/* VAX WIJAYA — themed calendar for Gaji Saya
   UI-only adapter. Existing payroll/date logic remains in gaji-saya.js. */
(function(){
    const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const DAYS = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];

    let activeInput = null;
    let viewYear = 0;
    let viewMonth = 0;

    const pad = (n) => String(n).padStart(2,"0");
    const iso = (y,m,d) => `${y}-${pad(m+1)}-${pad(d)}`;
    const parseIso = (value) => {
        const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!m) return null;
        return {y:Number(m[1]),m:Number(m[2])-1,d:Number(m[3])};
    };
    const todayParts = () => {
        const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
        const get = (t) => Number(parts.find(p => p.type === t)?.value || 0);
        return {y:get("year"),m:get("month")-1,d:get("day")};
    };

    function build(){
        if(document.getElementById("vaxCalendarBackdrop")) return;
        const backdrop = document.createElement("div");
        backdrop.id = "vaxCalendarBackdrop";
        backdrop.className = "vax-calendar-backdrop";
        backdrop.hidden = true;
        backdrop.innerHTML = `
            <section class="vax-calendar" role="dialog" aria-modal="true" aria-label="Pilih tanggal">
                <div class="vax-cal-head">
                    <button class="vax-cal-nav" type="button" data-cal-nav="prev" aria-label="Bulan sebelumnya"><i class="fa-solid fa-chevron-left"></i></button>
                    <div class="vax-cal-title"><strong id="vaxCalTitle">—</strong><small>Pilih tanggal</small></div>
                    <button class="vax-cal-nav" type="button" data-cal-nav="next" aria-label="Bulan berikutnya"><i class="fa-solid fa-chevron-right"></i></button>
                </div>
                <div class="vax-cal-body">
                    <div class="vax-cal-week">${DAYS.map(d=>`<span>${d}</span>`).join("")}</div>
                    <div id="vaxCalGrid" class="vax-cal-grid"></div>
                </div>
                <div class="vax-cal-foot">
                    <button type="button" class="vax-cal-action" data-cal-action="cancel">Batal</button>
                    <button type="button" class="vax-cal-action is-today" data-cal-action="today">Hari ini</button>
                </div>
            </section>`;
        document.body.appendChild(backdrop);

        backdrop.addEventListener("click", (e) => {
            if(e.target === backdrop) close();
            const nav = e.target.closest("[data-cal-nav]");
            if(nav){
                if(nav.dataset.calNav === "prev"){
                    viewMonth--;
                    if(viewMonth < 0){viewMonth = 11; viewYear--;}
                }else{
                    viewMonth++;
                    if(viewMonth > 11){viewMonth = 0; viewYear++;}
                }
                render();
                return;
            }
            const day = e.target.closest("[data-cal-date]");
            if(day){
                choose(day.dataset.calDate);
                return;
            }
            const action = e.target.closest("[data-cal-action]");
            if(action?.dataset.calAction === "cancel") close();
            if(action?.dataset.calAction === "today"){
                const t = todayParts();
                choose(iso(t.y,t.m,t.d));
            }
        });

        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && !backdrop.hidden) close();
        });
    }

    function render(){
        const title = document.getElementById("vaxCalTitle");
        const grid = document.getElementById("vaxCalGrid");
        if(!title || !grid) return;
        title.textContent = `${MONTHS[viewMonth]} ${viewYear}`;

        const first = new Date(viewYear,viewMonth,1);
        const startDow = first.getDay();
        const daysInMonth = new Date(viewYear,viewMonth+1,0).getDate();
        const prevDays = new Date(viewYear,viewMonth,0).getDate();
        const selected = parseIso(activeInput?.value);
        const t = todayParts();
        const buttons = [];

        for(let i=0;i<42;i++){
            const logical = i - startDow + 1;
            let y = viewYear, m = viewMonth, d = logical, outside = false;
            if(logical < 1){
                outside = true;
                m--;
                if(m < 0){m=11;y--;}
                d = prevDays + logical;
            }else if(logical > daysInMonth){
                outside = true;
                d = logical - daysInMonth;
                m++;
                if(m > 11){m=0;y++;}
            }
            const dateIso = iso(y,m,d);
            const isSelected = selected && selected.y===y && selected.m===m && selected.d===d;
            const isToday = t.y===y && t.m===m && t.d===d;
            buttons.push(`<button type="button" class="vax-cal-day${outside?" is-outside":""}${isToday?" is-today":""}${isSelected?" is-selected":""}" data-cal-date="${dateIso}">${d}</button>`);
        }
        grid.innerHTML = buttons.join("");
    }

    function open(input){
        build();
        activeInput = input;
        const selected = parseIso(input.value) || todayParts();
        viewYear = selected.y;
        viewMonth = selected.m;
        render();
        const backdrop = document.getElementById("vaxCalendarBackdrop");
        if(backdrop) backdrop.hidden = false;
    }

    function close(){
        const backdrop = document.getElementById("vaxCalendarBackdrop");
        if(backdrop) backdrop.hidden = true;
        activeInput = null;
    }

    function choose(value){
        if(!activeInput) return;
        activeInput.value = value;
        activeInput.dispatchEvent(new Event("input",{bubbles:true}));
        activeInput.dispatchEvent(new Event("change",{bubbles:true}));
        close();
    }

    function bind(){
        build();
        ["periodeDari","periodeSampai"].forEach((id) => {
            const input = document.getElementById(id);
            const shell = input?.closest(".period-input");
            if(!input || !shell) return;
            shell.setAttribute("role","button");
            shell.setAttribute("tabindex","0");
            shell.setAttribute("aria-label", id === "periodeDari" ? "Pilih tanggal mulai" : "Pilih tanggal akhir");
            shell.addEventListener("click", (e) => { e.preventDefault(); open(input); });
            shell.addEventListener("keydown", (e) => {
                if(e.key === "Enter" || e.key === " "){
                    e.preventDefault();
                    open(input);
                }
            });
        });
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",bind);
    else bind();
})();
