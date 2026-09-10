import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ERP VAX — Minutes Provider Master -> ERP Karyawan sync
// Default DRY RUN. Write hanya jika --apply diberikan.
// Rules:
// - Minutes controls: nama operasional, cabang aktif, status aktif
// - ERP controls/preserves: employee id, jabatan, no_hp_wa, alamat_ktp, history
// - CAPSTER/BACKUP generic bukan orang
// - explicit provider_master_identity_map has highest identity priority
// - explicit alias mapping may preserve ERP canonical name (e.g. NDING Minutes = Nazril ERP)
// - never creates/deletes employees
// - never changes jabatan/no_hp_wa/alamat_ktp

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("ENV Supabase belum lengkap.");
const supabase = createClient(supabaseUrl, serviceKey);

const input = process.argv.find(v=>v.startsWith("--input="))?.slice(8) || "/tmp/provider-master-live.json";
const output = process.argv.find(v=>v.startsWith("--out="))?.slice(6) || "/tmp/provider-master-sync-result.json";
const APPLY = process.argv.includes("--apply");
const GENERIC = new Set(["capster","backup"]);
const norm = (v="") => String(v).trim().replace(/\s+/g," ").toLowerCase();

const live = JSON.parse(fs.readFileSync(input,"utf8"));
if (!live?.branches?.length) throw new Error("Input provider live kosong/tidak valid.");

const { data:karyawan, error:kErr } = await supabase.from("karyawan")
  .select("id,nama_karyawan,cabang_id,aktif,jabatan,no_hp_wa,alamat_ktp");
if (kErr) throw kErr;

const { data:cabang, error:cErr } = await supabase.from("cabang")
  .select("id,nama_cabang,nama_minutes");
if (cErr) throw cErr;

const { data:identityMap, error:mErr } = await supabase.from("provider_master_identity_map")
  .select("provider_minutes_id,employee_id,provider_name_alias,source,confirmed_by_owner");
if (mErr) throw mErr;

const { data:history, error:hErr } = await supabase.from("provider_sales_daily_source")
  .select("provider_minutes_id,employee_id,activity_date")
  .not("provider_minutes_id","is",null)
  .not("employee_id","is",null)
  .order("activity_date",{ascending:false});
if (hErr) throw hErr;

const empById = new Map((karyawan||[]).map(x=>[Number(x.id),x]));
const branchByMinutes = new Map((cabang||[]).map(x=>[norm(x.nama_minutes),x]));
const branchById = new Map((cabang||[]).map(x=>[Number(x.id),x]));
const explicitByProvider = new Map((identityMap||[]).map(x=>[String(x.provider_minutes_id),x]));

const historyByProvider = new Map();
for (const r of history || []) {
  const pid=String(r.provider_minutes_id||"");
  if (pid && r.employee_id && !historyByProvider.has(pid)) historyByProvider.set(pid,Number(r.employee_id));
}

const employeesByName = new Map();
for (const e of karyawan || []) {
  const n=norm(e.nama_karyawan);
  if (!n) continue;
  if (!employeesByName.has(n)) employeesByName.set(n,[]);
  employeesByName.get(n).push(e);
}

function resolveEmployee(p, branchId) {
  const pid=String(p.provider_minutes_id||"");
  const name=norm(p.provider_name_raw);
  if (!pid || !name || GENERIC.has(name)) return {status:"GENERIC_IGNORED",employee:null,reason:"generic",explicit:null};

  const explicit=explicitByProvider.get(pid);
  if (explicit) {
    const employee=empById.get(Number(explicit.employee_id)) || null;
    if (!employee) return {status:"BROKEN_EXPLICIT_MAP",employee:null,reason:`mapped employee ${explicit.employee_id} missing`,explicit};
    return {status:"MATCHED_EXPLICIT",employee,reason:`provider_id ${pid} explicit map`,explicit};
  }

  const histId=historyByProvider.get(pid);
  if (histId && empById.has(histId)) return {status:"MATCHED_ID_HISTORY",employee:empById.get(histId),reason:`provider_id ${pid} historical mapping`,explicit:null};

  const sameBranch=(karyawan||[]).filter(e=>Number(e.cabang_id)===Number(branchId) && norm(e.nama_karyawan)===name);
  if (sameBranch.length===1) return {status:"MATCHED_NAME_BRANCH",employee:sameBranch[0],reason:"exact name + branch",explicit:null};

  const globals=employeesByName.get(name)||[];
  if (globals.length===1) return {status:"MATCHED_NAME_GLOBAL",employee:globals[0],reason:"globally unique exact name",explicit:null};
  if (globals.length>1) return {status:"AMBIGUOUS_NAME",employee:null,reason:`${globals.length} ERP employees same name`,explicit:null};
  return {status:"UNMAPPED",employee:null,reason:"no explicit/history/exact-name mapping",explicit:null};
}

const rows=[];
for (const b of live.branches || []) {
  const branch=branchByMinutes.get(norm(b.nama_minutes)) || branchById.get(Number(b.cabang_id)) || null;
  const branchId=branch?.id ?? b.cabang_id ?? null;
  for (const p of b.providers || []) {
    const r=resolveEmployee(p,branchId);
    const e=r.employee;
    const proposed=[];
    let preserveName=false;

    if (e) {
      if (r.explicit?.confirmed_by_owner && r.explicit.provider_name_alias && norm(r.explicit.provider_name_alias)===norm(p.provider_name_raw) && norm(e.nama_karyawan)!==norm(p.provider_name_raw)) {
        preserveName=true;
      }
      if (!preserveName && norm(e.nama_karyawan)!==norm(p.provider_name_raw)) {
        proposed.push({field:"nama_karyawan",from:e.nama_karyawan,to:p.provider_name_raw});
      }
      if (Number(e.cabang_id)!==Number(branchId)) {
        proposed.push({field:"cabang_id",from:e.cabang_id,to:branchId,from_name:branchById.get(Number(e.cabang_id))?.nama_cabang||null,to_name:branch?.nama_cabang||b.cabang});
      }
      const liveActive=Boolean(p.active);
      if (Boolean(e.aktif)!==liveActive) proposed.push({field:"aktif",from:Boolean(e.aktif),to:liveActive});
    }

    rows.push({
      cabang_minutes:b.nama_minutes,
      cabang_id:branchId,
      provider_minutes_id:p.provider_minutes_id,
      nama_minutes:p.provider_name_raw,
      active_minutes:Boolean(p.active),
      mapping_status:r.status,
      mapping_reason:r.reason,
      employee_id:e?.id??null,
      nama_erp:e?.nama_karyawan??null,
      jabatan_erp:e?.jabatan??null,
      cabang_erp:e?.cabang_id??null,
      aktif_erp:e?.aktif??null,
      preserve_erp_name:preserveName,
      proposed_changes:proposed
    });
  }
}

const byEmployee=new Map();
for (const r of rows) {
  if (!r.employee_id || r.mapping_status==="GENERIC_IGNORED") continue;
  if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id,[]);
  byEmployee.get(r.employee_id).push(r);
}
const multi=[...byEmployee.entries()].filter(([,a])=>a.length>1).map(([employee_id,a])=>({employee_id,count:a.length,provider_ids:a.map(x=>x.provider_minutes_id)}));

const blockers={
  ambiguous:rows.filter(r=>r.mapping_status==="AMBIGUOUS_NAME").length,
  broken_explicit:rows.filter(r=>r.mapping_status==="BROKEN_EXPLICIT_MAP").length,
  multi_live_provider_employees:multi.length
};
const unmapped=rows.filter(r=>r.mapping_status==="UNMAPPED").length;

const writableRows=rows.filter(r=>r.employee_id && r.proposed_changes.length>0);
const applied=[];

if (APPLY) {
  if (blockers.ambiguous || blockers.broken_explicit || blockers.multi_live_provider_employees) {
    throw new Error(`SYNC BLOCKED: ${JSON.stringify(blockers)}`);
  }

  for (const r of writableRows) {
    const patch={};
    for (const c of r.proposed_changes) {
      if (c.field==="nama_karyawan" || c.field==="cabang_id" || c.field==="aktif") patch[c.field]=c.to;
    }
    if (!Object.keys(patch).length) continue;

    const { data:updated, error:uErr } = await supabase.from("karyawan")
      .update(patch)
      .eq("id",r.employee_id)
      .select("id,nama_karyawan,cabang_id,aktif,jabatan,no_hp_wa,alamat_ktp")
      .single();
    if (uErr) throw new Error(`Update employee ${r.employee_id} gagal: ${uErr.message}`);
    applied.push({employee_id:r.employee_id,provider_minutes_id:r.provider_minutes_id,patch,updated});
  }
}

const summary={
  mode:APPLY?"APPLY":"DRY_RUN",
  providers_total:rows.length,
  generic_ignored:rows.filter(r=>r.mapping_status==="GENERIC_IGNORED").length,
  matched:rows.filter(r=>r.employee_id).length,
  unmapped,
  rows_with_changes:writableRows.length,
  blockers,
  applied:applied.length
};

const payload={
  generated_at:new Date().toISOString(),
  input,
  rules:{minutes_updates:["nama_karyawan","cabang_id","aktif"],erp_preserved:["id","jabatan","no_hp_wa","alamat_ktp","history"],generic_ignored:[...GENERIC]},
  summary,
  rows,
  applied
};
fs.writeFileSync(output,JSON.stringify(payload,null,2));
console.log(JSON.stringify(summary,null,2));
console.log(`OUTPUT=${output}`);
console.log(`WRITE_MODE=${APPLY?"TRUE":"FALSE"}`);
