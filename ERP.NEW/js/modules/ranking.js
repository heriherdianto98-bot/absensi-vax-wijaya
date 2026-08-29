/*
=========================================================
VAX ERP
Ranking Cabang - sinkron dengan DashboardEngine.rankingData
=========================================================
Catatan:
- Ranking utama: #rankingList (komponen ranking.html).
- Ranking kedua/duplikat: .ranking-list (komponen chart.html,
  sebelumnya berisi angka statis/dummy yang tidak mengikuti
  filter). Disinkronkan di sini agar kedua tampilan konsisten
  dan sama-sama memakai DashboardEngine.rankingData.
=========================================================
*/

function renderRanking() {

    const ranking = [...(DashboardEngine.rankingData || [])];

    renderRankingUtama(ranking);
    renderRankingDuplikat(ranking);

}


function hitungPersenRanking(item, omzetTertinggi){
    if(!omzetTertinggi) return 0;
    return Math.max(8, Math.round((Number(item.omzet||0) / omzetTertinggi) * 100));
}


function renderRankingUtama(ranking){

    const list = document.getElementById("rankingList");
    if (!list) return;

    if(ranking.length===0){
        list.innerHTML = `
        <div class="ranking-item">
            <div><strong>Belum ada data ranking.</strong></div>
        </div>
        `;
        return;
    }

    const omzetTertinggi = ranking[0].omzet || 0;

    list.innerHTML = ranking.map((item,index)=>`
        <div class="ranking-item">

            <div>

                <strong>
                    #${index+1} ${item.nama_cabang}
                </strong>

                <div class="ranking-bar">
                    <div class="ranking-fill"
                        style="width:${hitungPersenRanking(item, omzetTertinggi)}%">
                    </div>
                </div>

            </div>

            <span>
                Rp ${Number(item.omzet||0).toLocaleString("id-ID")}
            </span>

        </div>
    `).join("");

}


function renderRankingDuplikat(ranking){

    const listDuplikat = document.querySelector(".ranking-list");
    if(!listDuplikat) return;

    if(ranking.length===0){
        listDuplikat.innerHTML = `
        <div class="ranking-item">
            <div class="rank-info">
                <div class="branch">Belum ada data ranking.</div>
            </div>
        </div>
        `;
        return;
    }

    const omzetTertinggi = ranking[0].omzet || 0;

    listDuplikat.innerHTML = ranking.map((item,index)=>`
        <div class="ranking-item">

            <span class="rank">${index+1}</span>

            <div class="rank-info">

                <div class="branch">
                    ${item.nama_cabang}
                </div>

                <div class="bar">
                    <div class="fill"
                        style="width:${hitungPersenRanking(item, omzetTertinggi)}%">
                    </div>
                </div>

            </div>

            <span class="amount">
                Rp${Number(item.omzet||0).toLocaleString("id-ID")}
            </span>

        </div>
    `).join("");

}
