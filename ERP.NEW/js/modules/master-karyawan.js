/*
=========================================================
ERP VAX — Master Karyawan
=========================================================
Source of truth identity: public.karyawan (employee ID)
Operational display name for Capster: latest MATCHED Minutes provider name.
Generic Minutes labels `Backup` and `Capster` are NOT employees.
This module is read-only toward Supabase.
=========================================================
*/

const MasterKaryawan = (() => {
  const state = { employees: [], branches: [], rows: [], uiBound: false };
  const GENERIC_MINUTES = new Set(["backup", "capster"]);

  const $ = (id) => document.getElementById(id);
  const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  async function loadSources(){
    const [empRes, branchRes, providerRes] = await Promise.all([
      db.from("karyawan").select("id,nama_karyawan,cabang_id,jabatan,aktif").order("nama_karyawan", {ascending:true}),
      db.from("cabang").select("id,nama_cabang").order("id", {ascending:true}),
      db.from("provider_sales_daily_source")
        .select("activity_date,employee_id,provider_name_raw,provider_name_normalized,mapping_status")
        .not("employee_id", "is", null)
        .eq("mapping_status", "MATCHED")
        .order("activity_date", {ascending:false})
        .limit(5000)
    ]);
    if(empRes.error) throw empRes.error;
    if(branchRes.error) throw branchRes.error;
    if(providerRes.error) throw providerRes.error;

    state.employees = Array.isArray(empRes.data) ? empRes.data : [];
    state.branches = Array.isArray(branchRes.data) ? branchRes.data : [];

    const branchMap = new Map(state.branches.map(b => [Number(b.id), b.nama_cabang]));
    const minutesNameByEmployee = new Map();

    (providerRes.data || []).forEach(r => {
      const id = Number(r.employee_id);
      if(!id || minutesNameByEmployee.has(id)) return;
      const raw = String(r.provider_name_raw || "").trim();
      const n = norm(r.provider_name_normalized || raw);
      if(!raw || GENERIC_MINUTES.has(n)) return;
      minutesNameByEmployee.set(id, {name: raw, date: r.activity_date || null});
    });

    const seenIds = new Set();
    state.rows = state.employees.filter(e => {
      const id = Number(e.id);
      if(!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    }).map(e => {
      const id = Number(e.id);
      const m = minutesNameByEmployee.get(id);
      const isCapster = norm(e.jabatan) === "capster";
      return {
        id,
        nama: isCapster && m?.name ? m.name : String(e.nama_karyawan || "").trim(),
        namaMaster: String(e.nama_karyawan || "").trim(),
        cabangId: Number(e.cabang_id) || null,
        cabang: branchMap.get(Number(e.cabang_id)) || "—",
        jabatan: String(e.jabatan || "—").trim(),
        aktif: e.aktif !== false,
        source: isCapster && m?.name ? "Minutes" : "Master",
        minutesDate: m?.date || null
      };
    });
  }

  function populateFilters(){
    const branch = $("mkBranch");
    const role = $("mkRole");
    if(branch){
      const selected = branch.value;
      branch.innerHTML = '<option value="">Semua Cabang</option>' + state.branches.map(b => `<option value="${Number(b.id)}">${esc(b.nama_cabang)}</option>`).join("");
      if([...branch.options].some(o => o.value === selected)) branch.value = selected;
    }
    if(role){
      const selected = role.value;
      const roles = [...new Set(state.rows.map(r => r.jabatan).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"id"));
      role.innerHTML = '<option value="">Semua Jabatan</option>' + roles.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
      if([...role.options].some(o => o.value === selected)) role.value = selected;
    }
  }

  function filteredRows(){
    const q = norm($("mkSearch")?.value);
    const branch = Number($("mkBranch")?.value || 0);
    const role = String($("mkRole")?.value || "");
    const status = String($("mkStatus")?.value || "ACTIVE");
    return state.rows.filter(r => {
      if(q && !norm(`${r.nama} ${r.namaMaster} ${r.cabang} ${r.jabatan}`).includes(q)) return false;
      if(branch && r.cabangId !== branch) return false;
      if(role && r.jabatan !== role) return false;
      if(status === "ACTIVE" && !r.aktif) return false;
      if(status === "INACTIVE" && r.aktif) return false;
      return true;
    }).sort((a,b) => a.cabang.localeCompare(b.cabang,"id") || a.nama.localeCompare(b.nama,"id"));
  }

  function render(){
    const rows = filteredRows();
    const body = $("mkBody");
    const count = $("mkCount");
    const active = state.rows.filter(r=>r.aktif).length;
    const capster = state.rows.filter(r=>r.aktif && norm(r.jabatan)==="capster").length;
    const other = state.rows.filter(r=>r.aktif && norm(r.jabatan)!=="capster").length;
    if($("mkTotal")) $("mkTotal").textContent = String(state.rows.length);
    if($("mkActive")) $("mkActive").textContent = String(active);
    if($("mkCapster")) $("mkCapster").textContent = String(capster);
    if($("mkOther")) $("mkOther").textContent = String(other);
    if(count) count.textContent = `${rows.length} karyawan`;

    if(!body) return;
    if(!rows.length){
      body.innerHTML = '<tr><td colspan="6" class="mk-empty">Tidak ada data sesuai filter.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r,i) => `
      <tr>
        <td class="mk-no">${i+1}</td>
        <td><div class="mk-name">${esc(r.nama)}</div><small>ID ${r.id}</small></td>
        <td>${esc(r.cabang)}</td>
        <td><span class="mk-role">${esc(r.jabatan)}</span></td>
        <td><span class="mk-status ${r.aktif?'is-active':'is-inactive'}">${r.aktif?'Aktif':'Nonaktif'}</span></td>
        <td><span class="mk-source ${r.source==='Minutes'?'is-minutes':''}">${esc(r.source)}</span></td>
      </tr>`).join("");
  }

  function bind(){
    if(state.uiBound) return;
    const search = $("mkSearch");
    const branch = $("mkBranch");
    const role = $("mkRole");
    const status = $("mkStatus");
    search?.addEventListener("input", render);
    search?.addEventListener("search", render);
    branch?.addEventListener("change", render);
    role?.addEventListener("change", render);
    status?.addEventListener("change", render);
    $("mkRefresh")?.addEventListener("click", init);
    state.uiBound = true;
  }

  async function init(){
    const status = $("mkLoadStatus");
    try{
      bind();
      if(status) status.textContent = "Memuat data karyawan…";
      await loadSources();
      populateFilters();
      render();
      if(status) status.textContent = "Sinkron tampilan: nama Capster mengikuti Minutes; Backup/Capster generik dikecualikan.";
    }catch(err){
      console.error("Master Karyawan gagal dimuat", err);
      if(status) status.textContent = `Gagal memuat data: ${err?.message || err}`;
      const body = $("mkBody");
      if(body) body.innerHTML = '<tr><td colspan="6" class="mk-empty">Data belum dapat dimuat.</td></tr>';
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => MasterKaryawan.init(), {once:true});
