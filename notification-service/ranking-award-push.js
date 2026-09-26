import 'dotenv/config';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { loadRankingAwardVapid } from './ranking-award-vapid.js';

const argv=process.argv.slice(2);
const hasFlag=name=>argv.includes('--'+name);
const argValue=name=>{
  const hit=argv.find(x=>x.startsWith('--'+name+'='));
  return hit?hit.slice(name.length+3):'';
};
const DRY_RUN=hasFlag('dry-run');
const FORCE=hasFlag('force');
const DATE_OVERRIDE=argValue('date');

for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']){
  if(!process.env[name]) throw new Error('Missing env: '+name);
}
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const vapid=loadRankingAwardVapid();
const vapidSubject=process.env.VAPID_SUBJECT||'mailto:notification@vaxwijaya.com';
const erpBaseUrl=process.env.ERP_BASE_URL||'https://erp.vaxwijaya.com';
webpush.setVapidDetails(vapidSubject,vapid.publicKey,vapid.privateKey);

const title='SELAMAT, ANDA RANGKING 1 DI SEMUA CABANG';
const body='Selamat, Anda berhasil meraih Ranking 1 di Semua Cabang. Semoga hasil kerja hari ini membawa rezeki yang baik dan menambah semangat Anda. Gunakan sebagian hasil tersebut untuk menunjang penampilan kerja atau kebutuhan alat kerja agar performa tetap optimal.';

function jakartaDate(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function validDate(v){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))) throw new Error('Tanggal tidak valid: '+v);
  return String(v);
}
async function winnerFor(date){
  const {data,error}=await db.rpc('karyawan_ranking_award_candidates_v1',{p_date:date});
  if(error) throw error;
  return Array.isArray(data)&&data.length?data[0]:null;
}
async function activeSubscriptions(employeeId){
  const {data,error}=await db.from('karyawan_push_subscription_v1')
    .select('id,endpoint,p256dh,auth')
    .eq('karyawan_id',employeeId).eq('active',true).is('disabled_at',null);
  if(error) throw error;
  return data||[];
}
async function disableSubscription(id,reason){
  await db.from('karyawan_push_subscription_v1').update({
    active:false,disabled_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq('id',id);
  console.warn('[Ranking Award] subscription disabled',{id,reason});
}
async function upsertAward(winner,date){
  const payload={
    karyawan_id:winner.karyawan_id,activity_date:date,scope:'GLOBAL',rank:1,
    total_service:winner.total_service,total_income:winner.total_income,cabang_id:winner.cabang_id,
    title,body,updated_at:new Date().toISOString()
  };
  const {data,error}=await db.from('karyawan_ranking_award_v1')
    .upsert(payload,{onConflict:'karyawan_id,activity_date,scope'})
    .select('*').single();
  if(error) throw error;
  return data;
}
async function markAttempt(award,{sent,errorText}){
  const patch={
    push_attempts:Number(award.push_attempts||0)+1,
    last_push_error:errorText||null,
    updated_at:new Date().toISOString()
  };
  if(sent) patch.notified_at=award.notified_at||new Date().toISOString();
  const {error}=await db.from('karyawan_ranking_award_v1').update(patch).eq('id',award.id);
  if(error) throw error;
}
async function main(){
  const date=validDate(DATE_OVERRIDE||jakartaDate());
  const winner=await winnerFor(date);
  if(!winner){
    console.log(JSON.stringify({ok:true,date,skipped:true,reason:'NO_MAPPED_GLOBAL_WINNER'}));
    return;
  }
  const subscriptions=await activeSubscriptions(winner.karyawan_id);
  if(DRY_RUN){
    console.log(JSON.stringify({dryRun:true,date,winner,subscriptionCount:subscriptions.length},null,2));
    return;
  }
  const award=await upsertAward(winner,date);
  if(award.notified_at&&!FORCE){
    console.log(JSON.stringify({ok:true,date,skipped:true,reason:'ALREADY_NOTIFIED',awardId:award.id}));
    return;
  }
  if(!subscriptions.length){
    await markAttempt(award,{sent:false,errorText:'NO_ACTIVE_PUSH_SUBSCRIPTION'});
    console.log(JSON.stringify({ok:true,date,awardId:award.id,skipped:true,reason:'NO_ACTIVE_PUSH_SUBSCRIPTION'}));
    return;
  }

  const url=new URL('/dashboard-karyawan.html',erpBaseUrl);
  url.searchParams.set('ranking_award',date);
  url.searchParams.set('award_id',String(award.id));
  const notification=JSON.stringify({
    title,
    body:'Anda berhasil menjadi Ranking 1 di Semua Cabang. Ketuk untuk membuka apresiasi.',
    icon:'/ERP.NEW/assets/brand/erp-vax-wijaya.png',
    badge:'/ERP.NEW/assets/brand/erp-vax-wijaya.png',
    tag:'vax-ranking1-global-'+date+'-'+winner.karyawan_id,
    url:url.href,
    activityDate:date,
    awardId:award.id
  });

  let sent=0;
  const errors=[];
  for(const sub of subscriptions){
    try{
      await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},notification,{TTL:21600,urgency:'high'});
      sent++;
    }catch(err){
      const code=Number(err?.statusCode||0);
      errors.push('sub '+sub.id+': '+String(err?.message||err));
      if(code===404||code===410) await disableSubscription(sub.id,'HTTP_'+code);
    }
  }
  await markAttempt(award,{sent:sent>0,errorText:errors.length?errors.join(' | ').slice(0,4000):null});
  console.log(JSON.stringify({ok:true,date,awardId:award.id,winnerEmployeeId:winner.karyawan_id,subscriptions:subscriptions.length,sent,errors:errors.length},null,2));
}
main().catch(err=>{console.error('[ERP VAX Ranking Award Push]',err);process.exitCode=1;});
