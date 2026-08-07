# ERP VAX WIJAYA

# Minutes Connector Architecture

Version : 1.0.0

Status : FINAL

Last Update :
06 Agustus 2026

---

# TUJUAN

Dokumen ini menjelaskan bagaimana ERP VAX terhubung dengan Minutes.

Minutes adalah sumber data utama (Source of Truth).

ERP tidak mengubah data di Minutes.

ERP hanya membaca, melakukan sinkronisasi, menyimpan cache yang diperlukan, dan menampilkan informasi.

---

# SOURCE OF TRUTH

Minutes

↓

Connector

↓

Supabase

↓

ERP

---

# KONSEP

Minutes tetap menjadi aplikasi operasional.

ERP menjadi aplikasi monitoring dan analisis.

Semua transaksi tetap dilakukan di Minutes.

ERP tidak memiliki menu transaksi kasir.

---

# DATA YANG DIAMBIL

Customer

Barber

Cabang

Service

Transaksi

Cashout

Pembayaran

Waiting List

Status Service

Jam Masuk

Jam Selesai

Omzet

Jumlah Customer

---

# DATA YANG TIDAK DIAMBIL

Password Minutes

Data internal yang tidak berhubungan dengan ERP

Konfigurasi sistem Minutes

---

# KONNEKTOR

Connector bertugas:

Login

Membaca data

Sinkronisasi

Validasi

Cache

Log

Reconnect

---

# ALUR SISTEM

Minutes

↓

Login

↓

Ambil Data

↓

Validasi

↓

Transform Data

↓

Simpan Cache

↓

Supabase

↓

Dashboard ERP

---

# LOGIN

Menggunakan akun Minutes yang memiliki hak akses baca.

Session dikelola oleh Connector.

ERP tidak menyimpan password di database.

Password hanya digunakan saat proses login.

---

# SESSION

Connector menjaga session tetap aktif.

Jika session habis:

Login ulang otomatis.

Jika gagal:

Kirim notifikasi.

---

# CACHE

Data yang sering dipakai disimpan di Supabase.

Contoh:

Dashboard

Activity

Ranking

Omzet Harian

Omzet Bulanan

Cashout

Pembayaran

Customer Hari Ini

Waiting List

---

# REFRESH

Refresh dapat diatur.

Pilihan:

Manual

1 menit

5 menit

10 menit

15 menit

30 menit

60 menit

---

# ERROR HANDLING

Jika Minutes tidak bisa diakses:

Jangan menghapus data cache.

Tampilkan status:

Disconnected

Dashboard tetap menggunakan data terakhir.

---

# STATUS CONNECTOR

ONLINE

Sinkronisasi normal.

SYNCING

Sedang mengambil data.

OFFLINE

Connector terputus.

ERROR

Terjadi kesalahan.

RECONNECT

Mencoba login ulang.

---

# LOG

Setiap proses dicatat.

Contoh:

Login berhasil

Login gagal

Sinkronisasi berhasil

Sinkronisasi gagal

Reconnect

Timeout

---

# ACTIVITY

Connector membuat activity otomatis.

Contoh:

Sinkronisasi selesai

Customer baru

Cashout baru

Pembayaran QRIS

Customer selesai service

---

# KEAMANAN

Password tidak ditampilkan.

Password tidak disimpan di Supabase.

Gunakan HTTPS.

Semua konfigurasi berada pada:

config/minutes.js

---

# PENGEMBANGAN

Jika Minutes menyediakan API resmi di masa depan:

Connector cukup diganti.

Dashboard ERP tidak berubah.

Supabase tidak berubah.

Semua modul tetap berjalan.

---

# TARGET KINERJA

Login Connector < 5 detik

Sinkronisasi Dashboard < 10 detik

Refresh Activity < 5 detik

Dashboard terbuka < 2 detik

---

# ROADMAP

V1

Login

Dashboard

Activity

Ranking

Omzet

V2

Finance

Inventory

CRM

Review

AI

V3

Realtime

Notification

WhatsApp

Machine Learning

---

# PRINSIP TERPENTING

Minutes adalah sumber data utama.

ERP adalah pusat analisis, monitoring, dan pengambilan keputusan.

Semua modul ERP harus membaca data melalui Connector.

Tidak boleh mengambil data langsung dari Minutes tanpa melalui Connector.

---

END