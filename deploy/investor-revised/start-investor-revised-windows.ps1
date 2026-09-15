param(
  [switch]$InstallAutoStart,
  [switch]$RemoveAutoStart
)

$ErrorActionPreference = 'Stop'

$ScriptPath = $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ConnectorDir = Join-Path $RepoRoot 'minutes-connector'
$ApiFile = Join-Path $ConnectorDir 'investor-readonly-api.js'
$EnvFile = Join-Path $ConnectorDir '.env'
$StartupDir = [Environment]::GetFolderPath('Startup')
$StartupFile = Join-Path $StartupDir 'ERP-VAX-Investor-Revised.cmd'
$LogDir = Join-Path $ConnectorDir 'logs'
$OutLog = Join-Path $LogDir 'investor-readonly-api.out.log'
$ErrLog = Join-Path $LogDir 'investor-readonly-api.err.log'
$HealthUrl = 'http://127.0.0.1:8788/health'

function Test-ApiHealth {
  try {
    $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 3
    return [bool]$response.ok
  } catch {
    return $false
  }
}

function Wait-ApiHealth {
  param([int]$Seconds = 15)
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-ApiHealth) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

if ($RemoveAutoStart) {
  if (Test-Path $StartupFile) {
    Remove-Item $StartupFile -Force
    Write-Host 'Investor Revised auto-start removed.'
  } else {
    Write-Host 'Investor Revised auto-start was not installed.'
  }
  exit 0
}

if (-not (Test-Path $ApiFile)) {
  throw "Investor Revised API file not found: $ApiFile"
}
if (-not (Test-Path $EnvFile)) {
  throw "Investor Revised .env not found: $EnvFile"
}

$node = Get-Command node -ErrorAction Stop

if ($InstallAutoStart) {
  $cmd = "@echo off`r`nstart \"\" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"$ScriptPath\"`r`n"
  Set-Content -Path $StartupFile -Value $cmd -Encoding ASCII
  Write-Host "Investor Revised auto-start installed: $StartupFile"
}

if (Test-ApiHealth) {
  Write-Host 'Investor Revised API already healthy on 127.0.0.1:8788.'
  exit 0
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# Isolated service only. This does not start/stop the main ERP sync, scheduler,
# or any locked ERP engine. It only launches minutes-connector/investor-readonly-api.js.
Start-Process -FilePath $node.Source `
  -ArgumentList @($ApiFile) `
  -WorkingDirectory $ConnectorDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog

if (-not (Wait-ApiHealth -Seconds 15)) {
  Write-Host 'Investor Revised API failed to become healthy.' -ForegroundColor Red
  Write-Host "Check log: $ErrLog"
  exit 1
}

Write-Host 'Investor Revised API healthy on 127.0.0.1:8788.' -ForegroundColor Green
Write-Host 'Main ERP sync/scheduler were not touched.'
