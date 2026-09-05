/*
=========================================================
VAX ERP
Live Activity Module
=========================================================
Tanggung jawab:
- Merender Live Activity (#activityList) dari
  DashboardEngine.rawData, yaitu data yang SUDAH difilter
  sesuai cabang (DashboardEngine.lastCabangId) dan periode
  (DashboardEngine.lastPeriode) yang sedang aktif.
- Omzet per baris dihitung dari field Minutes yang sama
  dengan KPI/Ranking: service + produk (lihat
  DashboardEngine.calculate() & DashboardEngine.buildRanking()).
- Fungsi renderActivity() ini menggantikan definisi lama
  di dashboard.js karena activity.js dimuat setelahnya,
  sehingga dashboard.js tidak perlu diubah.
=========================================================
*/

/* UI ONLY — dashboard top header emphasis. No data/filter/engine mutation. */
(function ensureDashboardHeaderEmphasis(){
    if(!document.body?.classList?.contains("page-erp-dashboard")) return;
    if(document.getElementById("vaxDashboardHeaderEmphasisStyle")) return;

    const style = document.createElement("style");
    style.id = "vaxDashboardHeaderEmphasisStyle";
    style.textContent = `
        html body.page-erp-dashboard{
            --erp-top-header-h:68px !important;
        }
        html body.page-erp-dashboard .erp-wrapper{
            padding-top:68px !important;
        }
        html body.page-erp-dashboard #header{
            min-height:68px !important;
            animation:vaxHeaderBarPulse 2s ease-in-out infinite !important;
            border-bottom:1px solid rgba(242,194,48,.28) !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header,
        html body.page-erp-dashboard .erp-wrapper .erp-header,
        html body.page-erp-dashboard .od-command-bar{
            height:68px !important;
            min-height:68px !important;
            max-height:68px !important;
            padding:0 16px !important;
            gap:12px !important;
            background:linear-gradient(180deg, rgba(255,255,255,.035) 0%, rgba(16,19,24,.98) 100%) !important;
            border-bottom:1px solid rgba(242,194,48,.22) !important;
        }
        html body.page-erp-dashboard .header-context,
        html body.page-erp-dashboard .od-status-cluster{
            gap:10px !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header .header-chip,
        html body.page-erp-dashboard .erp-wrapper .erp-header .header-chip,
        html body.page-erp-dashboard .od-chip{
            min-height:50px !important;
            min-width:150px !important;
            max-width:260px !important;
            padding:6px 16px !important;
            gap:3px !important;
            border:1px solid rgba(242,194,48,.24) !important;
            border-radius:12px !important;
            background:linear-gradient(180deg, rgba(242,194,48,.10) 0%, rgba(255,255,255,.025) 100%) !important;
            box-shadow:inset 0 1px 0 rgba(255,255,255,.08), 0 0 12px rgba(242,194,48,.10) !important;
            animation:vaxHeaderChipPulse 1.75s ease-in-out infinite !important;
        }
        html body.page-erp-dashboard .header-chip + .header-chip{
            border-left:1px solid rgba(242,194,48,.24) !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header .header-chip:first-child{
            padding-left:16px !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header .header-chip label{
            font-size:11px !important;
            font-weight:800 !important;
            letter-spacing:.11em !important;
            line-height:1.15 !important;
            color:#AEB7C3 !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header .header-chip strong,
        html body.page-erp-dashboard .erp-wrapper .top-header #erpHeaderCabang,
        html body.page-erp-dashboard .erp-wrapper .top-header #erpHeaderPeriode{
            font-size:17px !important;
            font-weight:900 !important;
            line-height:1.15 !important;
            color:#F8FAFC !important;
            text-shadow:0 0 12px rgba(242,194,48,.14) !important;
        }
        html body.page-erp-dashboard .header-minutes-status{
            min-height:44px !important;
            padding:4px 10px !important;
            gap:8px !important;
        }
        html body.page-erp-dashboard .header-minutes-status strong{
            font-size:15px !important;
            font-weight:800 !important;
        }
        html body.page-erp-dashboard .header-minutes-status .header-minutes-sub{
            font-size:11px !important;
            font-weight:700 !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header .header-icon-btn{
            width:38px !important;
            height:38px !important;
            min-height:38px !important;
            flex:0 0 38px !important;
            border-radius:10px !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header .header-icon-btn .material-symbols-rounded,
        html body.page-erp-dashboard .erp-wrapper .top-header .header-icon-btn span{
            font-size:22px !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header .header-user-block,
        html body.page-erp-dashboard .od-owner{
            min-height:44px !important;
            gap:12px !important;
            padding-left:14px !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header #ownerAuthName,
        html body.page-erp-dashboard .erp-wrapper .top-header .header-auth-meta strong{
            font-size:16px !important;
            font-weight:800 !important;
            max-width:160px !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header #ownerAuthRole,
        html body.page-erp-dashboard .erp-wrapper .top-header .header-auth-meta span{
            font-size:11px !important;
            font-weight:800 !important;
        }
        html body.page-erp-dashboard .erp-wrapper .top-header .btn-owner-logout{
            height:40px !important;
            min-height:40px !important;
            padding:0 16px !important;
            font-size:14px !important;
            font-weight:800 !important;
            border-radius:10px !important;
        }
        @keyframes vaxHeaderBarPulse{
            0%,100%{
                box-shadow:0 2px 10px rgba(0,0,0,.28), 0 0 0 rgba(242,194,48,0) !important;
                filter:brightness(1);
            }
            50%{
                box-shadow:0 5px 18px rgba(0,0,0,.34), 0 0 24px rgba(242,194,48,.20) !important;
                filter:brightness(1.045);
            }
        }
        @keyframes vaxHeaderChipPulse{
            0%,100%{
                box-shadow:inset 0 1px 0 rgba(255,255,255,.08), 0 0 8px rgba(242,194,48,.10) !important;
                border-color:rgba(242,194,48,.22) !important;
                filter:brightness(1);
            }
            50%{
                box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 0 24px rgba(242,194,48,.38) !important;
                border-color:rgba(242,194,48,.48) !important;
                filter:brightness(1.08);
            }
        }
        @media (prefers-reduced-motion: reduce){
            html body.page-erp-dashboard #header,
            html body.page-erp-dashboard .erp-wrapper .top-header .header-chip,
            html body.page-erp-dashboard .erp-wrapper .erp-header .header-chip,
            html body.page-erp-dashboard .od-chip{animation:none !important;}
        }
    `;
    document.head.appendChild(style);
})();

function renderActivity(){

    const list = document.getElementById("activityList");

    if(!list) return;

    const hitungOmzetBaris = row =>
        Number(row.service||0) + Number(row.produk||0);

    // Baris tanpa nilai transaksi apa pun (sync harian yang belum ada
    // transaksi) disingkirkan agar Live Activity tidak menampilkan Rp0
    // padahal ada aktivitas bernilai di tanggal lain pada periode aktif.
    const adaNilaiTransaksi = row =>
        hitungOmzetBaris(row) > 0 ||
        Number(row.cash_out||0) > 0 ||
        Number(row.non_cash||0) > 0 ||
        Number(row.cash_payment||0) > 0;

    const aktivitas = [...(DashboardEngine.rawData || [])]
        .filter(row=>row.synced_at && adaNilaiTransaksi(row))
        .sort((a,b)=>new Date(b.synced_at)-new Date(a.synced_at))
        .slice(0,10);

    if(aktivitas.length===0){
        list.innerHTML = `
            <div class="activity-item">
                <div class="activity-content">
                    <p>Belum ada aktivitas dengan nilai transaksi pada periode ini.</p>
                </div>
            </div>
        `;

        return;
    }

    list.innerHTML = aktivitas.map(row=>`
        <div class="activity-item">

            <div class="activity-time">
                ${formatJamAktivitas(row.synced_at)}
            </div>

            <div class="activity-content">

                <strong>${row.nama_cabang || "-"}</strong>

                <p>
                    Sinkronisasi Omzet
                    •
                    ${formatRupiahAktivitas(hitungOmzetBaris(row))}
                </p>

            </div>

        </div>
    `).join("");

}


/* ================= HELPER FORMAT (khusus Activity) ================= */

function formatRupiahAktivitas(nilai){
    return "Rp" + Number(nilai||0).toLocaleString("id-ID");
}


function formatJamAktivitas(waktu){

    if(!waktu) return "-";

    return new Date(waktu).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta"
    });

}
