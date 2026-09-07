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
  function addUnique(arr,value){if(Array.isArray(arr)&&!arr.includes(value))arr.push(value)}

  function patchApprovedContextKnowledge(ea){
    const tabel=ea.getModule?.("TABEL_HARIAN");
    if(tabel){
      tabel.fields=tabel.fields||{};
      Object.assign(tabel.fields,{
        omzet_gross:"Total omzet/gross harian cabang dari data canonical Minutes untuk tanggal tersebut.",
        nett_revenue:"Nett Revenue harian canonical setelah komponen share/pengurang yang memang sudah tercermin pada engine resmi ERP.",
        share_produk:"Bagian share dari penjualan produk sesuai source/engine Share Produk yang sudah dipakai Tabel Harian.",
        share_cukur:"Share Provider/Share Cukur dari source provider sales resmi untuk tanggal dan cabang terkait.",
        bri_merchant:"Nilai aktual transaksi BRI Merchant yang diinput manual oleh Owner/SVP per tanggal + cabang. Angka disimpan ke bri_merchant_daily sebagai bri_non_cash_actual dan dipakai Setoran 3 Harian sebagai bridge read-only untuk penjumlahan periode; angka ini bukan hasil formula Tabel Harian.",
        customer:"Jumlah customer harian dari source canonical Minutes pada tanggal dan cabang terkait.",
        transaksi:"Jumlah transaksi harian dari source transaction_minutes yang berlaku pada ERP.",
        services:"Jumlah services harian dari source canonical Minutes pada tanggal dan cabang terkait."
      });
      tabel.faq=tabel.faq||[];
      if(!tabel.faq.some(x=>/cara isi bri merchant/i.test(x.q||""))){
        tabel.faq.push({q:"Cara isi BRI Merchant di Tabel Harian?",a:"Klik nominal pada kolom BRI Merchant di baris tanggal + cabang yang ingin diisi, masukkan nominal aktual sesuai data/laporan BRI Merchant, lalu Simpan. Input hanya untuk Owner/SVP. Jika sudah tersimpan, gunakan Edit atau Hapus. Nilainya disimpan per tanggal+cabang di bri_merchant_daily dan dijumlahkan oleh Setoran 3 Harian sebagai bridge read-only."});
      }
      addUnique(tabel.aliases,"bri merchant tabel harian");
      addUnique(tabel.aliases,"kolom bri merchant");
    }

    const setoran=ea.getModule?.("SETORAN_3_HARIAN");
    if(setoran){
      setoran.fields=setoran.fields||{};
      Object.assign(setoran.fields,{
        cash_harus_diambil:"Nilai cash canonical periode yang menjadi dasar setoran fisik untuk cabang tersebut.",
        non_tunai_minutes:"Total Non Tunai dari Tabel Harian/canonical Minutes pada periode Setoran.",
        nett_produk:"Total Nett Produk dari Tabel Harian untuk periode Setoran.",
        bri_merchant:"Nominal aktual BRI Merchant untuk periode Setoran. Nilai ini dibandingkan dengan Non Tunai Minutes untuk menghasilkan Selisih Non Tunai.",
        selisih_non_tunai:"Selisih antara BRI Merchant aktual dan Non Tunai Minutes pada periode Setoran.",
        biaya_di_luar_cashout:"Biaya/pengeluaran yang benar-benar mengurangi uang fisik setoran tetapi tidak tercatat di modul Cash Out. Nilai ini diinput SVP dan dikurangkan dari Cash Harus Diambil untuk mendapatkan Cash Aktual. Jika nilainya lebih dari 0, keterangan wajib diisi; sebelum status Sudah Diambil, bukti foto juga wajib jika ada biaya ini.",
        cash_aktual:"Uang fisik aktual yang harus disetorkan setelah Cash Harus Diambil dikurangi Biaya di luar Cashout. Pada flow aktif, rumus row-nya adalah cashReference - outside_cashout_cost.",
        keterangan:"Catatan wajib untuk menjelaskan selisih BRI Merchant vs Minutes atau Biaya di luar Cashout. Keterangan disimpan bersama baris Setoran.",
        bukti_foto:"Bukti foto Setoran. Jika ada selisih BRI Merchant vs Minutes atau Biaya di luar Cashout, bukti foto wajib sebelum SVP menandai Sudah Diambil.",
        sudah_diambil:"Status SVP bahwa uang fisik sudah diambil. BRI Merchant harus sudah diisi; jika ada selisih/biaya, bukti foto wajib terlebih dahulu."
      });
      setoran.faq=setoran.faq||[];
      const q="Biaya di luar Cashout itu apa?";
      if(!setoran.faq.some(x=>String(x.q||"").toLowerCase()===q.toLowerCase())){
        setoran.faq.push({q,a:"Biaya di luar Cashout adalah biaya/pengeluaran yang benar-benar mengurangi uang fisik setoran tetapi tidak tercatat di modul Cash Out. Di Setoran 3 Harian, SVP mengisi nominal ini bila memang ada. Nilainya dikurangkan dari Cash Harus Diambil untuk mendapatkan Cash Aktual. Jika nilainya lebih dari 0, Keterangan wajib diisi dan bukti foto wajib sebelum menandai Sudah Diambil."});
      }
      addUnique(setoran.aliases,"biaya di luar cashout");
      addUnique(setoran.aliases,"outside cashout");
      addUnique(setoran.aliases,"cash aktual setoran");
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
    return `<p>Untuk <strong>BRI Merchant di Tabel Harian</strong>, yang diisi adalah nominal aktual transaksi BRI Merchant untuk <strong>tanggal + cabang</strong> pada baris tersebut.</p>
      <div class="ea-rule-box"><strong>Cara isi</strong>
        <p><strong>1.</strong> Klik angka pada kolom <strong>BRI Merchant</strong> di baris tanggal dan cabang yang ingin diisi.</p>
        <p><strong>2.</strong> Masukkan nominal aktual sesuai data/laporan BRI Merchant.</p>
        <p><strong>3.</strong> Klik <strong>Simpan</strong>.</p>
        <p><strong>4.</strong> Jika angka sudah pernah tersimpan, gunakan <strong>Edit</strong> atau <strong>Hapus</strong>.</p>
      </div>
      <div class="ea-rule-box"><strong>Yang perlu diketahui</strong>
        <p>• Input hanya dapat dilakukan oleh <strong>Owner/SVP</strong>.</p>
        <p>• Nilai disimpan per tanggal+cabang di <strong>bri_merchant_daily</strong>.</p>
        <p>• Setoran 3 Harian menjumlahkan nilai ini untuk periodenya sebagai bridge read-only.</p>
      </div>${sourceFooter(ea,module,"TABEL HARIAN · SPECIFIC")}`;
  }

  function exactOutsideCashoutHelp(ea,module){
    return `<p><strong>Biaya di luar Cashout</strong> di Setoran 3 Harian adalah biaya/pengeluaran yang <strong>benar-benar mengurangi uang fisik setoran</strong>, tetapi biaya itu <strong>tidak tercatat di modul Cash Out</strong>.</p>
      <div class="ea-rule-box"><strong>Contoh pemakaian</strong>
        <p>Kalau ada pengeluaran nyata yang membuat uang fisik di kas berkurang, tetapi transaksi tersebut memang tidak masuk Cash Out, SVP mengisi nominalnya di kolom <strong>Biaya di luar Cashout</strong>.</p>
      </div>
      <div class="ea-rule-box"><strong>Pengaruh ke angka Setoran</strong>
        <p>• Nilai ini <strong>dikurangkan dari Cash Harus Diambil</strong> untuk mendapatkan <strong>Cash Aktual</strong>.</p>
        <p>• Jika nilainya <strong>lebih dari Rp0</strong>, <strong>Keterangan wajib diisi</strong>.</p>
        <p>• Sebelum ditandai <strong>Sudah Diambil</strong>, jika ada biaya ini maka <strong>bukti foto wajib</strong>.</p>
        <p>• Ini berbeda dari Cash Out yang sudah tercatat; Cash Out <strong>tidak boleh dikurangi ulang</strong> di Setoran.</p>
      </div>${sourceFooter(ea,module,"SETORAN 3 HARIAN · SPECIFIC")}`;
  }

  function exactSetoranFieldHelp(ea,module,q){
    if(/biaya\s*(di\s*)?luar\s*cash\s*out|outside\s*cash\s*out/.test(q))return exactOutsideCashoutHelp(ea,module);
    if(/cash\s*aktual/.test(q)){
      return `<p><strong>Cash Aktual</strong> adalah uang fisik aktual yang akan menjadi hasil setoran setelah memperhitungkan Biaya di luar Cashout.</p><div class="ea-rule-box"><strong>Rumus pada flow aktif</strong><p><strong>Cash Aktual = Cash Harus Diambil − Biaya di luar Cashout</strong>.</p><p>Cash Out yang sudah tercatat tidak dikurangi lagi.</p></div>${sourceFooter(ea,module,"SETORAN 3 HARIAN · SPECIFIC")}`;
    }
    if(/selisih\s*(non\s*tunai|bri)|bri.*selisih|selisih.*bri/.test(q)){
      return `<p><strong>Selisih Non Tunai</strong> membandingkan nominal BRI Merchant aktual dengan Non Tunai Minutes pada periode Setoran.</p><div class="ea-rule-box"><strong>Rumus</strong><p><strong>Selisih = BRI Merchant aktual − Non Tunai Minutes</strong>.</p><p>Jika ada selisih, Keterangan wajib diisi; untuk status Sudah Diambil, bukti foto juga wajib.</p></div>${sourceFooter(ea,module,"SETORAN 3 HARIAN · SPECIFIC")}`;
    }
    if(/sudah\s*diambil|belum\s*diambil/.test(q)){
      return `<p><strong>Sudah Diambil</strong> berarti SVP menyatakan uang fisik setoran cabang sudah diambil. Sebelum menandainya, BRI Merchant harus sudah diisi. Jika ada selisih atau Biaya di luar Cashout, bukti foto wajib tersedia.</p><p><strong>Belum Diambil</strong> berarti uang fisik masih belum diambil dan tetap diperlakukan sebagai Piutang Setoran pada flow terkait.</p>${sourceFooter(ea,module,"SETORAN 3 HARIAN · SPECIFIC")}`;
    }
    return null;
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
    return html+sourceFooter(ea,module,"SPECIFIC CONTEXT");
  }

  function install(){
    const params=new URLSearchParams(location.search);
    const ctx=readCtx();
    if(params.get("helpDesk")!=="1"||!fresh(ctx))return;
    const ea=window.ErpAssistant;
    if(!ea)return;

    const baseLoad=ea.loadKnowledge.bind(ea);
    ea.loadKnowledge=async function(){await baseLoad();patchApprovedContextKnowledge(ea)};

    const baseResolve=ea.resolveModule.bind(ea);
    ea.resolveModule=function(query){
      const active=ctx.module_id?ea.getModule?.(ctx.module_id):null;
      if(!active)return baseResolve(query);
      const explicit=explicitOtherModule(ea,query,active);
      return explicit||active;
    };

    const baseCompose=ea.compose.bind(ea);
    ea.compose=function(query){
      const active=ctx.module_id?ea.getModule?.(ctx.module_id):null;
      if(!active)return baseCompose(query);
      const explicit=explicitOtherModule(ea,query,active);
      if(explicit)return baseCompose(query);

      const q=ea.expand?.(query)||String(query||"").toLowerCase();
      const intent=ea.detectIntent?.(query)||"general";

      if(active.id==="TABEL_HARIAN"&&/(bri\s*merchant|merchant\s*bri)/.test(q)){
        ea.state={lastModuleId:active.id,lastFocus:"bri_merchant",lastIntent:intent};
        return {unknown:false,module:active,html:exactBriHelp(ea,active)};
      }

      if(active.id==="SETORAN_3_HARIAN"){
        const exact=exactSetoranFieldHelp(ea,active,q);
        if(exact){
          ea.state={lastModuleId:active.id,lastFocus:"setoran_specific",lastIntent:intent};
          return {unknown:false,module:active,html:exact};
        }
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
      const specificIntent=/(cara|bagaimana|gimana|arti|maksud|kenapa|mengapa|asal|sumber|dari mana|isi|input|kolom|angka|tombol|status|apa)/.test(q);
      if(specificIntent&&!rules.length){
        ea.state={lastModuleId:active.id,lastFocus:"knowledge_gap",lastIntent:intent};
        return {unknown:true,module:active,html:`<p>Saya tahu Bapak sedang berada di <strong>${ea.escape(active.name)}</strong>, tetapi knowledge untuk bagian yang ditanyakan belum cukup spesifik. Saya tidak akan mengalihkan jawaban ke modul lain atau menebak.</p>${sourceFooter(ea,active,"KNOWLEDGE BELUM SPESIFIK")}`};
      }

      return baseCompose(query);
    };
  }

  install();
})();
