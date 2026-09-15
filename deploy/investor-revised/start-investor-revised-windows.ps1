param(
  [switch]$InstallAutoStart,
  [switch]$RemoveAutoStart
)

$ErrorActionPreference = 'Stop'

$ScriptPath = $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ConnectorDir = Join-Path $RepoRoot 'minutes-connector'
$ApiFile = Join-Path $ConnectorDir 'investor-readonly-api.js'
$RunnerFile = Join-Path $ConnectorDir 'investor-monthly-dataset-yeartrend-compatible-readonly.js'
$ExpectedRunner = Split-Path $RunnerFile -Leaf
$EnvFile = Join-Path $ConnectorDir '.env'
$StartupDir = [Environment]::GetFolderPath('Startup')
$StartupFile = Join-Path $StartupDir 'ERP-VAX-Investor-Revised.cmd'
$LogDir = Join-Path $ConnectorDir 'logs'
$OutLog = Join-Path $LogDir 'investor-readonly-api.out.log'
$ErrLog = Join-Path $LogDir 'investor-readonly-api.err.log'
$HealthUrl = 'http://127.0.0.1:8788/health'

function Get-ApiHealth {
  try {
    return Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 3
  } catch {
    return $null
  }
}

function Test-ApiHealth {
  $response = Get-ApiHealth
  return [bool]($response -and $response.ok -and $response.runner -eq $ExpectedRunner)
}

function Wait-ApiHealth {
  param([int]$Seconds = 15)
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-ApiHealth) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Stop-StaleInvestorApi {
  $health = Get-ApiHealth
  if (-not $health -or $health.runner -eq $ExpectedRunner) { return }

  $apiPattern = [regex]::Escape($ApiFile)
  $procs = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match $apiPattern
  }
  foreach ($proc in $procs) {
    Stop-Process -Id $proc.ProcessId -Force
  }
  if ($procs) { Start-Sleep -Seconds 1 }
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
if (-not (Test-Path $RunnerFile)) {
  throw "Investor Revised READ ONLY runner not found: $RunnerFile"
}
if (-not (Test-Path $EnvFile)) {
  throw "Investor Revised .env not found: $EnvFile"
}

$node = Get-Command node -ErrorAction Stop

if ($InstallAutoStart) {
  $cmd = @"
@echo off
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ScriptPath"
"@
  Set-Content -Path $StartupFile -Value $cmd -Encoding ASCII
  Write-Host "Investor Revised auto-start installed: $StartupFile"
}

if (Test-ApiHealth) {
  Write-Host "Investor Revised API already healthy on 127.0.0.1:8788 with runner $ExpectedRunner."
  exit 0
}

# If an older Investor Revised API instance is alive with the obsolete runner,
# stop only that isolated API process. Main ERP sync/scheduler are not touched.
Stop-StaleInvestorApi

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# Process-scoped configuration only for Investor Revised API.
# This does not edit .env, sync.js, scheduler.js, DailyDataEngine, or LOCKED engines.
$env:INVESTOR_READONLY_RUNNER = $RunnerFile

Start-Process -FilePath $node.Source `
  -ArgumentList @($ApiFile) `
  -WorkingDirectory $ConnectorDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog

if (-not (Wait-ApiHealth -Seconds 15)) {
  Write-Host 'Investor Revised API failed to become healthy with the expected READ ONLY runner.' -ForegroundColor Red
  Write-Host "Expected runner: $ExpectedRunner"
  Write-Host "Check log: $ErrLog"
  exit 1
}

Write-Host "Investor Revised API healthy on 127.0.0.1:8788 with runner $ExpectedRunner." -ForegroundColor Green
Write-Host 'Main ERP sync/scheduler and LOCKED engines were not touched.'
