/* ERP VAX — Setoran 3 Harian role compatibility
   Owner = review/verification only. SVP/SPV = manual entry workflow.
   Tidak mengubah engine canonical; hanya memisahkan permission role pada halaman Setoran 3 Harian. */
(function(){
  "use strict";
  if(typeof SetoranDirectFlow === "undefined") return;

  // Legacy direct-flow memakai isSvp() sebagai gate untuk input/edit manual.
  // Owner harus READ ONLY pada tabel, kecuali aksi Owner khusus yang ditangani modul terpisah:
  // VERIF OWNER, review/lihat bukti, dan minta koreksi.
  SetoranDirectFlow.isSvp = function(){
    return ["svp","spv"].includes(String(this.role||"").toLowerCase());
  };

  SetoranDirectFlow.loadIdentity = async function(){
    const {data:s,error:se}=await db.auth.getSession();
    if(se) throw se;
    this.user=s?.session?.user;
    if(!this.user) throw new Error("Sesi tidak ditemukan.");

    const {data,error}=await db.from("profiles")
      .select("id,nama,role,aktif")
      .eq("id",this.user.id)
      .maybeSingle();
    if(error) throw error;
    if(!data||data.aktif===false) throw new Error("Profil tidak aktif.");

    this.profile=data;
    this.role=String(data.role||"").toLowerCase();
    if(!["owner","svp","spv"].includes(this.role)){
      throw new Error("Akses hanya Owner / SPV.");
    }

    const roleEl=document.getElementById("s3v2Role");
    const userEl=document.getElementById("s3v2User");
    if(roleEl) roleEl.textContent=this.role==="owner"?"OWNER · REVIEW":"SPV · VERIFIKASI";
    if(userEl) userEl.textContent=data.nama||this.role.toUpperCase();
  };
})();

/* Additive owner read-only hard guard loaded after all format/editor compatibility layers. */
(function(){
  const current=document.currentScript;
  if(!current||document.querySelector('script[data-s3-owner-readonly-guard]')) return;
  const s=document.createElement('script');
  s.dataset.s3OwnerReadonlyGuard='1';
  s.src=new URL('setoran-3-harian-owner-readonly-guard.js',current.src).href;
  document.head.appendChild(s);
})();

/*
=========================================================
ERP VAX — Setoran 3 Harian overlap preflight guard
Safety: workflow compatibility only.
- Tidak mengubah SetoranMoneyEngine / DailyDataEngine / rumus angka.
- Trigger overlap Supabase tetap menjadi hard guard canonical.
- Exact-period flow tetap unchanged.
- Hanya menangani kasus draft lama overlap agar UI tidak mencoba INSERT baru.
=========================================================
*/
(function(){
  "use strict";
  if(typeof SetoranDirectFlow === "undefined" || typeof db === "undefined") return;

  const flow=SetoranDirectFlow;
  if(flow.__overlapPreflightGuardInstalled) return;
  flow.__overlapPreflightGuardInstalled=true;

  const originalSaveRow=flow.saveRow.bind(flow);

  function fmt(iso){
    if(!iso) return "—";
    const [y,m,d]=String(iso).split("-");
    return `${d}-${m}-${y}`;
  }

  function branchName(id){
    const row=(flow.branches||[]).find(b=>Number(b.id)===Number(id));
    return flow.canonicalName?.(row?.nama_cabang)||row?.nama_cabang||`Cabang ${id}`;
  }

  function isExact(row,p){
    return row?.period_start===p.start && row?.period_end===p.end;
  }

  function activeContains(row,p){
    return Boolean(row && p.start<=row.period_start && p.end>=row.period_end);
  }

  async function findOverlap(cabangId,p){
    const {data,error}=await db.from(flow.TABLE)
      .select("*")
      .eq("cabang_id",Number(cabangId))
      .lte("period_start",p.end)
      .gte("period_end",p.start)
      .order("period_start",{ascending:true});
    if(error) throw error;
    return data||[];
  }

  async function hasReceipt(setoranId){
    const {data,error}=await db.from("setoran_3_harian_receipts")
      .select("id")
      .eq("setoran_id",setoranId)
      .limit(1);
    if(error) throw error;
    return Boolean(data?.length);
  }

  async function hasProof(setoranId){
    const {data,error}=await db.from(flow.PROOF_TABLE)
      .select("id")
      .eq("setoran_id",setoranId)
      .limit(1);
    if(error) throw error;
    return Boolean(data?.length);
  }

  async function prepareOverlapDraft(cabangId,p){
    const key=flow.key(cabangId);
    if(flow.savedRows.get(key)?.id) return;

    const overlaps=await findOverlap(cabangId,p);
    if(!overlaps.length) return;

    // Race-safe: exact row mungkin dibuat sesudah loadSavedRows tetapi sebelum save.
    const exact=overlaps.find(r=>isExact(r,p));
    if(exact){
      flow.savedRows.set(key,exact);
      return;
    }

    // Canonical guard seharusnya membuat max 1 overlap per cabang.
    // Kalau lebih dari satu, jangan memilih diam-diam.
    if(overlaps.length!==1){
      throw new Error(`${branchName(cabangId)}: ditemukan ${overlaps.length} record Setoran yang overlap. Simpan diblokir untuk mencegah salah update.`);
    }

    const old=overlaps[0];
    const periodText=`${fmt(old.period_start)} s/d ${fmt(old.period_end)}`;

    if(await hasReceipt(old.id)){
      throw new Error(`${branchName(cabangId)}: periode ${periodText} sudah DONE/diterima Owner dan bersifat final. Pilih periode lain.`);
    }

    if(old.owner_verified===true){
      throw new Error(`${branchName(cabangId)}: periode ${periodText} sudah Owner Verified. Batalkan verifikasi Owner terlebih dahulu sebelum memperluas periode.`);
    }

    // Auto-reuse hanya untuk ekspansi aman: periode aktif harus MEMUAT seluruh draft lama.
    // Partial overlap (mis. lama 13-15, baru 15-17) diblokir supaya hari lama tidak bergeser/hilang.
    if(!activeContains(old,p)){
      throw new Error(`${branchName(cabangId)}: periode aktif overlap dengan draft ${periodText}, tetapi bukan perluasan utuh. Pilih periode yang memuat draft lama atau selesaikan draft lama terlebih dahulu.`);
    }

    // Bukti yang sudah melekat pada periode lama tidak boleh ikut dipindahkan diam-diam
    // ke rentang yang lebih luas. Blokir dan minta penyelesaian eksplisit.
    if(await hasProof(old.id)){
      throw new Error(`${branchName(cabangId)}: draft ${periodText} sudah memiliki bukti. Periode tidak diperluas otomatis agar bukti lama tidak salah konteks.`);
    }

    // Draft belum final dan tanpa bukti: aman direuse sebagai record yang sama.
    // Saat rentang diperluas, status pengambilan di-reset karena hari tambahan belum tentu sudah diambil.
    const now=new Date().toISOString();
    const {data,error}=await db.from(flow.TABLE)
      .update({
        period_start:p.start,
        period_end:p.end,
        taken_status:"BELUM DIAMBIL",
        taken_at:null,
        taken_by:null,
        updated_by:flow.user?.id||null,
        updated_at:now
      })
      .eq("id",old.id)
      .select("*")
      .single();
    if(error) throw error;

    flow.savedRows.set(key,data);
    flow.ok?.(`${branchName(cabangId)}: draft ${periodText} dilanjutkan ke ${fmt(p.start)} s/d ${fmt(p.end)}.`);
  }

  flow.saveRow=async function(tr,options={}){
    const cabangId=Number(tr?.dataset?.cabangId);
    if(!Number.isFinite(cabangId)) return originalSaveRow(tr,options);

    const p=this.period();
    await prepareOverlapDraft(cabangId,p);
    return originalSaveRow(tr,options);
  };
})();
