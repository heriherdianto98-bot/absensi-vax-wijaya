/* ERP VAX — ERP Assistant Semantic Resolver V4
   Help Desk/knowledge layer only. No LOCK engine/formula/query mutation.
   Resolution order: global UI topic -> active module topic -> explicit other module -> existing router.
   Answers are composed from topic facts according to question intent, not exact sentence templates.
*/
"use strict";

(function(){
  const KEY="erpAssistantGlobalHelpContextV1";
  function readCtx(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(_e){return null}}
  function fresh(ctx){const t=Date.parse(ctx?.captured_at||"");return Number.isFinite(t)&&(Date.now()-t)<30*60*1000}
  function arr(v){return Array.isArray(v)?v:(v?[v]:[])}
  function esc(ea,v){return ea.escape?ea.escape(String(v||"")):String(v||"")}
  function money(ea,v){return ea.moneyHighlight?ea.moneyHighlight(String(v||"")):esc(ea,v)}

  function addTopic(mod,key,t){
    if(!mod)return;
    mod.assistant_topics=mod.assistant_topics||{};
    mod.assistant_topics[key]=Object.assign({},mod.assistant_topics[key]||{},t);
  }

  function patchKnowledge(ea){
    const setoran=ea.getModule?.("SETORAN_3_HARIAN");
    addTopic(setoran,"cash_harus_diambil",{
      label:"Cash Harus Diambil",aliases:["cash harus diambil","uang harus diambil","cash diambil"],
      definition:"Jumlah uang fisik yang seharusnya diambil pada periode Setoran 3 Harian, mengikuti Cash Bersih dari Tabel Harian untuk periode yang sama.",
      source:"Berasal dari Cash Bersih Tabel Harian/canonical periode Setoran.",
      effect:"Menjadi dasar uang fisik setoran sebelum dikurangi Biaya di luar Cashout untuk menghasilkan Cash Aktual.",
      formula:"Cash Aktual = Cash Harus Diambil − Biaya di luar Cashout.",
      rules:["Cash Out yang sudah tercatat tidak dikurangi ulang di Setoran."]
    });

    const arus=ea.getModule?.("ARUS_KAS_V2");
    addTopic(arus,"masuk_kas",{
      label:"Sudah Ditransfer / Masuk Kas",aliases:["sudah ditransfer","masuk kas","ditransfer masuk kas","uang rekening masuk kas"],
      definition:"Status/nilai uang rekening yang sudah benar-benar dicatat masuk ke Kas Besar melalui transaksi QRIS/GoPay Transfer untuk periode sumber yang sama.",
      source:"Berasal dari transaksi manual QRIS/GoPay Transfer yang benar-benar dicatat masuk ke Kas Besar.",
      effect:"Nilai ini dipakai untuk membandingkan Uang Rekening yang seharusnya masuk dengan uang yang sudah benar-benar masuk kas.",
      rules:["Transaksi AUTO dari Setoran tidak perlu diverifikasi ulang di Arus Kas."]
    });

    const tabel=ea.getModule?.("TABEL_HARIAN");
    addTopic(tabel,"cash_bersih",{
      label:"Cash Bersih",aliases:["cash bersih","uang cash bersih"],
      definition:"Uang tunai bersih menurut data harian canonical yang menjadi basis Cash Harus Diambil di Setoran 3 Harian.",
      effect:"Nilai ini diteruskan menjadi Cash Harus Diambil pada Setoran 3 Harian untuk periode terkait."
    });

    const dash=ea.getModule?.("DASHBOARD_OWNER");
    addTopic(dash,"periode_comparison",{
      label:"Perbandingan Periode",aliases:["vs periode sebelumnya","periode sebelumnya","naik rp","turun rp","naik dibanding periode","turun dibanding periode"],
      definition:"Indikator perubahan nilai pada periode aktif dibandingkan periode pembanding sebelumnya.",
      effect:"Jika tertulis Naik RpX, berarti nilai periode aktif lebih tinggi sebesar RpX dibanding periode sebelumnya; jika Turun RpX, berarti lebih rendah sebesar RpX.",
      rules:["Angka selisih adalah perbandingan dua periode, bukan transaksi baru atau uang tambahan yang dicatat terpisah."]
    });
    addTopic(dash,"barber_aktif",{
      label:"Barber Aktif",aliases:["barber aktif","jumlah barber aktif","capster aktif"],
      definition:"Ringkasan jumlah barber/capster yang dihitung aktif pada konteks/filter Dashboard Owner yang sedang digunakan.",
      effect:"Dipakai sebagai KPI operasional untuk melihat ketersediaan tenaga barber pada konteks dashboard."
    });
    addTopic(dash,"forecast_1_day",{
      label:"Prediksi 1 Hari Berikutnya",aliases:["prediksi 1 hari berikutnya","forecast 1 hari","prediksi besok","angka prediksi","prediksi berikutnya"],
      definition:"Nilai prediksi/forecast ERP untuk satu hari berikutnya berdasarkan data yang dipakai AI Insight/forecast pada Dashboard.",
      source:"Berasal dari engine/presenter forecast AI Insight ERP yang sudah menjadi consumer data ERP.",
      effect:"Angka yang tampil adalah estimasi untuk membantu Owner membaca arah performa, bukan transaksi aktual dan bukan angka yang ditulis kembali ke source canonical.",
      rules:["Prediction UI adalah decision-support/read-only dan tidak mengubah source transaksi."]
    });
    const warning=ea.getModule?.("CASH_OUT_WARNING");
    const warningFacts={
      label:"Control Cash Out / Warning Cash Out",aliases:["control cash out","warning cash out","cash out warning","cashout warning","warning di atas rp205000","warning rp205000"],
      definition:"Monitoring read-only yang menandai item Cash Out individual di atas Rp205.000 pada seluruh cabang operasional.",
      why:"Warning muncul ketika ada satu item Cash Out individual yang nilainya lebih dari Rp205.000.",
      when:"Muncul jika satu item Cash Out individual > Rp205.000; yang dinilai bukan total Cash Out harian.",
      effect:"Warning hanya memberi perhatian/monitoring dan tidak memblokir transaksi atau mengubah formula.",
      rules:["Threshold LOCK adalah individual Cash Out > Rp205.000, bukan total cash_out harian."]
    };
    addTopic(dash,"cash_out_warning",warningFacts);
    addTopic(warning,"cash_out_warning",warningFacts);

    ea.knowledge=ea.knowledge||{};
    ea.knowledge.global_assistant_topics=Object.assign({},ea.knowledge.global_assistant_topics||{}, {
      jam_operasional:{
        label:"Status Jam Operasional",aliases:["menunggu jam buka","aktif mulai 10 00 wib","jam buka","status jam buka","aktif mulai"],
        definition:"Status header ERP yang menunjukkan sistem sedang menunggu jam operasional dimulai.",
        effect:"Jika tertulis “Menunggu jam buka” dan “Aktif mulai 10:00 WIB”, artinya saat itu masih sebelum jam aktif operasional dan status akan masuk waktu aktif mulai 10:00 WIB.",
        rules:["Ini adalah informasi status operasional pada header ERP, bukan error modul yang sedang dibuka."]
      },
      cabang_aktif:{label:"Cabang Aktif",aliases:["cabang aktif"],definition:"Cabang/filter cabang yang sedang menjadi konteks aktif ERP."},
      periode_aktif:{label:"Periode Aktif",aliases:["periode aktif"],definition:"Rentang tanggal/periode yang sedang menjadi konteks aktif pada halaman ERP."}
    });
  }

  function intent(ea,q){
    const x=ea.expand?.(q)||String(q||"").toLowerCase();
    const tests=[
      ["why",/(kenapa|mengapa|kok|alasan)/],
      ["how",/(cara|bagaimana|gimana|isi|input|pakai|simpan|edit|hapus|langkah)/],
      ["source",/(dari mana|asal|sumber|berasal)/],
      ["when",/(kapan|saat apa|waktu apa|muncul)/],
      ["formula",/(rumus|formula|hitung|dihitung|perhitungan)/],
      ["effect",/(pengaruh|dampak|efek|jadi apa|masuk ke|kalau ada)/],
      ["compare",/(beda|perbedaan|dibanding|\bvs\b|versus)/],
      ["definition",/(apa itu|artinya apa|arti|maksud|fungsi|buat apa|ini apa)/]
    ];
    for(const [k,re] of tests)if(re.test(x))return k;
    return ea.detectIntent?.(q)||"general";
  }

  function scoreTopic(ea,key,t,q){
    const phrases=[t.label,key.replace(/_/g," "),...arr(t.aliases)];
    let s=0;
    for(const p of phrases){
      if(!p)continue;
      const ps=ea.phraseScore?.(q,p)||0;
      s=Math.max(s,ps*2.2);
    }
    const qt=ea.tokens?.(q)||[];
    const corpus=ea.tokens?.([t.label,t.definition,t.source,t.effect,t.why,t.when,t.formula,...arr(t.how),...arr(t.rules)].join(" "))||[];
    let hits=0;
    for(const a of qt)if(corpus.some(b=>ea.tokenMatch?.(a,b)))hits++;
    s+=hits*1.25;
    return s;
  }

  function bestTopic(ea,topics,q,min=10){
    const ranked=Object.entries(topics||{}).map(([k,t])=>({k,t,s:scoreTopic(ea,k,t,q)})).sort((a,b)=>b.s-a.s);
    return ranked[0]&&ranked[0].s>=min?ranked[0]:null;
  }

  function box(ea,title,items){
    const vals=arr(items).filter(Boolean);
    if(!vals.length)return "";
    return `<div class="ea-rule-box"><strong>${esc(ea,title)}</strong>${vals.map(v=>`<p>• ${money(ea,v)}</p>`).join("")}</div>`;
  }

  function composeTopic(ea,module,hit,q){
    const t=hit.t, i=intent(ea,q), label=t.label||hit.k.replace(/_/g," ");
    let lead="";
    if(i==="why"&&t.why)lead=t.why;
    else if(i==="when"&&t.when)lead=t.when;
    else if(i==="source"&&t.source)lead=`${label}: ${t.source}`;
    else if(i==="effect"&&t.effect)lead=t.effect;
    else if(i==="formula"&&t.formula)lead=t.formula;
    else if(i==="how"&&arr(t.how).length)lead=`Untuk ${label}, langkahnya:`;
    else if(i==="compare"&&t.effect)lead=t.effect;
    else lead=t.definition||t.effect||t.source||`Knowledge ${label} tersedia pada modul ini.`;

    let html=`<p>${money(ea,lead)}</p>`;
    if(i==="how")html+=box(ea,"Cara / langkahnya",t.how);
    if(i==="source"&&t.definition)html+=box(ea,"Artinya",[t.definition]);
    if((i==="definition"||i==="general")&&t.effect)html+=box(ea,"Pengaruh / fungsinya",[t.effect]);
    if(i!=="formula"&&t.formula)html+=box(ea,"Rumus terkait",[t.formula]);
    if(i!=="when"&&t.when)html+=box(ea,"Kapan / syaratnya",[t.when]);
    if(i!=="why"&&t.why)html+=box(ea,"Kenapa bisa muncul",[t.why]);
    html+=box(ea,"Yang perlu diketahui",arr(t.rules).slice(0,3));
    const name=module?.name||"ERP Global";
    html+=`<div class="ea-source"><span>${esc(ea,name)}</span><b>SEMANTIC CONTEXT V4</b></div>`;
    return {unknown:false,module:module||null,html};
  }

  function install(){
    const params=new URLSearchParams(location.search),ctx=readCtx();
    if(params.get("helpDesk")!=="1"||!fresh(ctx))return;
    const ea=window.ErpAssistant;if(!ea)return;
    const baseLoad=ea.loadKnowledge.bind(ea);
    ea.loadKnowledge=async function(){await baseLoad();patchKnowledge(ea)};
    const baseCompose=ea.compose.bind(ea);
    ea.compose=function(q){
      const active=ctx.module_id?ea.getModule?.(ctx.module_id):null;
      const globalHit=bestTopic(ea,ea.knowledge?.global_assistant_topics,q,12);
      if(globalHit){
        ea.state={lastModuleId:active?.id||null,lastFocus:`global:${globalHit.k}`,lastIntent:intent(ea,q)};
        return composeTopic(ea,null,globalHit,q);
      }
      if(active){
        const hit=bestTopic(ea,active.assistant_topics,q,10);
        if(hit){
          ea.state={lastModuleId:active.id,lastFocus:hit.k,lastIntent:intent(ea,q)};
          return composeTopic(ea,active,hit,q);
        }
      }
      return baseCompose(q);
    };
  }

  install();
})();
