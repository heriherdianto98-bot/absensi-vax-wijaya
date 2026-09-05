/* VAX ERP — Arus Kas V2
   Spreadsheet-style ledger. Consumer only: tidak mengubah engine Setoran 3 Harian.
*/
"use strict";

const ArusKasV2 = {
  TX_TABLE:"arus_kas_v2_transactions",
  AUDIT_TABLE:"arus_kas_v2_audit",
  SETORAN_TABLE:"setoran_3_harian",
  wallets:["KAS_BESAR","DANA_PRODUK","KAS_DENDA","PIUTANG_SETORAN","PIUTANG_DENDA"],
  user:null, profile:null, role:"", ledger:[], setoranRows:[], profileNames:new Map(), currentDetail:null,

  money(v){const n=Number(v);return Number.isFinite(n)?n:0},
  rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(this.money(v))},
  esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))},
  localDate(d=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(d)},
  monthStart(){const x=this.localDate();return `${x.slice(0,7)}-01`},
  fmtDate(iso){if(!iso)return"—";return new Intl.DateTimeFormat("id-ID",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Jakarta"}).format(new Date(`${iso}T12:00:00+07:00`))},
  periodKey(a,b){return `${a}|${b}`},
  isOwner(){return this.role==="owner"},

  async init(){
    try{
      this.busy(true);
      await this.loadIdentity();
      this.bind();
      document.getElementById("ak2Start").value=this.monthStart();
      document.getElementById("ak2End").value=this.localDate();
      await this.reload();
    }catch(e){this.fail(e?.message||String(e))}
    finally{this.busy(false)}
  },

  async loadIdentity(){
    const {data:s,error:se}=await db.auth.getSession(); if(se)throw se;
    this.user=s?.session?.user; if(!this.user)throw new Error("Sesi tidak ditemukan.");
    const {data,error}=await db.from("profiles").select("id,nama,role,aktif").eq("id",this.user.id).maybeSingle();
    if(error)throw error;
    if(!data||data.aktif===false)throw new Error("Profil tidak aktif.");
    this.profile=data; this.role=String(data.role||"").toLowerCase();
    if(!["owner","svp"].includes(this.role))throw new Error("Arus Kas V2 hanya untuk Owner / SVP.");
    document.getElementById("ak2Role").textContent=this.isOwner()?"OWNER · REVIEW":"SVP · INPUT";
    document.getElementById("ak2User").textContent=data.nama||this.role.toUpperCase();
  },

  bind(){
    document.getElementById("ak2Reload")?.addEventListener("click",()=>this.reload());
    document.getElementById("ak2StatusFilter")?.addEventListener("change",()=>this.renderLedger());
    document.getElementById("ak2Input")?.addEventListener("click",()=>this.openInput());
    document.querySelectorAll("[data-ak2-close]").forEach(x=>x.addEventListener("click",()=>this.closeInput()));
    document.querySelectorAll("[data-ak2-detail-close]").forEach(x=>x.addEventListener("click",()=>this.closeDetail()));
    document.getElementById("ak2Jenis")?.addEventListener("change",()=>this.syncPopupFields());
    document.getElementById("ak2Kategori")?.addEventListener("change",()=>this.syncPopupFields());
    document.getElementById("ak2Nominal")?.addEventListener("input",e=>this.formatMoneyInput(e.target));
    document.getElementById("ak2SaveBtn")?.addEventListener("click",()=>this.saveManual());
    document.getElementById("ak2EditBtn")?.addEventListener("click",()=>this.enableEdit());
    document.getElementById("ak2LedgerBody")?.addEventListener("click",e=>{const tr=e.target.closest("tr[data-id]");if(tr)this.openDetail(tr.dataset.id)});
  },

  range(){
    const start=document.getElementById("ak2Start")?.value,end=document.getElementById("ak2End")?.value;
    if(!start||!end)throw new Error("Pilih periode Arus Kas.");
    if(start>end)throw new Error("Tanggal awal tidak boleh melewati tanggal akhir.");
    return{start,end};
  },

  async reload(){
    this.clearMessage(); this.busy(true);
    try{
      const r=this.range();
      await this.loadSetoran(r);
      await this.syncAutomaticSetoran();
      await this.loadLedger(r);
      await this.loadProfileNames();
      this.renderAll();
    }catch(e){this.fail(e?.message||String(e))}
    finally{this.busy(false)}
  },

  async loadSetoran(r){
    const {data,error}=await db.from(this.SETORAN_TABLE).select("*")
      .lte("period_start",r.end).gte("period_end",r.start)
      .order("period_start",{ascending:true}).order("cabang_id",{ascending:true});
    if(error)throw error;
    this.setoranRows=data||[];
  },

  setoranGroups(){
    const map=new Map();
    for(const row of this.setoranRows){
      const key=this.periodKey(row.period_start,row.period_end);
      if(!map.has(key))map.set(key,{start:row.period_start,end:row.period_end,rows:[]});
      map.get(key).rows.push(row);
    }
    return [...map.values()].sort((a,b)=>a.start.localeCompare(b.start));
  },

  async syncAutomaticSetoran(){
    const groups=this.setoranGroups();
    for(const g of groups){
      if(!g.rows.length)continue;
      const allTaken=g.rows.every(r=>r.taken_status==="SUDAH DIAMBIL");
      if(!allTaken)continue;

      const setoranTotal=g.rows.reduce((t,r)=>t+this.money(r.total_setoran??r.setoran_cash_actual),0);
      const baseKey=`${g.start}_${g.end}`;
      await this.ensureAutoTransaction({
        tanggal:g.end, amount:setoranTotal, from_wallet:"EXTERNAL", to_wallet:"KAS_BESAR",
        category:"SETORAN_3_HARIAN", description:`Setoran ${this.fmtDate(g.start)} — ${this.fmtDate(g.end)}`,
        source_key:`${baseKey}:SETORAN`, start:g.start,end:g.end,
        metadata:{branch_count:g.rows.length,auto_kind:"SETORAN_CASH"}
      });

      if(typeof DailyDataEngine!=="undefined"){
        const dataset=await DailyDataEngine.load({client:db,start:g.start,end:g.end});
        const nettProduk=this.money(dataset?.summary?.nettProduct);
        if(nettProduk>0){
          await this.ensureAutoTransaction({
            tanggal:g.end, amount:nettProduk, from_wallet:"KAS_BESAR", to_wallet:"DANA_PRODUK",
            category:"TRANSFER_DANA_PRODUK", description:`Hak Nett Produk ${this.fmtDate(g.start)} — ${this.fmtDate(g.end)}`,
            source_key:`${baseKey}:PRODUK`,start:g.start,end:g.end,
            metadata:{auto_kind:"NETT_PRODUCT",source:"DailyDataEngine"}
          });
        }
      }
    }
  },

  async ensureAutoTransaction(x){
    if(!(x.amount>0))return;
    const {data:found,error:fe}=await db.from(this.TX_TABLE).select("id").eq("source_type","SETORAN_3_HARIAN").eq("source_key",x.source_key).maybeSingle();
    if(fe)throw fe; if(found)return;
    const payload={tanggal:x.tanggal,amount:Math.round(x.amount),from_wallet:x.from_wallet,to_wallet:x.to_wallet,entry_type:"AUTO",category:x.category,description:x.description,source_type:"SETORAN_3_HARIAN",source_key:x.source_key,source_period_start:x.start,source_period_end:x.end,verification_status:"BELUM_DIVERIFIKASI",created_by:this.user.id,updated_by:this.user.id,metadata:x.metadata||{}};
    const {data,error}=await db.from(this.TX_TABLE).insert(payload).select("*").single();
    if(error)throw error;
    await this.audit(data.id,"AUTO_CREATE",data);
  },

  async loadLedger(r){
    const {data,error}=await db.from(this.TX_TABLE).select("*").lte("tanggal",r.end).order("tanggal",{ascending:true}).order("created_at",{ascending:true});
    if(error)throw error;
    this.ledger=data||[];
  },

  async loadProfileNames(){
    this.profileNames.clear();
    const ids=[...new Set(this.ledger.flatMap(r=>[r.created_by,r.verified_by]).filter(Boolean))];
    if(!ids.length)return;
    const {data,error}=await db.from("profiles").select("id,nama").in("id",ids);
    if(error)return;
    for(const p of data||[])this.profileNames.set(p.id,p.nama||"—");
  },

  renderAll(){this.renderCards();this.renderLedger();this.renderQris()},

  walletBalance(wallet){
    return this.ledger.reduce((t,r)=>t+(r.to_wallet===wallet?this.money(r.amount):0)-(r.from_wallet===wallet?this.money(r.amount):0),0);
  },

  renderCards(){
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=this.rupiah(v)};
    set("ak2KasBesar",this.walletBalance("KAS_BESAR"));
    set("ak2DanaProduk",this.walletBalance("DANA_PRODUK"));
    set("ak2KasDenda",this.walletBalance("KAS_DENDA"));
    const pendingSetoran=this.setoranRows.filter(r=>r.taken_status!=="SUDAH DIAMBIL").reduce((t,r)=>t+this.money(r.total_setoran??r.setoran_cash_actual),0);
    set("ak2PiutangSetoran",pendingSetoran);
    set("ak2PiutangDenda",this.walletBalance("PIUTANG_DENDA"));
  },

  kasEffect(row){return (row.to_wallet==="KAS_BESAR"?this.money(row.amount):0)-(row.from_wallet==="KAS_BESAR"?this.money(row.amount):0)},

  renderLedger(){
    const r=this.range(), status=document.getElementById("ak2StatusFilter")?.value||"ALL";
    let running=0; const balanceAt=new Map();
    for(const row of this.ledger){running+=this.kasEffect(row);balanceAt.set(row.id,running)}
    const rows=this.ledger.filter(x=>x.tanggal>=r.start&&x.tanggal<=r.end&&(status==="ALL"||x.verification_status===status));
    const body=document.getElementById("ak2LedgerBody");
    if(!rows.length){body.innerHTML='<tr><td colspan="8" class="ak2-empty">Belum ada transaksi pada periode ini.</td></tr>';document.getElementById("ak2RowCount").textContent="0 transaksi";return}
    body.innerHTML=rows.map(row=>{
      const effect=this.kasEffect(row),incoming=effect>0?effect:0,outgoing=effect<0?Math.abs(effect):0;
      const inDesc=incoming?row.description||this.categoryName(row.category):"";
      const outDesc=outgoing?row.description||this.categoryName(row.category):"";
      return `<tr data-id="${row.id}">
        <td>${this.fmtDate(row.tanggal)}</td>
        <td class="ak2-money-in">${incoming?this.rupiah(incoming):"—"}</td>
        <td>${this.esc(inDesc)||"—"}</td>
        <td class="ak2-money-out">${outgoing?this.rupiah(outgoing):"—"}</td>
        <td>${this.esc(outDesc)||"—"}</td>
        <td class="ak2-balance">${this.rupiah(balanceAt.get(row.id)||0)}</td>
        <td>${this.sourceBadge(row)}</td>
        <td>${this.statusBadge(row.verification_status)}</td>
      </tr>`
    }).join("");
    document.getElementById("ak2RowCount").textContent=`${rows.length} transaksi`;
  },

  categoryName(v){return String(v||"").replaceAll("_"," ")},
  sourceBadge(row){const src=row.entry_type==="AUTO"?"AUTO":(row.created_by===this.user.id&&this.isOwner()?"OWNER":"SVP");const cls=src==="AUTO"?"is-auto":src==="OWNER"?"is-owner":"";return `<span class="ak2-source ${cls}">${src}</span>`},
  statusBadge(v){if(v==="OWNER_VERIFIED")return '<span class="ak2-status is-verified">OWNER VERIFIED</span>';if(v==="MINTA_KOREKSI")return '<span class="ak2-status is-correction">MINTA KOREKSI</span>';return '<span class="ak2-status is-pending">BELUM DIVERIFIKASI</span>'},

  renderQris(){
    const groups=this.setoranGroups(), ledgerQris=this.ledger.filter(r=>r.category==="QRIS_TRANSFER"&&r.to_wallet==="KAS_BESAR");
    let expTotal=0,actTotal=0;
    const rows=groups.map(g=>{
      const expected=g.rows.reduce((t,r)=>t+this.money(r.bri_non_cash_actual),0);
      const actual=ledgerQris.filter(x=>x.source_period_start===g.start&&x.source_period_end===g.end).reduce((t,r)=>t+this.money(r.amount),0);
      const diff=expected-actual; expTotal+=expected;actTotal+=actual;
      const notes=ledgerQris.filter(x=>x.source_period_start===g.start&&x.source_period_end===g.end).map(x=>x.description).filter(Boolean).join(" · ");
      return `<tr><td>${this.fmtDate(g.start)} — ${this.fmtDate(g.end)}</td><td>${this.rupiah(expected)}</td><td>${this.rupiah(actual)}</td><td class="ak2-qris-diff ${Math.abs(diff)>.5?'is-alert':'is-ok'}">${this.rupiah(diff)}</td><td>${this.esc(notes)||"—"}</td></tr>`
    });
    document.getElementById("ak2QrisBody").innerHTML=rows.length?rows.join(""):'<tr><td colspan="5" class="ak2-empty">Belum ada periode Setoran 3 Harian.</td></tr>';
    document.getElementById("ak2QrisExpected").textContent=this.rupiah(expTotal);
    document.getElementById("ak2QrisActual").textContent=this.rupiah(actTotal);
    document.getElementById("ak2QrisDiff").textContent=this.rupiah(expTotal-actTotal);
  },

  openInput(row=null){
    this.currentDetail=null;
    const modal=document.getElementById("ak2Modal"); modal.hidden=false;
    document.getElementById("ak2ModalTitle").textContent=row?"Edit Arus Kas":"Input Arus Kas";
    document.getElementById("ak2EditId").value=row?.id||"";
    document.getElementById("ak2Tanggal").value=row?.tanggal||this.localDate();
    const kind=row?(row.to_wallet==="KAS_BESAR"||row.to_wallet==="DANA_PRODUK"||row.to_wallet==="KAS_DENDA"?"IN":"OUT"):"IN";
    document.getElementById("ak2Jenis").value=kind;
    document.getElementById("ak2Kategori").value=row?.category||"PEMASUKAN_LAIN";
    const wallet=row?(kind==="IN"?row.to_wallet:row.from_wallet):"KAS_BESAR";
    document.getElementById("ak2Wallet").value=this.wallets.includes(wallet)?wallet:"KAS_BESAR";
    document.getElementById("ak2Nominal").dataset.value=row?String(row.amount):"";
    document.getElementById("ak2Nominal").value=row?this.rupiah(row.amount):"";
    document.getElementById("ak2Keterangan").value=row?.description||"";
    document.getElementById("ak2SourceStart").value=row?.source_period_start||"";
    document.getElementById("ak2SourceEnd").value=row?.source_period_end||"";
    document.getElementById("ak2EditBtn").hidden=true;
    document.getElementById("ak2SaveBtn").hidden=false;
    this.setFormDisabled(false);this.syncPopupFields();
  },

  closeInput(){document.getElementById("ak2Modal").hidden=true},
  formatMoneyInput(el){const digits=String(el.value||"").replace(/\D/g,"");const n=Number(digits||0);el.dataset.value=String(n);el.value=n?this.rupiah(n):""},
  syncPopupFields(){const cat=document.getElementById("ak2Kategori")?.value;document.getElementById("ak2SourcePeriod").hidden=cat!=="QRIS_TRANSFER"},
  setFormDisabled(disabled){["ak2Tanggal","ak2Jenis","ak2Kategori","ak2Wallet","ak2Nominal","ak2Keterangan","ak2SourceStart","ak2SourceEnd"].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=disabled})},

  async saveManual(){
    try{
      this.busy(true);this.clearMessage();
      const id=document.getElementById("ak2EditId").value;
      const existing=id?this.ledger.find(x=>x.id===id):null;
      if(existing?.verification_status==="OWNER_VERIFIED")throw new Error("Transaksi OWNER VERIFIED tidak boleh diedit langsung. Gunakan koreksi/adjustment.");
      if(existing?.entry_type==="AUTO")throw new Error("Transaksi AUTO tidak boleh diedit manual.");
      const tanggal=document.getElementById("ak2Tanggal").value,jenis=document.getElementById("ak2Jenis").value,category=document.getElementById("ak2Kategori").value,wallet=document.getElementById("ak2Wallet").value,amount=this.money(document.getElementById("ak2Nominal").dataset.value),description=document.getElementById("ak2Keterangan").value.trim();
      if(!tanggal||!amount)throw new Error("Tanggal dan nominal wajib diisi.");
      let from_wallet=jenis==="IN"?"EXTERNAL":wallet,to_wallet=jenis==="IN"?wallet:"EXTERNAL";
      if(category==="TRANSFER_INTERNAL"&&jenis==="OUT"){from_wallet="KAS_BESAR";to_wallet=wallet;if(to_wallet==="KAS_BESAR")throw new Error("Pilih tujuan selain Kas Besar untuk transfer internal.")}
      const sourceStart=category==="QRIS_TRANSFER"?document.getElementById("ak2SourceStart").value:null;
      const sourceEnd=category==="QRIS_TRANSFER"?document.getElementById("ak2SourceEnd").value:null;
      if(category==="QRIS_TRANSFER"&&(!sourceStart||!sourceEnd))throw new Error("QRIS / GoPay Transfer wajib memilih periode sumber.");
      const payload={tanggal,amount:Math.round(amount),from_wallet,to_wallet,entry_type:"MANUAL",category,description:description||null,source_type:category==="QRIS_TRANSFER"?"ARUS_KAS_QRIS":null,source_period_start:sourceStart||null,source_period_end:sourceEnd||null,verification_status:"BELUM_DIVERIFIKASI",updated_by:this.user.id,updated_at:new Date().toISOString()};
      let saved;
      if(existing){const {data,error}=await db.from(this.TX_TABLE).update(payload).eq("id",existing.id).select("*").single();if(error)throw error;saved=data;await this.audit(saved.id,"EDIT",{before:existing,after:saved})}
      else{const {data,error}=await db.from(this.TX_TABLE).insert({...payload,created_by:this.user.id}).select("*").single();if(error)throw error;saved=data;await this.audit(saved.id,"CREATE",saved)}
      this.closeInput();this.ok("Transaksi tersimpan · status Belum Diverifikasi.");await this.reload();
    }catch(e){this.fail(e?.message||String(e))}
    finally{this.busy(false)}
  },

  openDetail(id){
    const row=this.ledger.find(x=>x.id===id);if(!row)return;this.currentDetail=row;
    document.getElementById("ak2DetailModal").hidden=false;
    document.getElementById("ak2DetailTitle").textContent=row.description||this.categoryName(row.category);
    const created=this.profileNames.get(row.created_by)||"—",verified=this.profileNames.get(row.verified_by)||"—";
    document.getElementById("ak2DetailBody").innerHTML=`<div class="ak2-detail-grid">
      ${this.detailItem("Tanggal",this.fmtDate(row.tanggal))}${this.detailItem("Nominal",this.rupiah(row.amount))}
      ${this.detailItem("Kategori",this.categoryName(row.category))}${this.detailItem("Sumber",row.entry_type==="AUTO"?"AUTO SYSTEM":created)}
      ${this.detailItem("Dari",this.categoryName(row.from_wallet))}${this.detailItem("Ke",this.categoryName(row.to_wallet))}
      ${this.detailItem("Status",this.categoryName(row.verification_status))}${this.detailItem("Diverifikasi oleh",verified)}
      ${this.detailItem("Periode sumber",row.source_period_start?`${this.fmtDate(row.source_period_start)} — ${this.fmtDate(row.source_period_end)}`:"—")}${this.detailItem("Keterangan",row.description||"—")}
    </div>`;
    const actions=document.getElementById("ak2DetailActions");let html='<button type="button" class="ak2-btn" data-detail-close-btn>Tutup</button>';
    if(row.entry_type!=="AUTO"&&row.verification_status!=="OWNER_VERIFIED")html+='<button type="button" class="ak2-btn" data-detail-edit>Edit</button>';
    if(this.isOwner()&&row.verification_status!=="OWNER_VERIFIED"){
      html+='<button type="button" class="ak2-btn" data-detail-correct>Minta Koreksi</button><button type="button" class="ak2-btn ak2-btn-primary" data-detail-verify>Verifikasi</button>';
    }
    actions.innerHTML=html;
    actions.querySelector("[data-detail-close-btn]")?.addEventListener("click",()=>this.closeDetail());
    actions.querySelector("[data-detail-edit]")?.addEventListener("click",()=>{this.closeDetail();this.openInput(row)});
    actions.querySelector("[data-detail-verify]")?.addEventListener("click",()=>this.verifyRow(row.id));
    actions.querySelector("[data-detail-correct]")?.addEventListener("click",()=>this.requestCorrection(row.id));
  },
  detailItem(label,value){return `<div class="ak2-detail-item"><span>${this.esc(label)}</span><strong>${this.esc(value)}</strong></div>`},
  closeDetail(){document.getElementById("ak2DetailModal").hidden=true;this.currentDetail=null},
  enableEdit(){this.setFormDisabled(false);document.getElementById("ak2SaveBtn").hidden=false},

  async verifyRow(id){
    if(!this.isOwner())return;
    try{this.busy(true);const now=new Date().toISOString();const {data,error}=await db.from(this.TX_TABLE).update({verification_status:"OWNER_VERIFIED",verified_by:this.user.id,verified_at:now,correction_note:null,updated_by:this.user.id,updated_at:now}).eq("id",id).select("*").single();if(error)throw error;await this.audit(id,"OWNER_VERIFY",data);this.closeDetail();this.ok("Transaksi sudah OWNER VERIFIED.");await this.reload()}catch(e){this.fail(e?.message||String(e))}finally{this.busy(false)}
  },

  async requestCorrection(id){
    if(!this.isOwner())return;
    const note=window.prompt("Catatan koreksi untuk SVP:","");if(note===null)return;
    if(!note.trim()){this.fail("Catatan koreksi wajib diisi.");return}
    try{this.busy(true);const now=new Date().toISOString();const {data,error}=await db.from(this.TX_TABLE).update({verification_status:"MINTA_KOREKSI",correction_note:note.trim(),verified_by:null,verified_at:null,updated_by:this.user.id,updated_at:now}).eq("id",id).select("*").single();if(error)throw error;await this.audit(id,"REQUEST_CORRECTION",data);this.closeDetail();this.ok("Transaksi ditandai Minta Koreksi.");await this.reload()}catch(e){this.fail(e?.message||String(e))}finally{this.busy(false)}
  },

  async audit(transactionId,action,snapshot){const {error}=await db.from(this.AUDIT_TABLE).insert({transaction_id:transactionId,action,actor_id:this.user.id,snapshot:snapshot||{}});if(error)console.warn("Arus Kas V2 audit:",error.message)},
  busy(v){const el=document.getElementById("ak2Busy");if(el)el.hidden=!v},
  clearMessage(){const el=document.getElementById("ak2Message");if(el){el.hidden=true;el.className="ak2-message";el.textContent=""}},
  ok(msg){const el=document.getElementById("ak2Message");if(el){el.hidden=false;el.className="ak2-message";el.textContent=msg}},
  fail(msg){const el=document.getElementById("ak2Message");if(el){el.hidden=false;el.className="ak2-message is-error";el.textContent=msg}else console.error(msg)}
};

window.ArusKasV2=ArusKasV2;
window.addEventListener("DOMContentLoaded",()=>ArusKasV2.init(),{once:true});
