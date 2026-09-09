import 'dotenv/config';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

/*
=========================================================
ERP VAX — SETORAN CLOSING EMAIL (READ ONLY)
=========================================================
Tujuan:
- Email closing harian Owner setiap selesai operasional.
- Pada akhir siklus 3 hari: lampirkan rekap lengkap 3 harian.

SAFETY:
- READ ONLY terhadap Supabase.
- Tidak menulis DailyDataEngine, SetoranMoneyEngine, Cash Out,
  Setoran 3 Harian, Arus Kas, Minutes, approval, atau engine LOCK.
- Formula uang disalin PERSIS dari SetoranMoneyEngine LOCKED.
- BRI Merchant mengikuti bri_merchant_daily canonical.
- Cash Out total = SUM daily_recap_source.cash_out.
- Detail Cash Out memakai parser yang sama dengan CashOutDetail.

Scheduler dijalankan dari VPS/cron; script ini tidak mengubah scheduler lain.
=========================================================
*/

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--') && !a.includes('=')));
const argValue = (name) => {
  const prefix = `--${name}=`;
  const hit = argv.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
};

const DRY_RUN = flags.has('--dry-run');
const FORCE = flags.has('--force');
const FORCE_3DAY = flags.has('--force-3day');
const DAILY_ONLY = flags.has('--daily-only');
const DATE_OVERRIDE = argValue('date');

const required = [
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
  'SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS',
  'MAIL_FROM','MAIL_OWNER'
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing env: ${key}`);
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const BRANCH_ORDER = [
  'Kalijati','Palabuan','Soklat','Rawabadak','AR Hakim',
  'SPBU Pagaden','Pamanukan','Mekarwangi','Parahyangan','Cinangsi'
];
const ALIASES = {
  'kalijati':'Kalijati','palabuan':'Palabuan','soklat':'Soklat','barsel':'Soklat',
  'rawabadak':'Rawabadak','rawa badak':'Rawabadak','ar hakim':'AR Hakim',
  'spbu pagaden':'SPBU Pagaden','pagaden':'SPBU Pagaden','pamanukan':'Pamanukan',
  'mekarwangi':'Mekarwangi','parahyangan':'Parahyangan','cinangsi':'Cinangsi'
};

const money = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const rupiah = v => 'Rp' + money(v).toLocaleString('id-ID');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const canonicalName = name => {
  const n = String(name || '').trim();
  return ALIASES[n.toLowerCase()] || n;
};

function jakartaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(date);
}
function validateIso(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) throw new Error(`Tanggal tidak valid: ${iso}`);
  return String(iso);
}
function shiftDate(iso, n) {
  const [y,m,d] = validateIso(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y,m-1,d,12));
  dt.setUTCDate(dt.getUTCDate() + Number(n || 0));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}
function dateDiff(a,b) {
  const aa = new Date(`${validateIso(a)}T12:00:00+07:00`);
  const bb = new Date(`${validateIso(b)}T12:00:00+07:00`);
  return Math.round((bb-aa)/86400000);
}
function dateLabel(iso) {
  const [y,m,d] = validateIso(iso).split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone:'UTC', day:'2-digit', month:'long', year:'numeric'
  }).format(new Date(Date.UTC(y,m-1,d,12)));
}
function shortDateLabel(iso) {
  const [y,m,d] = validateIso(iso).split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone:'UTC', day:'2-digit', month:'short', year:'numeric'
  }).format(new Date(Date.UTC(y,m-1,d,12)));
}

// Persis SetoranMoneyEngine.calculateBranchMoney() — JANGAN diubah mandiri.
function calculateBranchMoney(row) {
  const nettMinutes = Number(row?.nett_revenue || 0);
  const productCost = Number(row?.product_cost || 0);
  const nonCash = Number(row?.non_cash || row?.minutes_non_cash || 0);
  const netRevenueErp = nettMinutes + productCost;
  return { netRevenueErp, nonCash, cashReference: netRevenueErp - nonCash };
}
function nettProduct(row) {
  return Number(row?.produk || 0) - Number(row?.share_produk || 0);
}

// Parser identik dengan CashOutDetail (view only).
function parseRupiahToken(raw) {
  const s = String(raw || '').replace(/[\s\u00a0\u202f\u2009]/g,'').trim();
  if (!s) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let normalized = s;
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    normalized = lastComma > lastDot
      ? s.replace(/\./g,'').replace(',','.')
      : s.replace(/,/g,'');
  } else normalized = s.replace(/[.,]/g,'');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}
function extractKasirSuffix(text) {
  const src = String(text || '');
  const m = src.match(/\s*[-–]\s*Kasir:\s*(.+)$/i);
  if (!m) return { body:src.trim(), kasir:null };
  return { body:src.slice(0,m.index).trim(), kasir:String(m[1] || '').trim() || null };
}
function parseCashOutSegment(chunk) {
  const raw = String(chunk || '').trim();
  if (!raw) return null;
  const { body, kasir } = extractKasirSuffix(raw);
  const m = body.match(/^(.*?)\s+Rp\s*([\d.,\s\u00a0\u202f\u2009]+)$/i);
  if (!m) return null;
  const nama = String(m[1] || '').trim();
  const nominal = parseRupiahToken(m[2]);
  if (!nama || nominal == null) return null;
  return { nama, nominal, kasir:kasir || null, raw };
}
function expandCashOutDetail(dailyRows) {
  const out = [];
  const warnings = [];
  for (const day of dailyRows || []) {
    const tanggal = String(day.tanggal || '').slice(0,10);
    const dayTotal = Number(day.cash_out || 0);
    const raw = String(day.keterangan_cash_out || '').trim();
    const chunks = raw ? raw.split(/\s*;\s*/).map(s=>s.trim()).filter(Boolean) : [];
    if (chunks.length) {
      const parsed = chunks.map(chunk => ({ chunk, parsed:parseCashOutSegment(chunk) }));
      const parsedCount = parsed.filter(x=>x.parsed).length;
      if (parsedCount > 0) {
        for (const x of parsed) {
          if (x.parsed) {
            out.push({ tanggal, cabang_id:day.cabang_id ?? null, nominal:x.parsed.nominal,
              keterangan:x.parsed.nama, kasir:x.parsed.kasir, source:'minutes-keterangan' });
          } else {
            const { body, kasir } = extractKasirSuffix(x.chunk);
            out.push({ tanggal, cabang_id:day.cabang_id ?? null, nominal:null,
              keterangan:body || x.chunk, kasir, source:'minutes-unparsed' });
            warnings.push(`${tanggal}: potongan keterangan tidak ter-parse penuh`);
          }
        }
        continue;
      }
      const { kasir } = extractKasirSuffix(raw);
      out.push({ tanggal, cabang_id:day.cabang_id ?? null, nominal:dayTotal,
        keterangan:raw, kasir, source:'minutes-raw-day' });
      continue;
    }
    if (dayTotal > 0) {
      out.push({ tanggal, cabang_id:day.cabang_id ?? null, nominal:dayTotal,
        keterangan:'—', kasir:null, source:'minutes-total-only' });
      warnings.push(`${tanggal}: cash_out ada, keterangan Minutes kosong`);
    }
  }
  return { rows:out, warnings:[...new Set(warnings)] };
}

async function loadOperationalBranches() {
  let res = await db.from('cabang').select('id,nama_cabang,nama_minutes,aktif');
  if (res.error && /nama_minutes|column/i.test(res.error.message || '')) {
    res = await db.from('cabang').select('id,nama_cabang,aktif');
  }
  if (res.error) throw res.error;
  const list = (res.data || []).filter(c => {
    if (!c?.id || !c?.nama_cabang || c.aktif === false) return false;
    if (String(c.nama_cabang).toLowerCase().includes('floating')) return false;
    if (Object.prototype.hasOwnProperty.call(c,'nama_minutes') && !String(c.nama_minutes ?? '').trim()) return false;
    return true;
  }).map(c => ({ ...c, canonical:canonicalName(c.nama_cabang) }));
  return list.sort((a,b) => {
    const ai = BRANCH_ORDER.indexOf(a.canonical), bi = BRANCH_ORDER.indexOf(b.canonical);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}

async function loadSourceRows(start,end,branchIds) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    let q = db.from('daily_recap_source').select('*')
      .gte('tanggal',start).lte('tanggal',end)
      .in('cabang_id',branchIds)
      .order('tanggal',{ascending:true}).order('cabang_id',{ascending:true})
      .range(from,from+pageSize-1);
    const { data,error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
    from += pageSize;
  }
  const unique = new Map();
  for (const r of rows) unique.set(`${String(r.tanggal).slice(0,10)}|${Number(r.cabang_id)}`,r);
  return [...unique.values()];
}

async function loadBri(start,end,branchIds) {
  const { data,error } = await db.from('bri_merchant_daily')
    .select('tanggal,cabang_id,bri_non_cash_actual')
    .gte('tanggal',start).lte('tanggal',end).in('cabang_id',branchIds);
  if (error) throw error;
  const map = new Map();
  for (const r of data || []) {
    const id = Number(r.cabang_id);
    map.set(id,(map.get(id) || 0) + money(r.bri_non_cash_actual));
  }
  return map;
}

async function loadSetoranSaved(start,end,branchIds) {
  const { data,error } = await db.from('setoran_3_harian').select('*')
    .eq('period_start',start).eq('period_end',end).in('cabang_id',branchIds);
  if (error) throw error;
  return new Map((data || []).map(r => [Number(r.cabang_id),r]));
}

async function buildReport(start,end) {
  const branches = await loadOperationalBranches();
  const ids = branches.map(b=>Number(b.id));
  const [source,briMap,savedMap] = await Promise.all([
    loadSourceRows(start,end,ids), loadBri(start,end,ids), loadSetoranSaved(start,end,ids)
  ]);

  const rows = branches.map(branch => {
    const id = Number(branch.id);
    const daily = source.filter(r=>Number(r.cabang_id)===id);
    let netRevenueErp=0, nonCash=0, cashReference=0, nettProduk=0, cashOut=0;
    for (const r of daily) {
      const m = calculateBranchMoney(r);
      netRevenueErp += m.netRevenueErp;
      nonCash += m.nonCash;
      cashReference += m.cashReference;
      nettProduk += nettProduct(r);
      cashOut += money(r.cash_out);
    }
    const bri = money(briMap.get(id));
    const diff = bri <= 0 ? 0 : bri - nonCash;
    const saved = savedMap.get(id) || {};
    const outside = money(saved.outside_cashout_cost);
    const actual = cashReference - diff - outside;
    const expanded = expandCashOutDetail(daily.filter(r => money(r.cash_out)!==0 || String(r.keterangan_cash_out||'').trim()));
    return {
      id, name:branch.canonical || branch.nama_cabang, daily,
      netRevenueErp, nonCash, cashReference, nettProduk, cashOut, bri, diff, outside, actual,
      note:saved.non_cash_note || saved.outside_cashout_note || saved.spv_note || '—',
      taken:saved.taken_status === 'SUDAH DIAMBIL',
      verified:saved.owner_verified === true,
      cashOutDetails:expanded.rows,
      warnings:expanded.warnings
    };
  });
  const total = rows.reduce((a,r) => {
    for (const k of ['netRevenueErp','nonCash','cashReference','nettProduk','cashOut','bri','diff','outside','actual']) a[k]+=money(r[k]);
    return a;
  },{netRevenueErp:0,nonCash:0,cashReference:0,nettProduk:0,cashOut:0,bri:0,diff:0,outside:0,actual:0});
  return { start,end,days:dateDiff(start,end)+1,rows,total };
}

function htmlShell(content,title,subtitle) {
  const clock = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'long',timeStyle:'short'}).format(new Date()) + ' WIB';
  return `<!doctype html><html><body style="margin:0;background:#edf0f3;font-family:Arial,Helvetica,sans-serif;color:#17212d">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 10px"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:850px;background:#fff;border:1px solid #d2d7dd">
  <tr><td style="padding:20px 24px;border-top:5px solid #c69a25;border-bottom:1px solid #d5d9de">
    <div style="font-size:22px;font-weight:900;color:#171717">ERP VAX WIJAYA</div>
    <div style="margin-top:4px;font-size:13px;font-weight:900;letter-spacing:1.7px;color:#9a7415">${esc(title)}</div>
    <div style="margin-top:5px;font-size:11px;color:#697481">${esc(subtitle)}</div>
  </td></tr>
  <tr><td style="padding:20px 24px">${content}</td></tr>
  <tr><td style="padding:12px 24px;border-top:1px solid #d5d9de;background:#f7f8f9;font-size:10px;color:#737d87">
    READ ONLY · Sumber canonical ERP VAX · Generated ${esc(clock)}
  </td></tr></table></td></tr></table></body></html>`;
}
function summaryCards(report) {
  const t=report.total;
  const cards = [
    ['Cash Harus Diambil',t.cashReference,'#a7790b'],['Cash Out',t.cashOut,'#c2410c'],
    ['Non Tunai Minutes',t.nonCash,'#385ab7'],['Nett Produk',t.nettProduk,'#08776c'],
    ['BRI Merchant',t.bri,'#7950a3'],['Selisih Non Tunai',t.diff,'#b42323'],['Cash Aktual',t.actual,'#08776c']
  ];
  return `<table role="presentation" width="100%" cellspacing="6" cellpadding="0"><tr>${cards.map(([l,v,c])=>`<td style="width:14.28%;padding:10px;border:1px solid #d8dce1;border-left:4px solid ${c};vertical-align:top"><div style="font-size:9px;font-weight:800;color:#68727d;text-transform:uppercase">${esc(l)}</div><div style="margin-top:5px;font-size:15px;font-weight:900;color:${c}">${rupiah(v)}</div></td>`).join('')}</tr></table>`;
}
function branchTable(report) {
  return `<table width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;font-size:10px">
  <thead><tr style="background:#111;color:#fff">${['Cabang','Cash Harus Diambil','Non Tunai','Nett Produk','BRI Merchant','Selisih','Cash Aktual'].map(x=>`<th style="padding:8px 5px;border:1px solid #333">${x}</th>`).join('')}</tr></thead>
  <tbody>${report.rows.map(r=>`<tr><td style="padding:7px 5px;border:1px solid #ddd;font-weight:800">${esc(r.name)}</td>${[r.cashReference,r.nonCash,r.nettProduk,r.bri,r.diff,r.actual].map(v=>`<td align="right" style="padding:7px 5px;border:1px solid #ddd">${rupiah(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function emailHtml(daily,recap=null) {
  const content = `<div style="font-size:12px;color:#5b6672;margin-bottom:10px">Closing tanggal <b style="color:#111">${esc(dateLabel(daily.end))}</b> · ${daily.rows.length} cabang operasional</div>
  ${summaryCards(daily)}${branchTable(daily)}
  <div style="margin-top:16px;padding:11px 13px;border-left:4px solid #c69a25;background:#fbf8ef;font-size:11px;line-height:1.5;color:#5c6269">PDF <b>Laporan Harian</b> terlampir.${recap?` Karena hari ini akhir siklus, PDF <b>Rekap 3 Harian ${esc(shortDateLabel(recap.start))} — ${esc(shortDateLabel(recap.end))}</b> juga terlampir.`:''}</div>`;
  return htmlShell(content,recap?'CLOSING HARIAN + REKAP 3 HARIAN':'CLOSING HARIAN',recap?`${dateLabel(daily.end)} · akhir siklus 3 harian`:dateLabel(daily.end));
}

function pdfBuffer(report,{title}) {
  return new Promise((resolve,reject)=>{
    const doc = new PDFDocument({size:'A4',layout:'landscape',margin:30,bufferPages:true});
    const chunks=[];
    doc.on('data',d=>chunks.push(d)); doc.on('end',()=>resolve(Buffer.concat(chunks))); doc.on('error',reject);
    const W=doc.page.width-60;
    const line=()=>{doc.strokeColor('#c69a25').lineWidth(1.4).moveTo(30,78).lineTo(doc.page.width-30,78).stroke();};
    const header=()=>{
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(16).text('ERP VAX WIJAYA',30,28);
      doc.fillColor('#9a7415').fontSize(9).text(title.toUpperCase(),30,49);
      doc.fillColor('#555').font('Helvetica').fontSize(8).text(`${shortDateLabel(report.start)} — ${shortDateLabel(report.end)} · ${report.days} hari`,30,62);
      line();
    };
    const ensure=(need=50)=>{if(doc.y+need>doc.page.height-35){doc.addPage();header();doc.y=92;}};
    header(); doc.y=92;
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(14).text(title);
    doc.moveDown(.3);
    doc.fillColor('#555').font('Helvetica').fontSize(8).text('Ringkasan canonical Setoran + rincian Cash Out read only.');
    doc.moveDown(.7);
    const labels=[['CASH HARUS DIAMBIL',report.total.cashReference],['CASH OUT',report.total.cashOut],['NON TUNAI MINUTES',report.total.nonCash],['NETT PRODUK',report.total.nettProduk],['BRI MERCHANT',report.total.bri],['SELISIH NON TUNAI',report.total.diff],['CASH AKTUAL',report.total.actual]];
    const cardW=(W-36)/7; const y=doc.y;
    labels.forEach(([l,v],i)=>{const x=30+i*(cardW+6);doc.rect(x,y,cardW,48).strokeColor('#cfcfcf').stroke();doc.fillColor('#555').font('Helvetica-Bold').fontSize(6.5).text(l,x+6,y+7,{width:cardW-12});doc.fillColor('#111').fontSize(10).text(rupiah(v),x+6,y+25,{width:cardW-12});});
    doc.y=y+60;
    const widths=[120,90,82,72,82,78,78,100];
    const heads=['CABANG','CASH HARUS DIAMBIL','NON TUNAI','NETT PRODUK','BRI MERCHANT','SELISIH','CASH AKTUAL','STATUS'];
    const drawTableHead=()=>{let x=30;const yy=doc.y;heads.forEach((h,i)=>{doc.rect(x,yy,widths[i],24).fillAndStroke('#111','#333');doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6).text(h,x+3,yy+7,{width:widths[i]-6,align:i? 'right':'left'});x+=widths[i];});doc.y=yy+24;};
    drawTableHead();
    for(const r of report.rows){ensure(28); if(doc.y<95)drawTableHead();let x=30;const yy=doc.y;const vals=[r.name,rupiah(r.cashReference),rupiah(r.nonCash),rupiah(r.nettProduk),rupiah(r.bri),rupiah(r.diff),rupiah(r.actual),`${r.taken?'DIAMBIL':'BELUM'} / ${r.verified?'VERIFIED':'BELUM'}`]; vals.forEach((v,i)=>{doc.rect(x,yy,widths[i],24).strokeColor('#d4d0c7').stroke();doc.fillColor('#111').font(i===0?'Helvetica-Bold':'Helvetica').fontSize(6.4).text(String(v),x+3,yy+7,{width:widths[i]-6,align:i>0&&i<7?'right':'left'});x+=widths[i];}); doc.y=yy+24;}

    // Cash Out full details
    doc.addPage(); header(); doc.y=92;
    doc.fillColor('#c2410c').font('Helvetica-Bold').fontSize(8).text('RINCIAN CASH OUT');
    doc.fillColor('#111').fontSize(15).text('Cash Out Per Cabang & Per Tanggal');
    doc.fillColor('#555').font('Helvetica').fontSize(8).text(`Grand Total ${rupiah(report.total.cashOut)}`);
    doc.moveDown(.7);
    for(const r of report.rows){
      const details=r.cashOutDetails || [];
      ensure(70);
      const top=doc.y;
      doc.rect(30,top,W,34).fillAndStroke('#faf7ef','#d7d0bf');
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(9).text(r.name,38,top+7,{width:250});
      doc.fillColor('#555').fontSize(6.5).text(`JUMLAH TRANSAKSI ${details.filter(d=>d.nominal!=null&&money(d.nominal)!==0).length}`,330,top+7,{width:180,align:'center'});
      doc.fillColor('#c2410c').fontSize(9).text(`SUBTOTAL ${rupiah(r.cashOut)}`,doc.page.width-245,top+7,{width:200,align:'right'});
      doc.y=top+34;
      const cw=[90,100,360,W-550];
      const dh=['TANGGAL','NOMINAL','KETERANGAN CASH OUT','KASIR / USER'];
      let x=30,hy=doc.y;dh.forEach((h,i)=>{doc.rect(x,hy,cw[i],20).fillAndStroke('#111','#333');doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6).text(h,x+3,hy+6,{width:cw[i]-6,align:i===1?'right':'left'});x+=cw[i];});doc.y=hy+20;
      if(!details.length){doc.fillColor('#777').font('Helvetica').fontSize(7).text('Tidak ada rincian Cash Out.',35,doc.y+7);doc.y+=24;}
      for(const d of details){ensure(23); if(doc.y<95){x=30;hy=doc.y;dh.forEach((h,i)=>{doc.rect(x,hy,cw[i],20).fillAndStroke('#111','#333');doc.fillColor('#fff').font('Helvetica-Bold').fontSize(6).text(h,x+3,hy+6,{width:cw[i]-6,align:i===1?'right':'left'});x+=cw[i];});doc.y=hy+20;} x=30;const yy=doc.y;const vals=[shortDateLabel(d.tanggal),d.nominal==null?'—':rupiah(d.nominal),d.keterangan||'—',d.kasir||'—']; vals.forEach((v,i)=>{doc.rect(x,yy,cw[i],20).strokeColor('#d7d0bf').stroke();doc.fillColor(i===1?'#b42323':'#222').font(i===1?'Helvetica-Bold':'Helvetica').fontSize(6.5).text(String(v),x+3,yy+6,{width:cw[i]-6,align:i===1?'right':'left'});x+=cw[i];});doc.y=yy+20;}
      doc.y+=10;
    }
    const pages=doc.bufferedPageRange();
    for(let i=0;i<pages.count;i++){
      doc.switchToPage(i);
      doc.fillColor('#777').font('Helvetica').fontSize(6.5).text(
        `ERP VAX WIJAYA · READ ONLY · Halaman ${i+1}/${pages.count}`,
        30,
        doc.page.height-22,
        {width:W,align:'right',lineBreak:false}
      );
    }
    doc.end();
  });
}

const STATE_FILE = process.env.SETORAN_CLOSING_STATE_FILE || path.join(process.cwd(),'.setoran-closing-state.json');
function readState(){try{return JSON.parse(fs.readFileSync(STATE_FILE,'utf8'));}catch{return {};}}
function writeState(state){fs.writeFileSync(STATE_FILE,JSON.stringify(state,null,2));}
function isCycleEnd(date) {
  if (DAILY_ONLY) return false;
  if (FORCE_3DAY) return true;
  const anchor = validateIso(process.env.SETORAN_3DAY_ANCHOR || '2026-09-10');
  const diff = dateDiff(anchor,date);
  return ((diff % 3) + 3) % 3 === 0;
}

async function main() {
  const target = validateIso(DATE_OVERRIDE || jakartaDate());
  const cycleEnd = isCycleEnd(target);
  const recapStart = shiftDate(target,-2);
  const state = readState();
  if (!FORCE && !DATE_OVERRIDE && state.daily === target) {
    console.log(JSON.stringify({skipped:true,reason:'daily-already-sent',date:target}));
    return;
  }

  const daily = await buildReport(target,target);
  const recap = cycleEnd ? await buildReport(recapStart,target) : null;
  const dailyPdf = await pdfBuffer(daily,{title:`Laporan Closing Harian — ${dateLabel(target)}`});
  const recapPdf = recap ? await pdfBuffer(recap,{title:`Rekap Setoran 3 Harian — ${shortDateLabel(recap.start)} — ${shortDateLabel(recap.end)}`}) : null;
  const subject = recap
    ? `[ERP VAX] Closing Harian + Rekap 3 Harian — ${dateLabel(target)}`
    : `[ERP VAX] Closing Harian — ${dateLabel(target)}`;
  const attachments=[{filename:`ERP-VAX-Closing-Harian-${target}.pdf`,content:dailyPdf,contentType:'application/pdf'}];
  if(recapPdf) attachments.push({filename:`ERP-VAX-Setoran-3-Harian-${recap.start}_sd_${recap.end}.pdf`,content:recapPdf,contentType:'application/pdf'});

  const meta={date:target,to:process.env.MAIL_OWNER,cycleEnd,recap:recap?`${recap.start}..${recap.end}`:null,branches:daily.rows.length,totals:daily.total,attachments:attachments.map(a=>a.filename)};
  if (DRY_RUN) { console.log(JSON.stringify({dryRun:true,...meta},null,2)); return; }

  await transport.verify();
  const info = await transport.sendMail({
    from:`"${process.env.MAIL_FROM_NAME || 'ERP VAX WIJAYA'}" <${process.env.MAIL_FROM}>`,
    to:process.env.MAIL_OWNER,
    subject,
    html:emailHtml(daily,recap),
    attachments
  });
  console.log(JSON.stringify({sent:true,messageId:info.messageId,...meta},null,2));

  if (!DATE_OVERRIDE) {
    state.daily=target;
    if (recap) state.recap3day=target;
    state.updatedAt=new Date().toISOString();
    writeState(state);
  }
}

main().catch(err=>{
  console.error('[ERP VAX Setoran Closing Email]',err);
  process.exitCode=1;
});
