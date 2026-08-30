-- Document live schema only. DO NOT apply to production (column already exists).
alter table public.product_sales_daily_source
add column if not exists qty_sold integer not null default 0;
