/*======================================
 VAX WIJAYA — Pengajuan Izin Karyawan
 UI ONLY — database belum diaktifkan
======================================*/

(function(){

    const form = document.getElementById("izinForm");
    const tanggal = document.getElementById("tanggalIzin");
    const alasan = document.getElementById("alasanIzin");
    const counter = document.getElementById("alasanCounter");
    const bukti = document.getElementById("buktiIzin");
    const preview = document.getElementById("previewBukti");
    const uploadEmpty = document.getElementById("uploadEmpty");
    const btnHapusFoto = document.getElementById("btnHapusFoto");
    const message = document.getElementById("formMessage");

    function todayLocal(){
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth()+1).padStart(2,"0");
        const d = String(now.getDate()).padStart(2,"0");
        return `${y}-${m}-${d}`;
    }

    if(tanggal){
        tanggal.value = todayLocal();
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

            if(!file.type.startsWith("image/")){
                clearPreview();
                if(message){
                    message.textContent = "Bukti harus berupa foto/gambar.";
                    message.className = "form-message error";
                }
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
                if(message){
                    message.textContent = "";
                    message.className = "form-message";
                }
            };
            reader.readAsDataURL(file);
        });
    }

    if(btnHapusFoto){
        btnHapusFoto.addEventListener("click", clearPreview);
    }

    if(form){
        form.addEventListener("submit", function(event){
            event.preventDefault();

            if(message){
                message.textContent = "";
                message.className = "form-message";
            }

            if(!tanggal?.value){
                message.textContent = "Tanggal izin wajib dipilih.";
                message.className = "form-message error";
                return;
            }

            if(!alasan?.value.trim()){
                message.textContent = "Alasan izin wajib diisi.";
                message.className = "form-message error";
                alasan?.focus();
                return;
            }

            if(!bukti?.files?.length){
                message.textContent = "Bukti/foto izin wajib dilampirkan.";
                message.className = "form-message error";
                return;
            }

            message.textContent = "Form UI sudah siap. Penyimpanan database belum diaktifkan.";
            message.className = "form-message success";
        });
    }

})();
