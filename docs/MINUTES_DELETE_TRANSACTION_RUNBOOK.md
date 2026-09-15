# MINUTES — DELETE TRANSACTION RUNBOOK

Status: OPERATIONAL RUNBOOK ONLY. Dokumen ini tidak mengubah engine ERP, sync utama, DailyDataEngine, Supabase, atau modul LOCK.

## Recall phrase
Jika Owner berkata `baca repo delete minutes`, baca dokumen ini dulu.

Contoh perintah lanjutan:
`hapus trx 60rb dari tgl 9 agustus sd 12 agustus cabang kalijati`

Bisa juga untuk beberapa tanggal non-berurutan:
`hapus trx 60rb tgl 1 dan 3 agustus cabang pamanukan`

## Pola yang sudah terbukti
- Operasi dilakukan dari Minutes > Sales Report > Daily Recap.
- Target ditentukan berdasarkan cabang, tanggal, dan nominal exact.
- Tombol Delete membawa `data-trx-id` pada elemen `.call-popup-pin`.
- Delete asli Minutes memakai request POST ke endpoint `removeTransaction`.
- HTTP 200 saja bukan bukti sukses.
- Hanya anggap sukses jika response Minutes menyatakan `response=true`.
- Setelah delete sukses, WAJIB klik `Generate Report` pada SETIAP tanggal yang diproses agar Transaction, Net Sales, customer/service summary, dan Daily Recap direkalkulasi.
- Setelah Generate Report, verifikasi kembali bahwa baris target hilang dari Success Transaction Data dan angka ringkasan turun sesuai total nominal yang dihapus.

## Workflow wajib
1. Pastikan cabang benar.
2. Pastikan tanggal/tanggal-tanggal target benar.
3. Audit daftar transaksi dengan nominal exact yang diminta Owner.
4. Tampilkan jumlah target sebelum delete, idealnya dirinci per tanggal.
5. Minta konfirmasi sebelum tindakan permanen.
6. Eksekusi delete hanya pada `trx_id` dari baris target yang ditemukan pada tanggal yang diminta.
7. Verifikasi response tiap transaksi; sukses hanya jika `response=true`.
8. Jika ada gagal, jangan lanjut buta; laporkan daftar gagal.
9. Klik Generate Report untuk setiap tanggal yang diproses.
10. Refresh dan audit angka akhir per tanggal.

## Single-date mode
Untuk satu tanggal, script boleh bekerja langsung pada halaman Daily Recap yang sedang aktif. Script mencari row dengan nominal exact, mengambil `data-trx-id`, menampilkan jumlah target, meminta konfirmasi, lalu POST satu per satu ke `removeTransaction`.

Catatan penting:
- teks tanggal pada popup bukan sumber pemilihan transaksi;
- transaksi yang diproses berasal dari halaman aktif;
- lebih aman jika popup membaca cabang dan tanggal aktif otomatis agar tidak ada label tanggal lama.

## Multi-date mode — SUDAH TERBUKTI
Multi-date sudah berhasil dipakai di Minutes pada cabang Pamanukan / alias `VAX Wijaya PMK` untuk 01 dan 03 Agustus 2026.

Hasil uji nyata:
- 01 Aug 2026: 13 transaksi Rp60.000 berhasil, 0 gagal.
- 03 Aug 2026: 3 transaksi Rp60.000 berhasil, 0 gagal.
- Total: 16 transaksi berhasil, 0 gagal.

Pola multi-date final:
1. Cabang aktif harus sudah benar.
2. Script mempunyai daftar tanggal target, misalnya `01 Aug 2026` dan `03 Aug 2026`.
3. Untuk setiap tanggal, script melakukan GET read-only ke Daily Recap tanggal tersebut memakai session Minutes yang aktif.
4. HTML hasil GET diparse dengan `DOMParser`.
5. Script mencari row dengan nominal exact dan tombol Delete yang mempunyai `data-trx-id`.
6. Semua target dikumpulkan dan dirinci per tanggal di Console/popup.
7. Owner mendapat satu popup konfirmasi berisi jumlah target per tanggal dan total keseluruhan.
8. Setelah dikonfirmasi, setiap `trx_id` dihapus satu per satu memakai POST ke `removeTransaction`.
9. Tiap transaksi hanya dihitung berhasil jika response JSON menyatakan `response=true`.
10. Hasil akhir harus dirinci per tanggal: berhasil/gagal.
11. Setelah batch selesai, `Generate Report` tetap dijalankan PER TANGGAL.

## Template logika multi-date
Gunakan pola ini sebagai referensi. Jangan menaruh PIN, user_pin, cookie, token, atau credential tetap di repository.

```javascript
(async () => {
  const DATES = [
    { label: '01 Aug 2026', query: '01+Aug+2026' },
    { label: '03 Aug 2026', query: '03+Aug+2026' }
  ];

  const TARGET_AMOUNT = /\b60[.,]000\b/;
  const BRANCH_OK = /pamanukan|vax wijaya pmk/i;

  if (!BRANCH_OK.test(document.body.innerText)) {
    alert('BATAL: cabang aktif tidak sesuai.');
    return;
  }

  const found = [];

  for (const d of DATES) {
    const res = await fetch(`/dashboard216a/report/recap/?date=${d.query}`, {
      credentials: 'include'
    });

    if (!res.ok) {
      alert(`BATAL: gagal membaca ${d.label}`);
      return;
    }

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    if (!BRANCH_OK.test(doc.body.innerText)) {
      alert(`BATAL: cabang pada ${d.label} tidak sesuai.`);
      return;
    }

    const rows = [...doc.querySelectorAll('table tbody tr')]
      .filter(tr => TARGET_AMOUNT.test(tr.innerText.replace(/\s+/g, ' ')))
      .map(tr => {
        const del = [...tr.querySelectorAll('a')]
          .find(a => /^delete$/i.test(a.innerText.trim()));

        return del?.dataset?.trxId ? {
          date: d.label,
          trxId: del.dataset.trxId,
          row: tr.innerText.replace(/\s+/g, ' ').trim()
        } : null;
      })
      .filter(Boolean);

    found.push(...rows);
    console.log(`${d.label}: ${rows.length} target`);
    console.table(rows);
  }

  // Setelah audit, tampilkan summary per tanggal dan minta konfirmasi.
  // Credential/PIN harus diminta saat runtime, jangan ditulis permanen di repo.
  // Delete POST satu per satu ke /dashboard216a/pos/removeTransaction.
  // Hitung sukses hanya jika JSON response.response === 'true'.
})();
```

## Alias cabang
Nama cabang di Minutes tidak selalu sama dengan nama operasional ERP. Validasi harus menerima alias yang benar.

Contoh yang sudah ditemukan:
- Pamanukan = `VAX Wijaya PMK`.

Jangan membuat validasi literal terlalu kaku. Jika nama tampilan Minutes berbeda, audit dulu alias cabang sebelum menjalankan delete.

## Rentang tanggal
Jika Owner meminta rentang, misalnya 9–12 Agustus, dua mode diperbolehkan:

**Mode aman per tanggal:**
- tanggal 9: audit -> delete -> Generate Report -> verifikasi;
- lalu 10, 11, 12.

**Mode multi-date:**
- audit semua tanggal dulu;
- tampilkan jumlah target per tanggal;
- satu kali konfirmasi;
- delete semua `trx_id` dengan verifikasi response per transaksi;
- laporkan hasil per tanggal;
- Generate Report tetap dilakukan satu per satu untuk tiap tanggal.

Gunakan multi-date hanya bila cabang sama dan setiap tanggal berhasil diaudit sebelum delete dimulai.

## Aturan keamanan
- Jangan simpan PIN, user_pin, cookie, token, atau kredensial Minutes di repository.
- Jangan menebak PIN atau kredensial sesi.
- Jangan menghapus berdasarkan nominal saja tanpa memastikan cabang dan tanggal target.
- Selalu tampilkan jumlah target sebelum tindakan permanen.
- Jangan menganggap HTTP 200 sebagai sukses; wajib cek `response=true`.
- Jangan menyentuh ERP engine/sync/Supabase untuk operasi ini.
- Jangan mengubah modul LOCK.

## Catatan hasil uji
### Kalijati
Metode single-date sudah terbukti untuk transaksi Rp60.000. Setelah delete tervalidasi dan `Generate Report` dijalankan, nilai Transaction dan Net Sales berubah sesuai transaksi yang dihapus.

### Pamanukan / VAX Wijaya PMK
Metode multi-date terbukti pada 01 dan 03 Aug 2026:
- 13 + 3 target Rp60.000;
- 16 berhasil;
- 0 gagal.

Masalah yang pernah terjadi:
- script lama hanya melihat HTTP 200 sehingga mengira sukses padahal transaksi tidak terhapus;
- Daily Recap terlihat belum berubah sebelum `Generate Report`;
- validasi tanggal yang terlalu kaku dapat menggagalkan eksekusi walau halaman benar;
- validasi nama cabang `Pamanukan` pernah gagal karena Minutes menampilkan alias `VAX Wijaya PMK`.

Workflow final:
`audit target -> ringkasan per tanggal -> konfirmasi -> delete terverifikasi -> Generate Report per tanggal -> verifikasi hasil`.
