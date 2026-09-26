(() => {
  const state = { employee: null, busy: false, rows: [] };
  const $ = (id) => document.getElementById(id);
  const rupiah = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");
  const parseRp = (v) => Number(String(v || "").replace(/[^0-9]/g, "")) || 0;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function showMessage(msg, ok){
    const el = $("ekMessage");
    if(!el) return;
    el.hidden = false;
    el.textContent = msg;
    el.className = "ek-message " + (ok ? "ok" : "err");
  }

  function statusLabel(row){
    const ks=String(row?.kasbon_status||"").toUpperCase();
    const canonical={
      AKTIF:["Dicairkan (Aktif)","forward"],
      DICAIRKAN:["Dicairkan (Aktif)","forward"],
      DISETUJUI:["Disetujui Owner","forward"],
      "MENUNGGU OWNER":["Menunggu Owner","wait"],
      DIKEMBALIKAN:["Dikembalikan Owner","wait"],
      DITOLAK:["Ditolak Owner","reject"],
      LUNAS:["Lunas","forward"]
    };
    if(canonical[ks]) return canonical[ks];
    const intake=String(row?.status||"").toUpperCase();
    const map = {
      MENUNGGU_SVP: ["Menunggu SVP","wait"],
      DITERUSKAN_OWNER: ["Diteruskan ke Owner","forward"],
      DITOLAK_SVP: ["Ditolak SVP","reject"],
      DIBATALKAN_KARYAWAN: ["Dibatalkan","cancel"]
    };
    return map[intake] || [intake || "—","cancel"];
  }

  function formatDate(v){
    const p = String(v || "").slice(0,10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : "—";
  }

  async function loadHistory(){
    const host = $("ekList");
    if(host) host.innerHTML = '<div class="ek-empty">Memuat riwayat...</div>';
    const res = await db.rpc("employee_cash_advance_request_list", { p_session_token: KaryawanSession.getToken() });
    if(res.error){
      if(host) host.innerHTML = '<div class="ek-empty">Riwayat belum dapat dimuat.</div>';
      showMessage(res.error.message || "Gagal memuat riwayat.", false);
      return;
    }
    state.rows = res.data || [];
    $("ekCount").textContent = String(state.rows.length);
    if(!state.rows.length){
      host.innerHTML = '<div class="ek-empty">Belum ada pengajuan kasbon.</div>';
      return;
    }
    host.innerHTML = state.rows.map((r) => {
      const meta = statusLabel(r);
      let html = '<article class="ek-item">';
      html += '<div class="ek-item-head"><div><strong>' + rupiah(r.requested_amount) + '</strong><small>' + formatDate(r.request_date) + '</small></div>';
      html += '<span class="ek-status ' + meta[1] + '">' + esc(meta[0]) + '</span></div>';
      html += '<p><b>Kebutuhan:</b> ' + esc(r.reason || "—") + '</p>';
      if(r.request_description) html += '<p>' + esc(r.request_description) + '</p>';
      if(r.svp_note) html += '<p class="ek-item-note"><b>Catatan SVP:</b> ' + esc(r.svp_note) + '</p>';
      if(r.status === "MENUNGGU_SVP") html += '<div class="ek-item-actions"><button type="button" class="ek-cancel" data-ek-cancel="' + r.id + '">Batalkan</button></div>';
      html += '</article>';
      return html;
    }).join("");
  }

  async function submit(){
    if(state.busy) return;
    const amount = parseRp($("ekNominal").value);
    const reason = String($("ekReason").value || "").trim();
    const desc = String($("ekDesc").value || "").trim();
    if(!(amount > 0)){ showMessage("Nominal kasbon harus lebih dari Rp0.", false); return; }
    if(reason.length < 3){ showMessage("Alasan / kebutuhan minimal 3 karakter.", false); return; }

    state.busy = true;
    $("ekSubmit").disabled = true;
    try{
      const res = await db.rpc("employee_cash_advance_request_submit", {
        p_session_token: KaryawanSession.getToken(),
        p_requested_amount: amount,
        p_reason: reason,
        p_request_description: desc || null
      });
      if(res.error) throw res.error;
      if(res.data?.ok !== true) throw new Error("Pengajuan tidak tersimpan.");
      $("ekNominal").value = "";
      $("ekReason").value = "";
      $("ekDesc").value = "";
      showMessage("Pengajuan berhasil dikirim ke SVP.", true);
      await loadHistory();
    }catch(err){
      showMessage(err?.message || String(err), false);
    }finally{
      state.busy = false;
      $("ekSubmit").disabled = false;
    }
  }

  async function cancel(id){
    if(state.busy) return;
    if(!confirm("Batalkan pengajuan kasbon ini?")) return;
    state.busy = true;
    try{
      const res = await db.rpc("employee_cash_advance_request_cancel", {
        p_session_token: KaryawanSession.getToken(),
        p_request_id: id
      });
      if(res.error) throw res.error;
      showMessage("Pengajuan dibatalkan.", true);
      await loadHistory();
    }catch(err){
      showMessage(err?.message || String(err), false);
    }finally{
      state.busy = false;
    }
  }

  function bind(){
    $("ekForm")?.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    $("ekNominal")?.addEventListener("input", (e) => {
      const n = parseRp(e.target.value);
      e.target.value = n ? rupiah(n) : "";
    });
    $("ekRefresh")?.addEventListener("click", loadHistory);
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ek-cancel]");
      if(btn) cancel(btn.getAttribute("data-ek-cancel"));
    });
  }

  async function boot(){
    const emp = await KaryawanSession.requirePage();
    if(!emp) return;
    state.employee = emp;
    $("ekNama").textContent = emp.nama_karyawan || "Karyawan";
    $("ekMeta").textContent = (emp.jabatan || "Karyawan") + " · Cabang ID " + (emp.cabang_id ?? "—");
    bind();
    await loadHistory();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();