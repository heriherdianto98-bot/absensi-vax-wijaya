import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';

const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
for(const k of required) if(!process.env[k]) throw new Error(`Missing env: ${k}`);

const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const PUBLIC_BASE=String(process.env.SVP_INVOICE_PUBLIC_BASE||'https://erp.vaxwijaya.com').replace(/\/$/,'');
const TOKEN_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

async function ownerAuth(req){
  const auth=String(req.headers.authorization||'');
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return {ok:false,error:'Bearer token tidak diterima API'};
  const {data,error}=await db.auth.getUser(token);
  if(error||!data?.user)return {ok:false,error:'Token Owner tidak valid'};
  const user=data.user;
  const {data:p,error:pe}=await db.from('profiles').select('role,aktif').eq('id',user.id).maybeSingle();
  if(pe||!p||p.aktif===false||String(p.role||'').toLowerCase()!=='owner')return {ok:false,error:'Owner authorization required'};
  return {ok:true,user};
}

function randomToken(length=10){
  const bytes=crypto.randomBytes(length);
  let out='';
  for(let i=0;i<length;i++)out+=TOKEN_ALPHABET[bytes[i]%TOKEN_ALPHABET.length];
  return out;
}

async function tokenForInvoice(invoiceId,ownerId){
  const {data:existing,error:ee}=await db.from('svp_invoice_share_links').select('token,revoked_at').eq('invoice_id',invoiceId).maybeSingle();
  if(ee)throw ee;
  if(existing?.token&&!existing.revoked_at)return existing.token;
  for(let attempt=0;attempt<8;attempt++){
    const token=randomToken(10);
    const payload={invoice_id:invoiceId,token,created_by:ownerId,created_at:new Date().toISOString(),revoked_at:null};
    const {error}=await db.from('svp_invoice_share_links').upsert(payload,{onConflict:'invoice_id'});
    if(!error)return token;
    if(!/duplicate|unique/i.test(error.message||''))throw error;
  }
  throw new Error('Gagal membuat token invoice');
}

async function invoiceByToken(token){
  const {data:link,error:le}=await db.from('svp_invoice_share_links').select('invoice_id,revoked_at').eq('token',token).maybeSingle();
  if(le)throw le;
  if(!link||link.revoked_at)return null;
  const [{data:inv,error:ie},{data:items,error:xe}]=await Promise.all([
    db.from('svp_invoices').select('*').eq('id',link.invoice_id).maybeSingle(),
    db.from('svp_invoice_items').select('*').eq('invoice_id',link.invoice_id).order('sort_order')
  ]);
  if(ie)throw ie;if(xe)throw xe;if(!inv)return null;
  return {inv,items:items||[]};
}

function streamPdf(res,inv,items){
  const safeNo=String(inv.invoice_no||'invoice').replace(/[^A-Za-z0-9._-]+/g,'-');
  res.writeHead(200,{
    'Content-Type':'application/pdf',
    'Content-Disposition':`inline; filename="${safeNo}.pdf"`,
    'Cache-Control':'private, no-store, max-age=0',
    'X-Content-Type-Options':'nosniff'
  });
  const doc=new PDFDocument({size:'A4',margin:48,info:{Title:`Invoice ${inv.invoice_no||''}`,Author:'ERP VAX WIJAYA'}});
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(19).fillColor('#163e86').text('ERP VAX WIJAYA');
  doc.moveDown(0.2).fontSize(10).fillColor('#222222').text(String(inv.title||'INVOICE SVP').toUpperCase(),{characterSpacing:1.2});
  doc.moveDown(0.2).font('Helvetica').fontSize(8).fillColor('#6e7884').text('ENTERPRISE MANAGEMENT SYSTEM');
  doc.moveDown(1.2);
  doc.strokeColor('#b88a19').lineWidth(2).moveTo(48,doc.y).lineTo(547,doc.y).stroke();
  doc.moveDown(1.1);

  const y0=doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('NO. INVOICE',48,y0);
  doc.font('Helvetica').fontSize(11).fillColor('#111').text(inv.invoice_no||'-',48,y0+14);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('KEPADA',48,y0+42);
  doc.font('Helvetica').fontSize(11).fillColor('#111').text('SVP VAX WIJAYA',48,y0+56);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('TANGGAL',340,y0,{width:207,align:'right'});
  doc.font('Helvetica').fontSize(11).fillColor('#111').text(dateLabel(inv.invoice_date),340,y0+14,{width:207,align:'right'});
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('JATUH TEMPO',340,y0+42,{width:207,align:'right'});
  doc.font('Helvetica').fontSize(11).fillColor('#111').text(dateLabel(inv.due_date),340,y0+56,{width:207,align:'right'});
  doc.y=y0+88;

  const cols=[48,78,310,360,445,547];
  const headerY=doc.y;
  doc.rect(cols[0],headerY,cols[5]-cols[0],24).fill('#eef1f4');
  doc.fillColor('#222').font('Helvetica-Bold').fontSize(8);
  doc.text('No',cols[0]+5,headerY+8,{width:cols[1]-cols[0]-10});
  doc.text('Daftar Tagihan',cols[1]+5,headerY+8,{width:cols[2]-cols[1]-10});
  doc.text('Qty',cols[2]+5,headerY+8,{width:cols[3]-cols[2]-10,align:'center'});
  doc.text('Nominal',cols[3]+5,headerY+8,{width:cols[4]-cols[3]-10,align:'right'});
  doc.text('Jumlah',cols[4]+5,headerY+8,{width:cols[5]-cols[4]-10,align:'right'});
  let y=headerY+24;
  doc.font('Helvetica').fontSize(8.5);
  items.forEach((x,i)=>{
    if(y>720){doc.addPage();y=48;}
    const h=26;
    doc.strokeColor('#d7dce1').rect(cols[0],y,cols[5]-cols[0],h).stroke();
    doc.fillColor('#222').text(String(i+1),cols[0]+5,y+8,{width:cols[1]-cols[0]-10});
    doc.text(String(x.item_name||''),cols[1]+5,y+8,{width:cols[2]-cols[1]-10});
    doc.text(String(Number(x.qty||0)),cols[2]+5,y+8,{width:cols[3]-cols[2]-10,align:'center'});
    doc.text(rp(x.unit_price),cols[3]+5,y+8,{width:cols[4]-cols[3]-10,align:'right'});
    doc.font('Helvetica-Bold').text(rp(x.amount),cols[4]+5,y+8,{width:cols[5]-cols[4]-10,align:'right'}).font('Helvetica');
    y+=h;
  });
  doc.y=y+14;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text('TOTAL INVOICE',330,doc.y,{width:217,align:'right'});
  doc.moveDown(0.25).fontSize(20).fillColor('#163e86').text(rp(inv.total),330,doc.y,{width:217,align:'right'});
  if(inv.notes){doc.moveDown(1);doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text('Catatan Owner');doc.font('Helvetica').fontSize(9).fillColor('#555').text(String(inv.notes));}
  doc.moveDown(2);
  doc.strokeColor('#d4d9df').lineWidth(1).moveTo(48,doc.y).lineTo(547,doc.y).stroke();
  doc.moveDown(0.6).font('Helvetica').fontSize(7.5).fillColor('#7a8490').text('ERP VAX WIJAYA • INVOICE OWNER → SVP • READ ONLY',48,doc.y,{width:499,align:'center'});
  doc.end();
}

const server=http.createServer(async(req,res)=>{
  cors(req,res);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,service:'svp-invoice-share-api'}));}
  try{
    if(req.method==='POST'&&url.pathname==='/api/svp-invoice/share'){
      const auth=await ownerAuth(req);
      if(!auth.ok){res.writeHead(403,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:auth.error}));}
      const body=await readBody(req);const id=String(body.invoice_id||'');if(!id)throw new Error('invoice_id required');
      const {data:inv,error:ie}=await db.from('svp_invoices').select('id,invoice_no').eq('id',id).maybeSingle();if(ie)throw ie;if(!inv){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Invoice tidak ditemukan'}));}
      const token=await tokenForInvoice(id,auth.user.id);
      const shareUrl=`${PUBLIC_BASE}/i/${token}`;
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true,token,url:shareUrl,invoice_no:inv.invoice_no}));
    }
    const m=url.pathname.match(/^\/i\/([23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{10})$/);
    if(req.method==='GET'&&m){
      const result=await invoiceByToken(m[1]);
      if(!result){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end('Invoice tidak ditemukan atau link sudah tidak aktif.');}
      return streamPdf(res,result.inv,result.items);
    }
    res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Not found'}));
  }catch(e){console.error('[SVP Invoice Share API]',e);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:e?.message||String(e)}));}
});

const port=Number(process.env.SVP_INVOICE_SHARE_API_PORT||8792);
server.listen(port,'127.0.0.1',()=>console.log(`SVP invoice share API listening on 127.0.0.1:${port}`));
