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
