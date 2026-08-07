# ERP VAX WIJAYA

Version : 1.0.0

Status : Production Architecture

Author :
OpenAI + Heri Herdianto

Last Update :
06 Agustus 2026

---

# TUJUAN ERP

ERP VAX Wijaya dibuat sebagai pusat kendali seluruh operasional Vax Wijaya Barbershop.

Semua data berasal dari Minutes sebagai sumber utama (Source of Truth).

ERP hanya membaca, mengolah, menganalisa, dan menampilkan data secara realtime.

---

# PRINSIP SISTEM

Minutes
↓
Connector
↓
Supabase
↓
ERP Dashboard
↓
User

ERP tidak menginput transaksi.

ERP hanya mengelola informasi.

---

# SUMBER DATA

1. Minutes

Sumber utama seluruh transaksi.

Data yang diambil:

- Customer
- Service
- Barber
- Omzet
- Cashout
- Pembayaran
- Jadwal
- Waiting List

---

2. Supabase

Digunakan sebagai:

- Cache
- Setting
- Master Cabang
- User ERP
- Permission
- Activity
- AI
- Notification

---

# MODUL ERP

Dashboard

Dashboard Owner

Dashboard Karyawan

Cabang

Karyawan

Absensi

Payroll

Finance

Inventory

CRM

Google Review

Analytics

AI

Pengaturan

---

# ALUR DATA

Minutes

↓

Connector

↓

Supabase

↓

Dashboard ERP

↓

User

---

# TAMPILAN

Semua halaman menggunakan:

Sidebar

Header

Footer

Modal

Theme

Widget

Card

Table

Button

Notification

Komponen dibuat reusable.

---

# RULE

Tidak boleh ada duplicate code.

Tidak boleh copy paste HTML.

Tidak boleh hardcode.

Semua setting berada di folder config.

Semua logika berada di folder js/modules.

Semua helper berada di utils.

Semua style berada di styles.

---

# PENGEMBANGAN

ERP dirancang agar dapat berkembang tanpa mengubah struktur project.

Penambahan fitur cukup membuat:

pages/

modules/

styles/

tanpa mengubah modul lain.

---

# ROADMAP

Phase 1

Dashboard

Minutes Connector

Theme

Export

Activity

Phase 2

Finance

Inventory

CRM

Analytics

Phase 3

Payroll

Absensi

AI

Google Review

Notification

Phase 4

Mobile App

Realtime

Machine Learning

Business Intelligence

---

END