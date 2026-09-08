/*
=========================================================
VAX ERP — ARUS KAS V2 WALLET TRANSFER
Additive runtime/UI layer.

Tujuan:
- Transfer Internal wajib punya Wallet Sumber dan Wallet Tujuan.
- Mendukung transfer antar wallet, tidak lagi memaksa KAS_BESAR sebagai sumber.
- Piutang Setoran tetap system-derived dan tidak boleh dipilih manual.
- Tidak mengubah engine Setoran 3 Harian / DailyDataEngine.
=========================================================
*/
"use strict";

(function(){
  const flow=window.ArusKasV2;
  if(!flow || flow.__walletTransferUiInstalled) return;
  flow.__walletTransferUiInstalled=true;

  const transferableWallets=[
    ["KAS_BESAR","Kas Besar"],
    ["DANA_PRODUK","Dana Produk"],
    ["KAS_DENDA","Kas Denda"],
    ["PIUTANG_DENDA","Piutang Denda"]
  ];

  function walletOptions(){
    return transferableWallets.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  }

  function ensureTransferFields(){
    if(document.getElementById("ak2TransferWallets")) return true;
    const wallet=document.getElementById("ak2Wallet");
    const walletLabel=wallet?.closest("label");
    if(!walletLabel) return false;

    walletLabel.id="ak2WalletField";
    const jenis=document.getElementById("ak2Jenis");
    const jenisLabel=jenis?.closest("label");
    if(jenisLabel) jenisLabel.id="ak2JenisField";

    const wrap=document.createElement("div");
    wrap.id="ak2TransferWallets";
    wrap.className="ak2-period-fields ak2-transfer-wallets";
    wrap.hidden=true;
    wrap.innerHTML=`
      <label>Wallet Sumber
        <select id="ak2WalletFrom">${walletOptions()}</select>
      </label>
      <label>Wallet Tujuan
        <select id="ak2WalletTo">${walletOptions()}</select>
      </label>`;
    walletLabel.insertAdjacentElement("afterend",wrap);

    const from=wrap.querySelector("#ak2WalletFrom");
    const to=wrap.querySelector("#ak2WalletTo");
    from.value="KAS_BESAR";
    to.value="DANA_PRODUK";
    return true;
  }

  function syncTransferUi(){
    ensureTransferFields();
    const isTransfer=document.getElementById("ak2Kategori")?.value==="TRANSFER_INTERNAL";
    const transfer=document.getElementById("ak2TransferWallets");
    const walletField=document.getElementById("ak2WalletField")||document.getElementById("ak2Wallet")?.closest("label");
    const jenisField=document.getElementById("ak2JenisField")||document.getElementById("ak2Jenis")?.closest("label");
    if(transfer) transfer.hidden=!isTransfer;
    if(walletField) walletField.hidden=isTransfer;
    if(jenisField) jenisField.hidden=isTransfer;
  }

  const baseSyncPopupFields=flow.syncPopupFields?.bind(flow);
  flow.syncPopupFields=function(){
    const r=baseSyncPopupFields?.(...arguments);
    syncTransferUi();
    return r;
  };

  const baseSetFormDisabled=flow.setFormDisabled?.bind(flow);
  flow.setFormDisabled=function(disabled){
    const r=baseSetFormDisabled?.(disabled);
    ["ak2WalletFrom","ak2WalletTo"].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=disabled});
    return r;
  };

  const baseOpenInput=flow.openInput?.bind(flow);
  if(baseOpenInput){
    flow.openInput=function(row=null){
      const r=baseOpenInput(row);
      ensureTransferFields();
      if(row?.category==="TRANSFER_INTERNAL"){
        const from=document.getElementById("ak2WalletFrom");
        const to=document.getElementById("ak2WalletTo");
        if(from && transferableWallets.some(([v])=>v===row.from_wallet)) from.value=row.from_wallet;
        if(to && transferableWallets.some(([v])=>v===row.to_wallet)) to.value=row.to_wallet;
      }else if(!row){
        const from=document.getElementById("ak2WalletFrom");
        const to=document.getElementById("ak2WalletTo");
        if(from) from.value="KAS_BESAR";
        if(to) to.value="DANA_PRODUK";
      }
      syncTransferUi();
      return r;
    };
  }

  const baseSaveManual=flow.saveManual?.bind(flow);
  flow.saveManual=async function(){
    if(document.getElementById("ak2Kategori")?.value!=="TRANSFER_INTERNAL"){
      return baseSaveManual?.(...arguments);
    }

    try{
      this.busy?.(true);
      this.clearMessage?.();
      ensureTransferFields();

      const id=document.getElementById("ak2EditId")?.value||"";
      const existing=id?this.ledger.find(x=>String(x.id)===String(id)):null;
      if(existing?.verification_status==="OWNER_VERIFIED") throw new Error("Transaksi OWNER VERIFIED tidak boleh diedit langsung. Gunakan koreksi/adjustment.");
      if(existing?.entry_type==="AUTO") throw new Error("Transaksi AUTO tidak boleh diedit manual.");

      const tanggal=document.getElementById("ak2Tanggal")?.value;
      const amount=this.money(document.getElementById("ak2Nominal")?.dataset?.value);
      const description=document.getElementById("ak2Keterangan")?.value?.trim()||"";
      const from_wallet=document.getElementById("ak2WalletFrom")?.value;
      const to_wallet=document.getElementById("ak2WalletTo")?.value;
      const allowed=new Set(transferableWallets.map(([v])=>v));

      if(!tanggal || !amount) throw new Error("Tanggal dan nominal wajib diisi.");
      if(!allowed.has(from_wallet) || !allowed.has(to_wallet)) throw new Error("Wallet sumber / tujuan tidak valid.");
      if(from_wallet===to_wallet) throw new Error("Wallet sumber dan tujuan harus berbeda.");

      const payload={
        tanggal,
        amount:Math.round(amount),
        from_wallet,
        to_wallet,
        entry_type:"MANUAL",
        category:"TRANSFER_INTERNAL",
        description:description||null,
        source_type:null,
        source_period_start:null,
        source_period_end:null,
        verification_status:"BELUM_DIVERIFIKASI",
        updated_by:this.user.id,
        updated_at:new Date().toISOString()
      };

      let saved;
      if(existing){
        const {data,error}=await db.from(this.TX_TABLE).update(payload).eq("id",existing.id).select("*").single();
        if(error) throw error;
        saved=data;
        await this.audit?.(saved.id,"EDIT",{before:existing,after:saved});
      }else{
        const {data,error}=await db.from(this.TX_TABLE).insert({...payload,created_by:this.user.id}).select("*").single();
        if(error) throw error;
        saved=data;
        await this.audit?.(saved.id,"CREATE",saved);
      }

      this.closeInput?.();
      this.ok?.("Transfer antar wallet tersimpan · status Belum Diverifikasi.");
      if(typeof this.fastReload==="function") await this.fastReload({loadSetoran:false});
      else await this.reload?.();
      return saved;
    }catch(e){
      this.fail?.(e?.message||String(e));
    }finally{
      this.busy?.(false);
    }
  };

  function installStyle(){
    if(document.getElementById("ak2WalletTransferUiStyle")) return;
    const s=document.createElement("style");
    s.id="ak2WalletTransferUiStyle";
    s.textContent=`
      body.page-arus-kas #ak2TransferWallets{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:18px}
      body.page-arus-kas #ak2TransferWallets[hidden]{display:none!important}
      body.page-arus-kas #ak2TransferWallets label{min-width:0}
      @media(max-width:700px){body.page-arus-kas #ak2TransferWallets{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  installStyle();
  if(!ensureTransferFields()){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(ensureTransferFields()||tries>=80){clearInterval(timer);syncTransferUi()}
    },50);
  }else syncTransferUi();
})();
