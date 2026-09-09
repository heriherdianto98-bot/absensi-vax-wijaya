import 'dotenv/config';
import http from 'node:http';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','MAIL_FROM','MAIL_SVP'];
for(const k of required) if(!process.env[k]) throw new Error(`Missing env: ${k}`);
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'false').toLowerCase()==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
const clock=()=>({date:new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'long',year:'numeric'}).format(new Date()),time:new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())+' WIB'});

function invoiceHtml(inv,items){const c=clock();const rows=items.map((x,i)=>`<tr><td style="border:1px solid #d5dae0;padding:9px;font-size:12px">${i+1}</td><td style="border:1px solid #d5dae0;padding:9px;font-size:12px">${esc(x.item_name)}</td><td align="center" style="border:1px solid #d5dae0;padding:9px;font-size:12px">${x.qty}</td><td align="right" style="border:1px solid #d5dae0;padding:9px;font-size:12px">${rp(x.unit_price)}</td><td align="right" style="border:1px solid #d5dae0;padding:9px;font-size:12px;font-weight:700">${rp(x.amount)}</td></tr>`).join('');return `<!doctype html><html><body style="margin:0;background:#eceff3;font-family:Arial,Helvetica,sans-serif;color:#172233"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 10px;background:#eceff3"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#fff;border:1px solid #c9d0d8"><tr><td style="padding:20px 24px;border-top:5px solid #b88a19;border-bottom:1px solid #cbd2da"><table width="100%"><tr><td><div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#163e86">ERP VAX WIJAYA</div><div style="margin-top:5px;font-size:13px;font-weight:900;letter-spacing:2px">${esc(inv.title||'INVOICE SVP')}</div><div style="margin-top:4px;font-size:10px;font-weight:700;letter-spacing:1.2px;color:#6e7884">ENTERPRISE MANAGEMENT SYSTEM</div></td><td align="right" style="font-size:10px;line-height:1.55;color:#56616e"><b style="display:block;color:#163e86;letter-spacing:1px">CONFIDENTIAL</b>${c.date}<br>${c.time}</td></tr></table></td></tr><tr><td style="padding:20px 24px"><table width="100%" style="margin-bottom:18px"><tr><td style="font-size:12px;line-height:1.55"><b>No. Invoice</b><br>${esc(inv.invoice_no)}<br><br><b>Kepada</b><br>SVP VAX WIJAYA</td><td align="right" style="font-size:12px;line-height:1.55"><b>Tanggal</b><br>${esc(inv.invoice_date||'')}${inv.due_date?`<br><br><b>Jatuh Tempo</b><br>${esc(inv.due_date)}`:''}</td></tr></table><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><thead><tr><th align="left" style="border:1px solid #d5dae0;background:#f2f4f6;padding:9px;font-size:11px">No</th><th align="left" style="border:1px solid #d5dae0;background:#f2f4f6;padding:9px;font-size:11px">Daftar Tagihan</th><th style="border:1px solid #d5dae0;background:#f2f4f6;padding:9px;font-size:11px">Qty</th><th align="right" style="border:1px solid #d5dae0;background:#f2f4f6;padding:9px;font-size:11px">Nominal</th><th align="right" style="border:1px solid #d5dae0;background:#f2f4f6;padding:9px;font-size:11px">Jumlah</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top:14px;text-align:right;font-size:24px;font-weight:900;color:#163e86">TOTAL ${rp(inv.total)}</div>${inv.notes?`<div style="margin-top:16px;padding:12px;border-left:4px solid #b88a19;background:#f5f7f9;font-size:11px;color:#56616e"><b>Catatan Owner:</b><br>${esc(inv.notes)}</div>`:''}</td></tr><tr><td style="padding:12px 24px;border-top:1px solid #cbd2da;background:#f6f7f9"><table width="100%"><tr><td style="font-size:10px;color:#43505d"><b style="display:block;color:#163e86">ERP VAX WIJAYA</b>INVOICE OWNER → SVP</td><td align="center" style="font-size:9px;color:#7a8490">INTERNAL / CONFIDENTIAL<br>Generated automatically</td><td align="right" style="font-size:9px;color:#7a8490">${c.date}<br>${c.time}</td></tr></table></td></tr></table></td></tr></table></body></html>`}

function cors(req,res){const o=req.headers.origin||'';const allowed=[process.env.ERP_BASE_URL,'https://erp-test.vaxwijaya.com','http://127.0.0.1:5500','http://localhost:5500'].filter(Boolean);if(allowed.includes(o))res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');}
const readBody=req=>new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1024*50){reject(new Error('Payload too large'));req.destroy()}});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)});

async function ownerAuth(req){
  const auth=String(req.headers.authorization||'');
  const bearer=auth.startsWith('Bearer ');
  const token=bearer?auth.slice(7):'';
  if(!token){
    console.warn('[SVP Invoice Auth] bearer token missing',{hasAuthorization:Boolean(auth),origin:req.headers.origin||''});
    return {ok:false,error:'Bearer token tidak diterima API'};
  }
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user){
    console.warn('[SVP Invoice Auth] token rejected',{message:error?.message||'user not found',status:error?.status||null});
    return {ok:false,error:`Token Owner tidak valid${error?.message?`: ${error.message}`:''}`};
  }
  const user=data.user;
  const {data:p,error:pe}=await db.from('profiles').select('role,aktif').eq('id',user.id).maybeSingle();
  if(pe){
    console.warn('[SVP Invoice Auth] profile lookup failed',{userId:user.id,message:pe.message});
    return {ok:false,error:'Profile Owner gagal dibaca'};
  }
  const role=String(p?.role||'').toLowerCase();
  console.log('[SVP Invoice Auth]',{userId:user.id,role,aktif:p?.aktif!==false,origin:req.headers.origin||''});
  if(!p||p.aktif===false||role!=='owner')return {ok:false,error:`Akses ditolak: role ${role||'kosong'}`};
  return {ok:true,user};
}

const server=http.createServer(async(req,res)=>{cors(req,res);if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,service:'svp-invoice-api'}))}if(req.method!=='POST'||req.url!=='/api/svp-invoice/send'){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Not found'}))}try{const auth=await ownerAuth(req);if(!auth.ok){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:auth.error}))}const owner=auth.user;const body=await readBody(req);const id=body.invoice_id;if(!id)throw new Error('invoice_id required');const {data:inv,error:ie}=await db.from('svp_invoices').select('*').eq('id',id).single();if(ie)throw ie;const {data:items,error:xe}=await db.from('svp_invoice_items').select('*').eq('invoice_id',id).order('sort_order');if(xe)throw xe;if(!items?.length)throw new Error('Invoice tidak memiliki item');const to=process.env.MAIL_SVP;const info=await transport.sendMail({from:`"${process.env.MAIL_FROM_NAME||'ERP VAX WIJAYA'}" <${process.env.MAIL_FROM}>`,to,subject:`[ERP VAX] ${inv.title||'Invoice SVP'} — ${inv.invoice_no}`,html:invoiceHtml(inv,items)});await db.from('svp_invoices').update({status:'sent',sent_at:new Date().toISOString(),sent_to_email:to,updated_by:owner.id,updated_at:new Date().toISOString()}).eq('id',id);console.log('[SVP Invoice Send]',{invoiceNo:inv.invoice_no,to,userId:owner.id,messageId:info.messageId});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({sent:true,to,messageId:info.messageId,invoice_no:inv.invoice_no}))}catch(e){console.error('[SVP Invoice API]',e);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e?.message||String(e)}))}});
const port=Number(process.env.SVP_INVOICE_API_PORT||8791);server.listen(port,'127.0.0.1',()=>console.log(`SVP invoice API listening on 127.0.0.1:${port}`));
