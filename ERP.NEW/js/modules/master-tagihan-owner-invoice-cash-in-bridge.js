/* ERP VAX — additive bridge: Owner invoice -> SVP ACC -> Arus Kas V2 Kas Besar IN.
   IMPORTANT: does not modify invoice engine, Arus Kas engine, or locked SVP->Owner bridge.
   One Owner invoice may create exactly one Kas Besar income transaction.
*/
"use strict";
(() => {
  const TX_TABLE = "arus_kas_v2_transactions";
  const AUDIT_TABLE = "arus_kas_v2_audit";
  const SOURCE_TYPE = "OWNER_INVOICE";

  const roleOf = (inv) => String(inv?.role || "").toLowerCase();
  const isSvp = (inv) => ["svp","spv"].includes(roleOf(inv));
  const senderRole = (row) => String(row?.sender_role || "").toLowerCase();
  const isOwnerInvoice = (row) => !["svp","spv"].includes(senderRole(row));
  const statusOf = (row) => String(row?.status || "draft").toLowerCase();
  const isApproved = (row) => ["paid","approved"].includes(statusOf(row));
  const sourceKey = (id) => `OWNER_INVOICE:${id}`;

  function rupiah(v){
    return new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(v||0));
  }

  function localDate(){
    return new Intl.DateTimeFormat("en-CA", {
      timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date());
  }

  function ensureStyle(){
    if(document.getElementById("ownerInvoiceCashInBridgeStyle")) return;
    const style = document.createElement("style");
    style.id = "ownerInvoiceCashInBridgeStyle";
    style.textContent = `
      .svp-return-actions .mt-action-owner-acc{
        min-height:40px;padding:8px 13px;border:1px solid #39d9c7;border-radius:10px;
        background:linear-gradient(180deg,#117b70 0%,#0d5f57 55%,#08453f 100%);
        color:#effffc;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:7px;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.13),0 5px 13px rgba(8,118,108,.24);
        cursor:pointer;white-space:nowrap;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;
      }
      .svp-return-actions .mt-action-owner-acc:hover{transform:translateY(-1px);border-color:#72f3e5;box-shadow:0 8px 18px rgba(31,190,172,.28)}
      .svp-return-actions .mt-action-owner-acc:disabled{opacity:.55;cursor:wait;transform:none}
      .svp-return-actions .mt-action-owner-acc .owner-acc-icon{
        width:23px;height:23px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;
        background:linear-gradient(145deg,#e3fffb,#79f0df 55%,#2bc7b4);color:#064a43;font-size:15px;font-weight:1000;
        border:1px solid #b5fff5;box-shadow:inset 0 1px 1px rgba(255,255,255,.9),0 2px 7px rgba(42,216,196,.35)
      }
    `;
    document.head.appendChild(style);
  }

  async function currentSvp(){
    const {data:s,error:se}=await db.auth.getSession();
    if(se) throw se;
    const user=s?.session?.user;
    if(!user) throw new Error("Sesi SVP tidak ditemukan.");
    const {data:p,error:pe}=await db.from("profiles").select("id,role,nama,aktif").eq("id",user.id).maybeSingle();
    if(pe) throw pe;
    const role=String(p?.role||"").toLowerCase();
    if(!p || p.aktif===false || !["svp","spv"].includes(role)) throw new Error("ACC invoice Owner hanya boleh dilakukan SVP.");
    return {user,profile:p};
  }

  async function findLedger(invoiceId){
    const {data,error}=await db.from(TX_TABLE)
      .select("id,amount,source_key")
      .eq("source_type",SOURCE_TYPE)
      .eq("source_key",sourceKey(invoiceId))
      .maybeSingle();
    if(error) throw error;
    return data||null;
  }

  async function markInvoicePaid(row,svpId){
    const now=new Date().toISOString();
    const {error}=await db.from("svp_invoices")
      .update({status:"paid",updated_by:svpId,updated_at:now})
      .eq("id",row.id);
    if(error) throw error;
  }

  async function writeAudit(transaction,row,svpId){
    try{
      await db.from(AUDIT_TABLE).insert({
        transaction_id:transaction.id,
        action:"OWNER_INVOICE_SVP_ACC",
        actor_id:svpId,
        snapshot:{
          invoice_id:row.id,
          invoice_no:row.invoice_no||null,
          total:Number(row.total||0),
          source_type:SOURCE_TYPE,
          source_key:sourceKey(row.id),
          direction:"IN_TO_KAS_BESAR"
        }
      });
    }catch(err){
      console.warn("Owner invoice cash-in bridge audit:",err?.message||err);
    }
  }

  function syncPaidUi(row){
    row.status="paid";
    const inv=window.SvPInvoice;
    if(!inv) return;
    if(Array.isArray(inv.rows)){
      const local=inv.rows.find(x=>String(x.id)===String(row.id));
      if(local) local.status="paid";
    }
    if(typeof inv.render==="function") inv.render();
  }

  async function approve(row,btn){
    if(!row || !isOwnerInvoice(row) || isApproved(row)) return;
    const total=Math.round(Number(row.total||0));
    if(!(total>0)){
      alert("Invoice tidak dapat di-ACC karena total nominal Rp0.");
      return;
    }

    const ok=window.confirm(
      `ACC invoice Owner ${row.invoice_no||""} sebesar ${rupiah(total)}?\n\n`+
      `Setelah ACC, nominal otomatis menjadi PEMASUKAN KAS BESAR.`
    );
    if(!ok) return;

    const old=btn?.innerHTML;
    if(btn){btn.disabled=true;btn.textContent="Memproses...";}

    try{
      const {user}=await currentSvp();
      let tx=await findLedger(row.id);
      if(!tx){
        const now=new Date().toISOString();
        const payload={
          tanggal:localDate(),
          amount:total,
          from_wallet:"EXTERNAL",
          to_wallet:"KAS_BESAR",
          entry_type:"AUTO",
          category:"INVOICE_OWNER",
          description:`ACC Invoice Owner ${row.invoice_no||row.id}${row.title?` · ${row.title}`:""}`,
          source_type:SOURCE_TYPE,
          source_key:sourceKey(row.id),
          source_period_start:null,
          source_period_end:null,
          verification_status:"OWNER_VERIFIED",
          created_by:user.id,
          updated_by:user.id,
          verified_by:row.created_by||user.id,
          verified_at:now,
          metadata:{
            invoice_id:row.id,
            invoice_no:row.invoice_no||null,
            invoice_title:row.title||null,
            sender_role:senderRole(row)||"owner",
            accepted_by_role:"svp",
            auto_kind:"OWNER_INVOICE_SVP_ACC"
          }
        };
        const {data,error}=await db.from(TX_TABLE).insert(payload).select("*").single();
        if(error) throw error;
        tx=data;
        await writeAudit(tx,row,user.id);
      }

      await markInvoicePaid(row,user.id);
      syncPaidUi(row);
      const inv=window.SvPInvoice;
      if(inv?.reload) await inv.reload();
      alert(`Invoice Owner berhasil di-ACC.\nKas Besar bertambah ${rupiah(total)}.`);
    }catch(err){
      console.error("Owner invoice cash-in bridge:",err);
      alert(`Gagal ACC invoice Owner: ${err?.message||err}`);
    }finally{
      if(btn && btn.isConnected && !isApproved(row)){
        btn.disabled=false;
        if(old!=null)btn.innerHTML=old;
      }
    }
  }

  function decorate(){
    const inv=window.SvPInvoice;
    if(!inv || !isSvp(inv)) return;
    const list=document.getElementById("mtInvoiceList");
    if(!list) return;

    ensureStyle();
    const rows=Array.isArray(inv.rows)?inv.rows:[];
    list.querySelectorAll(".mt-invoice-row").forEach(rowEl=>{
      const id=rowEl.querySelector("[data-id]")?.getAttribute("data-id");
      if(!id) return;
      const row=rows.find(x=>String(x.id)===String(id));
      if(!row || !isOwnerInvoice(row) || isApproved(row)) return;

      const actions=rowEl.querySelector(".mt-invoice-buttons");
      if(!actions || actions.querySelector(`[data-owner-invoice-acc="${id}"]`)) return;

      const b=document.createElement("button");
      b.type="button";
      b.className="mt-action mt-action-owner-acc";
      b.dataset.ownerInvoiceAcc=id;
      b.title="ACC invoice Owner dan tambahkan ke Kas Besar";
      b.innerHTML='<span class="owner-acc-icon" aria-hidden="true">✓</span><span>ACC</span>';
      actions.prepend(b);
    });
  }

  function install(){
    const inv=window.SvPInvoice;
    if(!inv || !inv.role) return false;
    if(!isSvp(inv)) return true;
    if(window.__ownerInvoiceCashInBridgeInstalled) return true;
    window.__ownerInvoiceCashInBridgeInstalled=true;

    ensureStyle();
    document.addEventListener("click",e=>{
      const btn=e.target.closest?.("[data-owner-invoice-acc]");
      if(!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const row=(window.SvPInvoice?.rows||[]).find(x=>String(x.id)===String(btn.dataset.ownerInvoiceAcc));
      if(row) approve(row,btn);
    },true);

    const list=document.getElementById("mtInvoiceList");
    if(list) new MutationObserver(()=>decorate()).observe(list,{childList:true,subtree:true});
    decorate();
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{if(install()||++tries>180)clearInterval(timer)},100);
  window.addEventListener("load",()=>{setTimeout(install,700);setTimeout(install,1500)});
})();
