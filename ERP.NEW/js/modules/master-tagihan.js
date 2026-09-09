/* ERP VAX — MASTER TAGIHAN
   Master reminder schedule only. Tidak membuat Cash Out/Arus Kas.
*/
"use strict";

const MasterTagihan={
  TABLE:"master_tagihan",
  rows:[],user:null,profile:null,role:"",
  categories:["WIFI","MINUTES","SUBSIDI_KOST","AIR","SAMPAH","KEAMANAN","SERVICE_AC"],
  esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))},
  money(v){const n=Number(v);return Number.isFinite(n)?n:0},
  rupiah(v){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(this.money(v))},
  labelCategory(v){return String(v||"").replaceAll("_"," ")},
  isOwner(){return this.role==="owner"},
  async init(){
    await this.loadIdentity();
    this.populateCategories();
    this.bind();
    this.applyAccess();
    await this.reload();
  },
  async loadIdentity(){
    const {data:s,error:se}=await db.auth.getSession(); if(se)throw se;
    this.user=s?.session?.user; if(!this.user)throw new Error("Sesi tidak ditemukan.");
    const {data,error}=await db.from("profiles").select("id,nama,role,aktif").eq("id",this.user.id).maybeSingle();
    if(error)throw error;
    if(!data||data.aktif===false)throw new Error("Profil tidak aktif.");
    this.profile=data;this.role=String(data.role||"").toLowerCase();
    if(this.role==="spv")this.role="svp";
    if(!["owner","svp"].includes(this.role))throw new Error("Master Tagihan hanya untuk Owner / SVP.");
  },
  applyAccess(){
    const add=document.getElementById("mtAdd");
    if(add)add.hidden=!this.isOwner();
    document.body.classList.toggle("mt-readonly",!this.isOwner());
  },
  populateCategories(){
    const opts=this.categories.map(x=>`<option value="${x}">${this.labelCategory(x)}</option>`).join("");
    const filter=document.getElementById("mtCategory");
    if(filter){filter.insertAdjacentHTML("beforeend",opts);filter.value="ALL";}
    const status=document.getElementById("mtStatus");if(status)status.value="ALL";
    const form=document.getElementById("mtFormCategory"); if(form)form.innerHTML=opts;
  },
  bind(){
    document.getElementById("mtSearch")?.addEventListener("input",()=>this.render());
    document.getElementById("mtCategory")?.addEventListener("change",()=>this.render());
    document.getElementById("mtStatus")?.addEventListener("change",()=>this.render());
    document.getElementById("mtRefresh")?.addEventListener("click",()=>this.reload());
    document.getElementById("mtAdd")?.addEventListener("click",()=>this.open());
    document.querySelectorAll("[data-mt-close]").forEach(x=>x.addEventListener("click",()=>this.close()));
    document.getElementById("mtForm")?.addEventListener("submit",e=>{e.preventDefault();this.save();});
    document.getElementById("mtAmount")?.addEventListener("input",e=>this.formatAmount(e.target));
    document.getElementById("mtBody")?.addEventListener("click",e=>{
      const btn=e.target.closest("[data-mt-edit]");if(!btn)return;
      const row=this.rows.find(x=>String(x.id)===String(btn.dataset.mtEdit));if(row)this.open(row);
    });
  },
  formatAmount(input){
    const n=Number(String(input.value||"").replace(/\D/g,""))||0;
    input.dataset.value=String(n);input.value=this.rupiah(n);
  },
  async reload(){
    const btn=document.getElementById("mtRefresh"); if(btn){btn.disabled=true;btn.textContent="↻ Memuat..."}
    try{
      let {data,error}=await db.rpc("get_master_tagihan");
      if(error){
        const fallback=await db.from(this.TABLE).select("*").order("jatuh_tempo_hari",{ascending:true}).order("kategori",{ascending:true}).order("cabang",{ascending:true});
        data=fallback.data;error=fallback.error;
      }
      if(error)throw error;
      this.rows=Array.isArray(data)?data:[];
      this.render();
    }catch(e){
      console.error("Master Tagihan reload gagal",e);
      this.rows=[];this.render();
      const body=document.getElementById("mtBody");
      if(body)body.innerHTML=`<tr><td colspan="7" class="mt-empty">Gagal memuat master tagihan: ${this.esc(e?.message||String(e))}</td></tr>`;
    }finally{if(btn){btn.disabled=false;btn.textContent="↻ Refresh"}}
  },
  daysUntil(day){
    const now=new Date();const y=now.getFullYear(),m=now.getMonth();
    const max=new Date(y,m+1,0).getDate();const targetDay=Math.min(Number(day)||1,max);
    let t=new Date(y,m,targetDay,12,0,0);
    const today=new Date(y,m,now.getDate(),12,0,0);
    if(t<today){const maxNext=new Date(y,m+2,0).getDate();t=new Date(y,m+1,Math.min(targetDay,maxNext),12,0,0)}
    return Math.round((t-today)/86400000);
  },
  filtered(){
    const q=String(document.getElementById("mtSearch")?.value||"").trim().toLowerCase();
    const cat=document.getElementById("mtCategory")?.value||"ALL";
    const status=document.getElementById("mtStatus")?.value||"ALL";
    return this.rows.filter(r=>(!q||[r.kategori,r.cabang,r.catatan].some(v=>String(v||"").toLowerCase().includes(q)))&&(cat==="ALL"||r.kategori===cat)&&(status==="ALL"||(status==="ACTIVE"?r.aktif:!r.aktif)));
  },
  render(){
    const active=this.rows.filter(r=>r.aktif);
    document.getElementById("mtActiveCount").textContent=String(active.length);
    document.getElementById("mtMonthlyTotal").textContent=this.rupiah(active.reduce((t,r)=>t+this.money(r.nominal),0));
    document.getElementById("mtDueSoon").textContent=String(active.filter(r=>{const d=this.daysUntil(r.jatuh_tempo_hari);return d>=0&&d<=7}).length);
    document.getElementById("mtCategoryCount").textContent=String(new Set(active.map(r=>r.kategori)).size);

    const rows=this.filtered();document.getElementById("mtRowCount").textContent=`${rows.length} data`;
    const body=document.getElementById("mtBody");
    if(!rows.length){body.innerHTML='<tr><td colspan="7" class="mt-empty">Tidak ada master tagihan sesuai filter.</td></tr>';return}
    body.innerHTML=rows.map(r=>{
      const d=this.daysUntil(r.jatuh_tempo_hari);
      const reminder=Array.isArray(r.reminder_days)?r.reminder_days:[7,3,1,0];
      return `<tr>
        <td><span class="mt-category">${this.esc(this.labelCategory(r.kategori))}</span></td>
        <td><span class="mt-branch">${this.esc(r.cabang)}</span></td>
        <td><span class="mt-due"><b>${this.esc(r.jatuh_tempo_hari)}</b><span>${d===0?"Hari ini":d===1?"Besok":`H-${d}`}</span></span></td>
        <td class="mt-money">${this.rupiah(r.nominal)}</td>
        <td><span class="mt-reminder">${reminder.map(x=>x===0?"H":"H-"+x).join(" · ")}<br>${r.notify_owner?"Owner":""}${r.notify_owner&&r.notify_svp?" + ":""}${r.notify_svp?"SVP":""}</span></td>
        <td><span class="mt-status ${r.aktif?"":"off"}">${r.aktif?"AKTIF":"NONAKTIF"}</span></td>
        <td><div class="mt-actions">${this.isOwner()?`<button class="mt-action" type="button" data-mt-edit="${r.id}">Edit</button>`:'<span class="mt-reminder">Read only</span>'}</div></td>
      </tr>`;
    }).join("");
  },
  open(row=null){
    if(!this.isOwner())return;
    const modal=document.getElementById("mtModal");modal.hidden=false;
    document.getElementById("mtModalTitle").textContent=row?"Edit Tagihan":"Tambah Tagihan";
    document.getElementById("mtId").value=row?.id||"";
    document.getElementById("mtFormCategory").value=row?.kategori||"WIFI";
    document.getElementById("mtBranch").value=row?.cabang||"";
    document.getElementById("mtDueDay").value=row?.jatuh_tempo_hari||"";
    const amount=document.getElementById("mtAmount");amount.dataset.value=String(row?.nominal||0);amount.value=row?this.rupiah(row.nominal):"";
    document.getElementById("mtNote").value=row?.catatan||"";
    document.getElementById("mtActive").checked=row?!!row.aktif:true;
    document.getElementById("mtFormMsg").textContent="";
  },
  close(){document.getElementById("mtModal").hidden=true},
  async save(){
    if(!this.isOwner())return;
    const msg=document.getElementById("mtFormMsg");msg.className="mt-form-msg mt-span-2";msg.textContent="Menyimpan...";
    const id=document.getElementById("mtId").value;
    const payload={
      kategori:document.getElementById("mtFormCategory").value,
      cabang:String(document.getElementById("mtBranch").value||"").trim().toUpperCase(),
      jatuh_tempo_hari:Number(document.getElementById("mtDueDay").value),
      nominal:Number(document.getElementById("mtAmount").dataset.value||String(document.getElementById("mtAmount").value).replace(/\D/g,""))||0,
      reminder_days:[7,3,1,0],notify_owner:true,notify_svp:true,
      aktif:document.getElementById("mtActive").checked,
      catatan:String(document.getElementById("mtNote").value||"").trim()||null,
      updated_by:this.user.id,updated_at:new Date().toISOString()
    };
    if(!payload.cabang||payload.jatuh_tempo_hari<1||payload.jatuh_tempo_hari>31||payload.nominal<0){msg.classList.add("is-error");msg.textContent="Periksa cabang, tanggal jatuh tempo, dan nominal.";return}
    try{
      let error;
      if(id){({error}=await db.from(this.TABLE).update(payload).eq("id",id));}
      else{payload.created_by=this.user.id;({error}=await db.from(this.TABLE).insert(payload));}
      if(error)throw error;
      this.close();await this.reload();
    }catch(e){msg.classList.add("is-error");msg.textContent=e?.message||String(e)}
  }
};
window.MasterTagihan=MasterTagihan;
