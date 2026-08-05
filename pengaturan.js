

const jamMasuk = document.getElementById("jamMasuk");
const toleransiMenit = document.getElementById("toleransiMenit");
const tarifDenda = document.getElementById("tarifDenda");
const radiusMeter = document.getElementById("radiusMeter");
const simpanPengaturan = document.getElementById("simpanPengaturan");

let pengaturanId = null;

async function loadPengaturan() {
    const { data, error } = await db
        .from("pengaturan_absensi")
        .select("*")
        .limit(1);

    if (error) {
        console.error(error);
        alert("Gagal memuat pengaturan");
        return;
    }

    if (data && data.length > 0) {
        const item = data[0];

        pengaturanId = item.id;
        jamMasuk.value = (item.jam_masuk || "").slice(0, 5);
        toleransiMenit.value = item.toleransi_menit ?? 0;
        tarifDenda.value = item.tarif_denda ?? 0;
        radiusMeter.value = item.radius_meter ?? 100;
    }
}

async function simpanDataPengaturan() {
    const jamMasukValue = jamMasuk.value;
    const toleransiValue = Number(toleransiMenit.value);
    const tarifDendaValue = Number(tarifDenda.value);
    const radiusMeterValue = Number(radiusMeter.value);

    if (!jamMasukValue) {
        alert("Jam masuk wajib diisi");
        return;
    }

    if (toleransiValue < 0 || tarifDendaValue < 0) {
        alert("Nilai tidak boleh kurang dari 0");
        return;
    }
    if (radiusMeterValue < 10) {
        alert("Radius minimal 10 meter");
        return;
    }
    const dataPengaturan = {
        jam_masuk: jamMasukValue,
        toleransi_menit: toleransiValue,
        tarif_denda: tarifDendaValue,
        radius_meter: radiusMeterValue
    };
    
    let hasil;

    if (pengaturanId) {
        hasil = await db
            .from("pengaturan_absensi")
            .update(dataPengaturan)
            .eq("id", pengaturanId);
    } else {
        hasil = await db
            .from("pengaturan_absensi")
            .insert(dataPengaturan)
            .select()
            .single();
    }

    if (hasil.error) {
        console.error(hasil.error);
        alert(hasil.error.message);
        return;
    }

    if (!pengaturanId && hasil.data) {
        pengaturanId = hasil.data.id;
    }

    alert("Pengaturan berhasil disimpan");
}

simpanPengaturan.addEventListener(
    "click",
    simpanDataPengaturan
);

document
    .getElementById("logout")
    .addEventListener("click", () => {
        localStorage.removeItem("login");
        window.location.href = "login.html";
    });

loadPengaturan();
const btnBackup = document.getElementById("btnBackup");

if (btnBackup) {
    btnBackup.addEventListener("click", backupDatabase);
}

async function backupDatabase() {
    try {
        btnBackup.disabled = true;
        btnBackup.textContent = "Memproses Backup...";

        const tabelBackup = [
            "karyawan",
            "cabang",
            "absensi",
            "pengaturan_absensi"
        ];

        const hasilBackup = {
            aplikasi: "Vax Wijaya Absensi",
            versi: "1.0",
            dibuat_pada: new Date().toISOString(),
            data: {}
        };

        for (const namaTabel of tabelBackup) {
            const { data, error } = await db
                .from(namaTabel)
                .select("*");

            if (error) {
                throw new Error(
                    `Gagal mengambil tabel ${namaTabel}: ${error.message}`
                );
            }

            hasilBackup.data[namaTabel] = data || [];
        }

        const isiFile = JSON.stringify(
            hasilBackup,
            null,
            2
        );

        const blob = new Blob(
            [isiFile],
            {
                type: "application/json"
            }
        );

        const url = URL.createObjectURL(blob);

        const tanggal = new Date()
            .toLocaleDateString("en-CA", {
                timeZone: "Asia/Jakarta"
            });

        const link = document.createElement("a");

        link.href = url;
        link.download =
            `backup-vax-wijaya-${tanggal}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        alert("Backup database berhasil dibuat.");
    } catch (error) {
        console.error("Backup gagal:", error);

        alert(
            "Backup gagal: " +
            error.message
        );
    } finally {
        btnBackup.disabled = false;
        btnBackup.textContent = "Backup Data";
    }
}
// =========================
// RESTORE DATABASE
// =========================

const btnRestore = document.getElementById("btnRestore");
const fileRestore = document.getElementById("fileRestore");

if (btnRestore) {
    btnRestore.addEventListener("click", restoreDatabase);
}

async function restoreDatabase() {
    try {
        const file = fileRestore?.files?.[0];

        if (!file) {
            alert("Pilih file backup JSON terlebih dahulu.");
            return;
        }

        if (!file.name.toLowerCase().endsWith(".json")) {
            alert("File harus berformat JSON.");
            return;
        }

        const isiFile = await file.text();

        let backup;

        try {
            backup = JSON.parse(isiFile);
        } catch {
            alert("File JSON tidak valid.");
            return;
        }

        if (
            backup.aplikasi !== "Vax Wijaya Absensi" ||
            !backup.data
        ) {
            alert("File bukan backup Vax Wijaya yang valid.");
            return;
        }

        const yakin = confirm(
            "Yakin ingin restore database?\n\n" +
            "Data dari file backup akan dimasukkan kembali ke database."
        );

        if (!yakin) return;

        btnRestore.disabled = true;
        btnRestore.textContent = "Memproses Restore...";

        const urutanTabel = [
            "cabang",
            "karyawan",
            "pengaturan_absensi",
            "absensi"
        ];

        for (const namaTabel of urutanTabel) {
            const dataTabel = backup.data[namaTabel];

            if (!Array.isArray(dataTabel) || dataTabel.length === 0) {
                continue;
            }

            const { error } = await db
                .from(namaTabel)
                .upsert(dataTabel, {
                    onConflict: "id"
                });

            if (error) {
                throw new Error(
                    `Restore tabel ${namaTabel} gagal: ${error.message}`
                );
            }
        }

        alert("Restore database berhasil.");

        fileRestore.value = "";

        await loadPengaturan();
    } catch (error) {
        console.error("Restore gagal:", error);

        alert(
            "Restore gagal: " +
            error.message
        );
    } finally {
        btnRestore.disabled = false;
        btnRestore.textContent = "Restore Data";
    }
}
// ===============================
// GANTI PASSWORD OWNER
// ===============================

const btnGantiPassword = document.getElementById("btnGantiPassword");

if (btnGantiPassword) {

    btnGantiPassword.addEventListener("click", async () => {

        const passwordBaru = document
            .getElementById("passwordBaru")
            .value.trim();

        const konfirmasi = document
            .getElementById("konfirmasiPassword")
            .value.trim();

        if (passwordBaru.length < 6) {
            alert("Password minimal 6 karakter.");
            return;
        }

        if (passwordBaru !== konfirmasi) {
            alert("Konfirmasi password tidak sama.");
            return;
        }

        const { error } = await db.auth.updateUser({
            password: passwordBaru
        });

        if (error) {
            alert(error.message);
            return;
        }

        alert("Password berhasil diubah.\nSilakan login kembali.");

        await db.auth.signOut();

        localStorage.clear();

        window.location.replace("login.html");

    });

}