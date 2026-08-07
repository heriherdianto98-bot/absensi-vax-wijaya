# ERP VAX WIJAYA

# Database Design

Version : 1.0.0

Status : FINAL

Last Update :
06 Agustus 2026

---

# TUJUAN

Dokumen ini menjadi standar seluruh database ERP VAX.

Semua tabel Supabase wajib mengikuti dokumen ini.

ERP tidak boleh membuat tabel tanpa dokumentasi.

---

# DATABASE UTAMA

ERP menggunakan dua sumber data.

1.

Minutes

↓

Source Of Truth

2.

Supabase

↓

ERP Database

---

# SOURCE OF TRUTH

Minutes adalah sumber utama.

Data transaksi tidak boleh diinput ulang ke ERP.

ERP hanya membaca dan melakukan sinkronisasi.

---

# FUNGSI SUPABASE

Supabase digunakan sebagai:

Master Data

Cache

Setting

Permission

Notification

AI

Activity

History

Dashboard

---

# MASTER TABLE

branches

Data seluruh cabang.

Contoh:

id

kode

nama

alamat

status

created_at

---

employees

Data seluruh karyawan.

id

barcode

nama

jabatan

cabang

status

created_at

---

users

User ERP.

id

username

password

role

employee_id

last_login

---

roles

Role ERP.

Owner

Supervisor

Kasir

Barber

Admin

---

permissions

Hak akses.

Role

↓

Menu

↓

Action

---

# TRANSACTION CACHE

transactions

Cache transaksi dari Minutes.

Tidak boleh diinput manual.

Field:

transaction_id

invoice

customer

barber

service

payment

branch

total

created_at

sync_at

---

transaction_items

Detail service.

transaction_id

service

qty

price

subtotal

---

cashout

Cache cashout.

id

branch

employee

category

nominal

description

created_at

---

payment

Cache pembayaran.

Cash

QRIS

Transfer

Debit

Credit Card

Voucher

Member

---

# DASHBOARD

dashboard_daily

Cache dashboard harian.

branch

date

omzet

customer

cashout

service

created_at

---

dashboard_monthly

Cache dashboard bulanan.

branch

month

year

omzet

customer

created_at

---

# ACTIVITY

activity

Seluruh aktivitas ERP.

Contoh:

Customer mulai cukur

Customer waiting

Cashout

Transaksi selesai

Non Tunai

Review Masuk

Sinkronisasi Minutes

Field

id

type

branch

employee

description

reference_id

created_at

---

# INVENTORY

products

stock

stock_history

purchase

supplier

purchase_item

---

# FINANCE

expense

income

finance_category

finance_history

---

# CRM

customer

member

voucher

point

campaign

birthday

review

---

# AI

ai_prompt

ai_history

ai_setting

ai_log

---

# SYSTEM

erp_setting

theme

notification

announcement

backup_log

sync_log

---

# RELASI

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

# RULE

Tidak boleh menghapus data transaksi.

Semua transaksi berasal dari Minutes.

ERP hanya membaca.

---

# CACHE

Dashboard membaca cache.

Bukan membaca Minutes secara langsung.

Hal ini dilakukan agar dashboard tetap cepat.

---

# SYNC

Minutes

↓

Connector

↓

Supabase

↓

Dashboard

Interval:

1 menit

5 menit

15 menit

Bisa diatur pada Setting ERP.

---

# BACKUP

Backup dilakukan dari Supabase.

Minutes tetap menjadi sumber utama.

---

# PENAMBAHAN TABEL

Setiap tabel baru wajib ditambahkan ke Database.md.

Tidak boleh membuat tabel tanpa dokumentasi.

---

END