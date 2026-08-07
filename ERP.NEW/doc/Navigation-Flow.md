# ERP VAX WIJAYA

# Navigation Flow

Version : 1.0.0

Status : FINAL

Last Update :
06 Agustus 2026

---

# TUJUAN

Dokumen ini menjadi standar navigasi seluruh ERP VAX.

Semua halaman harus mengikuti alur ini.

Tidak diperbolehkan membuat menu atau halaman di luar struktur ini tanpa memperbarui dokumen.

---

# ENTRY POINT

User

↓

Login

↓

Dashboard sesuai Role

---

# ROLE

Owner

Supervisor

Kasir

Barber

HR

Finance

Admin ERP

---

# DASHBOARD

Dashboard bukan tujuan akhir.

Dashboard adalah pusat navigasi.

Semua modul dapat diakses dari Dashboard sesuai hak akses.

---

# STRUKTUR MENU

Dashboard

↓

Master Data

↓

Operasional

↓

Business

↓

AI

↓

System

---

# MASTER DATA

Cabang

↓

Karyawan

↓

Jadwal

↓

Absensi

↓

Payroll

---

# BUSINESS

Finance

↓

Inventory

↓

CRM

↓

Analytics

↓

Review

---

# AI

VAX AI

↓

Google Review AI

↓

Analisa Omzet

↓

Prediksi Cabang

↓

Prediksi Stok

↓

AI Assistant

---

# SYSTEM

Pengaturan ERP

↓

Theme

↓

Permission

↓

Backup

↓

Connector Minutes

↓

Log

---

# DASHBOARD OWNER

Dashboard Owner

↓

Finance

↓

Analytics

↓

CRM

↓

Review

↓

Inventory

↓

Pengaturan

---

# DASHBOARD KARYAWAN

Dashboard Karyawan

↓

Absensi

↓

Target

↓

Komisi

↓

Jadwal

↓

Pengumuman

---

# MODUL

Setiap modul berdiri sendiri.

Dashboard hanya menjadi pintu masuk.

Tidak boleh ada modul yang bergantung pada tampilan Dashboard.

---

# FLOW MINUTES

Minutes

↓

Connector

↓

Supabase

↓

Dashboard

↓

User

---

# FLOW CRM

Customer

↓

Minutes

↓

Connector

↓

Supabase

↓

CRM

↓

Dashboard

---

# FLOW INVENTORY

Supplier

↓

Pembelian

↓

Stok

↓

Penggunaan

↓

Dashboard

---

# FLOW FINANCE

Cash In

↓

Cash Out

↓

Kategori

↓

Laporan

↓

Dashboard

---

# FLOW REVIEW

Google Review

↓

Connector

↓

AI

↓

Approval

↓

Google

---

# FLOW AI

Dashboard

↓

AI

↓

Analisa

↓

Rekomendasi

↓

User

---

# NOTIFICATION FLOW

Minutes

↓

Connector

↓

Notification

↓

Dashboard

↓

User

---

# SEARCH

Search Global tersedia di Header.

Dapat mencari:

Cabang

Karyawan

Customer

Invoice

Produk

Menu

---

# BREADCRUMB

Setiap halaman wajib memiliki breadcrumb.

Contoh:

Dashboard

>

Finance

>

Cash Out

---

# QUICK ACTION

Dashboard menyediakan tombol cepat:

Tambah Cabang

Tambah Karyawan

Sinkronisasi Minutes

Export

Print

Theme

---

# SIDEBAR

Sidebar hanya berisi menu utama.

Submenu muncul ketika diperlukan.

---

# HEADER

Header selalu konsisten.

Isi:

Judul

Breadcrumb

Dropdown Cabang

Search

Notification

Theme

Profile

---

# FOOTER

Footer menampilkan:

Versi ERP

Status Connector

Last Sync

---

# RULE

Semua halaman harus dapat kembali ke Dashboard.

Tidak boleh ada halaman yang menjadi jalan buntu.

Semua menu mengikuti role.

Semua modul menggunakan komponen yang sama.

---

END