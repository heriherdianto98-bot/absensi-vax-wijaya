# MINUTES — DELETE TRANSACTION RUNBOOK

Status: OPERATIONAL RUNBOOK ONLY. Dokumen ini tidak mengubah engine ERP, sync utama, DailyDataEngine, Supabase, atau modul LOCK.

## Recall phrase
Jika Owner berkata `baca repo delete minutes`, baca dokumen ini dulu.

Contoh perintah lanjutan:
`hapus trx 60rb dari tgl 9 agustus sd 12 agustus cabang kalijati`

## Pola yang sudah terbukti
- Operasi dilakukan dari Minutes > Sales Report > Daily Recap.
- Target ditentukan berdasarkan cabang aktif, tanggal aktif, dan nominal exact.
- Tombol Delete membawa `data-trx-id` pada elemen `.call-popup-pin`.
- Delete asli Minutes memakai request POST ke endpoint `removeTransaction`.
- HTTP 200 saja bukan bukti sukses.
- Hanya anggap sukses jika response Minutes menyatakan `response=true`.
- Setelah delete sukses, WAJIB klik `Generate Report` agar Transaction, Net Sales, customer/service summary, dan Daily Recap direkalkulasi.
- Setelah Generate Report, verifikasi kembali bahwa baris target hilang dari Success Transaction Data dan angka ringkasan turun sesuai total nominal yang dihapus.

## Workflow wajib
1. Pastikan cabang benar.
2. Pastikan tanggal benar.
3. Audit daftar transaksi dengan nominal exact yang diminta Owner.
4. Tampilkan jumlah target sebelum delete.
5. Minta konfirmasi sebelum tindakan permanen.
6. Eksekusi delete hanya pada `trx_id` dari baris target yang terlihat pada tanggal aktif.
7. Verifikasi response tiap transaksi.
8. Jika ada gagal, jangan lanjut buta; laporkan daftar gagal.
9. Klik Generate Report.
10. Refresh dan audit angka akhir.

## Rentang tanggal
Jika Owner meminta rentang, misalnya 9–12 Agustus:
- proses tanggal 9 sampai selesai + Generate Report + verifikasi;
- lalu tanggal 10;
- lalu 11;
- lalu 12.

Jangan melakukan satu batch lintas tanggal tanpa verifikasi per tanggal.

## Aturan keamanan
- Jangan simpan PIN, user_pin, cookie, token, atau kredensial Minutes di repository.
- Jangan menebak PIN atau kredensial sesi.
- Jangan menghapus berdasarkan nominal saja tanpa memastikan cabang dan tanggal aktif.
- Jangan menyentuh ERP engine/sync/Supabase untuk operasi ini.
- Jangan mengubah modul LOCK.

## Catatan hasil uji
Metode ini sudah terbukti pada cabang Kalijati untuk transaksi Rp60.000. Setelah delete tervalidasi dan `Generate Report` dijalankan, nilai Transaction dan Net Sales berubah sesuai transaksi yang dihapus.

Masalah yang pernah terjadi:
- script lama hanya melihat HTTP 200 sehingga mengira sukses padahal transaksi tidak terhapus;
- Daily Recap terlihat belum berubah sebelum `Generate Report`;
- validasi tanggal yang terlalu kaku dapat menggagalkan eksekusi walau halaman benar.

Karena itu workflow final harus selalu: `audit target -> konfirmasi -> delete terverifikasi -> Generate Report -> verifikasi hasil`.
