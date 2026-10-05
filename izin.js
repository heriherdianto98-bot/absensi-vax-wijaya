/*======================================
 VAX WIJAYA â€” Pengajuan Izin / Libur Karyawan
 SUBMIT REAL â†’ Supabase
 Status awal otomatis: MENUNGGU_SPV atau MENUNGGU_OWNER
======================================*/

(function(){

    const form = document.getElementById("izinForm");
    const tanggal = document.getElementById("tanggalIzin");
    const tanggalSelesai = document.getElementById("tanggalSelesaiIzin");
    const fieldTanggalSelesai = document.getElementById("fieldTanggalSelesai");
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
    const bentrokWarn = document.getElementById("izinBentrokWarn");
    const fieldPulangAwalKind = document.getElementById("fieldPulangAwalKind");
    const pulangAwalKind = document.getElementById("pulangAwalKind");
    const infoText = document.getElementById("izinInfoText");
    const hasilCard = document.getElementById("hasilPengajuanCard");
    const hasilTitle = document.getElementById("hasilPengajuanTitle");
    const hasilBadge = document.getElementById("hasilPengajuanBadge");
    const hasilJenis = document.getElementById("hasilPengajuanJenis");
    const hasilTanggal = document.getElementById("hasilPengajuanTanggal");
    const hasilAlasan = document.getElementById("hasilPengajuanAlasan");
    const hasilFotoWrap = document.getElementById("hasilPengajuanFotoWrap");
    const hasilFoto = document.getElementById("hasilPengajuanFoto");
    const hasilFlow = document.getElementById("hasilPengajuanFlow");

    let karyawanAktif = null;
    let submitBusy = false;
    let liburBlocked = false;
    let bentrokTimer = null;

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

    function renderHasilPengajuan({jenisLabel,tanggalValue,statusLabel,alasanValue,fotoSrc,flowText}){
        if(!hasilCard) return;

        hasilCard.hidden = false;
        hasilCard.classList.remove("is-approved","is-rejected");

        if(hasilTitle) hasilTitle.textContent = "Pengajuan berhasil dikirim";
        if(hasilBadge) hasilBadge.textContent = statusLabel || "MENUNGGU SPV";
        if(hasilJenis) hasilJenis.textContent = jenisLabel || "Pengajuan";
        if(hasilTanggal) hasilTanggal.textContent = fmtDateLong(tanggalValue || todayWib());
        if(hasilAlasan) hasilAlasan.textContent = alasanValue || "—";
        if(hasilFlow) hasilFlow.textContent = flowText || "Menunggu review SPV";

        if(hasilFotoWrap && hasilFoto){
            if(fotoSrc){
                hasilFoto.src = fotoSrc;
                hasilFotoWrap.hidden = false;
            }else{
                hasilFoto.removeAttribute("src");
                hasilFotoWrap.hidden = true;
            }
        }

        hasilCard.scrollIntoView({ behavior:"smooth", block:"nearest" });
    }

    function joinNames(names){
        const uniq = [...new Set((names || []).map((n) => String(n || "").trim()).filter(Boolean))];
        if(!uniq.length) return "";
        if(uniq.length === 1) return uniq[0];
        if(uniq.length === 2) return `${uniq[0]} dan ${uniq[1]}`;
        return `${uniq.slice(0, -1).join(", ")} dan ${uniq[uniq.length - 1]}`;
    }

    function fmtDateLong(ymd){
        if(!ymd) return "";
        const d = new Date(`${ymd}T00:00:00`);
        return d.toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" });
    }

    function bentrokText(ymd, names){
        return `Tanggal ${fmtDateLong(ymd)} sudah dipilih libur oleh ${joinNames(names)}. Silakan pilih tanggal lain atau hubungi SPV untuk pengaturan tukar jadwal.`;
    }

    function tanggalAkhir(){
        if(jenisAktif() !== "LIBUR") return tanggal?.value || "";
        return tanggalSelesai?.value || tanggal?.value || "";
    }

    function setBentrok(names, customText){
        const text = String(customText || "").trim();
        liburBlocked = !!text || (Array.isArray(names) && names.length > 0);
        if(bentrokWarn){
            bentrokWarn.hidden = !liburBlocked;
            bentrokWarn.textContent = text || (liburBlocked ? bentrokText(tanggal?.value, names) : "");
        }
        syncKirim();
    }

    function clearBentrok(){
        liburBlocked = false;
        if(bentrokWarn){
            bentrokWarn.hidden = true;
            bentrokWarn.textContent = "";
        }
        syncKirim();
    }

    function syncKirim(){
        if(!btnSubmit) return;
        const blocked = submitBusy || liburBlocked;
        btnSubmit.disabled = blocked;
        btnSubmit.classList.toggle("is-blocked", liburBlocked && !submitBusy);
        btnSubmit.style.opacity = blocked ? ".45" : "1";
        btnSubmit.style.pointerEvents = blocked ? "none" : "auto";
        const span = btnSubmit.querySelector("span");
        if(span) span.textContent = submitBusy ? "Mengirim..." : "Kirim Pengajuan";
    }

    function setBusy(value){
        submitBusy = value === true;
        syncKirim();
    }

    async function checkLiburBentrok(){
        if(jenisAktif() !== "LIBUR" || !tanggal?.value || !karyawanAktif){
            clearBentrok();
            return [];
        }
        const cabangId = karyawanAktif.cabang_id != null ? Number(karyawanAktif.cabang_id) : null;
        const kid = Number(karyawanAktif.id);
        if(!cabangId || !kid){
            clearBentrok();
            return [];
        }
        const akhir = tanggalAkhir();
        if(akhir && akhir < tanggal.value){
            setBentrok([], "Tanggal selesai tidak boleh sebelum tanggal mulai.");
            return ["range"];
        }
        try{
            const { data, error } = await db.rpc("check_libur_range", {
                p_cabang_id: cabangId,
                p_tanggal_mulai: tanggal.value,
                p_tanggal_selesai: akhir,
                p_karyawan_id: kid
            });
            if(!error && data){
                if(data.ok === false){
                    const first = Array.isArray(data.conflicts) ? data.conflicts[0] : null;
                    const names = first && Array.isArray(first.names) ? first.names : [];
                    setBentrok(names, data.message || "");
                    return names.length ? names : ["blocked"];
                }
                clearBentrok();
                return [];
            }
            const fallback = await db.rpc("check_libur_bentrok", {
                p_cabang_id: cabangId,
                p_tanggal: tanggal.value,
                p_karyawan_id: kid
            });
            if(!fallback.error && fallback.data){
                const names = Array.isArray(fallback.data.names) ? fallback.data.names : [];
                if(fallback.data.bentrok) setBentrok(names, fallback.data.message || "");
                else clearBentrok();
                return names;
            }
        }catch(_e){}
        clearBentrok();
        return [];
    }

    function scheduleBentrokCheck(){
        clearTimeout(bentrokTimer);
        bentrokTimer = setTimeout(() => { checkLiburBentrok(); }, 180);
    }

    function jenisAktif(){
        return String(jenis?.value || "IZIN").toUpperCase();
    }

    function buktiWajib(){
        return ["IZIN","SAKIT","PULANG_AWAL"].includes(jenisAktif());
    }

    function syncJenisUi(){
        const currentJenis = jenisAktif();
        const isLibur = currentJenis === "LIBUR";
        const isPulangAwal = currentJenis === "PULANG_AWAL";
        if(fieldTanggalSelesai) fieldTanggalSelesai.hidden = !isLibur;
        if(fieldPulangAwalKind) fieldPulangAwalKind.hidden = !isPulangAwal;
        if(isPulangAwal && tanggal){
            tanggal.value = todayWib();
            tanggal.min = todayWib();
            tanggal.max = todayWib();
            tanggal.dispatchEvent(new Event("input", { bubbles:true }));
        }else if(tanggal){
            tanggal.max = "";
        }
        if(tanggalSelesai){
            if(isLibur && !tanggalSelesai.value) tanggalSelesai.value = tanggal?.value || todayWib();
            tanggalSelesai.min = tanggal?.value || todayWib();
        }
        if(buktiHint){
            const jenis = jenisAktif();
            buktiHint.textContent = jenis === "PULANG_AWAL"
                ? "Foto bukti wajib untuk Pulang Lebih Awal"
                : jenis === "IZIN"
                    ? "Foto bukti wajib untuk pengajuan Izin"
                    : jenis === "SAKIT"
                        ? "Foto bukti wajib untuk pengajuan Sakit"
                        : "Foto bukti opsional untuk pengajuan Libur";
        }
        if(infoText){
            infoText.innerHTML = isPulangAwal
                ? 'Khusus karyawan yang sudah <b>Absen Masuk</b>. Setelah SPV <b>ACC</b>, status hari ini otomatis berubah menjadi Izin / Sakit / Libur dan jam pulang tercatat.'
                : 'Setelah reviewer <b>ACC</b>, status langsung final. Capster: max 14 hari, max 2 orang/cabang/tanggal. Kasir: wajib ada coverage.';
        }
        setMessage("");
        scheduleBentrokCheck();
    }

    if(tanggal){
        tanggal.value = todayWib();
        tanggal.min = todayWib();
        tanggal.addEventListener("change", function(){
            if(tanggalSelesai){
                tanggalSelesai.min = tanggal.value;
                if(!tanggalSelesai.value || tanggalSelesai.value < tanggal.value){
                    tanggalSelesai.value = tanggal.value;
                }
            }
            scheduleBentrokCheck();
        });
        tanggal.addEventListener("input", scheduleBentrokCheck);
    }
    if(tanggalSelesai){
        tanggalSelesai.value = todayWib();
        tanggalSelesai.min = todayWib();
        tanggalSelesai.addEventListener("change", scheduleBentrokCheck);
        tanggalSelesai.addEventListener("input", scheduleBentrokCheck);
    }

    if(jenis){
        jenis.addEventListener("change", syncJenisUi);
        syncJenisUi();
    }

    document.querySelectorAll("[data-pulang-kind]").forEach((btn) => {
        btn.addEventListener("click", function(){
            const value = String(btn.dataset.pulangKind || "IZIN").toUpperCase();
            if(pulangAwalKind) pulangAwalKind.value = value;
            document.querySelectorAll("[data-pulang-kind]").forEach((node) => {
                node.classList.toggle("active", node === btn);
            });
        });
    });

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
            scheduleBentrokCheck();
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
            const label = jenisAktif() === "PULANG_AWAL" ? "Pulang Lebih Awal" : (jenisAktif() === "SAKIT" ? "Sakit" : "Izin");
            setMessage(`Bukti/foto wajib untuk pengajuan ${label}.`, "error");
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

            if(jenisAktif() === "PULANG_AWAL"){
                const finalKind = String(pulangAwalKind?.value || "IZIN").toUpperCase();
                const resultTanggal = tanggal?.value || todayWib();
                const resultFotoSrc = preview?.src || "";
                const rpcRes = await db.rpc("submit_pulang_awal_v1", {
                    p_session_token: KaryawanSession.getToken(),
                    p_jenis: finalKind,
                    p_alasan: alasanValue,
                    p_bukti_path: buktiPath
                });
                if(rpcRes.error) throw rpcRes.error;

                form.reset();
                if(tanggal){
                    tanggal.value = todayWib();
                    tanggal.min = todayWib();
                    tanggal.max = "";
                    tanggal.dispatchEvent(new Event("change", { bubbles:true }));
                }
                if(tanggalSelesai){
                    tanggalSelesai.value = todayWib();
                    tanggalSelesai.min = todayWib();
                    tanggalSelesai.dispatchEvent(new Event("change", { bubbles:true }));
                }
                if(jenis){
                    jenis.value = "IZIN";
                    jenis.dispatchEvent(new Event("change", { bubbles:true }));
                }
                if(pulangAwalKind) pulangAwalKind.value = "IZIN";
                document.querySelectorAll("[data-pulang-kind]").forEach((node, index) => node.classList.toggle("active", index === 0));
                if(counter) counter.textContent = "0/300";
                clearPreview();
                renderHasilPengajuan({
                    jenisLabel:`Pulang Lebih Awal · ${finalKind === "SAKIT" ? "Sakit" : finalKind === "LIBUR" ? "Libur" : "Izin"}`,
                    tanggalValue:resultTanggal,
                    statusLabel:"MENUNGGU SPV",
                    alasanValue,
                    fotoSrc:resultFotoSrc,
                    flowText:"Menunggu review SPV"
                });
                setMessage("");
                return;
            }

            if(jenisAktif() === "LIBUR"){
                const names = await checkLiburBentrok();
                if(liburBlocked || (names && names.length)){
                    setBentrok(names);
                    setMessage(bentrokWarn?.textContent || "Tanggal libur bentrok.", "error");
                    return;
                }
            }

            const payload = {
                p_karyawan_id:Number(karyawanAktif.id),
                p_cabang_id:karyawanAktif.cabang_id != null ? Number(karyawanAktif.cabang_id) : null,
                p_tanggal:tanggal.value,
                p_tanggal_selesai:jenisAktif() === "LIBUR" ? tanggalAkhir() : tanggal.value,
                p_jenis:jenisAktif(),
                p_alasan:alasanValue,
                p_bukti_path:buktiPath
            };

            let saved = null;
            const rpcRes = await db.rpc("submit_pengajuan_izin", payload);
            if(rpcRes.error){
                const msg = String(rpcRes.error.message || "");
                if(/LIBUR_CAPSTER_PENUH|LIBUR_MAX_14|sudah mencapai batas maksimal libur Capster|maksimal 14 hari/i.test(msg)){
                    setBentrok([], msg.replace(/^ERROR:\s*/i, "").split("\n")[0]);
                    setMessage(bentrokWarn?.textContent || msg, "error");
                    return;
                }
                if(/LIBUR_BENTROK:/i.test(msg)){
                    const names = msg.split("LIBUR_BENTROK:")[1].split("|").map((s) => s.trim()).filter(Boolean);
                    setBentrok(names);
                    setMessage(bentrokText(tanggal.value, names), "error");
                    return;
                }
                if(/RANGE_INVALID/i.test(msg)){
                    setBentrok([], "Tanggal selesai tidak boleh sebelum tanggal mulai.");
                    setMessage("Tanggal selesai tidak boleh sebelum tanggal mulai.", "error");
                    return;
                }
                if(/SPOOF_KARYAWAN/i.test(msg)){
                    setMessage("Identitas karyawan tidak sah. Silakan login ulang.", "error");
                    return;
                }
                if(/SPOOF_CABANG/i.test(msg)){
                    setMessage("Cabang tidak sah. Silakan login ulang.", "error");
                    return;
                }
                if(/AUTH_REQUIRED|AUTH_NO_KARYAWAN/i.test(msg)){
                    setMessage("Login terautentikasi wajib. Silakan login ulang.", "error");
                    return;
                }
                throw rpcRes.error;
            }
            saved = rpcRes.data;

            const jenisNow = jenisAktif();
            const jenisSukses = jenisNow === "LIBUR" ? "Libur" : jenisNow === "SAKIT" ? "Sakit" : "Izin";
            const statusSukses = saved?.status === "MENUNGGU_OWNER" ? "MENUNGGU OWNER" : "MENUNGGU SPV";
            const resultTanggal = tanggal?.value || todayWib();
            const resultFotoSrc = preview?.src || "";

            form.reset();
            if(tanggal){
                tanggal.value = todayWib();
                tanggal.min = todayWib();
                tanggal.dispatchEvent(new Event("change", { bubbles:true }));
            }
            if(tanggalSelesai){
                tanggalSelesai.value = todayWib();
                tanggalSelesai.min = todayWib();
                tanggalSelesai.dispatchEvent(new Event("change", { bubbles:true }));
            }
            if(jenis) jenis.value = "IZIN";
            if(counter) counter.textContent = "0/300";
            clearPreview();
            syncJenisUi();

            renderHasilPengajuan({
                jenisLabel:jenisSukses,
                tanggalValue:resultTanggal,
                statusLabel:statusSukses,
                alasanValue,
                fotoSrc:resultFotoSrc,
                flowText:statusSukses === "MENUNGGU OWNER" ? "Menunggu review Owner" : "Menunggu review SPV"
            });
            setMessage("");

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
   CUSTOM DROPDOWN â€” SINGLE CONTROLLER
   Click + keyboard, no duplicate listeners.
===================================== */
(function(){
    const select = document.getElementById("jenisIzin");
    const custom = document.getElementById("jenisCustom");
    const trigger = document.getElementById("jenisTrigger");
    const menu = document.getElementById("jenisMenu");
    const value = document.getElementById("jenisValue");
    const options = Array.from(document.querySelectorAll(".jenis-option"));

    if(!select || !custom || !trigger || !menu || !value || !options.length) return;

    function isOpen(){
        return menu.hidden === false;
    }

    function labelFor(v){
        const key = String(v || "IZIN").toUpperCase();
        if(key === "PULANG_AWAL") return "Pulang Lebih Awal";
        return key === "LIBUR" ? "Libur" : key === "SAKIT" ? "Sakit" : "Izin";
    }

    function sync(){
        const current = String(select.value || "IZIN").toUpperCase();
        value.textContent = labelFor(current);
        options.forEach((btn)=>{
            const selected = String(btn.dataset.value || "").toUpperCase() === current;
            btn.classList.toggle("is-selected", selected);
            btn.setAttribute("aria-selected", selected ? "true" : "false");
        });
    }

    function openMenu(focusSelected = false){
        custom.classList.add("open");
        menu.hidden = false;
        trigger.setAttribute("aria-expanded","true");
        if(focusSelected){
            const target = options.find((b)=>String(b.dataset.value || "").toUpperCase() === String(select.value || "").toUpperCase()) || options[0];
            requestAnimationFrame(()=>target.focus());
        }
    }

    function closeMenu(returnFocus = false){
        custom.classList.remove("open");
        menu.hidden = true;
        trigger.setAttribute("aria-expanded","false");
        if(returnFocus) requestAnimationFrame(()=>trigger.focus());
    }

    function choose(btn){
        select.value = String(btn.dataset.value || "IZIN").toUpperCase();
        select.dispatchEvent(new Event("change",{bubbles:true}));
        sync();
        closeMenu(true);
    }

    trigger.addEventListener("click", function(event){
        event.preventDefault();
        event.stopPropagation();
        isOpen() ? closeMenu(false) : openMenu(false);
    });

    options.forEach((btn, index)=>{
        btn.type = "button";
        btn.setAttribute("tabindex","-1");

        btn.addEventListener("click", function(event){
            event.preventDefault();
            event.stopPropagation();
            choose(btn);
        });

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
                choose(btn);
                return;
            }
            if(event.key === "Escape"){
                event.preventDefault();
                closeMenu(true);
            }
        });
    });

    trigger.addEventListener("keydown", function(event){
        const currentIndex = Math.max(0, options.findIndex((b)=>
            String(b.dataset.value || "").toUpperCase() === String(select.value || "").toUpperCase()
        ));

        if(event.key === "ArrowDown"){
            event.preventDefault();
            if(!isOpen()){
                openMenu(false);
                requestAnimationFrame(()=>options[currentIndex].focus());
            }else{
                requestAnimationFrame(()=>options[(currentIndex + 1) % options.length].focus());
            }
            return;
        }

        if(event.key === "ArrowUp"){
            event.preventDefault();
            if(!isOpen()){
                openMenu(false);
                requestAnimationFrame(()=>options[currentIndex].focus());
            }else{
                requestAnimationFrame(()=>options[(currentIndex - 1 + options.length) % options.length].focus());
            }
            return;
        }

        if(event.key === "Enter" || event.key === " "){
            event.preventDefault();
            if(!isOpen()){
                openMenu(false);
                requestAnimationFrame(()=>options[currentIndex].focus());
            }else{
                requestAnimationFrame(()=>options[currentIndex].focus());
            }
            return;
        }

        if(event.key === "Home"){
            event.preventDefault();
            if(!isOpen()) openMenu(false);
            requestAnimationFrame(()=>options[0].focus());
            return;
        }

        if(event.key === "End"){
            event.preventDefault();
            if(!isOpen()) openMenu(false);
            requestAnimationFrame(()=>options[options.length - 1].focus());
            return;
        }

        if(event.key === "Escape" && isOpen()){
            event.preventDefault();
            closeMenu(true);
        }
    });

    document.addEventListener("click", function(event){
        if(!custom.contains(event.target)) closeMenu(false);
    });

    /* Explicit late-arrival route for Capster/Kasir */
    const telatLink = document.querySelector(".jenis-telat-link");
    if(telatLink){
        telatLink.addEventListener("click", function(event){
            event.preventDefault();
            event.stopPropagation();
            window.location.assign(new URL("izin-telat.html", window.location.href).href);
        });
        telatLink.addEventListener("keydown", function(event){
            if(event.key === "Enter" || event.key === " "){
                event.preventDefault();
                event.stopPropagation();
                window.location.assign(new URL("izin-telat.html", window.location.href).href);
            }
        });
    }

    select.addEventListener("change", sync);
    sync();
})();


/* =====================================
   CUSTOM CALENDAR â€” Tanggal Mulai / Selesai
===================================== */
(function(){
    const modal = document.getElementById("datePickerModal");
    const grid = document.getElementById("dateCalendarGrid");
    const monthTitle = document.getElementById("dateMonthTitle");
    const startInput = document.getElementById("tanggalIzin");
    const endInput = document.getElementById("tanggalSelesaiIzin");
    const startTrigger = document.getElementById("tanggalIzinTrigger");
    const endTrigger = document.getElementById("tanggalSelesaiIzinTrigger");
    const startLabel = document.getElementById("tanggalIzinLabel");
    const endLabel = document.getElementById("tanggalSelesaiIzinLabel");
    const fieldEnd = document.getElementById("fieldTanggalSelesai");
    const prevBtn = document.getElementById("datePrevMonth");
    const nextBtn = document.getElementById("dateNextMonth");
    const todayBtn = document.getElementById("dateTodayBtn");

    if(!modal || !grid || !startInput || !startTrigger) return;

    const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    let viewYear = 0;
    let viewMonth = 0;
    let activeField = "start";

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

    function parseYmd(ymd){
        const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!m) return null;
        return { y:Number(m[1]), mo:Number(m[2]), d:Number(m[3]) };
    }

    function fmtLabel(ymd){
        const p = parseYmd(ymd);
        if(!p) return "Pilih tanggal";
        return `${p.d} ${MONTHS[p.mo - 1]} ${p.y}`;
    }

    function pad(n){ return String(n).padStart(2, "0"); }

    function toYmd(y, mo, d){
        return `${y}-${pad(mo)}-${pad(d)}`;
    }

    function minFor(field){
        const today = todayWib();
        if(field === "end"){
            const start = startInput.value || today;
            return start > today ? start : today;
        }
        return today;
    }

    function syncLabels(){
        if(startLabel) startLabel.textContent = fmtLabel(startInput.value);
        if(endLabel) endLabel.textContent = fmtLabel(endInput?.value || "");
        if(endInput && startInput.value){
            endInput.min = startInput.value;
            if(endInput.value && endInput.value < startInput.value){
                endInput.value = startInput.value;
                if(endLabel) endLabel.textContent = fmtLabel(endInput.value);
            }
        }
    }

    function closeModal(){
        modal.hidden = true;
    }

    function openModal(field){
        if(field === "end" && fieldEnd?.hidden) return;
        activeField = field;
        const input = field === "end" ? endInput : startInput;
        const ymd = input?.value || todayWib();
        const p = parseYmd(ymd) || parseYmd(todayWib());
        viewYear = p.y;
        viewMonth = p.mo;
        modal.hidden = false;
        renderGrid();
    }

    function renderGrid(){
        if(monthTitle) monthTitle.textContent = `${MONTHS[viewMonth - 1]} ${viewYear}`;
        const first = new Date(viewYear, viewMonth - 1, 1);
        const startPad = first.getDay();
        const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
        const selected = activeField === "end" ? (endInput?.value || "") : (startInput.value || "");
        const min = minFor(activeField);
        const today = todayWib();
        const cells = [];

        for(let i = 0; i < startPad; i++){
            const prevDate = new Date(viewYear, viewMonth - 1, -startPad + i + 1);
            cells.push({
                y: prevDate.getFullYear(),
                mo: prevDate.getMonth() + 1,
                d: prevDate.getDate(),
                out: true
            });
        }
        for(let d = 1; d <= daysInMonth; d++){
            cells.push({ y: viewYear, mo: viewMonth, d, out: false });
        }
        while(cells.length % 7 !== 0){
            const last = cells[cells.length - 1];
            const next = new Date(last.y, last.mo - 1, last.d + 1);
            cells.push({
                y: next.getFullYear(),
                mo: next.getMonth() + 1,
                d: next.getDate(),
                out: true
            });
        }

        grid.innerHTML = cells.map((c) => {
            const ymd = toYmd(c.y, c.mo, c.d);
            const disabled = ymd < min;
            const cls = [
                "date-day",
                c.out ? "is-out" : "",
                disabled ? "is-disabled" : "",
                ymd === today ? "is-today" : "",
                ymd === selected ? "is-selected" : ""
            ].filter(Boolean).join(" ");
            return `<button type="button" class="${cls}" data-ymd="${ymd}" ${disabled ? "disabled" : ""}>${c.d}</button>`;
        }).join("");
    }

    function choose(ymd){
        if(!ymd || ymd < minFor(activeField)) return;
        const input = activeField === "end" ? endInput : startInput;
        if(!input) return;
        input.value = ymd;
        if(activeField === "start" && endInput){
            endInput.min = ymd;
            if(!endInput.value || endInput.value < ymd) endInput.value = ymd;
            endInput.dispatchEvent(new Event("change", { bubbles:true }));
        }
        input.dispatchEvent(new Event("change", { bubbles:true }));
        syncLabels();
        closeModal();
    }

    startTrigger.addEventListener("click", function(event){
        event.preventDefault();
        openModal("start");
    });
    if(endTrigger){
        endTrigger.addEventListener("click", function(event){
            event.preventDefault();
            openModal("end");
        });
    }
    if(prevBtn){
        prevBtn.addEventListener("click", function(){
            viewMonth -= 1;
            if(viewMonth < 1){ viewMonth = 12; viewYear -= 1; }
            renderGrid();
        });
    }
    if(nextBtn){
        nextBtn.addEventListener("click", function(){
            viewMonth += 1;
            if(viewMonth > 12){ viewMonth = 1; viewYear += 1; }
            renderGrid();
        });
    }
    if(todayBtn){
        todayBtn.addEventListener("click", function(){
            choose(todayWib());
        });
    }
    grid.addEventListener("click", function(event){
        const btn = event.target.closest("[data-ymd]");
        if(!btn || btn.disabled) return;
        choose(btn.getAttribute("data-ymd"));
    });
    modal.addEventListener("click", function(event){
        if(event.target.closest("[data-date-close]")){
            event.preventDefault();
            closeModal();
        }
    });
    document.addEventListener("keydown", function(event){
        if(event.key === "Escape" && !modal.hidden) closeModal();
    });
    startInput.addEventListener("change", syncLabels);
    if(endInput) endInput.addEventListener("change", syncLabels);
    document.getElementById("izinForm")?.addEventListener("reset", function(){
        setTimeout(syncLabels, 0);
    });

    if(!startInput.value) startInput.value = todayWib();
    if(endInput && !endInput.value) endInput.value = todayWib();
    syncLabels();
})();