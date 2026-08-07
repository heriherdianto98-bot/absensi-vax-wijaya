/*
=========================================================
ERP VAX WIJAYA
loader.js
Version : 2.0.0
Status  : Production Ready
=========================================================
*/

async function loadComponent(targetId, file) {

    try {

        const response = await fetch(file);

        if (!response.ok) {
            throw new Error(file);
        }

        const html = await response.text();

        document.getElementById(targetId).innerHTML = html;

initializeComponent(targetId);

if(targetId==="chart-section"){
    setTimeout(initChart,100);
}

    } catch (err) {

        console.error("Load Component Error :", err);

    }

}


function initializeComponent(targetId){

    if(targetId==="sidebar"){

        initSidebar();

    }

}


function initSidebar(){

    const sidebar=document.querySelector(".sidebar");

    const btn=document.getElementById("sidebarToggle");

    if(!sidebar || !btn) return;

    const status=localStorage.getItem("sidebar-collapse");

    if(status==="true"){

        sidebar.classList.add("collapsed");

    }

    btn.onclick=()=>{

        sidebar.classList.toggle("collapsed");

        localStorage.setItem(
            "sidebar-collapse",
            sidebar.classList.contains("collapsed")
        );

    };

}


document.addEventListener("DOMContentLoaded",()=>{

    loadComponent(
        "sidebar",
        "../components/sidebar.html"
    );

    loadComponent(
        "header",
        "../components/header.html"
    );

    loadComponent(
        "toolbar",
        "../components/toolbar.html"
    );

    loadComponent(
        "kpi-section",
        "../components/kpi.html"
    );

    loadComponent(
        "chart-section",
        "../components/chart.html"
    );
    loadComponent(
        "ranking-section",
        "../components/ranking.html"
    );
    loadComponent(
        "widget-section",
        "../components/ai-insight.html"
    );

    loadComponent(
        "activity-section",
        "../components/live-activity.html"
    );

    loadComponent(
        "payment-section",
        "../components/payment-summary.html"
    );

    loadComponent(
        "executive-summary",
        "../components/executive-summary.html"
    );

    DashboardEngine.load();

});