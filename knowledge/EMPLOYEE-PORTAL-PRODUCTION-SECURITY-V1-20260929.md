# Employee Portal Production Security V1 — 2026-09-29

## Scope
Employee Capster portal only: Dashboard, Absensi, Gaji Saya, Profil.

## Current verified foundation
- Employee pages call `KaryawanSession.requirePage()` / secure session RPC and do not treat legacy localStorage identifiers alone as proof of authentication.
- Active session guard re-checks the employee session and redirects invalid/inactive sessions.
- Logout calls the server-side logout RPC before local session data is cleared.
- Absensi retains canonical GPS/geofence validation and secure attendance RPC. This audit does not alter that engine.
- Gaji Saya remains a Payroll consumer; no payroll engine is duplicated here.

## Device Readiness added
Dashboard now checks:
- secure context / HTTPS readiness
- server-validated employee session
- browser geolocation permission
- notification permission
- haptic capability

Location is marked mandatory for Absensi. Dashboard, Gaji Saya, and Profil remain accessible even when location permission is not yet granted. The canonical Absensi engine remains responsible for the final GPS accuracy and geofence decision.

## Production deployment requirements
Before employee portal is opened publicly:
1. Serve the portal only through HTTPS.
2. Include `deploy/employee-portal-security-headers.conf` in the employee portal HTTPS nginx server block.
3. Confirm Supabase RLS/RPC permissions for employee-facing tables/functions.
4. Confirm no service-role key, SMTP password, VPS secret, or server credential is shipped in browser JS.
5. Verify session expiry/revocation and employee deactivation behavior online.
6. Run Android Chrome tests for:
   - login/logout
   - location permission denied/granted
   - GPS off/on
   - geofence reject/accept
   - notification permission denied/granted
   - refresh/reopen session
   - direct URL access to Dashboard, Absensi, Gaji Saya, Profil

## Known hardening item — not changed in V1
The employee bearer session token is currently held in browser localStorage. Server-side validation materially reduces trust in client state, but localStorage remains exposed to successful XSS. A later auth-hardening phase should evaluate an HttpOnly + Secure + SameSite cookie/session proxy architecture. Do not migrate this in the same change as Absensi/Payroll logic.

## CSP
Do not enable a strict Content-Security-Policy blindly. The current portal still contains inline style/script usage and third-party CDN assets. Inventory and remove/nonce those dependencies first, then deploy CSP in Report-Only mode before enforcement.
