/*======================================
 VAX WIJAYA — Pengajuan Izin / Libur Karyawan
 SUBMIT REAL → Supabase
 Status awal: MENUNGGU_SPV
======================================*/

(function(){

    const form = document.getElementById("izinForm");
    const tanggal = document.getElementById("tanggalIzin");
    const jenis = document.getElementById("jenisIzin");
    const alasan = document.getElementById("alasanIzin");
    const counter = document.getElementById("alasanCounter");
    const bukti = document.getElementById("buktiIzin");
    const preview = document.getElementById("previewBukti");
    const uploadEmpty = document.getElementById("uploadEmpty");
    const buktiHint = document.getElementById("buktiHint");
    const btnHapusFoto = document.getElementById("btnHapusFoto");
    const message = document.getElementById("formMessage");
    const btnSubmit = document.getElementById("btnKirimIzin");

    let karyawanAktif = null;
    let submitBusy = false;

    function todayWib(){
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone:"Asia/Jakarta",
            year:"numeric",
            month:"2-digit",
            day:"2-digit"
        }).formatToParts(new Date());

        const get = (type) => parts.find((p) => p.type === type)?.value || "";
        return `${get("year")}-${get("month")}-${get("day")}`;
    }

    function setMessage(text, type=""){
        if(!message) return;
        message.textContent = text || "";
        message.className = `form-message${type ? " " + type : ""}`;
    }

    function setBusy(value){
        submitBusy = value === true;
        if(!btnSubmit) return;

        btnSubmit.disabled = submitBusy;
        btnSubmit.style.opacity = submitBusy ? ".65" : "1";
        btnSubmit.style.pointerEvents = submitBusy ? "none" : "auto";

        const span = btnSubmit.querySelector("span");
        if(span){
            span.textContent = submitBusy ? "Mengirim..." : "Kirim Pengajuan";
        }
    }

    function jenisAktif(){
        return String(jenis?.value || "IZIN").toUpperCase();
    }

    function buktiWajib(){
        return jenisAktif() === "IZIN";
    }

    function syncJenisUi(){
        if(buktiHint){
            buktiHint.textContent = buktiWajib()
                ? "Foto bukti wajib untuk pengajuan Izin"
                : "Foto bukti opsional untuk pengajuan Libur";
        }
        setMessage("");
    }

    if(tanggal){
        tanggal.value = todayWib();
        tanggal.min = todayWib();
    }

    if(jenis){
        jenis.addEventListener("change", syncJenisUi);
        syncJenisUi();
    }

    if(alasan && counter){
        alasan.addEventListener("input", function(){
            counter.textContent = `${alasan.value.length}/300`;
        });
    }

    function clearPreview(){
        if(bukti) bukti.value = "";
        if(preview){
            preview.src = "";
            preview.hidden = true;
        }
        if(uploadEmpty) uploadEmpty.hidden = false;
        if(btnHapusFoto) btnHapusFoto.hidden = true;
    }

    if(bukti){
        bukti.addEventListener("change", function(){
            const file = bukti.files && bukti.files[0];

            if(!file){
                clearPreview();
                return;
            }

            const allowed = ["image/jpeg","image/png","image/webp"];

            if(!allowed.includes(file.type)){
                clearPreview();
                setMessage("Bukti harus berupa JPG, PNG, atau WEBP.", "error");
                return;
            }

            if(file.size > 5 * 1024 * 1024){
                clearPreview();
                setMessage("Ukuran foto maksimal 5 MB.", "error");
                return;
            }

            const reader = new FileReader();
            reader.onload = function(){
                if(preview){
                    preview.src = reader.result;
                    preview.hidden = false;
                }
                if(uploadEmpty) uploadEmpty.hidden = true;
                if(btnHapusFoto) btnHapusFoto.hidden = false;
                setMessage("");
            };
            reader.readAsDataURL(file);
        });
    }

    if(btnHapusFoto){
        btnHapusFoto.addEventListener("click", clearPreview);
    }

    function safeExt(file){
        const map = {
            "image/jpeg":"jpg",
            "image/png":"png",
            "image/webp":"webp"
        };
        return map[file?.type] || "jpg";
    }

    function buildProofPath(file){
        const kid = Number(karyawanAktif?.id);
        const ymd = String(tanggal?.value || todayWib()).replace(/[^0-9-]/g,"");
        return `${kid}/${ymd}/${Date.now()}.${safeExt(file)}`;
    }

    async function loadSession(){
        try{
            if(typeof KaryawanSession === "undefined" || typeof KaryawanSession.requirePage !== "function"){
                setMessage("Session karyawan belum tersedia. Silakan login ulang.", "error");
                return false;
            }

            const data = await KaryawanSession.requirePage();
            if(!data){
                setMessage("Session karyawan tidak ditemukan. Silakan login ulang.", "error");
                return false;
            }

            karyawanAktif = data;
            return true;
        }catch(error){
            console.error("Request session error:", error);
            setMessage("Gagal memuat session karyawan.", "error");
            return false;
        }
    }

    async function uploadProof(file){
        if(!file) return null;

        const path = buildProofPath(file);
        const { error } = await db.storage
            .from("izin-proofs")
            .upload(path, file, {
                cacheControl:"3600",
                upsert:false,
                contentType:file.type
            });

        if(error) throw error;
        return path;
    }

    async function submitPengajuan(){
        if(submitBusy) return;

        if(!karyawanAktif){
            const ok = await loadSession();
            if(!ok) return;
        }

        if(!tanggal?.value){
            setMessage("Tanggal pengajuan wajib dipilih.", "error");
            return;
        }

        const alasanValue = String(alasan?.value || "").trim();
        if(alasanValue.length < 3){
            setMessage("Alasan wajib diisi minimal 3 karakter.", "error");
            alasan?.focus();
            return;
        }

        const file = bukti?.files?.[0] || null;
        if(buktiWajib() && !file){
            setMessage("Bukti/foto wajib untuk pengajuan Izin.", "error");
            return;
        }

        if(file){
            const allowed = ["image/jpeg","image/png","image/webp"];
            if(!allowed.includes(file.type) || file.size > 5 * 1024 * 1024){
                setMessage("Foto harus JPG/PNG/WEBP dan maksimal 5 MB.", "error");
                return;
            }
        }

        if(typeof db === "undefined"){
            setMessage("Koneksi database belum tersedia.", "error");
            return;
        }

        setBusy(true);

        try{
            let buktiPath = null;

            if(file){
                setMessage("Mengunggah bukti...");
                buktiPath = await uploadProof(file);
            }

            setMessage("Menyimpan pengajuan...");

            const payload = {
                karyawan_id:Number(karyawanAktif.id),
                cabang_id:karyawanAktif.cabang_id != null ? Number(karyawanAktif.cabang_id) : null,
                tanggal:tanggal.value,
                jenis:jenisAktif(),
                alasan:alasanValue,
                bukti_path:buktiPath,
                status:"MENUNGGU_SPV"
            };

            const { error: insertError } = await db
                .from("pengajuan_izin")
                .insert(payload);

            if(insertError) throw insertError;

            const jenisSukses = jenisAktif() === "LIBUR" ? "Libur" : "Izin";

            form.reset();
            if(tanggal){
                tanggal.value = todayWib();
                tanggal.min = todayWib();
            }
            if(jenis) jenis.value = "IZIN";
            if(counter) counter.textContent = "0/300";
            clearPreview();
            syncJenisUi();

            setMessage(
                `Pengajuan ${jenisSukses} berhasil dikirim. Status: MENUNGGU SPV.`,
                "success"
            );

        }catch(error){
            console.error("Gagal kirim pengajuan:", error);
            setMessage(error?.message || "Pengajuan gagal dikirim.", "error");
        }finally{
            setBusy(false);
        }
    }

    if(form){
        form.addEventListener("submit", function(event){
            event.preventDefault();
            submitPengajuan();
        });
    }

    loadSession();

})();

/* =====================================
   CUSTOM DROPDOWN — KEYBOARD ACCESSIBLE
   Arrow Up/Down, Home/End, Enter/Space, Esc
===================================== */
(function(){
    const select = document.getElementById("jenisIzin");
    const custom = document.getElementById("jenisCustom");
    const trigger = document.getElementById("jenisTrigger");
    const menu = document.getElementById("jenisMenu");
    const options = Array.from(document.querySelectorAll(".jenis-option"));

    if(!select || !custom || !trigger || !menu || !options.length) return;

    function isOpen(){
        return menu.hidden === false;
    }

    function openMenu(focusMode = "selected"){
        custom.classList.add("open");
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");

        let target = options.find((btn) => btn.dataset.value === select.value) || options[0];
        if(focusMode === "first") target = options[0];
        if(focusMode === "last") target = options[options.length - 1];

        requestAnimationFrame(() => target.focus());
    }

    function closeMenu(returnFocus = false){
        custom.classList.remove("open");
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        if(returnFocus) requestAnimationFrame(() => trigger.focus());
    }

    function moveFocus(delta){
        const activeIndex = options.indexOf(document.activeElement);
        const current = activeIndex >= 0 ? activeIndex : 0;
        const next = (current + delta + options.length) % options.length;
        options[next].focus();
    }

    trigger.addEventListener("keydown", function(event){
        if(event.key === "ArrowDown"){
            event.preventDefault();
            if(!isOpen()) openMenu("selected");
            else moveFocus(1);
            return;
        }

        if(event.key === "ArrowUp"){
            event.preventDefault();
            if(!isOpen()) openMenu("selected");
            else moveFocus(-1);
            return;
        }

        if(event.key === "Home"){
            event.preventDefault();
            openMenu("first");
            return;
        }

        if(event.key === "End"){
            event.preventDefault();
            openMenu("last");
            return;
        }

        if(event.key === "Enter" || event.key === " "){
            event.preventDefault();
            if(!isOpen()) openMenu("selected");
            else closeMenu(true);
            return;
        }

        if(event.key === "Escape" && isOpen()){
            event.preventDefault();
            closeMenu(true);
        }
    });

    options.forEach((btn, index) => {
        btn.setAttribute("tabindex", "-1");

        btn.addEventListener("keydown", function(event){
            if(event.key === "ArrowDown"){
                event.preventDefault();
                options[(index + 1) % options.length].focus();
                return;
            }

            if(event.key === "ArrowUp"){
                event.preventDefault();
                options[(index - 1 + options.length) % options.length].focus();
                return;
            }

            if(event.key === "Home"){
                event.preventDefault();
                options[0].focus();
                return;
            }

            if(event.key === "End"){
                event.preventDefault();
                options[options.length - 1].focus();
                return;
            }

            if(event.key === "Enter" || event.key === " "){
                event.preventDefault();
                btn.click();
                requestAnimationFrame(() => trigger.focus());
                return;
            }

            if(event.key === "Escape"){
                event.preventDefault();
                closeMenu(true);
                return;
            }

            if(event.key === "Tab"){
                closeMenu(false);
            }
        });
    });
})();
