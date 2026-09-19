/*
=========================================================
VAX ERP — Toast / Modal (reusable, dark + gold)
=========================================================
*/

const ErpToast = {
    _root: null,

    ensure(){
        if(this._root) return this._root;
        const el = document.createElement("div");
        el.id = "erpToastRoot";
        el.className = "erp-toast-root";
        el.hidden = true;
        el.innerHTML = `
            <div class="erp-toast-backdrop" data-erp-toast-close></div>
            <div class="erp-toast-panel" role="alertdialog" aria-modal="true" aria-labelledby="erpToastTitle">
                <div class="erp-toast-icon" id="erpToastIcon" aria-hidden="true">!</div>
                <div class="erp-toast-body">
                    <h3 id="erpToastTitle">Pemberitahuan</h3>
                    <p id="erpToastMessage"></p>
                </div>
                <button type="button" class="erp-toast-ok" data-erp-toast-close>OK</button>
            </div>
        `;
        document.body.appendChild(el);
        el.addEventListener("click", (e) => {
            if(e.target.closest("[data-erp-toast-close]")) this.hide();
        });
        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && !el.hidden) this.hide();
        });
        this._root = el;
        return el;
    },

    show(message, type = "info"){
        const root = this.ensure();
        const title = root.querySelector("#erpToastTitle");
        const msg = root.querySelector("#erpToastMessage");
        const icon = root.querySelector("#erpToastIcon");
        const panel = root.querySelector(".erp-toast-panel");

        const kind = String(type || "info").toLowerCase();
        panel.classList.remove("is-info", "is-warn", "is-error", "is-success");
        panel.classList.add(
            kind === "error" ? "is-error"
                : kind === "success" ? "is-success"
                : kind === "warn" || kind === "warning" ? "is-warn"
                : "is-info"
        );

        if(title){
            title.textContent =
                kind === "error" ? "Gagal"
                    : kind === "success" ? "Berhasil"
                    : kind === "warn" || kind === "warning" ? "Perhatian"
                    : "Pemberitahuan";
        }
        if(msg) msg.textContent = String(message || "");
        if(icon){
            icon.textContent =
                kind === "error" ? "✕"
                    : kind === "success" ? "✓"
                    : kind === "warn" || kind === "warning" ? "!"
                    : "i";
        }

        root.hidden = false;
        root.classList.add("is-open");
        document.body.classList.add("erp-toast-open");
        root.querySelector(".erp-toast-ok")?.focus();
    },

    hide(){
        const root = this._root;
        if(!root) return;
        root.hidden = true;
        root.classList.remove("is-open");
        document.body.classList.remove("erp-toast-open");
    },

    /** Ganti alert() native hanya di halaman yang memanggil installAlertBridge(). */
    installAlertBridge(){
        if(window.__erpAlertBridged) return;
        window.__erpAlertBridged = true;
        window.alert = (message) => {
            this.show(String(message ?? ""), "warn");
        };
    }
};

window.ErpToast = ErpToast;
