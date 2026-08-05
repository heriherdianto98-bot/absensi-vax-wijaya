// PROTEKSI HALAMAN VAX WIJAYA

async function cekLogin() {
    const {
        data: { session },
        error
    } = await db.auth.getSession();

    // Belum login
    if (error || !session) {
        localStorage.clear();
        window.location.replace("login.html");
        return;
    }

    const userId = session.user.id;

    // Ambil profil user
    const { data: profil, error: profilError } = await db
        .from("profiles")
        .select("id, nama, role, aktif")
        .eq("id", userId)
        .single();

    // Profil tidak valid atau akun nonaktif
    if (
        profilError ||
        !profil ||
        profil.aktif === false
    ) {
        await db.auth.signOut();
        localStorage.clear();
        window.location.replace("login.html");
        return;
    }

    // Simpan data login
    localStorage.setItem("login", "true");
    localStorage.setItem("user_id", profil.id);
    localStorage.setItem("nama", profil.nama || "");
    localStorage.setItem("role", profil.role || "");

    const halaman = window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

    const role = String(profil.role || "")
        .trim()
        .toLowerCase();

    const nama = String(profil.nama || "")
        .trim()
        .toLowerCase();

    // Dashboard hanya Owner dan SPV
    const bolehDashboard =
        role === "owner" ||
        role === "spv" ||
        nama === "heri herdianto" ||
        nama === "speedrangga";

    // Pengaturan hanya Owner
    const hanyaOwner =
        role === "owner" ||
        nama === "heri herdianto";

    // Blok akses langsung ke Dashboard
    if (
        halaman === "dashboard.html" &&
        !bolehDashboard
    ) {
        alert("Anda tidak memiliki akses ke Dashboard.");
        window.location.replace("index.html");
        return;
    }

    // Blok akses langsung ke Pengaturan
    if (
        halaman === "pengaturan.html" &&
        !hanyaOwner
    ) {
        alert("Halaman Pengaturan hanya dapat diakses Owner.");
        window.location.replace("dashboard.html");
        return;
    }

    // Sembunyikan menu Dashboard
    const menuDashboard = document.querySelector(
        'a[href="dashboard.html"]'
    );

    if (menuDashboard && !bolehDashboard) {
        menuDashboard.style.display = "none";
    }

    // Sembunyikan menu Pengaturan untuk SPV
    const menuPengaturan = document.querySelector(
        'a[href="pengaturan.html"]'
    );

    if (menuPengaturan && !hanyaOwner) {
        menuPengaturan.style.display = "none";
    }
}

cekLogin();