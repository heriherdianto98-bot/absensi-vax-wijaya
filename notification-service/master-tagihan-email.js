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
  if (d === 0) return '#ef4444';
  if (d === 1) return '#f97316';
  return '#d9b54e';
}

function buildHtml(rows) {
  const total = rows.reduce((s, r) => s + Number(r.nominal || 0), 0);
  const grouped = new Map();
  for (const r of rows) {
    const d = daysUntilMonthly(r.jatuh_tempo_hari);
    const key = d;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(r);
  }

  const sections = [...grouped.entries()].sort((a,b)=>a[0]-b[0]).map(([d, items]) => {
    const color = urgencyColor(d);
    const cards = items.map(r => `
      <tr><td style="padding:0 0 10px 0">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #303944;border-radius:12px;background:#151c23">
          <tr><td style="padding:14px 16px">
            <div style="font-size:12px;font-weight:800;color:${color};letter-spacing:.08em">${urgencyLabel(d)}</div>
            <div style="margin-top:5px;font-size:18px;font-weight:800;color:#f5f7f9">${String(r.kategori || '').replaceAll('_',' ')} — ${r.cabang || '—'}</div>
            <div style="margin-top:10px;font-size:13px;color:#aeb8c2">Jatuh tempo: <b style="color:#fff">${targetDateLabel(r.jatuh_tempo_hari)}</b></div>
            <div style="margin-top:4px;font-size:13px;color:#aeb8c2">Nominal: <b style="color:#fff">${fmtMoney(r.nominal)}</b></div>
          </td></tr>
        </table>
      </td></tr>`).join('');
    return `<tr><td style="padding-top:8px"><table width="100%" role="presentation">${cards}</table></td></tr>`;
  }).join('');

  return `<!doctype html><html><body style="margin:0;background:#0b1016;font-family:Arial,sans-serif;color:#eef2f6">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1016;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border:1px solid #38434e;border-radius:16px;overflow:hidden;background:#10171d">
        <tr><td style="padding:22px 24px;border-bottom:2px solid #b6922e;background:linear-gradient(180deg,#161e26,#11171d)">
          <div style="font-size:12px;font-weight:900;color:#d9b54e;letter-spacing:.14em">ERP VAX WIJAYA</div>
          <div style="margin-top:5px;font-size:26px;font-weight:900;color:#fff">Master Tagihan</div>
          <div style="margin-top:5px;font-size:13px;color:#9aa6b1">Reminder otomatis Owner + SVP</div>
        </td></tr>
        <tr><td style="padding:20px 24px">${sections}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;border-top:1px solid #303944">
            <tr><td style="padding-top:16px;font-size:13px;color:#aeb8c2">Total kewajiban pada reminder ini</td></tr>
            <tr><td style="padding-top:4px;font-size:26px;font-weight:900;color:#f1c84d">${fmtMoney(total)}</td></tr>
            <tr><td style="padding-top:14px;font-size:12px;line-height:1.6;color:#7f8b97">Pembayaran tetap dilakukan melalui Cash Out Minutes. Master Tagihan hanya berfungsi sebagai reminder dan tidak membuat transaksi Arus Kas.</td></tr>
            <tr><td style="padding-top:18px"><a href="${process.env.ERP_BASE_URL}/ERP.NEW/pages/master-tagihan.html" style="display:inline-block;padding:11px 16px;border-radius:9px;background:#745815;color:#ffe59a;text-decoration:none;font-size:13px;font-weight:800">Buka Master Tagihan</a></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:12px 24px;border-top:1px solid #2b343d;background:#0d1318;text-align:center;font-size:10px;color:#68737d">ERP VAX WIJAYA · Automated Notification</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
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
      html: '<div style="font-family:Arial;background:#10171d;color:#fff;padding:24px"><h2 style="color:#d9b54e">ERP VAX WIJAYA</h2><p>Test email notification berhasil dikirim dari VPS.</p></div>'
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
