// LOGIN VAX WIJAYA - SUPABASE AUTH
// Pastikan config.js dan supabase.js dipanggil sebelum login.js

const btnLogin = document.getElementById("btnLogin");
const inputUsername = document.getElementById("username");
const inputPassword = document.getElementById("password");

if (!btnLogin || !inputUsername || !inputPassword) {
    console.error("Form login tidak ditemukan.");
} else {
    btnLogin.addEventListener("click", prosesLogin);

btnLogin.classList.add("loading");
btnLogin.textContent = "LOGIN...";

    inputPassword.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            prosesLogin();
        }
    });
}

async function prosesLogin() {

    btnLogin.disabled = true;
    btnLogin.textContent = "LOGIN...";

    const username = inputUsername.value.trim();
    const password = inputPassword.value.trim();

    if (!username || !password) {
        alert("Username dan Password wajib diisi.");
        return;
    }
    btnLogin.disabled = true;
    btnLogin.textContent = "MEMERIKSA...";

    try {

        // ===========================
        // LOGIN KARYAWAN (K0001)
        // ===========================
        if (!username.includes("@")) {
    
            const { data: karyawan, error } = await db
                .from("karyawan")
                .select("*")
                .eq("kode_login", username.toUpperCase())
                .eq("password_awal", password)
                .single();
    
            if (error || !karyawan) {
                throw new Error("Kode login atau password salah");
            }
    
            if (!karyawan.aktif) {
                alert("Akun dinonaktifkan.");
                return;
            }
    
            localStorage.setItem("login", "true");
            localStorage.setItem("user_id", karyawan.id);
            localStorage.setItem("nama", karyawan.nama_karyawan);
            localStorage.setItem("jabatan", karyawan.jabatan);
            localStorage.setItem("cabang_id", karyawan.cabang_id);
            localStorage.setItem("role", "karyawan");
    
            window.location.href = "dashboard-karyawan.html";
            return;
        }
    
        // ===========================
        // LOGIN OWNER / SVP
        // ===========================
        const { data: authData, error: authError } =
            await db.auth.signInWithPassword({
                email: username.toLowerCase(),
                password: password
            });
    
        if (authError) throw authError;
    
        const userId = authData.user.id;
    
        const { data: profil, error: profilError } =
            await db
                .from("profiles")
                .select("*")
                .eq("id", userId)
                .single();
    
        if (profilError) throw profilError;
    
        if (!profil.aktif) {
            alert("Akun dinonaktifkan.");
            await db.auth.signOut();
            return;
        }
    
        localStorage.setItem("login", "true");
        localStorage.setItem("user_id", profil.karyawan_id);
        localStorage.setItem("nama", profil.nama);
        localStorage.setItem("role", profil.role);
        localStorage.setItem("jabatan", profil.role);
    
        window.location.href = "dashboard.html";
    
    }

     catch (err) {

        console.log(err);
        alert("Username atau Password salah.");

    } finally {

        btnLogin.disabled = false;
        btnLogin.classList.remove("loading");
        btnLogin.textContent = "LOGIN";
    
    }

}