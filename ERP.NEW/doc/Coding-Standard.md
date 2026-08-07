# ERP VAX WIJAYA

## Coding Standard

Version : 1.0.0

Status : FINAL

Last Update :
06 Agustus 2026

---

# TUJUAN

Dokumen ini menjadi standar resmi seluruh proses pengembangan ERP VAX.

Semua file wajib mengikuti aturan ini.

---

# PRINSIP

Clean Code

Reusable

Scalable

Readable

Maintainable

Modular

Production Ready

---

# PENAMAAN FILE

Gunakan huruf kecil.

Benar

dashboard.js

finance.js

inventory.html

erp.css

Salah

Dashboard.js

Finance.HTML

ERP.CSS

---

# HTML

HTML hanya berisi:

Layout

Container

Component

Semantic Tag

Tidak boleh berisi:

CSS

Javascript

Business Logic

---

# CSS

CSS hanya berisi:

Layout

Animation

Responsive

Theme

Tidak boleh berisi:

Javascript

HTML

---

# Javascript

Javascript dibagi menjadi:

Modules

Theme

Utils

Config

Setiap file hanya memiliki SATU tanggung jawab.

---

# CONFIG

Folder config hanya berisi konfigurasi.

Contoh:

supabase.js

minutes.js

erp.js

ai.js

Tidak boleh ada query database.

Tidak boleh ada HTML.

---

# MODULES

Satu modul = satu fungsi.

Contoh

dashboard.js

Hanya dashboard.

Tidak boleh mengurus inventory.

---

activity.js

Hanya activity.

Tidak boleh mengurus chart.

---

connector.js

Hanya sinkronisasi Minutes.

Tidak boleh mengubah tampilan.

---

# COMPONENT

Semua komponen reusable.

Contoh

Sidebar

Header

Footer

Modal

Widget

Table

Card

Notification

Tidak boleh copy-paste.

---

# UTILS

Berisi helper.

Contoh

format rupiah

format tanggal

validator

toast

loading

Tidak boleh mengambil data Minutes.

Tidak boleh query Supabase.

---

# DATABASE

Semua query database dilakukan melalui module yang sesuai.

Tidak boleh query database langsung dari HTML.

---

# SOURCE OF TRUTH

Source utama adalah:

Minutes

Supabase digunakan sebagai:

Cache

Master Data

Setting

Permission

AI

Notification

---

# COMMENT

Semua file wajib memiliki header.

Contoh

Nama File

Versi

Status

Author

Last Update

---

# VERSION

Major

1.0.0

Minor

1.1.0

Patch

1.1.1

---

# NAMING

Gunakan camelCase untuk function.

Contoh

loadDashboard()

formatCurrency()

loadChart()

Gunakan PascalCase hanya jika suatu saat memakai class.

---

# HARDCODE

Tidak diperbolehkan hardcode:

URL

Password

API

KEY

Branch

Theme

Semua harus melalui config.

---

# DUPLICATE

Tidak boleh ada duplicate code.

Jika kode digunakan lebih dari satu tempat:

Pindahkan ke:

components

atau

utils

---

# GIT

Satu commit hanya untuk satu fitur.

Contoh

Tambah Dashboard

Perbaikan Minutes

Update Theme

---

# TESTING

Setiap file wajib diuji sebelum digabungkan ke project.

---

# DOKUMENTASI

Setiap fitur baru wajib mengupdate:

Roadmap

Changelog

Jika mengubah struktur:

Architecture

Folder Structure

---

# RULE TERPENTING

Lebih baik membuat satu file yang benar daripada lima file yang harus dibongkar.

Tidak boleh terburu-buru.

Arsitektur selalu lebih penting daripada kecepatan.

---

END