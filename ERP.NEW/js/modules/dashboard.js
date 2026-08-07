document.addEventListener("DOMContentLoaded", async () => {

    await DashboardEngine.load();

    updateDashboard();

    document
        .getElementById("cabangFilter")
        ?.addEventListener("change", async function () {

            const periode =
            document.getElementById("periodeFilter").value;
            
            await DashboardEngine.load(
                this.value,
                periode
            );
            
            updateDashboard();

            

        });

});

function updateDashboard(){

    const s = DashboardEngine.summary;

    document.getElementById("todayRevenue").innerText =
        "Rp" + s.omzet.toLocaleString("id-ID");

    document.getElementById("execNett").innerText =
        "Rp" + s.nett.toLocaleString("id-ID");

    document.getElementById("execCash").innerText =
        "Rp" + s.cash.toLocaleString("id-ID");

    document.getElementById("execQris").innerText =
        "Rp" + s.qris.toLocaleString("id-ID");

}