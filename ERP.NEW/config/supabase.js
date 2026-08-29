/*
=========================================================
VAX ERP — Supabase client config notes
=========================================================
Browser client dibuat di js/modules/connector.js memakai
anon/publishable key (BUKAN service_role).

Owner Auth:
- Login: pages/login.html → OwnerAuth.loginOwner()
- Guard: js/modules/owner-auth.js (wajib session + profiles.role=owner)
- Session JWT otomatis menempel di request Supabase setelah login
=========================================================
*/
