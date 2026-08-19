# HERI — Personal Finance & AI Assistant

**Phase 1** — Foundation + Migration + Voice AI Core

## Important

- Project **HERI** is fully separate from ERP VAX.
- Baseline V3 is **read-only**: `HERI/_baseline/Catatan_Pengeluaran_Pribadi_V3.html`
- HERI **never writes** localStorage key `expense_new_v3_heri_putri`
- HERI writes only `heri_transactions_v1` (+ memory/privacy keys)

## Run web

```bash
cd HERI
npm run web
# open http://localhost:5173
```

Or open `HERI/web/index.html` in a browser (Chrome recommended for Speech Recognition).

## Run VPS API foundation

```bash
cd HERI
npm run server
# http://127.0.0.1:8787/api/v1/health
# http://127.0.0.1:8787/api/v1/contract
```

## Android foundation

Sources under `android-app/` + `capacitor.config.json`.

To build installable APK on Owner machine:

1. Install Android Studio + JDK
2. `npm i @capacitor/core @capacitor/cli @capacitor/android`
3. `npx cap add android` (or sync existing)
4. Copy/sync `web/` into Android assets
5. Open `android/` in Android Studio → Run

### Already prepared locally

- Deep link `heri://query?q=...`
- RECORD_AUDIO permission
- NFC feature/permission (optional hardware)
- JS bridge `HeriAndroid.speak` / `nfcAvailable`
- Assistant query router → `HERI_handleAssistantQuery`

### Needs external setup (not claimed active)

- Google Play Console App Actions / Assistant integration
- Digital Asset Links for `https://heri.app`
- Official payment/NFC issuer SDKs

## Tests

```bash
cd HERI
npm run test:phase1
```

## Data keys

| Key | Role |
|-----|------|
| `expense_new_v3_heri_putri` | V3 inputs — **read-only** |
| `heri_transactions_v1` | HERI new inputs |
| `heri_category_memory_v1` | Smart category memory |
| `heri_voice_privacy_v1` | Per-category TTS privacy |
| `heri_voice_privacy_level_v1` | Privacy level A/B/C/D |
| `heri_hidden_ids_v1` | Soft-hide without touching V3 |

IMPORTED_DATA (Excel historical) is embedded in the HTML (same as V3).

## Phase 2 � Debug APK

Exact paths:
- `android/app/build/outputs/apk/debug/app-debug.apk`
- `dist/HERI-debug.apk`

Install on Samsung: copy `dist/HERI-debug.apk` to phone and sideload.
Rebuild: `npm run build:apk` (requires `.tools/jdk-21` + `.tools/android-sdk`).
