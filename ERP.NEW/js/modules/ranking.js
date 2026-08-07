function renderRanking() {

    const list = document.getElementById("rankingList");
    if (!list) return;

    list.innerHTML = "";

    const ranking = [...DashboardEngine.rawData]
        .sort((a,b)=>Number(b.service)-Number(a.service));

    ranking.forEach((item,index)=>{

        const persen = Math.max(20,100-index*8);

        list.innerHTML += `
        <div class="ranking-item">

            <div>

                <strong>
                    #${index+1} ${item.nama_cabang}
                </strong>

                <div class="ranking-bar">
                    <div class="ranking-fill"
                        style="width:${persen}%">
                    </div>
                </div>

            </div>

            <span>
                Rp ${Number(item.service).toLocaleString("id-ID")}
            </span>

        </div>
        `;

    });

}