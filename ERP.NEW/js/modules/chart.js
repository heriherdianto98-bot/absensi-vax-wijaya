/*
=========================================
VAX ERP
Chart Module
=========================================
*/

let omzetChart;


function renderChart(key){

    const ctx=document.getElementById("omzetChart");

    if(!ctx) return;

    if(omzetChart){
        omzetChart.destroy();
    }

    omzetChart=new Chart(ctx,{

        type:"line",

        data:{

            labels:DashboardEngine.chartData[key].labels,

            datasets:[{

                data:DashboardEngine.chartData[key].data,

                borderColor:"#d4af37",

                backgroundColor:"rgba(212,175,55,.18)",

                borderWidth:4,

                fill:true,

                tension:.4,

                pointRadius:5,

                pointHoverRadius:7

            }]

        },

        options:{

            responsive:true,

            maintainAspectRatio:false,

            plugins:{
                legend:{
                    display:false
                }
            },

            scales:{

                x:{
                    ticks:{
                        color:"#aaa"
                    },
                    grid:{
                        color:"rgba(255,255,255,.05)"
                    }
                },

                y:{
                    ticks:{
                        color:"#aaa"
                    },
                    grid:{
                        color:"rgba(255,255,255,.05)"
                    }
                }

            }

        }

    });

}

function initChart(){

    renderChart("hari");

    const buttons=document.querySelectorAll(".chart-filter");

    buttons.forEach(btn=>{

        btn.onclick=()=>{

            buttons.forEach(b=>b.classList.remove("active"));

            btn.classList.add("active");

            const text=btn.innerText.trim();

            if(text==="Hari") renderChart("hari");

            if(text==="7 Hari") renderChart("minggu");

            if(text==="30 Hari") renderChart("bulan30");

            if(text==="Bulan") renderChart("bulan");

        };

    });

}