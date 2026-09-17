/* Master Cabang target suggestions — isolated consumer UI. READ ONLY until owner uses existing Save button.
   Never changes DashboardEngine, target-bulanan save logic, or any source data. */
"use strict";
(() => {
  const modal = document.getElementById("modalTargetBulanan");
  const list = document.getElementById("targetListWrapper");
  const monthEl = document.getElementById("targetBulanSelect");
  const yearEl = document.getElementById("targetTahunInput");
  if (!modal || !list || !monthEl || !yearEl) return;

  const fmt = value => "Rp " + Math.round(value).toLocaleString("id-ID");
  const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  let seq = 0;
  let sourceKey = "";
  let sources = new Map();

  const style = document.createElement("style");
  style.id = "cabangTargetRecommendationStyle";
  style.textContent = `
    #modalTargetBulanan .target-reco-panel{margin:16px 22px 0;padding:14px 17px;border:1px solid rgba(243,199,86,.45);border-radius:13px;background:linear-gradient(140deg,#323c48,#202b38);color:#eef3fa;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 6px 14px rgba(0,0,0,.20)}
    #modalTargetBulanan .target-reco-title{font-size:17px;font-weight:900;color:#ffe08b}
    #modalTargetBulanan .target-reco-help{margin:5px 0 10px;color:#dbe4f0;font-size:13px;line-height:1.5}
    #modalTargetBulanan .target-reco-status{font-size:13px;color:#f7df9f;font-weight:700;line-height:1.5}
    #modalTargetBulanan .target-reco-bulk{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}
    #modalTargetBulanan .target-reco-btn{padding:8px 11px;border:1px solid #b68d33;border-radius:8px;background:linear-gradient(180deg,#50432a,#302c27);color:#ffe7a2;font-size:12px;font-weight:900;cursor:pointer}
    #modalTargetBulanan .target-reco-btn:hover:not(:disabled){filter:brightness(1.17)}
    #modalTargetBulanan .target-reco-btn:disabled{opacity:.42;cursor:not-allowed}
    #modalTargetBulanan .target-reco-source{margin-top:7px;color:#e6edf7;font-size:12px;font-weight:700;line-height:1.45}
    #modalTargetBulanan .target-reco-warning{color:#ffce91}
    #modalTargetBulanan .target-reco-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
    #modalTargetBulanan .target-reco-actions .target-reco-btn{padding:5px 8px;font-size:11px}
    #modalTargetBulanan .target-row{align-items:center;min-height:103px}
    #modalTargetBulanan .target-row .target-nama{min-width:0}
    #modalTargetBulanan .target-reco-foot{margin:10px 0 0;color:#cbd5e1;font-size:12px;line-height:1.5}
    @media(max-width:620px){#modalTargetBulanan .target-reco-panel{margin:12px 13px 0;padding:12px}#modalTargetBulanan .target-row{grid-template-columns:minmax(0,1fr) 130px;gap:8px}#modalTargetBulanan .target-reco-actions .target-reco-btn{font-size:10px;padding:5px}}
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.className = "target-reco-panel";
  panel.setAttribute("aria-label", "Usulan target dari omzet ERP");
  panel.innerHTML = `
    <div class="target-reco-title">📊 Dasar Target dari Omzet ERP</div>
    <p class="target-reco-help">Sumber: omzet aktual (service + produk) bulan sebelumnya dari daily_recap_source, per ID cabang. Pilih Samakan atau Naik 5% untuk mengisi nominal; tidak tersimpan sebelum klik Simpan Semua Target.</p>
    <div class="target-reco-status" id="targetRecoStatus" aria-live="polite">Pilih bulan dan tahun target.</div>
    <div class="target-reco-bulk"><button type="button" class="target-reco-btn" data-target-reco-all="same" disabled>Samakan semua yang lengkap</button><button type="button" class="target-reco-btn" data-target-reco-all="up5" disabled>Naik 5% semua yang lengkap</button></div>
    <p class="target-reco-foot">Data tidak lengkap, duplikat, atau omzet Rp0 tidak diberi usulan otomatis. Nilai tersimpan tetap bisa diedit manual; tidak ada angka yang diganti tanpa tindakan Anda.</p>
  `;
  list.before(panel);
  const status = panel.querySelector("#targetRecoStatus");
  const bulkButtons = [...panel.querySelectorAll("[data-target-reco-all]")];

  function sourcePeriod(){
    const month = Number(monthEl.value), year = Number(yearEl.value);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2020 || year > 2100) return null;
    const start = new Date(Date.UTC(year, month - 2, 1));
    const priorYear = start.getUTCFullYear(), priorMonth = start.getUTCMonth() + 1;
    const days = new Date(Date.UTC(priorYear, priorMonth, 0)).getUTCDate();
    const yy = String(priorYear), mm = String(priorMonth).padStart(2,"0");
    return { key:`${year}-${month}`, label:`${months[priorMonth-1]} ${priorYear}`, start:`${yy}-${mm}-01`, end:`${yy}-${mm}-${String(days).padStart(2,"0")}`, days };
  }

  async function fetchSource(period){
    const client = typeof db !== "undefined" ? db : null;
    if (!client?.from) throw new Error("Koneksi Supabase belum siap.");
    const result = [];
    const pageSize = 1000;
    for (let from = 0; from < 10000; from += pageSize){
      const { data, error } = await client.from("daily_recap_source")
        .select("tanggal,cabang_id,service,produk")
        .gte("tanggal",period.start).lte("tanggal",period.end)
        .order("tanggal",{ascending:true}).order("cabang_id",{ascending:true})
        .range(from,from+pageSize-1);
      if(error) throw error;
      const chunk = data || [];
      result.push(...chunk);
      if(chunk.length < pageSize) return result;
    }
    throw new Error("Data melewati batas 10.000 baris; tidak membuat usulan agar omzet tidak terpotong.");
  }

  function buildSources(rows, period){
    const map = new Map();
    rows.forEach(row => {
      const id = Number(row.cabang_id), date = String(row.tanggal || "").slice(0,10);
      if (!Number.isFinite(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      if(!map.has(id)) map.set(id,{omzet:0,dates:new Set(),duplicate:false,invalid:false});
      const item = map.get(id);
      const service = Number(row.service), produk = Number(row.produk);
      if(!Number.isFinite(service) || !Number.isFinite(produk) || service < 0 || produk < 0) item.invalid = true;
      else item.omzet += service + produk;
      if(item.dates.has(date)) item.duplicate = true;
      item.dates.add(date);
    });
    map.forEach(item => { item.ready = !item.duplicate && !item.invalid && item.omzet > 0 && item.dates.size === period.days; });
    return map;
  }

  function applySuggestion(id, mode){
    const info = sources.get(id);
    if(!info?.ready || sourceKey !== sourcePeriod()?.key) return false;
    const input = [...list.querySelectorAll(".input-target-cabang")].find(el => Number(el.dataset.cabangId) === id);
    if(!input) return false;
    const value = Math.round(info.omzet * (mode === "up5" ? 1.05 : 1));
    input.value = fmt(value);
    input.dispatchEvent(new Event("input",{bubbles:true})); // existing input listener recalculates total; does not save
    return true;
  }

  function paintRows(){
    if(sourceKey !== sourcePeriod()?.key) return;
    let readyCount = 0, shown = 0;
    list.querySelectorAll(".target-row").forEach(row => {
      const input = row.querySelector(".input-target-cabang");
      const name = row.querySelector(".target-nama");
      if(!input || !name) return;
      const id = Number(input.dataset.cabangId);
      const info = sources.get(id);
      let box = name.querySelector(".target-reco-detail");
      if(!box){box=document.createElement("div");box.className="target-reco-detail";name.appendChild(box);}
      shown++;
      if(info?.ready) readyCount++;
      if(!info){ box.innerHTML='<div class="target-reco-source target-reco-warning">Omzet sumber tidak tersedia · perlu review</div>';return; }
      const reason = info.invalid ? "Nilai sumber tidak valid" : info.duplicate ? "Tanggal duplikat" : info.dates.size !== sourcePeriod().days ? `Data ${info.dates.size}/${sourcePeriod().days} hari` : info.omzet <= 0 ? "Omzet belum tersedia" : "";
      box.innerHTML = `<div class="target-reco-source ${info.ready?"":"target-reco-warning"}">Omzet sumber: ${escape(fmt(info.omzet))} · ${info.dates.size}/${sourcePeriod().days} hari${reason?` · ${escape(reason)}`:""}</div><div class="target-reco-actions"><button type="button" class="target-reco-btn" data-target-reco-id="${id}" data-target-reco-mode="same" ${info.ready?"":"disabled"}>Samakan ${escape(fmt(info.omzet))}</button><button type="button" class="target-reco-btn" data-target-reco-id="${id}" data-target-reco-mode="up5" ${info.ready?"":"disabled"}>Naik 5% ${escape(fmt(info.omzet*1.05))}</button></div>`;
    });
    bulkButtons.forEach(button => {button.disabled = readyCount === 0;});
    if(shown) status.textContent += ""; // preserve source summary; row rerenders never overwrite user input
  }

  async function refresh(){
    const current = ++seq;
    sources = new Map(); sourceKey = "";
    bulkButtons.forEach(button => {button.disabled=true;});
    if(!modal.classList.contains("show")) return;
    const period = sourcePeriod();
    if(!period){status.textContent="Bulan/tahun target tidak valid.";return;}
    status.textContent = `Memeriksa omzet ${period.label}…`;
    try{
      const rows = await fetchSource(period);
      if(current !== seq || !modal.classList.contains("show") || sourcePeriod()?.key !== period.key) return;
      sources = buildSources(rows,period);
      sourceKey = period.key;
      const valid = [...sources.values()].filter(item=>item.ready).length;
      status.textContent = `Sumber ${period.label} (${period.start} s.d. ${period.end}) · ${rows.length} baris · ${valid} cabang memiliki data harian lengkap. Pilihan hanya mengubah draft di popup.`;
      paintRows();
    }catch(err){
      if(current !== seq) return;
      sourceKey="";
      status.textContent=`Usulan belum tersedia: ${err?.message || "gagal membaca data"}. Target tersimpan tidak diubah.`;
      console.warn("[Master Cabang Target Suggestion]",err);
    }
  }

  panel.addEventListener("click",event=>{
    const bulk = event.target.closest("[data-target-reco-all]");
    if(!bulk || bulk.disabled || !sourceKey) return;
    let applied = 0;
    list.querySelectorAll(".input-target-cabang").forEach(input=>{
      if(applySuggestion(Number(input.dataset.cabangId),bulk.dataset.targetRecoAll)) applied++;
    });
    status.textContent = `${applied} cabang dengan data lengkap diisi ke draft. Periksa nominal, kemudian klik Simpan Semua Target jika sudah sesuai.`;
  });
  list.addEventListener("click",event=>{
    const button = event.target.closest("[data-target-reco-id]");
    if(!button || button.disabled) return;
    if(applySuggestion(Number(button.dataset.targetRecoId),button.dataset.targetRecoMode)){
      status.textContent = `Usulan diterapkan pada draft cabang terpilih. Periksa nominal sebelum Simpan Semua Target.`;
    }
  });
  const observer = new MutationObserver(records=>{
    if(sourceKey && records.some(record=>record.type==="childList" && [...record.addedNodes].some(node=>node.nodeType===1 && (node.classList?.contains("target-row") || node.querySelector?.(".target-row"))))) paintRows();
  });
  observer.observe(list,{childList:true});
  document.getElementById("btnTargetBulanan")?.addEventListener("click",()=>setTimeout(refresh,0));
  monthEl.addEventListener("change",()=>setTimeout(refresh,0));
  yearEl.addEventListener("change",()=>setTimeout(refresh,0));
  document.getElementById("btnTutupModalTarget")?.addEventListener("click",()=>{seq++;sourceKey="";});
})();