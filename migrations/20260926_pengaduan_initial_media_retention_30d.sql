-- Pengaduan initial photo/video attachment limits + 30-day retention.
-- Additive storage capability. Existing reply-photo flow remains supported.

alter table public.erp_pengaduan_photo
  drop constraint if exists erp_pengaduan_photo_mime_type_check;

alter table public.erp_pengaduan_photo
  add constraint erp_pengaduan_photo_mime_type_check
  check (
    mime_type = any (
      array[
        'image/jpeg'::text,
        'image/png'::text,
        'image/webp'::text,
        'video/mp4'::text,
        'video/webm'::text,
        'video/quicktime'::text
      ]
    )
  );

alter table public.erp_pengaduan_photo
  drop constraint if exists erp_pengaduan_photo_size_bytes_check;

alter table public.erp_pengaduan_photo
  add constraint erp_pengaduan_photo_size_bytes_check
  check (size_bytes > 0 and size_bytes <= 8388608);

update storage.buckets
set
  file_size_limit = 8388608,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
where id='erp-pengaduan-photos';
