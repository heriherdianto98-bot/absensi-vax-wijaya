# ERP VAX WIJAYA

## Folder Structure

Version : 1.0.0

Status : FINAL

Last Update :
06 Agustus 2026

---

# TUJUAN

Dokumen ini menjelaskan fungsi setiap folder dalam project ERP VAX.

Semua developer wajib mengikuti struktur ini.

Tidak diperbolehkan membuat folder baru tanpa persetujuan Architecture.

---

# ROOT PROJECT

ERP.NEW

Berisi seluruh sistem ERP.

Tidak diperbolehkan menyimpan file random di root.

Root hanya boleh berisi:

assets/

components/

config/

data/

docs/

js/

pages/

styles/

utils/

vendor/

index.html

login.html

README.md

---

# assets/

Berisi seluruh file visual.

Contoh:

logo/

icons/

images/

avatar/

background/

illustration/

Tidak boleh menyimpan javascript.

Tidak boleh menyimpan css.

---

# components/

Berisi komponen tampilan yang digunakan berulang.

Contoh:

Sidebar

Header

Footer

Modal

Widget

Notification

Card

Table

Loader

Komponen harus reusable.

---

# config/

Berisi konfigurasi sistem.

Contoh:

supabase.js

minutes.js

erp.js

ai.js

Tidak boleh berisi logika bisnis.

Tidak boleh berisi HTML.

---

# data/

Berisi data statis dan cache.

Contoh:

branches.json

setting.json

theme.json

cache.json

permission.json

Tidak boleh menyimpan source code.

---

# docs/

Berisi dokumentasi resmi project.

Contoh:

Architecture.md

Folder-Structure.md

Coding-Standard.md

Database.md

Minutes.md

Roadmap.md

Changelog.md

Semua perubahan besar harus diperbarui di folder ini.

---

# js/

Berisi seluruh javascript project.

Struktur:

theme/

modules/

Tidak boleh menyimpan CSS.

---

# js/modules/

Berisi logika bisnis.

Contoh:

dashboard.js

activity.js

chart.js

connector.js

export.js

finance.js

inventory.js

crm.js

review.js

analytics.js

Setiap file hanya memiliki SATU tanggung jawab.

---

# js/theme/

Berisi sistem tema ERP.

Contoh:

theme.js

dark.js

light.js

gold.js

blue.js

green.js

---

# pages/

Berisi seluruh halaman ERP.

Contoh:

erp-dashboard.html

dashboard-owner.html

dashboard-karyawan.html

finance.html

inventory.html

crm.html

analytics.html

review.html

AI.html

Payroll.html

Absensi.html

pengaturan.html

Semua halaman menggunakan komponen yang sama.

---

# styles/

Berisi seluruh CSS.

Contoh:

erp.css

theme.css

responsive.css

sidebar.css

header.css

modal.css

Tidak boleh menyimpan javascript.

---

# utils/

Berisi helper.

Contoh:

helper.js

formatter.js

validator.js

date.js

toast.js

loading.js

Tidak boleh mengambil data database.

---

# vendor/

Berisi library pihak ketiga.

Contoh:

Chart.js

SweetAlert2

html2pdf

xlsx

Flatpickr

FullCalendar

Tidak boleh dimodifikasi kecuali update versi.

---

# ATURAN PENAMBAHAN FITUR

Jika membuat fitur baru:

1.

Tambahkan halaman di:

pages/

2.

Tambahkan logika di:

js/modules/

3.

Tambahkan style di:

styles/

4.

Tambahkan konfigurasi bila diperlukan di:

config/

5.

Update dokumentasi pada:

docs/

---

# CONTOH

Tambah Modul Booking

↓

pages/booking.html

↓

js/modules/booking.js

↓

styles/booking.css

↓

docs/Roadmap.md

---

# LARANGAN

Tidak boleh copy-paste kode.

Tidak boleh hardcode URL.

Tidak boleh menyimpan CSS di HTML.

Tidak boleh menyimpan HTML di JavaScript.

Tidak boleh membuat file tanpa fungsi yang jelas.

---

END