/* ERP VAX — ERP Assistant Global Help Context Router V3
   UI/help layer only. The active Help Desk module is the context anchor.
   Answers are composed from topic knowledge + detected question intent,
   not from exact sentence templates. Does not change any LOCK business engine.
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
  function arr(v){return Array.isArray(v)?v:(v?[v]:[])}
  function uniq(list){return [...new Set((list||[]).filter(Boolean))]}

  function patchApprovedContextKnowledge(ea){
    const tabel=ea.getModule?.("TABEL_HARIAN");
    if(tabel){
      tabel.fields=tabel.fields||{};
      Object.assign(tabel.fields,{
        omzet_gross:"Total omzet/gross harian cabang dari data canonical Minutes untuk tanggal tersebut.",
        nett_revenue:"Nett Revenue harian canonical setelah komponen share/pengurang yang memang sudah tercermin pada engine resmi ERP.",
        share_produk:"Bagian share dari penjualan produk sesuai source/engine Share Produk yang sudah dipakai Tabel Harian.",
        share_cukur:"Share Provider/Share Cukur dari source provider sales resmi untuk tanggal dan cabang terkait.",
        bri_merchant:"Nilai aktual transaksi BRI Merchant untuk tanggal dan cabang pada baris Tabel Harian. Nilai ini merupakan input aktual BRI, bukan hasil formula Tabel Harian.",
        customer:"Jumlah customer harian dari source canonical Minutes pada tanggal dan cabang terkait.",
        transaksi:"Jumlah transaksi harian dari source transaction_minutes yang berlaku pada ERP.",
        services:"Jumlah services harian dari source canonical Minutes pada tanggal dan cabang terkait."
      });
      tabel.assistant_topics=tabel.assistant_topics||{};
      tabel.assistant_topics.bri_merchant={
        label:"BRI Merchant",
        aliases:["bri merchant","merchant bri","bri"],
        definition:"Nilai aktual transaksi BRI Merchant untuk tanggal dan cabang pada baris Tabel Harian.",
        source:"Nominal diambil dari data/laporan BRI Merchant aktual lalu dicatat per tanggal + cabang di bri_merchant_daily sebagai bri_non_cash_actual.",
        how:[
          "Klik nominal pada kolom BRI Merchant di baris tanggal dan cabang yang ingin diisi.",
          "Masukkan nominal aktual sesuai data/laporan BRI Merchant.",
          "Klik Simpan. Jika sudah pernah tersimpan, gunakan Edit untuk mengubah atau Hapus untuk menghapus."
        ],
        who:"Input BRI Merchant pada Tabel Harian hanya dapat dilakukan oleh Owner/SVP.",
        effect:"Nilai ini kemudian dapat dijumlahkan oleh Setoran 3 Harian untuk periode terkait sebagai bridge read-only.",
        rules:["Angka BRI Merchant bukan hasil formula Tabel Harian; nilainya adalah angka aktual BRI per tanggal+cabang."]
      };
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
        bri_merchant:"Nominal aktual BRI Merchant untuk periode Setoran yang dibandingkan dengan Non Tunai Minutes.",
        selisih_non_tunai:"Selisih antara BRI Merchant aktual dan Non Tunai Minutes pada periode Setoran.",
        biaya_di_luar_cashout:"Biaya/pengeluaran nyata yang mengurangi uang fisik setoran tetapi tidak tercatat di modul Cash Out.",
        cash_aktual:"Uang fisik aktual hasil setoran setelah memperhitungkan Biaya di luar Cashout.",
        keterangan:"Catatan untuk menjelaskan selisih BRI Merchant vs Minutes atau Biaya di luar Cashout.",
        bukti_foto:"Bukti foto yang diwajibkan ketika ada selisih atau Biaya di luar Cashout sebelum status Sudah Diambil.",
        sudah_diambil:"Status SVP bahwa uang fisik setoran cabang sudah diambil.",
        belum_diambil:"Status bahwa uang fisik belum diambil dan masih diperlakukan sebagai Piutang Setoran pada flow terkait."
      });
      setoran.assistant_topics=setoran.assistant_topics||{};
      Object.assign(setoran.assistant_topics,{
        biaya_di_luar_cashout:{
          label:"Biaya di luar Cashout",
          aliases:["biaya di luar cashout","outside cashout","biaya luar cash out","biaya luar cashout"],
          definition:"Biaya/pengeluaran nyata yang mengurangi uang fisik setoran tetapi tidak tercatat di modul Cash Out.",
          source:"Nilainya diinput SVP hanya ketika memang ada pengeluaran nyata di luar transaksi Cash Out.",
          how:["Isi nominal Biaya di luar Cashout pada baris cabang terkait.","Jika nilainya lebih dari Rp0, isi Keterangan yang menjelaskan biaya tersebut.","Sebelum menandai Sudah Diambil, siapkan bukti foto jika ada biaya ini."],
          effect:"Nilai ini mengurangi Cash Harus Diambil untuk menghasilkan Cash Aktual.",
          formula:"Cash Aktual = Cash Harus Diambil − Biaya di luar Cashout.",
          rules:["Cash Out yang sudah tercatat tidak boleh dikurangi ulang di Setoran.","Jika nilainya lebih dari Rp0, Keterangan wajib diisi.","Jika ada biaya ini, bukti foto wajib sebelum status Sudah Diambil."]
        },
        cash_aktual:{
          label:"Cash Aktual",
          aliases:["cash aktual","aktual cash","hasil setoran"],
          definition:"Uang fisik aktual hasil setoran setelah memperhitungkan Biaya di luar Cashout.",
          source:"Berasal dari Cash Harus Diambil pada periode Setoran, kemudian dikurangi Biaya di luar Cashout.",
          formula:"Cash Aktual = Cash Harus Diambil − Biaya di luar Cashout.",
          effect:"Cash Aktual yang valid menjadi nilai uang fisik hasil setoran pada flow berikutnya.",
          rules:["Cash Out tidak dikurangi ulang di sini."]
        },
        selisih_non_tunai:{
          label:"Selisih Non Tunai",
          aliases:["selisih non tunai","selisih bri","selisih merchant"],
          definition:"Perbedaan antara BRI Merchant aktual dan Non Tunai Minutes pada periode Setoran.",
          source:"Membandingkan BRI Merchant aktual periode dengan Non Tunai Minutes dari data canonical.",
          formula:"Selisih Non Tunai = BRI Merchant aktual − Non Tunai Minutes.",
          effect:"Jika ada selisih, Keterangan wajib diisi dan bukti foto diperlukan sebelum Sudah Diambil.",
          rules:["Selisih ini tidak mengubah angka sumber Tabel Harian."]
        },
        bri_merchant:{
          label:"BRI Merchant",
          aliases:["bri merchant","merchant bri","bri"],
          definition:"Nominal aktual BRI Merchant untuk periode Setoran.",
          source:"Diisi dari nominal aktual BRI Merchant untuk periode terkait.",
          how:["Masukkan nominal BRI Merchant aktual pada baris cabang terkait.","Jika angka berbeda dengan Non Tunai Minutes, isi Keterangan dan siapkan bukti foto."],
          effect:"Nilai ini dibandingkan dengan Non Tunai Minutes untuk menghasilkan Selisih Non Tunai.",
          rules:["BRI Merchant harus terisi sebelum status Sudah Diambil."]
        },
        keterangan:{
          label:"Keterangan",
          aliases:["keterangan","catatan","note"],
          definition:"Catatan penjelas pada baris Setoran.",
          how:["Isi penjelasan yang jelas ketika ada Selisih Non Tunai atau Biaya di luar Cashout."],
          when:"Keterangan wajib ketika ada selisih BRI Merchant vs Minutes atau Biaya di luar Cashout lebih dari Rp0.",
          effect:"Keterangan menjadi bagian audit baris Setoran agar selisih/biaya dapat ditelusuri."
        },
        bukti_foto:{
          label:"Bukti Foto",
          aliases:["bukti foto","foto bukti","bukti"],
          definition:"Dokumen foto pendukung untuk kondisi Setoran yang memerlukan pembuktian.",
          how:["Unggah foto bukti pada baris cabang terkait sebelum menandai Sudah Diambil jika ada selisih atau biaya di luar Cashout."],
          when:"Wajib bila ada Selisih Non Tunai atau Biaya di luar Cashout sebelum status Sudah Diambil."
        },
        sudah_diambil:{
          label:"Sudah Diambil / Belum Diambil",
          aliases:["sudah diambil","belum diambil","status diambil"],
          definition:"Sudah Diambil berarti SVP menyatakan uang fisik setoran cabang sudah diambil; Belum Diambil berarti uang fisik masih belum diambil.",
          when:"Sebelum menandai Sudah Diambil, BRI Merchant harus terisi dan bila ada selisih/biaya, bukti foto wajib tersedia.",
          effect:"Belum Diambil tetap diperlakukan sebagai Piutang Setoran pada flow terkait."
        }
      });
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

  function detectQuestionIntent(ea,query){
    const q=ea.expand?.(query)||String(query||"").toLowerCase();
    const scores={definition:0,source:0,how:0,effect:0,why:0,when:0,verify:0,compare:0,formula:0,contents:0,general:1};
    const cues={
      definition:["apa itu","apa yang dimaksud","maksud","arti","fungsi","buat apa"],
      source:["asal","sumber","dari mana","berasal","ambil dari","datanya dari"],
      how:["cara","bagaimana","gimana","isi","input","pakai","gunakan","edit","simpan","hapus","langkah","proses"],
      effect:["pengaruh","efek","dampak","jadi berapa","mengurangi","menambah","masuk ke","kalau ada"],
      why:["kenapa","mengapa","kok","alasan"],
      when:["kapan","saat apa","waktu apa","wajib kapan","muncul kapan"],
      verify:["verifikasi","verify","siapa yang cek","owner cek","koreksi","approval"],
      compare:["beda","perbedaan","dibanding","vs","versus"],
      formula:["rumus","formula","hitung","dihitung","perhitungan"],
      contents:["isinya apa","apa saja","apa aja","bagian apa","kolom apa"]
    };
    for(const [intent,phrases] of Object.entries(cues)){
      for(const p of phrases){
        const s=ea.phraseScore?.(q,p)||0;
        if(s>0)scores[intent]+=Math.max(3,s/3);
      }
    }
    const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
    return ranked[0][1]>=3?ranked[0][0]:(ea.detectIntent?.(query)||"general");
  }

  function topicScore(ea,topicKey,topic,query){
    let score=0;
    score+=ea.phraseScore?.(query,String(topic.label||topicKey).replace(/_/g," "))*2||0;
    for(const alias of arr(topic.aliases))score=Math.max(score,(ea.phraseScore?.(query,alias)||0)*2.1);
    const qt=ea.tokens?.(query)||[];
    const corpus=ea.tokens?.([topic.label,topic.definition,topic.source,topic.effect,topic.formula,topic.when,topic.who,...arr(topic.how),...arr(topic.rules)].join(" "))||[];
    for(const t of qt)if(corpus.some(h=>ea.tokenMatch?.(t,h)))score+=1.5;
    return score;
  }

  function inferTopic(ea,module,query){
    const topics=module?.assistant_topics||{};
    const ranked=Object.entries(topics).map(([k,t])=>({k,t,s:topicScore(ea,k,t,query)})).sort((a,b)=>b.s-a.s);
    if(ranked[0]?.s>=8)return ranked[0];

    const field=ea.bestField?.(module,query)||null;
    if(field){
      const existing=topics[field.k];
      if(existing)return {k:field.k,t:existing,s:field.s||8};
      return {k:field.k,t:{label:ea.humanLabel?.(field.k)||field.k,definition:String(field.v||"")},s:field.s||8};
    }

    const q=ea.expand?.(query)||"";
    const followup=/^(kalau|kalo|terus|trs|lalu|nah|yang|ini|itu|kalau begitu)\b/.test(q)||(ea.tokens?.(query)||[]).length<=2;
    if(followup&&ea.state?.lastFocus&&topics[ea.state.lastFocus])return {k:ea.state.lastFocus,t:topics[ea.state.lastFocus],s:7};
    return null;
  }

  function listBox(ea,title,items,ordered=false){
    const clean=uniq(items);
    if(!clean.length)return "";
    return `<div class="ea-rule-box"><strong>${ea.escape(title)}</strong>${clean.map((x,i)=>`<p>${ordered?`<strong>${i+1}.</strong> `:"• "}${ea.moneyHighlight?.(x)||ea.escape(x)}</p>`).join("")}</div>`;
  }

  function composeTopicAnswer(ea,module,topic,intent,query){
    const label=topic.label||"Bagian ini";
    const definition=topic.definition||"";
    const rules=arr(topic.rules);
    let html="";

    switch(intent){
      case "how":
        html+=`<p>Untuk <strong>${ea.escape(label)}</strong> di <strong>${ea.escape(module.name)}</strong>:</p>`;
        if(arr(topic.how).length)html+=listBox(ea,"Cara / langkahnya",topic.how,true);
        else if(definition)html+=`<p>${ea.moneyHighlight?.(definition)||ea.escape(definition)}</p>`;
        if(topic.when)html+=listBox(ea,"Kapan / syaratnya",[topic.when]);
        if(topic.who)html+=listBox(ea,"Siapa yang melakukan",[topic.who]);
        if(rules.length)html+=listBox(ea,"Yang perlu diperhatikan",rules.slice(0,3));
        break;
      case "source":
        html+=`<p><strong>${ea.escape(label)}</strong> di ${ea.escape(module.name)} ${topic.source?"berasal dari":"memiliki fungsi"} ${ea.moneyHighlight?.(topic.source||definition)||ea.escape(topic.source||definition)}.</p>`;
        if(topic.formula)html+=listBox(ea,"Perhitungannya",[topic.formula]);
        break;
      case "effect":
        html+=`<p>Pengaruh <strong>${ea.escape(label)}</strong> di ${ea.escape(module.name)}: ${ea.moneyHighlight?.(topic.effect||definition)||ea.escape(topic.effect||definition)}</p>`;
        if(topic.formula)html+=listBox(ea,"Rumus terkait",[topic.formula]);
        if(rules.length)html+=listBox(ea,"Aturan terkait",rules.slice(0,3));
        break;
      case "formula":
        html+=`<p>Untuk <strong>${ea.escape(label)}</strong> di ${ea.escape(module.name)}:</p>`;
        if(topic.formula)html+=listBox(ea,"Rumus",[topic.formula]);
        else html+=`<p>Knowledge modul ini belum mencatat rumus khusus untuk bagian tersebut.</p>`;
        if(topic.source)html+=listBox(ea,"Sumber angka",[topic.source]);
        break;
      case "when":
        html+=`<p><strong>${ea.escape(label)}</strong> ${topic.when?ea.moneyHighlight?.(topic.when):"dipakai sesuai alur modul ini."}</p>`;
        if(!topic.when&&rules.length)html+=listBox(ea,"Aturan waktunya",rules.slice(0,3));
        break;
      case "verify":
        html+=`<p>Untuk <strong>${ea.escape(label)}</strong> di ${ea.escape(module.name)}:</p>`;
        if(topic.who)html+=listBox(ea,"Pihak terkait",[topic.who]);
        const vr=rules.filter(r=>/(owner|svp|verif|koreksi|wajib|review)/i.test(r));
        html+=listBox(ea,"Aturan verifikasi",vr.length?vr:rules.slice(0,3));
        break;
      case "why":
        html+=`<p><strong>${ea.escape(label)}</strong> ${topic.effect?`berpengaruh karena ${ea.moneyHighlight?.(topic.effect)}`:ea.moneyHighlight?.(definition)||ea.escape(definition)}</p>`;
        if(topic.source)html+=listBox(ea,"Dasarnya",[topic.source]);
        if(rules.length)html+=listBox(ea,"Aturan terkait",rules.slice(0,3));
        break;
      case "compare":
        html+=`<p><strong>${ea.escape(label)}</strong>: ${ea.moneyHighlight?.(definition)||ea.escape(definition)}</p>`;
        if(topic.source)html+=listBox(ea,"Sumber",[topic.source]);
        if(topic.effect)html+=listBox(ea,"Pengaruh",[topic.effect]);
        break;
      case "definition":
      case "general":
      default:
        html+=`<p><strong>${ea.escape(label)}</strong> di <strong>${ea.escape(module.name)}</strong> adalah ${ea.moneyHighlight?.(definition.charAt(0).toLowerCase()+definition.slice(1))||ea.escape(definition)}</p>`;
        if(topic.effect)html+=listBox(ea,"Pengaruhnya",[topic.effect]);
        if(topic.formula)html+=listBox(ea,"Rumus terkait",[topic.formula]);
        if(rules.length)html+=listBox(ea,"Yang perlu diketahui",rules.slice(0,3));
        break;
    }
    return html+sourceFooter(ea,module,"CONTEXT + INTENT");
  }

  function composeModuleIntent(ea,module,intent,query){
    if(intent==="contents")return null;
    if(intent==="source"){
      const sources=arr(module.sources);
      if(sources.length)return `<p><strong>${ea.escape(module.name)}</strong> menggunakan sumber:</p>${listBox(ea,"Sumber resmi",sources)}${sourceFooter(ea,module,"MODULE CONTEXT")}`;
    }
    const rules=ea.bestRules?.(module,query,4)||[];
    if(rules.length){
      return `<p>Untuk pertanyaan Bapak di <strong>${ea.escape(module.name)}</strong>, aturan yang paling terkait adalah:</p>${listBox(ea,"Aturan terkait",rules.map(x=>x.r))}${sourceFooter(ea,module,"MODULE CONTEXT")}`;
    }
    return null;
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
      return explicitOtherModule(ea,query,active)||active;
    };

    const baseCompose=ea.compose.bind(ea);
    ea.compose=function(query){
      const active=ctx.module_id?ea.getModule?.(ctx.module_id):null;
      if(!active)return baseCompose(query);

      const explicit=explicitOtherModule(ea,query,active);
      if(explicit)return baseCompose(query);

      const intent=detectQuestionIntent(ea,query);
      const topic=inferTopic(ea,active,query);

      if(topic){
        ea.state={lastModuleId:active.id,lastFocus:topic.k,lastIntent:intent};
        return {unknown:false,module:active,html:composeTopicAnswer(ea,active,topic.t,intent,query)};
      }

      const moduleAnswer=composeModuleIntent(ea,active,intent,query);
      if(moduleAnswer){
        ea.state={lastModuleId:active.id,lastFocus:null,lastIntent:intent};
        return {unknown:false,module:active,html:moduleAnswer};
      }

      const specificIntent=["definition","source","how","effect","why","when","verify","compare","formula"].includes(intent);
      if(specificIntent){
        ea.state={lastModuleId:active.id,lastFocus:"knowledge_gap",lastIntent:intent};
        return {unknown:true,module:active,html:`<p>Saya memahami Bapak sedang bertanya di <strong>${ea.escape(active.name)}</strong>, tetapi knowledge untuk bagian itu belum cukup rinci untuk menjawab <strong>${ea.escape(intent)}</strong> secara tepat. Saya tidak akan menebak atau mengalihkan jawaban ke modul lain.</p>${sourceFooter(ea,active,"KNOWLEDGE BELUM RINCI")}`};
      }

      return baseCompose(query);
    };
  }

  install();
})();
