/*
=========================================================
ERP VAX — Master Karyawan
=========================================================
Source of truth identity: public.karyawan (employee ID)
Operational display name for Capster: latest MATCHED Minutes provider name.
Generic Minutes labels `Backup` and `Capster` are NOT employees.
Owner UI can add/edit master employee data. Existing IDs are preserved.
=========================================================
*/

const MasterKaryawan = (() => {
  const state = { employees: [], branches: [], rows: [], uiBound: false, mode: "add" };
  const GENERIC_MINUTES = new Set(["backup", "capster"]);

  const $ = (id) => document.getElementById(id);
  const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  async function loadSources(){
    const [empRes, branchRes, providerRes] = await Promise.all([
      db.from("karyawan").select("id,nama_karyawan,cabang_id,jabatan,aktif,no_hp_wa,alamat_ktp").order("nama_karyawan", {ascending:true}),
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
        noHpWa: String(e.no_hp_wa || "").trim(),
        alamatKtp: String(e.alamat_ktp || "").trim(),
        source: isCapster && m?.name ? "Minutes" : "Master",
        minutesDate: m?.date || null
      };
    });
  }

  function roleOptions(){
    const values = new Set(state.rows.map(r => r.jabatan).filter(v => v && v !== "—"));
    ["Capster","Kasir","Kasir Backup / Floating","SPV"].forEach(v => values.add(v));
    return [...values].sort((a,b)=>a.localeCompare(b,"id"));
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
      role.innerHTML = '<option value="">Semua Jabatan</option>' + roleOptions().map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
      if([...role.options].some(o => o.value === selected)) role.value = selected;
    }
  }

  function populateFormOptions(){
    const branch = $("mkFormBranch");
    const role = $("mkFormRole");
    if(branch){
      branch.innerHTML = '<option value="">Pilih Cabang</option>' + state.branches.map(b => `<option value="${Number(b.id)}">${esc(b.nama_cabang)}</option>`).join("");
    }
    if(role){
      role.innerHTML = '<option value="">Pilih Jabatan</option>' + roleOptions().map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
    }
  }

  function filteredRows(){
    const q = norm($("mkSearch")?.value);
    const branch = Number($("mkBranch")?.value || 0);
    const role = String($("mkRole")?.value || "");
    const status = String($("mkStatus")?.value || "ACTIVE").toUpperCase();

    return state.rows.filter(r => {
      const haystack = norm(`${r.nama} ${r.namaMaster} ${r.cabang} ${r.jabatan}`);
      if(q && !haystack.includes(q)) return false;
      if(branch && Number(r.cabangId) !== branch) return false;
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
      body.innerHTML = '<tr><td colspan="7" class="mk-empty">Tidak ada data sesuai filter.</td></tr>';
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
        <td><button class="mk-edit" type="button" data-edit-id="${r.id}">✎ Edit</button></td>
      </tr>`).join("");
  }

  function showError(message){
    const box = $("mkFormError");
    if(!box) return;
    box.hidden = !message;
    box.textContent = message || "";
  }

  function openModal(id = null){
    const row = id ? state.rows.find(r => r.id === Number(id)) : null;
    state.mode = row ? "edit" : "add";
    populateFormOptions();
    showError("");

    $("mkFormId").value = row?.id || "";
    $("mkFormName").value = row?.namaMaster || "";
    $("mkFormBranch").value = row?.cabangId ? String(row.cabangId) : "";
    $("mkFormRole").value = row?.jabatan && row.jabatan !== "—" ? row.jabatan : "";
    $("mkFormActive").value = row?.aktif === false ? "false" : "true";
    $("mkFormPhone").value = row?.noHpWa || "";
    $("mkFormAddress").value = row?.alamatKtp || "";

    $("mkModalTitle").textContent = row ? `Edit ${row.nama}` : "Tambah Karyawan";
    $("mkModalHint").textContent = row
      ? "Ubah cabang, jabatan, status, nomor WhatsApp, atau alamat KTP. ID karyawan tidak berubah."
      : "Nomor HP/WhatsApp dan alamat sesuai KTP wajib untuk karyawan baru.";

    const modal = $("mkModal");
    modal?.classList.add("is-open");
    modal?.setAttribute("aria-hidden","false");
    setTimeout(() => $("mkFormName")?.focus(), 30);
  }

  function closeModal(){
    const modal = $("mkModal");
    modal?.classList.remove("is-open");
    modal?.setAttribute("aria-hidden","true");
    showError("");
  }

  function normalizePhone(value){
    return String(value || "").replace(/[^0-9+]/g, "").trim();
  }

  function validateForm(){
    const name = String($("mkFormName")?.value || "").trim();
    const branchId = Number($("mkFormBranch")?.value || 0);
    const role = String($("mkFormRole")?.value || "").trim();
    const phone = normalizePhone($("mkFormPhone")?.value);
    const address = String($("mkFormAddress")?.value || "").trim();

    if(!name) return "Nama karyawan wajib diisi.";
    if(GENERIC_MINUTES.has(norm(name))) return "Nama Backup/Capster generik tidak boleh dibuat sebagai karyawan.";
    if(!branchId) return "Cabang wajib dipilih.";
    if(!role) return "Jabatan wajib dipilih.";
    if(state.mode === "add" && !phone) return "No. HP / WhatsApp wajib diisi untuk karyawan baru.";
    if(state.mode === "add" && !address) return "Alamat sesuai KTP wajib diisi untuk karyawan baru.";

    const editingId = Number($("mkFormId")?.value || 0);
    const duplicate = state.rows.find(r => r.id !== editingId && norm(r.namaMaster) === norm(name));
    if(duplicate) return `Nama ${name} sudah ada di Master Karyawan (ID ${duplicate.id}).`;
    return "";
  }

  async function saveForm(event){
    event?.preventDefault();
    const error = validateForm();
    if(error){ showError(error); return; }

    const btn = $("mkSave");
    const oldText = btn?.textContent || "Simpan";
    if(btn){ btn.disabled = true; btn.textContent = "Menyimpan…"; }
    showError("");

    try{
      const payload = {
        nama_karyawan: String($("mkFormName").value || "").trim(),
        cabang_id: Number($("mkFormBranch").value),
        jabatan: String($("mkFormRole").value || "").trim(),
        aktif: $("mkFormActive").value === "true",
        no_hp_wa: normalizePhone($("mkFormPhone").value) || null,
        alamat_ktp: String($("mkFormAddress").value || "").trim() || null
      };

      if(state.mode === "edit"){
        const id = Number($("mkFormId").value);
        const { error: updateError } = await db.from("karyawan").update(payload).eq("id", id);
        if(updateError) throw updateError;
      }else{
        const nextId = Math.max(0, ...state.employees.map(e => Number(e.id) || 0)) + 1;
        const { error: insertError } = await db.from("karyawan").insert({ id: nextId, ...payload });
        if(insertError) throw insertError;
      }

      closeModal();
      await init();
      const status = $("mkLoadStatus");
      if(status) status.textContent = state.mode === "edit" ? "Data karyawan berhasil diperbarui." : "Karyawan baru berhasil ditambahkan.";
    }catch(err){
      console.error("Simpan Master Karyawan gagal", err);
      showError(err?.message || String(err));
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = oldText; }
    }
  }

  function handleFilterEvent(event){
    const id = event?.target?.id;
    if(!["mkSearch","mkBranch","mkRole","mkStatus"].includes(id)) return;
    render();
  }

  function handleClick(event){
    const edit = event.target.closest?.("[data-edit-id]");
    if(edit){ openModal(Number(edit.dataset.editId)); return; }
    if(event.target.closest?.("[data-mk-close]")){ closeModal(); return; }
  }

  function bind(){
    if(state.uiBound) return;
    document.addEventListener("input", handleFilterEvent);
    document.addEventListener("change", handleFilterEvent);
    document.addEventListener("search", handleFilterEvent);
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", e => { if(e.key === "Escape") closeModal(); });

    $("mkRefresh")?.addEventListener("click", init);
    $("mkAdd")?.addEventListener("click", () => openModal());
    $("mkForm")?.addEventListener("submit", saveForm);
    state.uiBound = true;
  }

  async function init(){
    const status = $("mkLoadStatus");
    try{
      bind();
      if(status) status.textContent = "Memuat data karyawan…";
      await loadSources();
      populateFilters();
      populateFormOptions();
      render();
      if(status) status.textContent = "Sinkron tampilan: nama Capster mengikuti Minutes; Backup/Capster generik dikecualikan.";
    }catch(err){
      console.error("Master Karyawan gagal dimuat", err);
      if(status) status.textContent = `Gagal memuat data: ${err?.message || err}`;
      const body = $("mkBody");
      if(body) body.innerHTML = '<tr><td colspan="7" class="mk-empty">Data belum dapat dimuat.</td></tr>';
    }
  }

  return { init, render, openModal };
})();

document.addEventListener("DOMContentLoaded", () => MasterKaryawan.init(), {once:true});
