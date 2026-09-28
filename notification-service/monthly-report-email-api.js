import 'dotenv/config';
import http from 'node:http';
import { existsSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';

/* Endpoint terpisah: tidak mengubah scheduler email 23.00 atau engine laporan LOCK. */
const TO='speedrangga59@gmail.com';
const CHROMIUM_PATH=process.env.MONTHLY_PDF_CHROMIUM_PATH||'/usr/bin/chromium';
if(!existsSync(CHROMIUM_PATH))throw new Error('Chromium PDF belum tersedia: '+CHROMIUM_PATH);
const ORIGINS=new Set(['https://erp.vaxwijaya.com','https://erp-test.vaxwijaya.com','http://127.0.0.1:5500','http://localhost:5500','http://127.0.0.1:5501','http://localhost:5501']);
for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SMTP_HOST','SMTP_USER','SMTP_PASS','MAIL_FROM'])
  if(!process.env[name])throw new Error(`Konfigurasi ${name} belum ada`);
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const mailer=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),
  secure:String(process.env.SMTP_SECURE||'false').toLowerCase()==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
let sending=false;
function readBody(req){return new Promise((resolve,reject)=>{let text='',size=0;req.on('data',part=>{
  size+=part.length;if(size>2*1024*1024){reject(new Error('Dokumen PDF terlalu besar'));req.destroy();return;}text+=part.toString('utf8');
});req.on('end',()=>{try{resolve(JSON.parse(text));}catch(_){reject(new Error('Format permintaan tidak valid'));}});req.on('error',reject);});}
async function ownerOnly(req){
  const authorization=String(req.headers.authorization||'');
  if(!authorization.startsWith('Bearer '))throw new Error('Sesi login tidak tersedia');
  const {data,error}=await db.auth.getUser(authorization.slice(7));
  if(error||!data?.user)throw new Error('Sesi login tidak valid');
  const {data:profile,error:pe}=await db.from('profiles').select('role,aktif').eq('id',data.user.id).maybeSingle();
  if(pe||!profile||profile.aktif===false||String(profile.role||'').trim().toLowerCase()!=='owner')throw new Error('Hanya Owner yang boleh mengirim laporan');
}
function validateReport(body){
  const month=String(body?.month||''),branch=String(body?.branch||''),html=String(body?.html||'');
  if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||!branch||branch.length>100)throw new Error('Cabang atau bulan tidak valid');
  if(html.length<500||html.length>1800000||!html.includes('class="page-frame"')||!html.includes('LAPORAN BULANAN'))
    throw new Error('Dokumen PDF laporan bulanan tidak valid');
  return {month,branch,html};
}
function validateMutation(body){
  const title=String(body?.title||'').trim(),period=String(body?.period||'').trim(),balance=String(body?.balance||'').trim(),html=String(body?.html||'');
  if(!/^Mutasi\s+/i.test(title)||title.length>120||!period||period.length>120||!balance||balance.length>80)
    throw new Error('Data mutasi tidak valid');
  if(html.length<500||html.length>1800000||!html.includes('LAPORAN MUTASI ARUS KAS')||!html.includes('<table'))
    throw new Error('Dokumen PDF mutasi tidak valid');
  return {title,period,balance,html};
}
async function renderPdf(html){
  const browser=await chromium.launch({executablePath:CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const context=await browser.newContext({viewport:{width:1024,height:768},javaScriptEnabled:false});
    const page=await context.newPage();
    await page.route('**/*',route=>route.abort()); // Tidak ada akses network dari HTML laporan.
    await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,''),{waitUntil:'load',timeout:20000});
    const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,timeout:30000});
    if(pdf.length<1000||pdf.length>12*1024*1024||pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('PDF tidak valid');
    return pdf;
  }finally{await browser.close();}
}
function cors(req,res){
  const origin=String(req.headers.origin||'');
  if(ORIGINS.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
}
const server=http.createServer(async(req,res)=>{
  cors(req,res);
  if(req.method==='OPTIONS')return reply(res,204,{});
  if(req.method==='GET'&&req.url==='/health')return reply(res,200,{ok:true,service:'monthly-report-email'});
  const isMonthly=req.method==='POST'&&req.url==='/api/monthly-report/email-svp';
  const isMutation=req.method==='POST'&&req.url==='/api/arus-kas/mutation/email-svp';
  if(!isMonthly&&!isMutation)return reply(res,404,{error:'Not found'});
  if(!ORIGINS.has(String(req.headers.origin||'')))return reply(res,403,{error:'Origin ditolak'});
  if(sending)return reply(res,429,{error:'Pengiriman sebelumnya masih berlangsung'});
  sending=true;
  try{
    await ownerOnly(req);
    const body=await readBody(req);
    if(isMutation){
      const {title,period,balance,html}=validateMutation(body);
      const pdf=await renderPdf(html);
      const safe=title.replace(/[^a-z0-9-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'Mutasi-Arus-Kas';
      const filename=`ERP-VAX-${safe}.pdf`;
      const subject=`${title} · ${period}`;
      const info=await mailer.sendMail({from:`"${process.env.MAIL_FROM_NAME||'ERP VAX WIJAYA'}" <${process.env.MAIL_FROM}>`,
        to:TO,subject,text:`Terlampir ${title}. Periode ${period}. Saldo saat ini ${balance}. Dokumen internal VAX WIJAYA.`,
        attachments:[{filename,content:pdf,contentType:'application/pdf'}]});
      console.log('[Mutation PDF Email]',{to:TO,title,period,bytes:pdf.length,messageId:info.messageId});
      return reply(res,200,{sent:true,to:TO,title,period,messageId:info.messageId});
    }
    const {month,branch,html}=validateReport(body);
    const pdf=await renderPdf(html);
    const monthLabel=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][Number(month.slice(5,7))-1]+' '+month.slice(0,4);
    const title=`Laporan Bulanan ${branch} ${monthLabel}`;
    const filename=`ERP-VAX-Laporan-Bulanan-${month}-${branch.replace(/[^a-z0-9-]+/gi,'-').slice(0,50)}.pdf`;
    const info=await mailer.sendMail({from:`"${process.env.MAIL_FROM_NAME||'ERP VAX WIJAYA'}" <${process.env.MAIL_FROM}>`,
      to:TO,subject:title,text:`Terlampir ${title}. Dokumen internal VAX WIJAYA.`,
      attachments:[{filename,content:pdf,contentType:'application/pdf'}]});
    console.log('[Monthly PDF Email]',{to:TO,month,branch,bytes:pdf.length,messageId:info.messageId});
    return reply(res,200,{sent:true,to:TO,month,branch,messageId:info.messageId});
  }catch(err){
    console.error('[Report PDF Email]',{name:err?.name,message:err?.message});
    const forbidden=/sesi|owner/i.test(String(err?.message||''));
    return reply(res,forbidden?403:500,{sent:false,error:forbidden?'Akses Owner atau sesi login tidak valid.':String(err?.message||'Gagal mengirim PDF')});
  }finally{sending=false;}
});
const port=Number(process.env.MONTHLY_REPORT_EMAIL_API_PORT||8795);
server.listen(port,'127.0.0.1',()=>console.log(`Monthly PDF email API listening on 127.0.0.1:${port}`));
