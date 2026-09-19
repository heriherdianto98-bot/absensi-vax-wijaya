/*
=========================================================
VAX ERP — Custom select (dark/gold) — sync ke <select> native
Tidak mengubah value/logic filter; hanya UI.
Search opsional via data-erp-cselect-search="placeholder"
=========================================================
*/

const ErpCustomSelect = {
    enhance(selectEl){
        if(!selectEl || selectEl.dataset.cselectReady === "1") return;
        selectEl.dataset.cselectReady = "1";

        const searchPlaceholder = String(selectEl.getAttribute("data-erp-cselect-search") || "").trim();
        const hasSearch = Boolean(searchPlaceholder);

        const wrap = document.createElement("div");
        wrap.className = "erp-cselect" + (hasSearch ? " has-search" : "");
        selectEl.parentNode.insertBefore(wrap, selectEl);
        wrap.appendChild(selectEl);
        selectEl.classList.add("erp-cselect-native");

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "erp-cselect-trigger";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");

        const menu = document.createElement("div");
        menu.className = "erp-cselect-menu";
        menu.hidden = true;
        menu.tabIndex = -1;
        menu.setAttribute("role", "listbox");
        wrap.tabIndex = -1;

        wrap.appendChild(trigger);
        wrap.appendChild(menu);

        const syncLabel = () => {
            const opt = selectEl.selectedOptions?.[0];
            trigger.innerHTML = `<span>${opt ? opt.textContent : "—"}</span><i aria-hidden="true">▾</i>`;
        };

        const visibleOptions = (listEl) =>
            [...(listEl || menu).querySelectorAll(".erp-cselect-option")].filter((o) => !o.hidden);

        const applyFilter = (listEl, searchInput) => {
            if(!hasSearch || !listEl || !searchInput) return;
            const q = String(searchInput.value || "").trim().toLowerCase();
            let visible = 0;
            listEl.querySelectorAll(".erp-cselect-option").forEach((btn) => {
                const match = !q || String(btn.textContent || "").toLowerCase().includes(q);
                btn.hidden = !match;
                btn.classList.remove("is-active");
                if(match) visible += 1;
            });
            let empty = listEl.querySelector(".erp-cselect-empty");
            if(!empty){
                empty = document.createElement("div");
                empty.className = "erp-cselect-empty";
                empty.textContent = "Data tidak ditemukan";
                listEl.appendChild(empty);
            }
            empty.hidden = visible > 0;
            const first = visibleOptions(listEl)[0];
            if(first) first.classList.add("is-active");
        };

        const buildMenu = () => {
            menu.innerHTML = "";
            let listEl = menu;
            let searchInput = null;

            if(hasSearch){
                const searchWrap = document.createElement("div");
                searchWrap.className = "erp-cselect-search";
                searchInput = document.createElement("input");
                searchInput.type = "search";
                searchInput.className = "erp-cselect-search-input";
                searchInput.placeholder = searchPlaceholder;
                searchInput.setAttribute("autocomplete", "off");
                searchInput.setAttribute("spellcheck", "false");
                searchInput.setAttribute("aria-label", searchPlaceholder);
                searchWrap.appendChild(searchInput);
                menu.appendChild(searchWrap);

                listEl = document.createElement("div");
                listEl.className = "erp-cselect-list";
                menu.appendChild(listEl);

                searchInput.addEventListener("input", () => applyFilter(listEl, searchInput));
                searchInput.addEventListener("click", (e) => e.stopPropagation());
            }

            [...selectEl.options].forEach((opt) => {
                if(opt.hidden || opt.disabled) return;
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "erp-cselect-option";
                btn.setAttribute("role", "option");
                btn.dataset.value = opt.value;
                btn.textContent = opt.textContent;
                if(opt.selected) btn.classList.add("is-selected");
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
                    syncLabel();
                    close(true);
                    trigger.focus();
                });
                listEl.appendChild(btn);
            });

            applyFilter(listEl, searchInput);
            menu._erpCselectList = listEl;
            menu._erpCselectSearch = searchInput;
        };

        const close = (fromPick) => {
            menu.hidden = true;
            wrap.classList.remove("is-open");
            trigger.setAttribute("aria-expanded", "false");
            const search = menu.querySelector(".erp-cselect-search-input");
            if(search) search.value = "";
            menu.querySelectorAll(".erp-cselect-option.is-active").forEach((el) => {
                el.classList.remove("is-active");
            });
            if(fromPick){
                wrap._erpCselectPickLock = true;
                window.setTimeout(() => { wrap._erpCselectPickLock = false; }, 280);
            }
        };

        const listItems = () => {
            const listEl = menu._erpCselectList || menu;
            return [...listEl.querySelectorAll(".erp-cselect-option")].filter((o) => !o.hidden);
        };

        const setActive = (idx) => {
            const items = listItems();
            if(!items.length) return;
            const next = Math.max(0, Math.min(items.length - 1, idx));
            items.forEach((o) => o.classList.remove("is-active"));
            items[next].classList.add("is-active");
            items[next].scrollIntoView({ block: "nearest" });
        };

        const activateSelected = () => {
            const items = listItems();
            const selected = items.find((o) => o.classList.contains("is-selected")) || items[0];
            if(!selected) return;
            setActive(items.indexOf(selected));
        };

        const onNavKey = (e) => {
            const openNow = wrap.classList.contains("is-open");
            if(e.key === "ArrowDown" || e.key === "ArrowUp"){
                e.preventDefault();
                e.stopPropagation();
                if(!openNow) open();
                const items = listItems();
                if(!items.length) return;
                const cur = items.findIndex((o) => o.classList.contains("is-active"));
                if(e.key === "ArrowDown") setActive(cur < 0 ? 0 : cur + 1);
                else setActive(cur < 0 ? items.length - 1 : cur - 1);
                return true;
            }
            if(e.key === "Enter" && openNow){
                e.preventDefault();
                e.stopPropagation();
                const active = menu.querySelector(".erp-cselect-option.is-active:not([hidden])") || listItems()[0];
                active?.click();
                return true;
            }
            if(e.key === "Escape" && openNow){
                e.preventDefault();
                e.stopPropagation();
                close();
                trigger.focus({ preventScroll: true });
                return true;
            }
            return false;
        };

        const open = () => {
            if(wrap._erpCselectPickLock) return;
            ErpCustomSelect.closeAll(wrap);
            buildMenu();
            menu.hidden = false;
            menu.tabIndex = -1;
            wrap.classList.add("is-open");
            trigger.setAttribute("aria-expanded", "true");
            activateSelected();
            if(hasSearch && window.matchMedia("(pointer: fine)").matches){
                menu._erpCselectSearch?.focus({ preventScroll: true });
            }else{
                menu.focus({ preventScroll: true });
            }
        };

        trigger.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if(wrap._erpCselectPickLock) return;
            if(wrap.classList.contains("is-open")) close();
            else open();
        });

        wrap._erpCselectOnNav = onNavKey;
        ErpCustomSelect.bindNavKeys();

        selectEl.addEventListener("change", syncLabel);

        syncLabel();
        wrap._erpCselectClose = close;
    },

    closeAll(exceptWrap){
        document.querySelectorAll(".erp-cselect.is-open").forEach((el) => {
            if(exceptWrap && el === exceptWrap) return;
            el._erpCselectClose?.();
        });
    },

    enhanceAll(root = document){
        root.querySelectorAll("select[data-erp-cselect], select.absensi-cselect").forEach((sel) => {
            this.enhance(sel);
        });
    },

    bindNavKeys(){
        if(window.__erpCselectNavKey) return;
        window.__erpCselectNavKey = true;
        document.addEventListener("keydown", (e) => {
            const openWrap = document.querySelector(".erp-cselect.is-open");
            if(openWrap){
                openWrap._erpCselectOnNav?.(e);
                return;
            }
            const wrap = e.target.closest?.(".erp-cselect");
            if(wrap) wrap._erpCselectOnNav?.(e);
        }, true);
    },

    bindOutsideClose(){
        if(window.__erpCselectOutside) return;
        window.__erpCselectOutside = true;
        this.bindNavKeys();

        document.addEventListener("pointerdown", (e) => {
            const wrap = e.target.closest(".erp-cselect");
            ErpCustomSelect.closeAll(wrap || null);
        }, true);

        document.addEventListener("click", (e) => {
            if(e.target.closest(".erp-cselect")) return;
            ErpCustomSelect.closeAll();
        });

        document.addEventListener("keydown", (e) => {
            if(e.key !== "Escape") return;
            if(!document.querySelector(".erp-cselect.is-open")) return;
            e.preventDefault();
            ErpCustomSelect.closeAll();
        });
    }
};

window.ErpCustomSelect = ErpCustomSelect;
