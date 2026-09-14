/*
=========================================================
VAX ERP — Kasbon Payment Flow UI Bridge V1
=========================================================
Scope: Kasbon UI integration only.
- Does NOT modify Payroll core/formula.
- Does NOT write Arus Kas directly; backend RPC/trigger is canonical.
- BULANAN = payroll deduction flow.
- HARIAN = SVP/Owner records daily payment via RPC.
=========================================================
*/
(() => {
  if (typeof KasbonModule === "undefined" || typeof db === "undefined") return;
  const M = KasbonModule;
  if (M.__paymentFlowUiV1) return;
  M.__paymentFlowUiV1 = true;

  const escapeHtml = (v) => String(v ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const methodForPosition = (position) => String(position || "").trim().toLowerCase() === "capster" ? "HARIAN" : "BULANAN";
  const money = (n) => M.formatRupiah ? M.formatRupiah(Number(n || 0)) : `Rp${Number(n || 0).toLocaleString("id-ID")}`;
  const todayWib = () => M.todayWib ? M.todayWib() : new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

  function currentEmployee(){
    const id = Number(document.getElementById("kasbonFormKaryawan")?.value || 0);
    return (M.karyawanList || []).find(r => Number(r.id) === id) || null;
  }

  function markExistingMonthlyKasbon(){
    const summary = document.querySelector("#kasbonForm .kasbon-employee-summary") || document.querySelector(".kasbon-modal .kasbon-employee-summary");
    if(!summary) return;
    summary.querySelectorAll(".kasbon-existing-monthly-pulse").forEach(el => el.classList.remove("kasbon-existing-monthly-pulse"));
    const nodes = [...summary.querySelectorAll("div,span,strong,p")];
    const label = nodes.find(el => String(el.textContent || "").trim().toUpperCase() === "SUDAH KASBON BULAN INI");
    if(!label) return;
    const box = label.closest("div") || label.parentElement;
    const value = box?.querySelector("strong") || label.nextElementSibling;
    if(!value) return;
    const amount = Number(String(value.textContent || "").replace(/[^\d]/g,"")) || 0;
    if(amount > 0) value.classList.add("kasbon-existing-monthly-pulse");
  }

  function ensureUi(){
    const formGrid = document.querySelector("#kasbonForm .kasbon-fieldset:nth-of-type(2) .kasbon-form-grid");
    if(formGrid && !document.getElementById("kasbonFormPaymentMethod")){
      const label = document.createElement("label");
      label.className = "kasbon-field kasbon-field-wide kasbon-payment-method-field";
      label.innerHTML = `
        <span>Metode Pembayaran</span>
        <select id="kasbonFormPaymentMethod" disabled>
          <option value="BULANAN">BULANAN · Potong Gaji</option>
          <option value="HARIAN">HARIAN · Bayar via SVP</option>
        </select>
        <small id="kasbonFormPaymentHint" class="kasbon-payment-hint">Otomatis mengikuti jabatan.</small>`;
      const nominal = document.getElementById("kasbonFormNominal")?.closest("label");
      if(nominal?.nextSibling) formGrid.insertBefore(label, nominal.nextSibling);
      else formGrid.appendChild(label);
    }

    const ownerAmount = document.getElementById("kasbonOwnerAmountWrap");
    if(ownerAmount && !document.getElementById("kasbonOwnerPaymentMethodWrap")){
      const label = document.createElement("label");
      label.className = "kasbon-field kasbon-field-wide";
      label.id = "kasbonOwnerPaymentMethodWrap";
      label.hidden = true;
      label.innerHTML = `
        <span>Metode Pembayaran</span>
        <select id="kasbonOwnerPaymentMethod">
          <option value="BULANAN">BULANAN · Potong Gaji Otomatis</option>
          <option value="HARIAN">HARIAN · Input Pembayaran SVP</option>
        </select>
        <small class="kasbon-payment-hint">Owner boleh menentukan metode sebelum kasbon dicairkan.</small>`;
      ownerAmount.insertAdjacentElement("afterend", label);
    }

    if(!document.getElementById("kasbonPaymentModal")){
      const modal = document.createElement("div");
      modal.className = "kasbon-modal";
      modal.id = "kasbonPaymentModal";
      modal.hidden = true;
      modal.innerHTML = `
        <div class="kasbon-modal-backdrop" data-kasbon-payment-close></div>
        <div class="kasbon-modal-panel" role="dialog" aria-modal="true" aria-labelledby="kasbonPaymentTitle">
          <header class="kasbon-modal-head">
            <h3 id="kasbonPaymentTitle">Pembayaran Kasbon Harian</h3>
            <button type="button" class="kasbon-icon-btn" data-kasbon-payment-close aria-label="Tutup">×</button>
          </header>
          <form id="kasbonPaymentForm" class="kasbon-form" autocomplete="off">
            <input type="hidden" id="kasbonPaymentId">
            <input type="hidden" id="kasbonPaymentDedupe">
            <div class="kasbon-payment-summary" id="kasbonPaymentSummary"></div>
            <label class="kasbon-field kasbon-field-wide"><span>Nominal Bayar</span><input id="kasbonPaymentAmount" type="text" inputmode="numeric" placeholder="Rp0" required></label>
            <label class="kasbon-field kasbon-field-wide"><span>Tanggal Bayar</span><input id="kasbonPaymentDate" type="date" required></label>
            <label class="kasbon-field kasbon-field-wide"><span>Catatan (opsional)</span><textarea id="kasbonPaymentNote" rows="2"></textarea></label>
            <div class="kasbon-form-actions">
              <button type="button" class="kasbon-btn-ghost" data-kasbon-payment-close>Batal</button>
              <button type="submit" class="kasbon-btn-primary" id="kasbonPaymentSave">Simpan Pembayaran</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(modal);

      modal.addEventListener("click", (e) => {
        if(e.target.closest("[data-kasbon-payment-close]")) closePayment();
      });
      document.getElementById("kasbonPaymentAmount")?.addEventListener("input", (e) => M.formatNominalInput?.(e.target));
      document.getElementById("kasbonPaymentForm")?.addEventListener("submit", savePayment);
    }

    bindBridgeEvents();
  }

  let eventsBound = false;
  function bindBridgeEvents(){
    if(eventsBound) return;
    eventsBound = true;
    const root = document.getElementById("financeKasbonRoot") || document;
    root.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest("[data-kasbon-delete-test]");
      if(deleteBtn){
        e.preventDefault();
        e.stopPropagation();
        deleteTestKasbon(deleteBtn.getAttribute("data-kasbon-delete-test"));
        return;
      }
      const btn = e.target.closest("[data-kasbon-pay-daily]");
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openPayment(btn.getAttribute("data-kasbon-pay-daily"));
    });
  }

  function syncFormMethod(row = null){
    const select = document.getElementById("kasbonFormPaymentMethod");
    const hint = document.getElementById("kasbonFormPaymentHint");
    if(!select) return;
    const emp = currentEmployee();
    const method = row?.payment_method || methodForPosition(emp?.jabatan || row?.position_snapshot || "");
    select.value = method;
    if(hint){
      hint.textContent = method === "HARIAN"
        ? "Default Capster: pembayaran harian dicatat SVP."
        : "Default Kasir / SVP / Floating: dipotong otomatis saat payroll.";
    }
  }

  function addMethodBadges(){
    (M.rows || []).forEach(row => {
      const detailBtn = document.querySelector(`[data-kasbon-detail="${CSS.escape(String(row.id))}"]`);
      const tr = detailBtn?.closest("tr");
      if(!tr || tr.querySelector(".kasbon-method-badge")) return;
      const statusCell = tr.cells?.[6];
      if(!statusCell) return;
      const method = row.payment_method || methodForPosition(row.position_snapshot);
      const badge = document.createElement("span");
      badge.className = `kasbon-method-badge is-${method.toLowerCase()}`;
      badge.textContent = method;
      badge.title = method === "HARIAN" ? "Pembayaran harian via SVP" : "Potong gaji otomatis";
      statusCell.appendChild(document.createElement("br"));
      statusCell.appendChild(badge);
    });
  }

  async function augmentDetail(row){
    if(!row) return;
    const body = document.getElementById("kasbonDetailBody");
    const actions = document.getElementById("kasbonDetailActions");
    if(!body || !actions) return;
    body.querySelector(".kasbon-payment-detail")?.remove();
    const method = row.payment_method || methodForPosition(row.position_snapshot);
    const panel = document.createElement("section");
    panel.className = "kasbon-payment-detail";
    panel.innerHTML = `
      <div><span>Metode Bayar</span><strong><span class="kasbon-method-badge is-${method.toLowerCase()}">${method}</span></strong></div>
      <div><span>Total Dibayar</span><strong>${money(row.total_paid)}</strong></div>
      <div><span>Sisa Kasbon</span><strong>${money(row.current_outstanding)}</strong></div>
      <div><span>Skema</span><strong>${method === "HARIAN" ? "Input pembayaran oleh SVP" : "Potong gaji otomatis"}</strong></div>
      <div class="kasbon-payment-history" id="kasbonPaymentHistory"><span>Riwayat Pembayaran</span><strong>Memuat…</strong></div>`;
    body.appendChild(panel);

    actions.querySelectorAll("[data-kasbon-lunas]").forEach(el => el.remove());
    actions.querySelectorAll("[data-kasbon-delete-test]").forEach(el => el.remove());

    const status = String(row.status || "").toUpperCase();
    const deletableTestStatuses = ["DRAFT","MENUNGGU OWNER","DIKEMBALIKAN","DITOLAK","DISETUJUI"];
    if(M.role === "owner" && deletableTestStatuses.includes(status)){
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "kasbon-btn-danger";
      delBtn.setAttribute("data-kasbon-delete-test", row.id);
      delBtn.textContent = "Hapus Data Tes";
      delBtn.title = "Owner-only. Hanya sebelum kasbon masuk pencairan / pembayaran.";
      actions.insertBefore(delBtn, actions.firstChild);
    }

    if(method === "HARIAN" && ["AKTIF","DICAIRKAN"].includes(status) && Number(row.current_outstanding || 0) > 0){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kasbon-btn-primary";
      btn.setAttribute("data-kasbon-pay-daily", row.id);
      btn.textContent = "Bayar Harian";
      actions.insertBefore(btn, actions.firstChild);
    }

    try{
      const {data,error} = await db.from("employee_cash_advance_payments")
        .select("id,payment_date,amount,source,note,created_at")
        .eq("kasbon_id", row.id)
        .order("payment_date",{ascending:false})
        .order("created_at",{ascending:false})
        .limit(8);
      if(error) throw error;
      const box = document.getElementById("kasbonPaymentHistory");
      if(!box) return;
      if(!data?.length){ box.innerHTML = `<span>Riwayat Pembayaran</span><strong>Belum ada pembayaran</strong>`; return; }
      box.innerHTML = `<span>Riwayat Pembayaran</span><div>${data.map(p => `<p><b>${escapeHtml(p.payment_date)}</b> · ${money(p.amount)} <small>${escapeHtml(p.source)}</small>${p.note ? ` · ${escapeHtml(p.note)}` : ""}</p>`).join("")}</div>`;
    }catch(err){
      const box = document.getElementById("kasbonPaymentHistory");
      if(box) box.innerHTML = `<span>Riwayat Pembayaran</span><strong>Gagal memuat</strong>`;
      console.error(err);
    }
  }

  async function deleteTestKasbon(id){
    if(M.busy || M.role !== "owner") return;
    const row = (M.rows || []).find(r => String(r.id) === String(id));
    if(!row){ M.toast?.("Data Kasbon tidak ditemukan.","error"); return; }
    const status = String(row.status || "").toUpperCase();
    if(["DICAIRKAN","AKTIF","LUNAS"].includes(status)){
      M.toast?.("Kasbon sudah masuk alur keuangan dan tidak boleh hard delete.","error");
      return;
    }
    const ok = confirm(`HAPUS DATA TES KASBON?\n\n${row.employee_name_snapshot || "—"}\n${money(row.approved_amount ?? row.requested_amount)}\nStatus: ${status}\n\nData ini akan dihapus permanen. Lanjutkan?`);
    if(!ok) return;
    M.busy = true;
    try{
      const {error} = await db.rpc("erp_kasbon_delete_test",{p_kasbon_id:id});
      if(error) throw error;
      M.toast?.("Data tes Kasbon dihapus.","success");
      M.historyCache?.delete(id);
      M.closeModal?.("detail");
      await M.loadList();
    }catch(err){
      console.error(err);
      M.toast?.(err?.message || String(err),"error");
    }finally{
      M.busy = false;
    }
  }

  function openPayment(id){
    const row = (M.rows || []).find(r => String(r.id) === String(id));
    if(!row){ M.toast?.("Data Kasbon tidak ditemukan.","error"); return; }
    const method = row.payment_method || methodForPosition(row.position_snapshot);
    if(method !== "HARIAN"){ M.toast?.("Kasbon ini bukan metode HARIAN.","error"); return; }
    if(!["owner","spv"].includes(M.role)){ M.toast?.("Akses pembayaran Kasbon ditolak.","error"); return; }
    if(Number(row.current_outstanding || 0) <= 0){ M.toast?.("Kasbon sudah tidak memiliki outstanding.","warn"); return; }
    document.getElementById("kasbonPaymentId").value = row.id;
    document.getElementById("kasbonPaymentDedupe").value = `SVP_HARIAN:${row.id}:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    document.getElementById("kasbonPaymentAmount").value = "Rp0";
    document.getElementById("kasbonPaymentDate").value = todayWib();
    document.getElementById("kasbonPaymentNote").value = "";
    document.getElementById("kasbonPaymentSummary").innerHTML = `
      <strong>${escapeHtml(row.employee_name_snapshot || "—")}</strong>
      <span>${escapeHtml(row.branch_name_snapshot || "—")} · Outstanding ${money(row.current_outstanding)}</span>`;
    document.getElementById("kasbonPaymentModal").hidden = false;
  }

  function closePayment(){
    const modal = document.getElementById("kasbonPaymentModal");
    if(modal) modal.hidden = true;
  }

  async function savePayment(e){
    e.preventDefault();
    if(M.busy) return;
    const id = document.getElementById("kasbonPaymentId")?.value;
    const row = (M.rows || []).find(r => String(r.id) === String(id));
    const amount = M.parseRupiah?.(document.getElementById("kasbonPaymentAmount")?.value) || 0;
    const date = document.getElementById("kasbonPaymentDate")?.value || todayWib();
    const note = String(document.getElementById("kasbonPaymentNote")?.value || "").trim();
    const dedupe = document.getElementById("kasbonPaymentDedupe")?.value || null;
    if(!row || !(amount > 0)){ M.toast?.("Nominal pembayaran harus > 0.","error"); return; }
    if(amount > Number(row.current_outstanding || 0)){ M.toast?.("Pembayaran melebihi outstanding.","error"); return; }
    M.busy = true;
    const btn = document.getElementById("kasbonPaymentSave");
    if(btn) btn.disabled = true;
    try{
      const {error} = await db.rpc("erp_kasbon_record_payment",{
        p_kasbon_id:id,
        p_amount:amount,
        p_payment_date:date,
        p_note:note || null,
        p_source:"SVP_HARIAN",
        p_payroll_period:null,
        p_dedupe_key:dedupe
      });
      if(error) throw error;
      M.toast?.("Pembayaran Kasbon tersimpan. Arus Kas bertambah otomatis.","success");
      M.historyCache?.delete(id);
      closePayment();
      await M.loadList();
    }catch(err){
      console.error(err);
      M.toast?.(err?.message || String(err),"error");
    }finally{
      M.busy = false;
      if(btn) btn.disabled = false;
    }
  }

  const originalBoot = M.boot.bind(M);
  M.boot = async function(opts = {}){
    const result = await originalBoot(opts);
    ensureUi();
    syncFormMethod();
    addMethodBadges();
    return result;
  };

  const originalLoadList = M.loadList.bind(M);
  M.loadList = async function(...args){
    const result = await originalLoadList(...args);
    const visibleRows = (M.rows || []).filter(row => String(row?.status || "").toUpperCase() !== "LUNAS");
    if(visibleRows.length !== (M.rows || []).length){
      M.rows = visibleRows;
      M.renderSummary?.();
      M.renderOwnerQueue?.();
      M.renderTable?.();
    }
    ensureUi();
    addMethodBadges();
    return result;
  };

  if(typeof M.onEmployeeSelected === "function"){
    const originalEmployeeSelected = M.onEmployeeSelected.bind(M);
    M.onEmployeeSelected = async function(...args){
      const result = await originalEmployeeSelected(...args);
      syncFormMethod();
      window.requestAnimationFrame(markExistingMonthlyKasbon);
      return result;
    };
  }

  if(typeof M.openForm === "function"){
    const originalOpenForm = M.openForm.bind(M);
    M.openForm = async function(id = null){
      const result = await originalOpenForm(id);
      ensureUi();
      const row = id ? (M.rows || []).find(r => String(r.id) === String(id)) : null;
      syncFormMethod(row);
      window.requestAnimationFrame(markExistingMonthlyKasbon);
      return result;
    };
  }

  const originalOpenOwnerAction = M.openOwnerAction.bind(M);
  M.openOwnerAction = function(id, action){
    ensureUi();
    const result = originalOpenOwnerAction(id, action);
    const row = (M.rows || []).find(r => String(r.id) === String(id));
    const wrap = document.getElementById("kasbonOwnerPaymentMethodWrap");
    const select = document.getElementById("kasbonOwnerPaymentMethod");
    if(wrap) wrap.hidden = action !== "APPROVE";
    if(select && row) select.value = row.payment_method || methodForPosition(row.position_snapshot);
    return result;
  };

  M.confirmOwnerAction = async function(){
    if(this.busy || this.role !== "owner") return;
    const id = document.getElementById("kasbonOwnerId")?.value;
    const action = document.getElementById("kasbonOwnerAction")?.value;
    const note = String(document.getElementById("kasbonOwnerNote")?.value || "").trim();
    const amount = this.parseRupiah(document.getElementById("kasbonOwnerAmount")?.value);
    const row = this.rows.find(r => String(r.id) === String(id));
    if(!row) return;
    const patch = {owner_note:note || null};
    if(action === "APPROVE"){
      if(!(amount > 0)){ this.toast("Nominal final disetujui harus > 0.","error"); return; }
      const method = String(document.getElementById("kasbonOwnerPaymentMethod")?.value || row.payment_method || methodForPosition(row.position_snapshot)).toUpperCase();
      if(!["BULANAN","HARIAN"].includes(method)){ this.toast("Metode pembayaran tidak valid.","error"); return; }
      patch.status = "DISETUJUI";
      patch.approved_amount = amount;
      patch.payment_method = method;
    }else if(action === "RETURN"){
      if(!note){ this.toast("Catatan Owner wajib saat Kembalikan.","error"); return; }
      patch.status = "DIKEMBALIKAN";
      patch.approved_amount = null;
    }else if(action === "REJECT"){
      if(!note){ this.toast("Alasan Owner wajib saat Tolak.","error"); return; }
      patch.status = "DITOLAK";
      patch.approved_amount = null;
    }else return;

    this.busy = true;
    const btn = document.getElementById("kasbonOwnerConfirm");
    if(btn) btn.disabled = true;
    try{
      const {error} = await db.from(this.TABLE).update(patch).eq("id",id);
      if(error) throw error;
      this.toast("Aksi Owner tersimpan.","success");
      this.closeModal("owner");
      this.historyCache.delete(id);
      await this.loadList();
    }catch(err){
      console.error(err);
      this.toast(err?.message || String(err),"error");
    }finally{
      this.busy = false;
      if(btn) btn.disabled = false;
    }
  };

  const originalOpenDetail = M.openDetail.bind(M);
  M.openDetail = function(id){
    const result = originalOpenDetail(id);
    const row = (M.rows || []).find(r => String(r.id) === String(id));
    augmentDetail(row);
    return result;
  };
})();

/* =========================================================
   FORM TANGGAL PENGAJUAN — CUSTOM CYAN CALENDAR / UI ONLY
   Keeps #kasbonFormTanggal as the canonical value source.
   ========================================================= */
(() => {
  if(typeof KasbonModule === "undefined") return;
  const M = KasbonModule;
  if(M.__formDateCyanUiV1) return;
  M.__formDateCyanUiV1 = true;

  const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  let viewYear = 0;
  let viewMonth = 0;

  const fmt = (iso) => {
    const p = String(iso || "").split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "Pilih tanggal";
  };

  const today = () => M.todayWib ? M.todayWib() : new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

  function closePicker(){
    const popup = document.getElementById("kasbonFormDatePopup");
    const trigger = document.getElementById("kasbonFormDateTrigger");
    if(popup) popup.hidden = true;
    if(trigger) trigger.setAttribute("aria-expanded","false");
  }

  function syncTrigger(){
    const input = document.getElementById("kasbonFormTanggal");
    const label = document.getElementById("kasbonFormDateLabel");
    if(input && label) label.textContent = fmt(input.value);
  }

  function render(){
    const input = document.getElementById("kasbonFormTanggal");
    const monthEl = document.getElementById("kasbonFormDateMonth");
    const grid = document.getElementById("kasbonFormDateGrid");
    if(!input || !monthEl || !grid) return;
    monthEl.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    const selected = input.value || "";
    const now = today();
    const first = new Date(Date.UTC(viewYear,viewMonth,1,12));
    const offset = (first.getUTCDay()+6)%7;
    const max = new Date(Date.UTC(viewYear,viewMonth+1,0,12)).getUTCDate();
    let html = "";
    for(let i=0;i<offset;i++) html += `<span class="kasbon-form-date-day is-empty"></span>`;
    for(let d=1;d<=max;d++){
      const iso = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const cls = ["kasbon-form-date-day"];
      if(iso===selected) cls.push("is-selected");
      if(iso===now) cls.push("is-today");
      html += `<button type="button" class="${cls.join(" ")}" data-kasbon-form-date="${iso}">${d}</button>`;
    }
    grid.innerHTML = html;
  }

  function openPicker(){
    const input = document.getElementById("kasbonFormTanggal");
    const popup = document.getElementById("kasbonFormDatePopup");
    const trigger = document.getElementById("kasbonFormDateTrigger");
    if(!input || !popup || !trigger) return;
    const seed = input.value || today();
    const p = seed.split("-").map(Number);
    viewYear = p[0];
    viewMonth = (p[1] || 1)-1;
    popup.hidden = false;
    trigger.setAttribute("aria-expanded","true");
    render();
  }

  function ensurePicker(){
    const input = document.getElementById("kasbonFormTanggal");
    if(!input || document.getElementById("kasbonFormDateTrigger")){
      syncTrigger();
      return;
    }
    const label = input.closest("label");
    if(!label) return;
    input.classList.add("kasbon-form-date-native");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden","true");

    const wrap = document.createElement("div");
    wrap.className = "kasbon-form-date-wrap";
    wrap.innerHTML = `
      <button type="button" class="kasbon-form-date-trigger" id="kasbonFormDateTrigger" aria-haspopup="dialog" aria-expanded="false">
        <span id="kasbonFormDateLabel">${fmt(input.value)}</span><i aria-hidden="true">▣</i>
      </button>
      <div class="kasbon-form-date-popup" id="kasbonFormDatePopup" role="dialog" aria-label="Pilih tanggal pengajuan" hidden>
        <div class="kasbon-form-date-head">
          <button type="button" data-kasbon-form-date-nav="-1" aria-label="Bulan sebelumnya">‹</button>
          <strong id="kasbonFormDateMonth">—</strong>
          <button type="button" data-kasbon-form-date-nav="1" aria-label="Bulan berikutnya">›</button>
        </div>
        <div class="kasbon-form-date-week"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div>
        <div class="kasbon-form-date-grid" id="kasbonFormDateGrid"></div>
        <div class="kasbon-form-date-foot"><button type="button" data-kasbon-form-date-today>Hari ini</button></div>
      </div>`;
    input.insertAdjacentElement("afterend",wrap);

    const trigger = document.getElementById("kasbonFormDateTrigger");
    trigger?.addEventListener("click",()=>{
      const popup = document.getElementById("kasbonFormDatePopup");
      if(popup?.hidden) openPicker(); else closePicker();
    });
    wrap.addEventListener("click",(e)=>{
      const nav = e.target.closest("[data-kasbon-form-date-nav]");
      if(nav){
        const delta = Number(nav.getAttribute("data-kasbon-form-date-nav") || 0);
        viewMonth += delta;
        if(viewMonth<0){viewMonth=11;viewYear--;} else if(viewMonth>11){viewMonth=0;viewYear++;}
        render();
        return;
      }
      const day = e.target.closest("[data-kasbon-form-date]");
      if(day){
        input.value = day.getAttribute("data-kasbon-form-date") || input.value;
        input.dispatchEvent(new Event("change",{bubbles:true}));
        syncTrigger();
        closePicker();
        return;
      }
      if(e.target.closest("[data-kasbon-form-date-today]")){
        input.value = today();
        input.dispatchEvent(new Event("change",{bubbles:true}));
        syncTrigger();
        closePicker();
      }
    });
    input.addEventListener("change",syncTrigger);
  }

  document.addEventListener("click",(e)=>{
    const wrap = document.querySelector(".kasbon-form-date-wrap");
    if(wrap && !wrap.contains(e.target)) closePicker();
  });
  document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") closePicker(); });

  const originalBoot = M.boot.bind(M);
  M.boot = async function(...args){
    const result = await originalBoot(...args);
    ensurePicker();
    return result;
  };
  if(typeof M.openForm === "function"){
    const originalOpenForm = M.openForm.bind(M);
    M.openForm = async function(...args){
      const result = await originalOpenForm(...args);
      ensurePicker();
      syncTrigger();
      closePicker();
      return result;
    };
  }
})();