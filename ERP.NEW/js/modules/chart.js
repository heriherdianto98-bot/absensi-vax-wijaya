/*
=========================================
VAX ERP
Chart Module
=========================================
Visual only — series dari DashboardEngine.buildChartData()
(Minutes daily gross_revenue / Sales Summary model).
*/

let omzetChart;

/* Dark Premium chart chrome (canvas — not controllable via CSS) */
const CHART_VISUAL = {
    axis: "#CBD5E1",
    grid: "rgba(148,163,184,.15)",
    line: "#d4af37",
    fill: "rgba(212,175,55,.18)",
    point: "#F2C230",
    pointBorder: "#11151B",
    tooltipBg: "#11151B",
    tooltipTitle: "#F8FAFC",
    tooltipBody: "#F8FAFC",
    tooltipBorder: "#D4AF37"
};

function formatChartRupiah(nilai){
    const n = Number(nilai || 0);
    return "Rp" + n.toLocaleString("id-ID");
}

function formatChartAxisRupiah(nilai){
    const n = Number(nilai || 0);
    const abs = Math.abs(n);
    if(abs >= 1_000_000_000){
        return "Rp" + (n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M";
    }
    if(abs >= 1_000_000){
        return "Rp" + (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
    }
    if(abs >= 1_000){
        return "Rp" + (n / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " rb";
    }
    return formatChartRupiah(n);
}

/* READ ONLY: rata-rata dihitung langsung dari titik data grafik aktif.
   Termasuk nilai 0 bila tanggal tersebut memang tampil di periode grafik. */
function getChartAverage(data){
    const values = Array.isArray(data)
        ? data.map((v) => Number(v || 0)).filter(Number.isFinite)
        : [];
    if(!values.length) return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round(total / values.length);
}

function renderChart(key){

    const ctx = document.getElementById("omzetChart");
    if(!ctx) return;

    if(omzetChart){
        try{ omzetChart.destroy(); }
        catch(_e){ /* ignore stale canvas */ }
        omzetChart = null;
    }

    const chartKey = key || "aktif";
    const pack = (DashboardEngine.chartData && DashboardEngine.chartData[chartKey])
        || { labels: [], data: [] };

    const labels = Array.isArray(pack.labels) ? pack.labels : [];
    const data = Array.isArray(pack.data) ? pack.data : [];
    const singleDay = data.length === 1;
    const averageOmzet = getChartAverage(data);

    // Minutes-style: selalu line + marker + area fill.
    // 1 tanggal → marker besar (bukan bar, bukan fake second point).
    const pointRadius = singleDay ? 10 : 5;
    const pointHoverRadius = singleDay ? 12 : 7;

    omzetChart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                data,
                borderColor: CHART_VISUAL.line,
                backgroundColor: CHART_VISUAL.fill,
                borderWidth: 4,
                fill: true,
                tension: singleDay ? 0 : 0.35,
                pointRadius,
                pointHoverRadius,
                pointBackgroundColor: CHART_VISUAL.point,
                pointBorderColor: CHART_VISUAL.pointBorder,
                pointBorderWidth: singleDay ? 3 : 2,
                pointHoverBackgroundColor: CHART_VISUAL.point,
                pointHoverBorderColor: "#F8FAFC"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                subtitle: {
                    display: true,
                    text: `Rata-rata Omzet: ${formatChartRupiah(averageOmzet)} / hari`,
                    align: "start",
                    color: "#F2C230",
                    padding: { top: 0, bottom: 8 },
                    font: { weight: "800", size: 12 }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: CHART_VISUAL.tooltipBg,
                    titleColor: CHART_VISUAL.tooltipTitle,
                    bodyColor: CHART_VISUAL.tooltipBody,
                    borderColor: CHART_VISUAL.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    titleFont: { weight: "700" },
                    bodyFont: { weight: "700" },
                    cornerRadius: 10,
                    callbacks: {
                        label(context){
                            return formatChartRupiah(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: CHART_VISUAL.axis,
                        font: { weight: "600", size: 11 },
                        maxRotation: 0,
                        autoSkip: true
                    },
                    grid: {
                        color: CHART_VISUAL.grid,
                        drawBorder: false
                    },
                    border: {
                        color: "rgba(148,163,184,.25)"
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: CHART_VISUAL.axis,
                        font: { weight: "600", size: 11 },
                        padding: 6,
                        callback(value){
                            return formatChartAxisRupiah(value);
                        }
                    },
                    grid: {
                        color: CHART_VISUAL.grid,
                        drawBorder: false
                    },
                    border: {
                        color: "rgba(148,163,184,.25)"
                    }
                }
            }
        }
    });

}

function initChart(){

    renderChart("aktif");

    const buttons = document.querySelectorAll(".chart-filter");

    buttons.forEach((btn) => {

        btn.onclick = () => {

            buttons.forEach((b) => b.classList.remove("active"));

            btn.classList.add("active");

            const text = btn.innerText.trim();

            if(text === "Hari") renderChart("hari");

            if(text === "7 Hari") renderChart("minggu");

            if(text === "30 Hari") renderChart("bulan30");

            if(text === "Bulan") renderChart("bulan");

        };

    });

}
