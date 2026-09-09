import 'dotenv/config';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const TEST_EMAIL = args.has('--test-email');

const required = [
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS',
  'MAIL_FROM','MAIL_OWNER','MAIL_SVP','ERP_BASE_URL'
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

const fmtMoney = n => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
}).format(Number(n || 0));

function jakartaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = t => parts.find(x => x.type === t)?.value;
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')) };
}

function jakartaClock() {
  const now = new Date();
  return {
    date: new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', day:'2-digit', month:'long', year:'numeric' }).format(now),
    time: new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', hour:'2-digit', minute:'2-digit', hour12:false }).format(now) + ' WIB'
  };
}

function daysUntilMonthly(day) {
  const { y, m, d } = jakartaParts();
  const now = new Date(Date.UTC(y, m - 1, d));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let target = new Date(Date.UTC(y, m - 1, Math.min(Number(day) || 1, last)));
  if (target < now) {
    const lastNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    target = new Date(Date.UTC(y, m, Math.min(Number(day) || 1, lastNext)));
  }
  return Math.round((target - now) / 86400000);
}

function targetDateLabel(day) {
  const { y, m, d } = jakartaParts();
  const now = new Date(Date.UTC(y, m - 1, d));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let target = new Date(Date.UTC(y, m - 1, Math.min(Number(day) || 1, last)));
  if (target < now) {
    const lastNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    target = new Date(Date.UTC(y, m, Math.min(Number(day) || 1, lastNext)));
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric'
  }).format(target);
}

const reminderDays = new Set(
  String(process.env.TAGIHAN_REMINDER_DAYS || '3,2,1,0')
    .split(',').map(x => Number(x.trim())).filter(Number.isFinite)
);

function urgencyLabel(d) {
  if (d === 0) return 'JATUH TEMPO HARI INI';
  return `REMINDER H-${d}`;
}

function urgencyColor(d) {
  if (d === 0) return '#a52323';
  if (d === 1) return '#b15d15';
  return '#8a6818';
}

function cashOutShell(content, { title='MASTER TAGIHAN', subtitle='Reminder otomatis Owner + SVP' } = {}) {
  const clock = jakartaClock();
  return `<!doctype html><html><body style="margin:0;background:#eceff3;font-family:Arial,Helvetica,sans-serif;color:#172233">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eceff3;padding:24px 10px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#fff;border:1px solid #c9d0d8">
        <tr><td style="padding:20px 24px;border-top:5px solid #b88a19;border-bottom:1px solid #cbd2da;background:#fff">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td style="vertical-align:top">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:1px;color:#163e86">ERP VAX WIJAYA</div>
              <div style="margin-top:5px;font-size:13px;font-weight:900;letter-spacing:2.2px;color:#172233">${title}</div>
              <div style="margin-top:4px;font-size:10px;font-weight:700;letter-spacing:1.2px;color:#6e7884;text-transform:uppercase">Enterprise Management System</div>
            </td>
            <td align="right" style="vertical-align:top;font-size:10px;line-height:1.55;color:#56616e">
              <b style="display:block;color:#163e86;letter-spacing:1.1px">CONFIDENTIAL</b>
              ${clock.date}<br>${clock.time}
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:22px 24px">
          <div style="margin:0 0 16px;padding:11px 13px;border-left:4px solid #b88a19;background:#f5f7f9;color:#4d5966;font-size:12px;line-height:1.55">${subtitle}</div>
          ${content}
        </td></tr>
        <tr><td style="padding:12px 24px;border-top:1px solid #cbd2da;background:#f6f7f9">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td style="font-size:10px;line-height:1.45;color:#43505d"><b style="display:block;color:#163e86">ERP VAX WIJAYA</b>MASTER TAGIHAN</td>
            <td align="center" style="font-size:9px;line-height:1.45;color:#7a8490">INTERNAL / CONFIDENTIAL<br>Generated automatically</td>
            <td align="right" style="font-size:9px;line-height:1.45;color:#7a8490">${clock.date}<br>${clock.time}</td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function buildHtml(rows) {
  const total = rows.reduce((s, r) => s + Number(r.nominal || 0), 0);
  const grouped = new Map();
  for (const r of rows) {
    const d = daysUntilMonthly(r.jatuh_tempo_hari);
    if (!grouped.has(d)) grouped.set(d, []);
    grouped.get(d).push(r);
  }

  const sections = [...grouped.entries()].sort((a,b)=>a[0]-b[0]).map(([d, items]) => {
    const color = urgencyColor(d);
    const cards = items.map(r => `
      <tr><td style="padding:0 0 9px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d5dae0;background:#fff">
          <tr><td style="padding:13px 15px">
            <div style="font-size:10px;font-weight:900;color:${color};letter-spacing:1.2px">${urgencyLabel(d)}</div>
            <div style="margin-top:5px;font-size:16px;font-weight:800;color:#172233">${String(r.kategori || '').replaceAll('_',' ')} — ${r.cabang || '—'}</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px"><tr>
              <td style="font-size:12px;color:#697481">Jatuh tempo<br><b style="color:#172233">${targetDateLabel(r.jatuh_tempo_hari)}</b></td>
              <td align="right" style="font-size:12px;color:#697481">Nominal<br><b style="font-size:16px;color:#163e86">${fmtMoney(r.nominal)}</b></td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`).join('');
    return `<table width="100%" role="presentation" cellspacing="0" cellpadding="0">${cards}</table>`;
  }).join('');

  const content = `${sections}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;border-top:2px solid #172233">
      <tr><td style="padding-top:14px;font-size:12px;color:#697481">Total kewajiban pada reminder ini</td><td align="right" style="padding-top:12px;font-size:22px;font-weight:900;color:#163e86">${fmtMoney(total)}</td></tr>
      <tr><td colspan="2" style="padding-top:14px;font-size:11px;line-height:1.6;color:#697481">Pembayaran tetap dilakukan melalui Cash Out Minutes. Master Tagihan hanya berfungsi sebagai reminder dan tidak membuat transaksi Arus Kas.</td></tr>
      <tr><td colspan="2" style="padding-top:16px"><a href="${process.env.ERP_BASE_URL}/ERP.NEW/pages/master-tagihan.html" style="display:inline-block;padding:10px 15px;border:1px solid #b88a19;background:#fff8df;color:#6c5010;text-decoration:none;font-size:12px;font-weight:800">Buka Master Tagihan</a></td></tr>
    </table>`;

  return cashOutShell(content);
}

function buildTestHtml() {
  return cashOutShell(
    '<div style="padding:18px;border:1px solid #d5dae0;background:#fff"><div style="font-size:15px;font-weight:800;color:#172233">Test Email Notification</div><p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#697481">Test email notification berhasil dikirim dari VPS melalui Brevo SMTP.</p></div>',
    { title:'NOTIFICATION TEST', subtitle:'Verifikasi jalur VPS → Brevo SMTP → Owner + SVP' }
  );
}

async function loadRows() {
  const { data, error } = await db.from('master_tagihan')
    .select('id,kategori,cabang,jatuh_tempo_hari,nominal,aktif,notify_owner,notify_svp')
    .eq('aktif', true)
    .order('jatuh_tempo_hari', { ascending: true });
  if (error) throw error;
  return (data || []).filter(r => reminderDays.has(daysUntilMonthly(r.jatuh_tempo_hari)));
}

async function send(rows) {
  const recipients = [process.env.MAIL_OWNER, process.env.MAIL_SVP].filter(Boolean);
  const nearest = Math.min(...rows.map(r => daysUntilMonthly(r.jatuh_tempo_hari)));
  const subject = nearest === 0
    ? '[ERP VAX] JATUH TEMPO HARI INI — Master Tagihan'
    : `[ERP VAX] Reminder Tagihan H-${nearest}`;

  const message = {
    from: `"${process.env.MAIL_FROM_NAME || 'ERP VAX WIJAYA'}" <${process.env.MAIL_FROM}>`,
    to: recipients.join(','),
    subject,
    html: buildHtml(rows)
  };
  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, to: recipients, subject, rows: rows.length }, null, 2));
    return;
  }
  const info = await transport.sendMail(message);
  console.log(JSON.stringify({ sent: true, messageId: info.messageId, to: recipients, rows: rows.length }, null, 2));
}

async function main() {
  if (TEST_EMAIL) {
    await transport.verify();
    await transport.sendMail({
      from: `"${process.env.MAIL_FROM_NAME || 'ERP VAX WIJAYA'}" <${process.env.MAIL_FROM}>`,
      to: [process.env.MAIL_OWNER, process.env.MAIL_SVP].filter(Boolean).join(','),
      subject: '[ERP VAX] Test Email Notification',
      html: buildTestHtml()
    });
    console.log('Test email sent');
    return;
  }
  const rows = await loadRows();
  if (!rows.length) {
    console.log('No Master Tagihan reminder due today.');
    return;
  }
  await send(rows);
}

main().catch(err => {
  console.error('[ERP VAX Notification Service]', err);
  process.exitCode = 1;
});
