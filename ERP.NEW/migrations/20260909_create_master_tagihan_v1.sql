-- ERP VAX — MASTER TAGIHAN V1
-- Reminder master only. Pembayaran tetap melalui Cash Out Minutes.
-- Tidak membuat transaksi Arus Kas.

create table if not exists public.master_tagihan (
  id uuid primary key default gen_random_uuid(),
  kategori text not null check (kategori in ('WIFI','MINUTES','SUBSIDI_KOST','AIR','SAMPAH','KEAMANAN','SERVICE_AC')),
  cabang text not null,
  jatuh_tempo_hari smallint not null check (jatuh_tempo_hari between 1 and 31),
  nominal numeric(14,0) not null default 0 check (nominal >= 0),
  reminder_days integer[] not null default array[7,3,1,0],
  notify_owner boolean not null default true,
  notify_svp boolean not null default true,
  aktif boolean not null default true,
  catatan text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint master_tagihan_unique unique (kategori, cabang)
);

comment on table public.master_tagihan is 'Master jadwal tagihan rutin ERP VAX. Reminder only; pembayaran tetap melalui Cash Out Minutes dan tidak membuat transaksi Arus Kas.';

alter table public.master_tagihan enable row level security;

drop policy if exists master_tagihan_read_owner_svp on public.master_tagihan;
create policy master_tagihan_read_owner_svp on public.master_tagihan
for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role,'')) in ('owner','svp')));

drop policy if exists master_tagihan_write_owner on public.master_tagihan;
create policy master_tagihan_write_owner on public.master_tagihan
for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role,'')) = 'owner'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role,'')) = 'owner'));

insert into public.master_tagihan (kategori,cabang,jatuh_tempo_hari,nominal,catatan)
values
('WIFI','PAMANUKAN',1,256500,'Baseline master dari daftar Owner'),
('WIFI','ARHAKIM',2,200000,'Baseline master dari daftar Owner'),
('WIFI','UNPAR',3,215500,'Baseline master dari daftar Owner'),
('WIFI','RAWABADAK',6,200000,'Baseline master dari daftar Owner'),
('WIFI','PALABUAN',7,249000,'Baseline master dari daftar Owner'),
('WIFI','CINANGSI',20,200000,'Baseline master dari daftar Owner'),
('WIFI','XJATI',21,230000,'Baseline master dari daftar Owner'),
('WIFI','MEKARWANGI',21,221000,'Baseline master dari daftar Owner'),
('WIFI','SPBU PAGADEN',21,254000,'Baseline master dari daftar Owner'),
('WIFI','BARSEL',28,93000,'Baseline master dari daftar Owner'),
('MINUTES','PAMANUKAN',15,200000,'Baseline master dari daftar Owner'),
('MINUTES','ARHAKIM',15,250000,'Baseline master dari daftar Owner'),
('MINUTES','UNPAR',15,200000,'Baseline master dari daftar Owner'),
('MINUTES','RAWABADAK',15,200000,'Baseline master dari daftar Owner'),
('MINUTES','PALABUAN',15,250000,'Baseline master dari daftar Owner'),
('MINUTES','CINANGSI',15,200000,'Baseline master dari daftar Owner'),
('MINUTES','XJATI',15,250000,'Baseline master dari daftar Owner'),
('MINUTES','MEKARWANGI',15,200000,'Baseline master dari daftar Owner'),
('MINUTES','SPBU PAGADEN',15,200000,'Baseline master dari daftar Owner'),
('MINUTES','BARSEL',15,200000,'Baseline master dari daftar Owner'),
('SUBSIDI_KOST','BARSEL',10,200000,'Baseline master dari daftar Owner'),
('SUBSIDI_KOST','CINANGSI',11,150000,'Baseline master dari daftar Owner'),
('SUBSIDI_KOST','ARHAKIM',11,250000,'Baseline master dari daftar Owner'),
('SUBSIDI_KOST','KALIJATI',11,300000,'Baseline master dari daftar Owner'),
('SUBSIDI_KOST','RAWABADAK',18,250000,'Baseline master dari daftar Owner'),
('SUBSIDI_KOST','PAMANUKAN',25,250000,'Baseline master dari daftar Owner'),
('AIR','PAMANUKAN',7,232000,'Baseline master dari daftar Owner'),
('AIR','ARHAKIM',11,100000,'Baseline master dari daftar Owner'),
('SAMPAH','BARSEL',1,25000,'Baseline master dari daftar Owner'),
('SAMPAH','PAMANUKAN',1,70000,'Baseline master dari daftar Owner'),
('SAMPAH','RAWABADAK',2,50000,'Baseline master dari daftar Owner'),
('SAMPAH','PALABUAN',8,50000,'Baseline master dari daftar Owner'),
('SAMPAH','UNPAR',11,50000,'Baseline master dari daftar Owner'),
('SAMPAH','ARHAKIM',16,50000,'Baseline master dari daftar Owner'),
('SAMPAH','XJATI',21,50000,'Baseline master dari daftar Owner'),
('SAMPAH','MEKARWANGI',26,350000,'Baseline master dari daftar Owner'),
('KEAMANAN','RAWABADAK',9,100000,'Baseline master dari daftar Owner'),
('KEAMANAN','UNPAR',11,75000,'Baseline master dari daftar Owner'),
('SERVICE_AC','BARSEL',8,160000,'Baseline master dari daftar Owner'),
('SERVICE_AC','ARHAKIM',8,100000,'Baseline master dari daftar Owner'),
('SERVICE_AC','PLB',8,240000,'Baseline master dari daftar Owner'),
('SERVICE_AC','XJATI',8,310000,'Baseline master dari daftar Owner'),
('SERVICE_AC','RAWABADAK',10,240000,'Baseline master dari daftar Owner'),
('SERVICE_AC','PAMANUKAN',10,100000,'Baseline master dari daftar Owner'),
('SERVICE_AC','SPBU PAGADEN',29,240000,'Baseline master dari daftar Owner'),
('SERVICE_AC','UNPAR',30,100000,'Baseline master dari daftar Owner'),
('SERVICE_AC','CINANGSI',31,230000,'Baseline master dari daftar Owner')
on conflict (kategori,cabang) do update set
  jatuh_tempo_hari=excluded.jatuh_tempo_hari,
  nominal=excluded.nominal,
  catatan=excluded.catatan,
  updated_at=now();
