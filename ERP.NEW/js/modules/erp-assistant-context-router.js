/* ERP VAX — ERP Assistant Global Help Context Router
   UI/help layer only. Pins Help Desk questions to the source module and prefers
   field/FAQ/rule-specific answers. Does not change any LOCK business engine.
*/
"use strict";

(function(){
  const KEY="erpAssistantGlobalHelpContextV1";

  function readCtx(){
    try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(_e){return null}
  }

  function fresh(ctx){
    const t=Date.parse(ctx?.captured_at||"");
    return Number.isFinite(t)&&(Date.now()-t)<30*60*1000;
  }

  function escRe(v){return String(v||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}

  function addUnique(arr,value){
    if(!Array.isArray(arr))return;
    if(!arr.includes(value))arr.push(value);
  }

  function patchApprovedContextKnowledge(ea){
    const tabel=ea.getModule?.("TABEL_HARIAN");
    if(tabel){
      tabel.fields=tabel.fields||{};
      Object.assign(tabel.fields,{
        omzet_gross:"Total omzet/gross harian cabang dari data canonical Minutes untuk tanggal tersebut.",
        nett_revenue:"Nett Revenue harian canonical setelah komponen share/pengurang yang memang sudah tercermin pada engine resmi ERP.",
        share_produk:"Bagian share dari penjualan produk sesuai source/engine Share Produk yang sudah dipakai Tabel Harian.",
        share_cukur:"Share Provider/Share Cukur dari source provider sales resmi untuk tanggal dan cabang terkait.",
        bri_merchant:"Nilai non-tunai aktual BRI Merchant yang diinput manual oleh Owner/SVP per tanggal + cabang. Angka disimpan ke bri_merchant_daily sebagai bri_non_cash_actual dan dipakai Setoran 3 Harian sebagai bridge read-only untuk penjumlahan periode; angka ini bukan hasil formula Tabel Harian.",
        customer:"Jumlah customer harian dari source canonical Minutes pada tanggal dan cabang terkait.",
        transaksi:"Jumlah transaksi harian dari source transaction_minutes yang berlaku pada ERP.",
        services:"Jumlah services harian dari source canonical Minutes pada tanggal dan cabang terkait."
      });
      tabel.faq=tabel.faq||[];
      if(!tabel.faq.some(x=>/cara isi bri merchant/i.test(x.q||""))){
        tabel.faq.push({
          q:"Cara isi BRI Merchant di Tabel Harian?",
          a:"Di Tabel Harian, klik nominal pada kolom BRI Merchant di baris tanggal + cabang yang ingin diisi. Masukkan nominal non-tunai aktual sesuai data BRI Merchant lalu klik Simpan. Input ini hanya untuk Owner/SVP. Jika data sudah tersimpan, gunakan Edit untuk mengubah atau Hapus untuk menghapus. Nilainya disimpan per tanggal+cabang di bri_merchant_daily dan kemudian dijumlahkan oleh Setoran 3 Harian sebagai bridge read-only."
        });
      }
      addUnique(tabel.aliases,"bri merchant tabel harian");
      addUnique(tabel.aliases,"kolom bri merchant");
    }
  }

  function explicitOtherModule(ea,query,active){
    const q=ea.expand?.(query)||String(query||"").toLowerCase();
    for(const m of (ea.knowledge?.modules||[])){
      if(!m||m.id===active?.id)continue;
      const canonical=ea.expand?.(m.name)||String(m.name||"").toLowerCase();
      if(canonical&&canonical.length>=5&&q.includes(canonical))return m;
      for(const alias of (m.aliases||[])){
        const a=ea.expand?.(alias)||String(alias||"").toLowerCase();
        if(!a||a.length<4)continue;
        const re=new RegExp(`\\b(?:di|modul|menu|halaman)\\s+${escRe(a)}\\b`);
        if(re.test(q))return m;
      }
    }
    return null;
  }

  function sourceFooter(ea,module,label="HELP DESK CONTEXT"){
    return `<div class="ea-source"><span>${ea.escape(module?.name||"Modul ERP")}</span><b>${ea.escape(label)}</b></div>`;
  }

  function exactBriHelp(ea,module){
    return `<p>Untuk <strong>BRI Merchant di Tabel Harian</strong>, yang diisi adalah nominal non-tunai aktual dari BRI Merchant untuk <strong>tanggal + cabang</strong> pada baris tersebut.</p>
      <div class="ea-rule-box"><strong>Cara isi</strong>
        <p><strong>1.</strong> Klik angka pada kolom <strong>BRI Merchant</strong> di baris tanggal dan cabang yang ingin diisi.</p>
        <p><strong>2.</strong> Masukkan nominal aktual sesuai data/laporan BRI Merchant.</p>
        <p><strong>3.</strong> Klik <strong>Simpan</strong>.</p>
        <p><strong>4.</strong> Jika angka sudah pernah tersimpan, gunakan <strong>Edit</strong> untuk mengubahnya atau <strong>Hapus</strong> untuk menghapus.</p>
      </div>
      <div class="ea-rule-box"><strong>Yang perlu diketahui</strong>
        <p>• Input hanya dapat dilakukan oleh <strong>Owner/SVP</strong>.</p>
        <p>• Nilai disimpan per tanggal+cabang di <strong>bri_merchant_daily</strong> sebagai angka aktual BRI.</p>
        <p>• Setoran 3 Harian hanya menjumlahkan nilai ini untuk periodenya sebagai bridge read-only; tidak mengubah formula Tabel Harian.</p>
      </div>
      ${sourceFooter(ea,module,"TABEL HARIAN · SPECIFIC")}`;
  }

  function genericFieldHelp(ea,module,field,intent,query){
    const label=ea.humanLabel?.(field.k)||field.k;
    const desc=String(field.v||"");
    const rules=ea.bestRules?.(module,query,3)||[];
    let html=`<p><strong>${ea.escape(label)}</strong> di <strong>${ea.escape(module.name)}</strong>: ${ea.moneyHighlight?.(desc)||ea.escape(desc)}</p>`;
    if(intent==="how"||/(cara|isi|input|edit|simpan|pakai|gunakan)/.test(ea.expand?.(query)||"")){
      html+=`<div class="ea-rule-box"><strong>Cara / alurnya</strong><p>Gunakan field/fitur ini sesuai fungsi di atas pada baris, periode, atau transaksi yang sedang dikerjakan.</p>${rules.map(x=>`<p>• ${ea.moneyHighlight?.(x.r)||ea.escape(x.r)}</p>`).join("")}</div>`;
    }else if(rules.length){
      html+=`<div class="ea-rule-box"><strong>Aturan terkait</strong>${rules.map(x=>`<p>• ${ea.moneyHighlight?.(x.r)||ea.escape(x.r)}</p>`).join("")}</div>`;
    }
    html+=sourceFooter(ea,module,"SPECIFIC CONTEXT");
    return html;
  }

  function install(){
    const params=new URLSearchParams(location.search);
    const ctx=readCtx();
    if(params.get("helpDesk")!=="1"||!fresh(ctx))return;
    const ea=window.ErpAssistant;
    if(!ea)return;

    const baseLoad=ea.loadKnowledge.bind(ea);
    ea.loadKnowledge=async function(){
      await baseLoad();
      patchApprovedContextKnowledge(ea);
    };

    const baseResolve=ea.resolveModule.bind(ea);
    ea.resolveModule=function(query){
      const active=ctx.module_id?ea.getModule?.(ctx.module_id):null;
      if(!active)return baseResolve(query);
      const explicit=explicitOtherModule(ea,query,active);
      if(explicit)return explicit;
      return active;
    };

    const baseCompose=ea.compose.bind(ea);
    ea.compose=function(query){
      const active=ctx.module_id?ea.getModule?.(ctx.module_id):null;
      if(!active)return baseCompose(query);
      const explicit=explicitOtherModule(ea,query,active);
      if(explicit)return baseCompose(query);

      const q=ea.expand?.(query)||String(query||"").toLowerCase();
      const intent=ea.detectIntent?.(query)||"general";

      if(active.id==="TABEL_HARIAN"&&/(bri\s*merchant|bri merchant|merchant bri)/.test(q)){
        ea.state={lastModuleId:active.id,lastFocus:"bri_merchant",lastIntent:intent};
        return {unknown:false,module:active,html:exactBriHelp(ea,active)};
      }

      const field=ea.bestField?.(active,query)||null;
      if(field){
        ea.state={lastModuleId:active.id,lastFocus:field.k,lastIntent:intent};
        return {unknown:false,module:active,html:genericFieldHelp(ea,active,field,intent,query)};
      }

      const faq=ea.bestFaq?.(active,query)||null;
      if(faq){
        ea.state={lastModuleId:active.id,lastFocus:faq.f.q,lastIntent:intent};
        return {unknown:false,module:active,html:`<p>${ea.moneyHighlight?.(faq.f.a)||ea.escape(faq.f.a)}</p>${sourceFooter(ea,active,"SPECIFIC CONTEXT")}`};
      }

      const rules=ea.bestRules?.(active,query,3)||[];
      const specificIntent=/(cara|bagaimana|gimana|arti|maksud|kenapa|mengapa|asal|sumber|dari mana|isi|input|kolom|angka|tombol|status)/.test(q);
      if(specificIntent&&!rules.length){
        ea.state={lastModuleId:active.id,lastFocus:"knowledge_gap",lastIntent:intent};
        return {unknown:true,module:active,html:`<p>Saya tahu Bapak sedang berada di <strong>${ea.escape(active.name)}</strong>, tetapi knowledge untuk bagian yang ditanyakan belum cukup spesifik. Saya tidak akan mengalihkan jawaban ke modul lain atau menebak.</p>${sourceFooter(ea,active,"KNOWLEDGE BELUM SPESIFIK")}`};
      }

      return baseCompose(query);
    };
  }

  install();
})();
