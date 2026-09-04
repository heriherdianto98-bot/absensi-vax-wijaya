/*
=========================================================
VAX ERP — SHARE CUKUR CARD + 3-LEVEL DRILLDOWN
=========================================================
READ ONLY UI consumer.
Canonical source: provider_sales_daily_source.provider_share
Flow:
1. Klik card Share Cukur -> total per cabang.
2. Klik total cabang -> ringkasan provider + total share provider.
3. Klik provider -> rincian tanggal + nominal share provider tersebut.
Tidak mengubah data, formula, sync, atau source.
=========================================================
*/
"use strict";

(function(){
    const VALUE_ID = "thcTotShareCukur";
    const MODAL_ID = "thcShareCukurDrilldownModal";
    let lastRows = [];
    let lastFilter = null;
    let seq = 0;
    let subscribed = false;

    function esc(value){
        return String(value ?? "")
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }

    function rupiah(value){
        const n = Number(value || 0);
        return new Intl.NumberFormat("id-ID", {
            style:"currency", currency:"IDR", minimumFractionDigits:0, maximumFractionDigits:0
        }).format(Number.isFinite(n) ? n : 0);
    }

    function cardEl(){
        return document.getElementById(VALUE_ID)?.closest(".thc-tot-item") || null;
    }

    function getFilter(){
        if(typeof DashboardEngine === "undefined") return null;
        const start = DashboardEngine.lastRange?.start || null;
        const end = DashboardEngine.lastRange?.end || start;
        if(!start || !end) return null;
        const cabangId = typeof DashboardEngine.resolveCabangId === "function"
            ? DashboardEngine.resolveCabangId(DashboardEngine.lastCabangId)
            : null;
        const opIds = cabangId == null && typeof DashboardEngine.getOperationalCabangIds === "function"
            ? DashboardEngine.getOperationalCabangIds().map(Number).filter(Number.isFinite)
            : null;
        return { start, end, cabangId: cabangId == null ? null : Number(cabangId), opIds };
    }

    function branchNameMap(){
        const map = new Map();
        if(typeof DashboardEngine?.getOperationalCabangList === "function"){
            for(const c of DashboardEngine.getOperationalCabangList() || []){
                map.set(Number(c.id), c.nama_cabang || `Cabang #${c.id}`);
            }
        }
        return map;
    }

    function shortName(name){
        return String(name || "—")
            .replace(/^vax\s+wijaya\s+/i, "")
            .replace(/^vaxwijaya\s+/i, "")
            .trim() || "—";
    }

    async function fetchRows(filter){
        if(typeof db === "undefined") throw new Error("Supabase client tidak tersedia");
        if(!filter?.start || !filter?.end) return [];
        const out = [];
        const pageSize = 1000;
        let from = 0;
        while(true){
            let q = db
                .from("provider_sales_daily_source")
                .select("activity_date,cabang_id,provider_name_raw,provider_share,source")
                .gte("activity_date", filter.start)
                .lte("activity_date", filter.end)
                .eq("source", "MINUTES_PROVIDER_SALES_DAILY")
                .range(from, from + pageSize - 1);
            if(filter.cabangId != null) q = q.eq("cabang_id", filter.cabangId);
            else if(Array.isArray(filter.opIds) && filter.opIds.length) q = q.in("cabang_id", filter.opIds);
            else return [];
            const { data, error } = await q;
            if(error) throw error;
            const batch = data || [];
            out.push(...batch);
            if(batch.length < pageSize) break;
            from += pageSize;
        }
        return out;
    }

    function normalizedRows(){
        const names = branchNameMap();
        return (lastRows || []).map(r => ({
            tanggal: String(r.activity_date || "").slice(0,10),
            cabangId: Number(r.cabang_id),
            cabang: shortName(names.get(Number(r.cabang_id)) || `Cabang #${r.cabang_id}`),
            provider: String(r.provider_name_raw || "—").trim() || "—",
            nominal: Number(r.provider_share || 0)
        })).filter(r => Number.isFinite(r.nominal) && r.nominal > 0)
          .sort((a,b) => a.cabang.localeCompare(b.cabang) || a.provider.localeCompare(b.provider) || a.tanggal.localeCompare(b.tanggal));
    }

    function groups(){
        const map = new Map();
        for(const row of normalizedRows()){
            const key = String(row.cabangId);
            if(!map.has(key)) map.set(key, { key, cabang: row.cabang, total:0, rows:[] });
            const g = map.get(key);
            g.total += row.nominal;
            g.rows.push(row);
        }
        return [...map.values()].sort((a,b) => b.total - a.total || a.cabang.localeCompare(b.cabang));
    }

    function providerGroups(branchGroup){
        const map = new Map();
        for(const row of branchGroup?.rows || []){
            const key = String(row.provider || "—");
            if(!map.has(key)) map.set(key, { key, provider: row.provider, total:0, rows:[] });
            const g = map.get(key);
            g.total += row.nominal;
            g.rows.push(row);
        }
        return [...map.values()].sort((a,b) => b.total - a.total || a.provider.localeCompare(b.provider));
    }

    function total(){
        return normalizedRows().reduce((sum,r) => sum + r.nominal, 0);
    }

    function ensureInteractive(){
        const card = cardEl();
        if(!card) return false;
        card.classList.add("is-link");
        card.setAttribute("role","button");
        card.setAttribute("tabindex","0");
        card.setAttribute("aria-label","Buka rincian Share Cukur");
        card.title = "Klik untuk lihat Share Cukur per cabang";
        if(!card.querySelector(".share-cukur-click-hint")){
            const hint = document.createElement("span");
            hint.className = "share-cukur-click-hint";
            hint.setAttribute("aria-hidden","true");
            hint.innerHTML = `<span class="share-cukur-click-icon">↗</span><span>DETAIL</span>`;
            card.appendChild(hint);
        }
        const desc = card.querySelector(".thc-share-desc");
        if(desc) desc.textContent = "Klik untuk lihat total share per cabang";
        return true;
    }

    function ensureModal(){
        let modal = document.getElementById(MODAL_ID);
        if(modal) return modal;
        const style = document.createElement("style");
        style.textContent = `
            #thcTotals .thc-tot-item.is-share-cukur{position:relative;cursor:pointer;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}
            #thcTotals .thc-tot-item.is-share-cukur .share-cukur-click-hint{position:absolute;top:10px;right:12px;display:inline-flex;align-items:center;gap:5px;color:#5eead4;font-size:10px;font-weight:800;letter-spacing:.04em;opacity:.9;pointer-events:none;white-space:nowrap}
            #thcTotals .thc-tot-item.is-share-cukur .share-cukur-click-icon{display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;border:1px solid rgba(45,212,191,.38);border-radius:7px;background:rgba(20,184,166,.10);font-size:13px}
            #thcTotals .thc-tot-item.is-share-cukur:hover{transform:translateY(-1px);filter:brightness(1.06)}
            #${MODAL_ID}[hidden]{display:none!important}
            #${MODAL_ID}{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px}
            #${MODAL_ID} .sc-backdrop{position:absolute;inset:0;background:rgba(2,6,12,.78);backdrop-filter:blur(3px)}
            #${MODAL_ID} .sc-panel{position:relative;width:min(820px,96vw);max-height:82vh;overflow:hidden;border:1px solid rgba(45,212,191,.45);border-radius:16px;background:#0c131d;box-shadow:0 24px 80px rgba(0,0,0,.45);color:#eaf0f7}
            #${MODAL_ID} .sc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid rgba(45,212,191,.24)}
            #${MODAL_ID} .sc-head h3{margin:0;font-size:18px;color:#5eead4}
            #${MODAL_ID} .sc-head p{margin:3px 0 0;color:#9fb0c3;font-size:12px}
            #${MODAL_ID} .sc-close{width:38px;height:38px;border-radius:10px;border:1px solid #344254;background:#172231;color:#fff;font-size:22px;cursor:pointer}
            #${MODAL_ID} .sc-total{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:rgba(20,184,166,.07);border-bottom:1px solid rgba(45,212,191,.18)}
            #${MODAL_ID} .sc-total strong{font-size:22px;color:#5eead4}
            #${MODAL_ID} .sc-wrap{max-height:58vh;overflow:auto}
            #${MODAL_ID} table{width:100%;border-collapse:collapse;font-size:13px}
            #${MODAL_ID} th{position:sticky;top:0;background:#111b27;color:#5eead4;text-align:left;padding:11px 14px;border-bottom:1px solid #2b3948}
            #${MODAL_ID} td{padding:11px 14px;border-bottom:1px solid #1c2936;vertical-align:middle}
            #${MODAL_ID} td:last-child,#${MODAL_ID} th:last-child{text-align:right;white-space:nowrap}
            #${MODAL_ID} .sc-branch-btn,#${MODAL_ID} .sc-provider-btn{border:0;background:transparent;color:#5eead4;font:inherit;font-weight:800;cursor:pointer;padding:4px 0;text-decoration:underline;text-underline-offset:3px}
            #${MODAL_ID} .sc-provider-name{font-weight:800;color:#eef6fb}
            #${MODAL_ID} .sc-back{display:inline-flex;align-items:center;gap:7px;border:1px solid #344254;background:#172231;color:#dbe7f3;border-radius:9px;padding:7px 10px;cursor:pointer;margin:12px 14px 0}
            #${MODAL_ID} .sc-empty{padding:28px;text-align:center;color:#9fb0c3}
        `;
        document.head.appendChild(style);
        modal = document.createElement("div");
        modal.id = MODAL_ID;
        modal.hidden = true;
        modal.setAttribute("aria-hidden","true");
        modal.innerHTML = `
            <div class="sc-backdrop" data-sc-close></div>
            <section class="sc-panel" role="dialog" aria-modal="true" aria-labelledby="scTitle">
                <div class="sc-head"><div><h3 id="scTitle">Share Cukur per Cabang</h3><p id="scPeriod">—</p></div><button type="button" class="sc-close" data-sc-close aria-label="Tutup">×</button></div>
                <div class="sc-total"><span id="scTotalLabel">Total Share Cukur</span><strong id="scGrandTotal">Rp0</strong></div>
                <div class="sc-wrap"><div id="scBody"></div></div>
            </section>`;
        document.body.appendChild(modal);
        modal.addEventListener("click", e => {
            if(e.target.closest("[data-sc-close]")) return closeModal();
            const branch = e.target.closest("[data-sc-branch]");
            if(branch) return renderBranch(branch.dataset.scBranch);
            const provider = e.target.closest("[data-sc-provider]");
            if(provider) return renderProvider(provider.dataset.scBranch, provider.dataset.scProvider);
            if(e.target.closest("[data-sc-back-summary]")) return renderSummary();
            const backBranch = e.target.closest("[data-sc-back-branch]");
            if(backBranch) return renderBranch(backBranch.dataset.scBackBranch);
        });
        document.addEventListener("keydown", e => {
            if(e.key === "Escape" && !modal.hidden) closeModal();
        });
        return modal;
    }

    function renderSummary(){
        const modal = ensureModal();
        modal.querySelector("#scTitle").textContent = "Share Cukur per Cabang";
        modal.querySelector("#scTotalLabel").textContent = "Total Share Cukur";
        modal.querySelector("#scGrandTotal").textContent = rupiah(total());
        const body = modal.querySelector("#scBody");
        const list = groups();
        if(!list.length){
            body.innerHTML = `<div class="sc-empty">Belum ada Share Cukur pada periode aktif.</div>`;
            return;
        }
        body.innerHTML = `<table><thead><tr><th>Cabang</th><th>Total Share</th></tr></thead><tbody>${list.map(g => `<tr><td>${esc(g.cabang)}</td><td><button type="button" class="sc-branch-btn" data-sc-branch="${esc(g.key)}">${rupiah(g.total)}</button></td></tr>`).join("")}</tbody></table>`;
    }

    function renderBranch(key){
        const modal = ensureModal();
        const group = groups().find(g => g.key === key);
        if(!group) return renderSummary();
        modal.querySelector("#scTitle").textContent = `Share Cukur Provider — ${group.cabang}`;
        modal.querySelector("#scTotalLabel").textContent = `Total Share ${group.cabang}`;
        modal.querySelector("#scGrandTotal").textContent = rupiah(group.total);
        const providers = providerGroups(group);
        modal.querySelector("#scBody").innerHTML = `<button type="button" class="sc-back" data-sc-back-summary>← Kembali ke Cabang</button><table><thead><tr><th>Provider / Capster</th><th>Total Share Provider</th></tr></thead><tbody>${providers.map(p => `<tr><td><button type="button" class="sc-provider-btn sc-provider-name" data-sc-branch="${esc(group.key)}" data-sc-provider="${esc(p.key)}">${esc(p.provider)}</button></td><td><button type="button" class="sc-provider-btn" data-sc-branch="${esc(group.key)}" data-sc-provider="${esc(p.key)}">${rupiah(p.total)}</button></td></tr>`).join("")}</tbody></table>`;
    }

    function renderProvider(branchKey, providerKey){
        const modal = ensureModal();
        const group = groups().find(g => g.key === branchKey);
        if(!group) return renderSummary();
        const provider = providerGroups(group).find(p => p.key === providerKey);
        if(!provider) return renderBranch(branchKey);
        modal.querySelector("#scTitle").textContent = `${provider.provider} — ${group.cabang}`;
        modal.querySelector("#scTotalLabel").textContent = `Total Share ${provider.provider}`;
        modal.querySelector("#scGrandTotal").textContent = rupiah(provider.total);
        modal.querySelector("#scBody").innerHTML = `<button type="button" class="sc-back" data-sc-back-branch="${esc(group.key)}">← Kembali ke Provider</button><table><thead><tr><th>Tanggal</th><th>Nominal Share</th></tr></thead><tbody>${provider.rows.sort((a,b) => a.tanggal.localeCompare(b.tanggal)).map(r => `<tr><td>${esc(r.tanggal)}</td><td>${rupiah(r.nominal)}</td></tr>`).join("")}</tbody></table>`;
    }

    async function openModal(){
        if(!lastRows.length) await refresh();
        const modal = ensureModal();
        modal.querySelector("#scPeriod").textContent = lastFilter ? `${lastFilter.start} — ${lastFilter.end}` : "Periode aktif";
        renderSummary();
        modal.hidden = false;
        modal.setAttribute("aria-hidden","false");
        modal.querySelector(".sc-close")?.focus();
    }

    function closeModal(){
        const modal = document.getElementById(MODAL_ID);
        if(!modal) return;
        modal.hidden = true;
        modal.setAttribute("aria-hidden","true");
        cardEl()?.focus();
    }

    async function refresh(){
        const filter = getFilter();
        if(!filter) return;
        const mySeq = ++seq;
        try{
            const rows = await fetchRows(filter);
            if(mySeq !== seq) return;
            lastRows = rows;
            lastFilter = filter;
            ensureInteractive();
        }catch(err){
            console.warn("[ShareCukurCard] load gagal:", err);
        }
    }

    function bind(){
        if(typeof DashboardEngine === "undefined" || typeof DashboardEngine.subscribe !== "function"){
            setTimeout(bind,100);
            return;
        }
        const waitCard = setInterval(() => {
            if(ensureInteractive()) clearInterval(waitCard);
        },100);
        setTimeout(() => clearInterval(waitCard),15000);
        document.addEventListener("click", e => {
            if(e.target.closest("#thcTotals .thc-tot-item.is-share-cukur")) openModal();
        });
        document.addEventListener("keydown", e => {
            if((e.key === "Enter" || e.key === " ") && e.target.closest?.("#thcTotals .thc-tot-item.is-share-cukur")){
                e.preventDefault();
                openModal();
            }
        });
        refresh();
        if(!subscribed){
            subscribed = true;
            DashboardEngine.subscribe(event => {
                if(event === "loaded" || event === "calculated") setTimeout(refresh,50);
            });
        }
        document.addEventListener("change", e => {
            if(e.target?.id === "branchFilter" || e.target?.id === "periodFilter") setTimeout(refresh,150);
        });
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once:true });
    else bind();
})();
