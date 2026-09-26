const EmployeeKasbonIntake = {
  rows: [],
  busy: false,
  action: null,
  currentId: null,

  money(v){ return "Rp" + Number(v||0).toLocaleString("id-ID"); },
  esc(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); },

  async boot(){
    const root=document.getElementById("financeKasbonRoot");
    const role=String(window.KasbonModule?.role||"").toLowerCase();
    if(role!=="spv" && role!=="svp") return;
    if(!root || document.getElementById("ekSvpIntake")) return;
    root.insertAdjacentHTML("afterbegin",
      '<section class="ek-svp-intake" id="ekSvpIntake">' +
      '<div class="ek-svp-head"><div><small>KARYAWAN → SVP</small><h3>Pengajuan Kasbon Baru <span class="ek-svp-count" id="ekSvpCount">0</span></h3></div>' +
      '<button type="button" id="ekSvpRefresh">Refresh</button></div>' +
      '<div class="ek-svp-list" id="ekSvpList"><div class="ek-svp-empty">Memuat pengajuan...</div></div></section>' +
      '<div class="ek-svp-modal" id="ekSvpModal" hidden>' +
      '<div class="ek-svp-backdrop" data-ek-svp-close></div>' +
      '<div class="ek-svp-dialog" role="dialog" aria-modal="true">' +
      '<h4 id="ekSvpModalTitle">Review Pengajuan</h4><p id="ekSvpModalMeta">—</p>' +
      '<textarea id="ekSvpNote" maxlength="600" placeholder="Catatan SVP wajib diisi..."></textarea>' +
      '<div class="ek-svp-dialog-actions"><button type="button" class="ek-svp-cancel" data-ek-svp-close>Batal</button>' +
      '<button type="button" class="ek-svp-confirm" id="ekSvpConfirm">Konfirmasi</button></div></div></div>'
    );
    this.bind();
    await this.load();
  },

  bind(){
    document.getElementById("ekSvpRefresh")?.addEventListener("click",()=>this.load());
    document.getElementById("ekSvpList")?.addEventListener("click",(e)=>{
      const btn=e.target.closest("[data-ek-svp-action]");
      if(!btn) return;
      this.open(btn.dataset.ekSvpId,btn.dataset.ekSvpAction);
    });
    document.querySelectorAll("[data-ek-svp-close]").forEach(el=>el.addEventListener("click",()=>this.close()));
    document.getElementById("ekSvpConfirm")?.addEventListener("click",()=>this.confirm());
  },

  async load(){
    const host=document.getElementById("ekSvpList");
    if(host) host.innerHTML='<div class="ek-svp-empty">Memuat pengajuan...</div>';
    const res=await db.from("employee_cash_advance_requests").select("*").eq("status","MENUNGGU_SVP").order("created_at",{ascending:true});
    if(res.error){
      if(host) host.innerHTML='<div class="ek-svp-empty">Gagal memuat pengajuan.</div>';
      console.error(res.error); return;
    }
    this.rows=res.data||[];
    document.getElementById("ekSvpCount").textContent=String(this.rows.length);
    if(!this.rows.length){
      host.innerHTML='<div class="ek-svp-empty">Tidak ada pengajuan baru dari karyawan.</div>';
      return;
    }
    host.innerHTML=this.rows.map((r)=>{
      let desc=r.request_description ? "<br>"+this.esc(r.request_description) : "";
      return '<article class="ek-svp-item">' +
        '<div class="ek-svp-meta"><strong>'+this.esc(r.employee_name_snapshot)+' · '+this.esc(r.branch_name_snapshot)+'</strong>' +
        '<span>'+this.esc(r.position_snapshot||"Karyawan")+' · '+this.esc(r.request_date||"—")+'</span>' +
        '<span class="ek-svp-amount">'+this.money(r.requested_amount)+'</span>' +
        '<p><b>Kebutuhan:</b> '+this.esc(r.reason||"—")+desc+'</p></div>' +
        '<div class="ek-svp-actions">' +
        '<button type="button" class="ek-svp-reject" data-ek-svp-action="REJECT" data-ek-svp-id="'+r.id+'">Tolak</button>' +
        '<button type="button" class="ek-svp-forward" data-ek-svp-action="FORWARD" data-ek-svp-id="'+r.id+'">Teruskan ke Owner</button>' +
        '</div></article>';
    }).join("");
  },

  open(id,action){
    const row=this.rows.find(r=>String(r.id)===String(id));
    if(!row) return;
    this.currentId=id;
    this.action=action;
    document.getElementById("ekSvpModalTitle").textContent=action==="FORWARD"?"Teruskan ke Owner":"Tolak Pengajuan";
    document.getElementById("ekSvpModalMeta").textContent=(row.employee_name_snapshot||"—")+" · "+this.money(row.requested_amount);
    document.getElementById("ekSvpNote").value="";
    document.getElementById("ekSvpModal").hidden=false;
  },

  close(){
    document.getElementById("ekSvpModal").hidden=true;
    this.currentId=null;
    this.action=null;
  },

  async confirm(){
    if(this.busy||!this.currentId||!this.action) return;
    const action=this.action;
    const note=String(document.getElementById("ekSvpNote").value||"").trim();
    if(note.length<3){ alert("Catatan SVP minimal 3 karakter."); return; }
    this.busy=true;
    const btn=document.getElementById("ekSvpConfirm");
    if(btn) btn.disabled=true;
    try{
      const res=await db.rpc("erp_employee_cash_advance_request_review",{
        p_request_id:this.currentId,p_action:action,p_note:note
      });
      if(res.error) throw res.error;
      this.close();
      if(typeof ErpToast!=="undefined"&&ErpToast.show){
        ErpToast.show(action==="FORWARD"?"Pengajuan diteruskan ke Owner.":"Pengajuan ditolak SVP.","success");
      }
      await this.load();
      if(action==="FORWARD"&&typeof KasbonModule!=="undefined") await KasbonModule.loadList();
    }catch(err){
      console.error(err);
      if(typeof ErpToast!=="undefined"&&ErpToast.show) ErpToast.show(err?.message||String(err),"error");
      else alert(err?.message||String(err));
    }finally{
      this.busy=false;
      if(btn) btn.disabled=false;
    }
  }
};
window.EmployeeKasbonIntake=EmployeeKasbonIntake;
