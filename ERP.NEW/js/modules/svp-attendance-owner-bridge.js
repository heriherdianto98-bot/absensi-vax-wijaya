/*
=========================================================
VAX ERP — SVP Attendance Owner Read Bridge
=========================================================
Purpose:
- Read SVP floating attendance from public.svp_absensi_v1 via owner-only RPC.
- Merge it into Owner Absensi presentation only:
  Status Karyawan Hari Ini, Aktivitas Absensi, and Matrix/Laporan Absensi.
Safety:
- Does NOT write public.absensi.
- Does NOT change employee attendance/geofence/denda engine.
- Does NOT change locked employee attendance rules.
=========================================================
*/
(() => {
  "use strict";

  const state = {
    installed: false,
    svpIds: new Set()
  };

  const isOwner = () => {
    try{
      return typeof OwnerAuth !== "undefined"
        && OwnerAuth.profile
        && OwnerAuth.isOwnerRole(OwnerAuth.profile.role);
    }catch(_e){
      return false;
    }
  };

  const normId = (v) => String(v == null ? "" : v).trim();

  async function fetchRows(fromIso, toIso){
    if(!isOwner() || typeof db === "undefined") return [];
    const { data, error } = await db.rpc("svp_absensi_owner_list_v1", {
      p_from: fromIso,
      p_to: toIso
    });
    if(error){
      console.warn("[SVP Owner Bridge] read failed:", error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }

  function toSynthetic(row){
    const done = Boolean(row?.jam_pulang);
    return {
      karyawan_id: row.karyawan_id,
      tanggal: row.tanggal,
      jam_masuk: row.jam_masuk,
      jam_pulang: row.jam_pulang,
      status: done ? "Hadir · Selesai" : "Hadir",
      status_absensi: "H",
      terlambat_menit: 0,
      denda: 0,
      status_denda: "",
      __svp_floating: true,
      __svp_address_in: row.alamat_masuk || "",
      __svp_address_out: row.alamat_pulang || ""
    };
  }

  function markEmployeeIndexes(rows){
    for(const row of rows){
      const id = normId(row.karyawan_id);
      if(id) state.svpIds.add(id);
    }

    if(typeof AbsensiOwner !== "undefined"){
      (AbsensiOwner._karyawanIndex || []).forEach((k) => {
        if(state.svpIds.has(normId(k.id))){
          k.cabang = "SVP / Floating";
        }
      });
    }
  }

  function paintDailyStatus(rows){
    if(typeof AbsensiOwner === "undefined") return;

    for(const source of rows){
      const id = normId(source.karyawan_id);
      if(!id) continue;

      let statusRow = (AbsensiOwner._statusRows || []).find((r) => normId(r.id) === id);
      if(statusRow){
        statusRow.cabang = "SVP / Floating";
        statusRow.status = "MASUK";
        statusRow.statusClass = "st-masuk";
        statusRow.denda = 0;
      }

      const tr = document.querySelector(`#statusKaryawan tr[data-absensi-row-id="${CSS.escape(id)}"]`);
      if(tr){
        if(tr.cells[1]) tr.cells[1].textContent = "SVP / Floating";
        if(tr.cells[2]){
          tr.cells[2].innerHTML = '<span class="absensi-status st-masuk">MASUK</span>';
        }
        tr.setAttribute("data-denda","0");
      }
    }
  }

  function mergeDailyRows(rows){
    if(typeof AbsensiOwner === "undefined") return;

    const old = (AbsensiOwner._absensiDay || []).filter((r) => !r?.__svp_floating);
    const synthetic = rows.map(toSynthetic);
    AbsensiOwner._absensiDay = old.concat(synthetic);

    markEmployeeIndexes(rows);
    paintDailyStatus(rows);

    AbsensiOwner.refreshKpiFromCache?.();
    AbsensiOwner.applyStatusTableFilter?.();
    AbsensiOwner.loadAktivitasTerbaru?.();
  }

  function installDailyBridge(){
    if(typeof AbsensiOwner === "undefined" || AbsensiOwner.__svpOwnerBridgeInstalled) return;
    AbsensiOwner.__svpOwnerBridgeInstalled = true;

    const original = AbsensiOwner.loadDashboard.bind(AbsensiOwner);
    AbsensiOwner.loadDashboard = async function(){
      const result = await original();
      if(!isOwner()) return result;

      const iso = this.selectedDate?.();
      if(!iso) return result;

      const rows = await fetchRows(iso, iso);
      mergeDailyRows(rows);
      return result;
    };
  }

  function installMatrixBridge(){
    if(typeof AbsensiLaporanBulanan === "undefined" || AbsensiLaporanBulanan.__svpOwnerBridgeInstalled) return;
    AbsensiLaporanBulanan.__svpOwnerBridgeInstalled = true;

    const originalLoadAbsensi = AbsensiLaporanBulanan.loadAbsensi.bind(AbsensiLaporanBulanan);
    AbsensiLaporanBulanan.loadAbsensi = async function(year, month){
      await originalLoadAbsensi(year, month);
      if(!isOwner()) return;

      const start = this.isoDay(year, month, 1);
      const end = this.isoDay(year, month, this.daysInMonth(year, month));
      const rows = await fetchRows(start, end);
      const old = (this._absensiRows || []).filter((r) => !r?.__svp_floating);
      this._absensiRows = old.concat(rows.map(toSynthetic));

      for(const row of rows){
        const id = normId(row.karyawan_id);
        if(id) state.svpIds.add(id);
      }
    };

    const originalCabangNameOf = AbsensiLaporanBulanan.cabangNameOf.bind(AbsensiLaporanBulanan);
    AbsensiLaporanBulanan.cabangNameOf = function(k){
      if(k && state.svpIds.has(normId(k.id))) return "SVP / Floating";
      return originalCabangNameOf(k);
    };

    const originalLateMinutesOf = AbsensiLaporanBulanan.lateMinutesOf.bind(AbsensiLaporanBulanan);
    AbsensiLaporanBulanan.lateMinutesOf = function(rec){
      if(rec?.__svp_floating) return 0;
      return originalLateMinutesOf(rec);
    };

    const originalDendaSementaraOf = AbsensiLaporanBulanan.dendaSementaraOf.bind(AbsensiLaporanBulanan);
    AbsensiLaporanBulanan.dendaSementaraOf = function(rec){
      if(rec?.__svp_floating) return 0;
      return originalDendaSementaraOf(rec);
    };
  }

  function install(){
    if(state.installed) return;
    state.installed = true;
    installDailyBridge();
    installMatrixBridge();
    console.log("[SVP Owner Bridge] read-only presentation bridge active");
  }

  install();
})();
