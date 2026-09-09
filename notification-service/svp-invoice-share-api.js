import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
for(const k of required) if(!process.env[k]) throw new Error(`Missing env: ${k}`);

const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const PUBLIC_BASE=String(process.env.SVP_INVOICE_PUBLIC_BASE||'https://erp.vaxwijaya.com').replace(/\/$/,'');
const TOKEN_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const OWNER_SIGNATURE_PATH=process.env.SVP_INVOICE_OWNER_SIGNATURE||'/var/www/erp-vax-test/assets/owner-signature.png';

const rp=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const dateLabel=v=>{if(!v)return '-';const d=new Date(`${String(v).slice(0,10)}T00:00:00+07:00`);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(d)};
const readBody=req=>new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1024*30){reject(new Error('Payload too large'));req.destroy()}});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)});

function cors(req,res){
  const o=req.headers.origin||'';
  const allowed=['https://erp.vaxwijaya.com','https://erp-test.vaxwijaya.com','http://127.0.0.1:5500','http://localhost:5500'];
  if(allowed.includes(o))res.setHeader('Access-Control-Allow-Origin',o);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
}

async function roleAuth(req){
  const auth=String(req.headers.authorization||'');
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return {ok:false,error:'Bearer token tidak diterima API'};
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user)return {ok:false,error:'Token pengguna tidak valid'};
  const user=data.user;
  const {data:p,error:pe}=await db.from('profiles').select('role,aktif').eq('id',user.id).maybeSingle();
  const role=String(p?.role||'').toLowerCase();
  if(pe||!p||p.aktif===false||!['owner','svp','spv'].includes(role))return {ok:false,error:'Akses invoice ditolak'};
  return {ok:true,user,role:role==='spv'?'svp':role};
}

function randomToken(length=10){
  const bytes=crypto.randomBytes(length);let out='';
  for(let i=0;i<length;i++)out+=TOKEN_ALPHABET[bytes[i]%TOKEN_ALPHABET.length];
  return out;
}

async function tokenForInvoice(invoiceId,userId){
  const {data:existing,error:ee}=await db.from('svp_invoice_share_links').select('token,revoked_at').eq('invoice_id',invoiceId).maybeSingle();
  if(ee)throw ee;if(existing?.token&&!existing.revoked_at)return existing.token;
  for(let attempt=0;attempt<8;attempt++){
    const token=randomToken(10);
    const payload={invoice_id:invoiceId,token,created_by:userId,created_at:new Date().toISOString(),revoked_at:null};
    const {error}=await db.from('svp_invoice_share_links').upsert(payload,{onConflict:'invoice_id'});
    if(!error)return token;if(!/duplicate|unique/i.test(error.message||''))throw error;
  }
  throw new Error('Gagal membuat token invoice');
}

async function invoiceByToken(token){
  const {data:link,error:le}=await db.from('svp_invoice_share_links').select('invoice_id,revoked_at').eq('token',token).maybeSingle();
  if(le)throw le;if(!link||link.revoked_at)return null;
  const [{data:inv,error:ie},{data:items,error:xe}]=await Promise.all([
    db.from('svp_invoices').select('*').eq('id',link.invoice_id).maybeSingle(),
    db.from('svp_invoice_items').select('*').eq('invoice_id',link.invoice_id).order('sort_order')
  ]);
  if(ie)throw ie;if(xe)throw xe;if(!inv)return null;
  return {inv,items:items||[]};
}

function streamPdf(res,inv,items){
  const senderRole=String(inv.sender_role||'owner').toLowerCase();
  const fromSvp=['svp','spv'].includes(senderRole);
  const recipient=fromSvp?'OWNER VAX WIJAYA':'SVP VAX WIJAYA';
  const noteLabel=fromSvp?'Catatan SVP':'Catatan Owner';
  const direction=fromSvp?'INVOICE SVP → OWNER':'INVOICE OWNER → SVP';
  const safeNo=String(inv.invoice_no||'invoice').replace(/[^A-Za-z0-9._-]+/g,'-');
  res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${safeNo}.pdf"`,'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'});
  const doc=new PDFDocument({size:'A4',margin:36,info:{Title:`Invoice ${inv.invoice_no||''}`,Author:'ERP VAX WIJAYA'}});doc.pipe(res);

  const pageW=595.28,left=36,right=pageW-36,width=right-left;
  const blue='#163e86',gold='#b88a19',ink='#172233',muted='#6e7884',line='#cbd2da',soft='#f3f5f7';
  doc.rect(left,36,width,770).lineWidth(0.8).strokeColor('#c9d0d8').stroke();doc.rect(left,36,width,5).fill(gold);
  doc.font('Times-Bold').fontSize(25).fillColor(blue).text('ERP VAX WIJAYA',left+24,65,{width:width-48});
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(String(inv.title||'INVOICE SVP').toUpperCase(),left+24,99,{characterSpacing:1.8});
  doc.font('Helvetica').fontSize(8.8).fillColor(muted).text('ENTERPRISE MANAGEMENT SYSTEM',left+24,120,{characterSpacing:0.8});
  doc.moveTo(left,144).lineTo(right,144).lineWidth(2.2).strokeColor('#c5cbd2').stroke();

  const metaX=left+24,metaY=162,metaW=width-48,metaH=98,metaRightW=170,metaRightX=metaX+metaW-metaRightW-18;
  doc.roundedRect(metaX,metaY,metaW,metaH,3).fillAndStroke(soft,'#dde2e7');doc.rect(metaX,metaY,4,metaH).fill(gold);
  doc.font('Helvetica-Bold').fontSize(8.8).fillColor(ink).text('No. Invoice',metaX+18,178,{width:245});
  doc.font('Helvetica').fontSize(10.5).text(inv.invoice_no||'-',metaX+18,193,{width:245});
  doc.font('Helvetica-Bold').fontSize(8.8).text('Kepada',metaX+18,222,{width:245});
  doc.font('Helvetica').fontSize(10.5).text(recipient,metaX+18,237,{width:245});
  doc.font('Helvetica-Bold').fontSize(8.8).text('Tanggal',metaRightX,178,{width:metaRightW,align:'right'});
  doc.font('Helvetica').fontSize(10.5).text(dateLabel(inv.invoice_date),metaRightX,193,{width:metaRightW,align:'right'});
  doc.font('Helvetica-Bold').fontSize(8.8).text('Jatuh Tempo',metaRightX,222,{width:metaRightW,align:'right'});
  doc.font('Helvetica').fontSize(10.5).text(dateLabel(inv.due_date),metaRightX,237,{width:metaRightW,align:'right'});

  const tableX=left+24,tableW=width-48,cols=[tableX,tableX+38,tableX+244,tableX+292,tableX+382,tableX+tableW];
  let y=282;const headerH=28;
  doc.rect(tableX,y,tableW,headerH).fill('#eef1f4');doc.strokeColor('#d5dae0').lineWidth(0.8).rect(tableX,y,tableW,headerH).stroke();
  doc.font('Helvetica-Bold').fontSize(8.7).fillColor(ink);
  doc.text('No',cols[0]+7,y+9,{width:cols[1]-cols[0]-14});doc.text('Daftar Tagihan',cols[1]+7,y+9,{width:cols[2]-cols[1]-14});
  doc.text('Qty',cols[2]+6,y+9,{width:cols[3]-cols[2]-12,align:'center'});doc.text('Nominal',cols[3]+6,y+9,{width:cols[4]-cols[3]-12,align:'right'});doc.text('Jumlah',cols[4]+6,y+9,{width:cols[5]-cols[4]-12,align:'right'});y+=headerH;
  doc.font('Helvetica').fontSize(8.9);
  for(let i=0;i<items.length;i++){
    const x=items[i],rowH=32;doc.strokeColor('#d5dae0').rect(tableX,y,tableW,rowH).stroke();
    doc.fillColor(ink).text(String(i+1),cols[0]+7,y+10,{width:cols[1]-cols[0]-14,lineBreak:false});
    doc.text(String(x.item_name||''),cols[1]+7,y+10,{width:cols[2]-cols[1]-14,height:14,ellipsis:true});
    doc.text(String(Number(x.qty||0)),cols[2]+6,y+10,{width:cols[3]-cols[2]-12,align:'center',lineBreak:false});
    doc.text(rp(x.unit_price),cols[3]+6,y+10,{width:cols[4]-cols[3]-12,align:'right',lineBreak:false});
    doc.font('Helvetica-Bold').text(rp(x.amount),cols[4]+6,y+10,{width:cols[5]-cols[4]-12,align:'right',lineBreak:false}).font('Helvetica');y+=rowH;
  }
  const totalY=Math.max(y+18,360);doc.font('Helvetica-Bold').fontSize(21).fillColor(blue).text(`TOTAL  ${rp(inv.total)}`,right-275,totalY,{width:251,align:'right',lineBreak:false});
  if(inv.notes){const noteY=totalY+42;doc.rect(left+24,noteY,270,54).fill('#f7f8fa');doc.rect(left+24,noteY,3,54).fill('#c9ced4');doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#697481').text(noteLabel,left+36,noteY+10,{width:246});doc.font('Helvetica').fontSize(8.5).text(String(inv.notes),left+36,noteY+24,{width:246,height:24,ellipsis:true});}

  if(!fromSvp){
    const signX=right-245,signY=Math.max(totalY+46,475);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ink).text('Disetujui / Mengetahui,',signX,signY,{width:210,align:'center'});
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(ink).text('OTORISASI OWNER',signX,signY+15,{width:210,align:'center',characterSpacing:1.2});
    if(existsSync(OWNER_SIGNATURE_PATH)){try{doc.image(OWNER_SIGNATURE_PATH,signX+33,signY+30,{fit:[145,70],align:'center',valign:'center'});}catch(e){console.warn('[SVP Invoice PDF] signature image failed',e?.message||e)}}
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(ink).text('Heri Herdianto',signX,signY+104,{width:210,align:'center'});
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(ink).text('OWNER',signX,signY+124,{width:210,align:'center',characterSpacing:1.5});
  }

  const footerY=770;doc.moveTo(left,footerY).lineTo(right,footerY).lineWidth(0.8).strokeColor(line).stroke();doc.rect(left,footerY,width,36).fill('#f6f7f9');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(blue).text('ERP VAX WIJAYA',left+24,footerY+11,{width:150});
  doc.font('Helvetica').fontSize(7.4).fillColor(muted).text(direction,left+24,footerY+21,{width:150});
  doc.font('Helvetica').fontSize(7.2).fillColor(ink).text('INTERNAL / CONFIDENTIAL',left+210,footerY+11,{width:160,align:'center'});
  doc.font('Helvetica').fontSize(7.2).fillColor(muted).text('Generated automatically',left+210,footerY+21,{width:160,align:'center'});
  doc.font('Helvetica').fontSize(7.2).fillColor(ink).text(dateLabel(new Date().toISOString().slice(0,10)),right-120,footerY+16,{width:96,align:'right'});doc.end();
}

const server=http.createServer(async(req,res)=>{
  cors(req,res);if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,service:'svp-invoice-share-api'}));}
  try{
    if(req.method==='POST'&&url.pathname==='/api/svp-invoice/share'){
      const auth=await roleAuth(req);if(!auth.ok){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:auth.error}));}
      const body=await readBody(req),id=String(body.invoice_id||'');if(!id)throw new Error('invoice_id required');
      const {data:inv,error:ie}=await db.from('svp_invoices').select('id,invoice_no,created_by,sender_role').eq('id',id).maybeSingle();if(ie)throw ie;if(!inv){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Invoice tidak ditemukan'}));}
      if(auth.role==='svp'&&(String(inv.created_by)!==String(auth.user.id)||!['svp','spv'].includes(String(inv.sender_role||'').toLowerCase()))){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'SVP hanya dapat membagikan invoice miliknya sendiri'}));}
      const token=await tokenForInvoice(id,auth.user.id),shareUrl=`${PUBLIC_BASE}/i/${token}.pdf`;
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true,token,url:shareUrl,invoice_no:inv.invoice_no}));
    }
    const m=url.pathname.match(/^\/i\/([23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{10})(?:\.pdf)?$/);
    if(req.method==='GET'&&m){const result=await invoiceByToken(m[1]);if(!result){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end('Invoice tidak ditemukan atau link sudah tidak aktif.');}return streamPdf(res,result.inv,result.items);}
    res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Not found'}));
  }catch(e){console.error('[SVP Invoice Share API]',e);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:e?.message||String(e)}));}
});
const port=Number(process.env.SVP_INVOICE_SHARE_API_PORT||8792);server.listen(port,'127.0.0.1',()=>console.log(`SVP invoice share API listening on 127.0.0.1:${port}`));
