# UI-only: prevent the white first paint on the Owner dashboard.
# Run from the ERP-VAX repository root. Never changes JS, CSS, data or other pages.
$ErrorActionPreference = 'Stop'
$target = Join-Path (Get-Location).Path 'ERP.NEW/pages/erp-dashboard.html'
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "File tidak ditemukan: $target. Jalankan dari root repository." }
$bytes = [IO.File]::ReadAllBytes($target)
$hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
$utf8 = [Text.UTF8Encoding]::new($false, $true)
$text = $utf8.GetString($bytes, $(if ($hasBom) { 3 } else { 0 }), $bytes.Length - $(if ($hasBom) { 3 } else { 0 }))
$marker = '<style id="vax-owner-first-paint">'
if ($text.Contains($marker)) { Write-Host 'Sudah terpasang; tidak ada perubahan.'; exit 0 }
$needle = '<meta charset="UTF-8">'
if ($text.Split([string[]]@($needle), [StringSplitOptions]::None).Length -ne 2) { throw 'Struktur HTML tidak sesuai; tidak ada perubahan.' }
$paint = '<style id="vax-owner-first-paint">html,body{background:#0B0E12;color:#F8FAFC;color-scheme:dark}</style>'
$updated = $text.Replace($needle, "$needle`r`n$paint")
$backup = "$target.first-paint.bak"
if (Test-Path -LiteralPath $backup) { throw "Backup sudah ada: $backup. Tidak menimpa backup." }
[IO.File]::WriteAllBytes($backup, $bytes)
$payload = $utf8.GetBytes($updated)
if ($hasBom) { $payload = [byte[]]@(239,187,191) + $payload }
[IO.File]::WriteAllBytes($target, $payload)
Write-Host 'Selesai: hanya ERP.NEW/pages/erp-dashboard.html; backup tersimpan.'
