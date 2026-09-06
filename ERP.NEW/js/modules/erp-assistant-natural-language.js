/* ERP VAX — ERP Assistant Natural Language Layer
   UI/response wording only. Keeps Context Engine V2.1 routing + knowledge unchanged.
*/
"use strict";

if(typeof window!=="undefined" && window.ErpAssistant){
  const A=window.ErpAssistant;

  const baseCompose=A.compose.bind(A);
  const baseRelation=A.relationAnswer.bind(A);
  const baseContents=A.composeContents.bind(A);
  const baseInit=A.init.bind(A);

  function polish(html){
    return String(html||"")
      .replaceAll("Yang perlu diketahui","Intinya")
      .replaceAll("Alur penting","Yang terjadi")
      .replaceAll("Rule terkait","Yang berlaku")
      .replaceAll("Isi / bagian utama","Di dalamnya")
      .replaceAll("Yang dilakukan Owner","Yang perlu Owner lakukan")
      .replaceAll("Alurnya","Alurnya begini")
      .replace(/<p>([^<]+) menggunakan sumber resmi berikut:<\/p>/g,"<p>Datanya untuk <strong>$1</strong> diambil dari sumber resmi berikut:</p>")
      .replace(/<p>Untuk <strong>([^<]+)<\/strong>, aturan verifikasinya:<\/p>/g,"<p>Kalau soal verifikasi di <strong>$1</strong>, patokannya begini:</p>");
  }

  A.relationAnswer=function(query){
    const out=baseRelation(query);
    if(!out)return null;

    if(out.focus==="setoran_to_arus_kas"){
      out.html=`<p>Iya, kalau uangnya berasal dari <strong>Setoran 3 Harian</strong>, setelah cabang sudah <strong>Owner Verified</strong> datanya masuk ke <strong>Arus Kas V2</strong> sebagai transaksi AUTO.</p>
      <div class="ea-rule-box"><strong>Alurnya begini</strong>
        <p>• Transaksi AUTO dari Setoran tidak perlu diverifikasi lagi di Arus Kas.</p>
        <p>• Cash Aktual/hasil setoran yang valid masuk ke Kas Besar.</p>
        <p>• Nett Produk masuk ke Dana Produk.</p>
      </div>
      <div class="ea-source"><span>Setoran 3 Harian → Arus Kas V2</span><b>OWNER LOCKED</b></div>`;
    }

    if(out.focus==="manual_svp"){
      out.html=`<p>Kalau <strong>SVP input manual</strong> di Arus Kas, transaksinya belum final. Owner tetap perlu mengecek sebelum transaksi dianggap benar.</p>
      <div class="ea-rule-box"><strong>Yang perlu Owner lakukan</strong>
        <p>• Cek detail dan nominal transaksi.</p>
        <p>• Kalau benar, pilih Verifikasi.</p>
        <p>• Kalau ada yang salah, pilih Minta Koreksi.</p>
        <p>• Ini berbeda dengan transaksi AUTO dari Setoran yang tidak perlu diverifikasi ulang.</p>
      </div>
      <div class="ea-source"><span>Arus Kas V2</span><b>OWNER LOCKED</b></div>`;
    }

    return out;
  };

  A.composeContents=function(m){
    const html=baseContents(m);
    const fields=Object.keys(m?.fields||{}).slice(0,8);
    let intro="";

    if(m?.id==="ARUS_KAS_V2"){
      intro="<p><strong>Arus Kas V2</strong> adalah buku ledger uang barber. Di sini Bapak bisa melihat uang masuk, uang keluar, saldo, transaksi AUTO dari Setoran, transaksi manual, dan rekonsiliasi uang rekening.</p>";
    }else{
      intro=`<p>Di <strong>${A.escape(m?.name||"")}</strong>, fungsi utamanya ${A.escape(String(m?.purpose||"").charAt(0).toLowerCase()+String(m?.purpose||"").slice(1))}</p>`;
    }

    let out=intro;
    if(fields.length)out+=`<div class="ea-rule-box"><strong>Di dalamnya</strong><p>${fields.map(k=>A.humanLabel(k)).join(" • ")}</p></div>`;
    if((m?.rules||[]).length)out+=`<div class="ea-rule-box"><strong>Yang penting</strong>${m.rules.slice(0,4).map(r=>`<p>• ${A.moneyHighlight(r)}</p>`).join("")}</div>`;
    return out||html;
  };

  A.compose=function(query){
    const out=baseCompose(query);
    if(out?.html)out.html=polish(out.html);
    return out;
  };

  A.init=async function(){
    await baseInit();
    const first=this.refs?.log?.querySelector(".ea-msg.assistant .ea-bubble");
    if(first){
      first.innerHTML="<p>Halo Pak. Saya <strong>ERP Assistant</strong>. Bapak bisa tanya dengan bahasa biasa, singkatan, atau typo ringan. Saya akan jawab berdasarkan konteks dan Knowledge Base ERP yang sudah disetujui.</p><p>Saya hanya membantu menjelaskan, jadi tetap <strong>READ ONLY</strong>.</p>";
    }
  };
}
