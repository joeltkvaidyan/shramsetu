# ShramSetu - one-command dev launcher (Windows PowerShell)
# Starts all four services, skipping any that are already running.
# Logs go to shramsetu/logs/ (gitignored). Run .\stop-all.ps1 to stop everything.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File start-all.ps1
#
# NOTE: keep this file pure ASCII. PowerShell 5.1 reads BOM-less scripts
# as ANSI, so any em dash / smart quote corrupts string parsing.

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot           # ...\shramsetu
$Logs = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Get-PortPid([int]$Port) {
  $line = netstat -ano | Select-String -Pattern "[:.]$Port\s" |
          Select-String "LISTENING" | Select-Object -First 1
  if (-not $line) { return $null }
  $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
  $ownerPid = $parts[-1]
  if ($ownerPid -match '^\d+$') { return [int]$ownerPid }
  return $null
}

function Test-Http([string]$Url, [int]$TimeoutSec = 3) {
  try {
    $resp = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500)
  } catch { return $false }
}

# Starts a detached process; stdout and stderr MUST go to different files
# (PowerShell requirement). Returns the new PID.
function Start-Detached([string]$Exe, [string[]]$ProcArgs, [string]$WorkDir, [string]$OutLog, [string]$ErrLog) {
  $p = Start-Process -FilePath $Exe -ArgumentList $ProcArgs -WorkingDirectory $WorkDir `
       -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog `
       -WindowStyle Hidden -PassThru
  return $p.Id
}

$started = 0
$already = 0

# -- 1. Node API (:8000) ------------------------------------------------
if (Get-PortPid 8000) {
  Write-Host "[skip] API      :8000 already running (pid $(Get-PortPid 8000))"
  $already++
} else {
  Write-Host "[start] API      :8000 ..."
  Start-Detached "node.exe" @("src/index.js") (Join-Path $Root "server") `
    (Join-Path $Logs "server.log") (Join-Path $Logs "server.err.log") | Out-Null
  $started++
}

# -- 2. AI service (:8100) ----------------------------------------------
if (Get-PortPid 8100) {
  Write-Host "[skip] AI       :8100 already running (pid $(Get-PortPid 8100))"
  $already++
} else {
  Write-Host "[start] AI       :8100 ..."
  Start-Detached (Join-Path $Root "ai-service\venv\Scripts\python.exe") `
    @("-m","uvicorn","main:app","--host","127.0.0.1","--port","8100") `
    (Join-Path $Root "ai-service") `
    (Join-Path $Logs "ai.log") (Join-Path $Logs "ai.err.log") | Out-Null
  $started++
}

# -- 3. Frontend HTTP preview (:5199) ------------------------------------
if (Get-PortPid 5199) {
  Write-Host "[skip] Frontend :5199 already running (pid $(Get-PortPid 5199))"
  $already++
} else {
  Write-Host "[start] Frontend :5199 (HTTP) ..."
  $env:SHRAM_HTTPS = "off"
  Start-Detached "npm.cmd" @("run","dev","--","--port","5199","--host","127.0.0.1","--strictPort") `
    (Join-Path $Root "frontend") `
    (Join-Path $Logs "vite-http.log") (Join-Path $Logs "vite-http.err.log") | Out-Null
  Remove-Item Env:SHRAM_HTTPS -ErrorAction SilentlyContinue
  $started++
}

# -- 4. Frontend HTTPS for phones (:5443) --------------------------------
if (Get-PortPid 5443) {
  Write-Host "[skip] Frontend :5443 already running (pid $(Get-PortPid 5443))"
  $already++
} else {
  Write-Host "[start] Frontend :5443 (HTTPS, phones) ..."
  Start-Detached "npm.cmd" @("run","dev","--","--port","5443","--host","0.0.0.0","--strictPort") `
    (Join-Path $Root "frontend") `
    (Join-Path $Logs "vite-https.log") (Join-Path $Logs "vite-https.err.log") | Out-Null
  $started++
}

# -- Health checks (poll up to 90s; AI service cold start is slow) -------
Write-Host ""
Write-Host "Waiting for services ..."
$checks = @(
  @{ Name = "API      :8000"; Url = "http://127.0.0.1:8000/health" },
  @{ Name = "AI       :8100"; Url = "http://127.0.0.1:8100/health" },
  @{ Name = "Frontend :5199"; Url = "http://127.0.0.1:5199/" },
  @{ Name = "HTTPS    :5443"; Url = "https://127.0.0.1:5443/" }
)
$ok = @{}
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 2
  $pending = @($checks | Where-Object { -not $ok[$_.Name] })
  if ($pending.Count -eq 0) { break }
  foreach ($c in $pending) {
    if ($c.Url -like "https*") {
      $code = & curl.exe -sk -o NUL -w "%{http_code}" --max-time 3 $c.Url 2>$null
      if ("$code" -match '^(2|3|4)') { $ok[$c.Name] = $true }
    } else {
      if (Test-Http $c.Url) { $ok[$c.Name] = $true }
    }
  }
}

Write-Host ""
$failed = 0
foreach ($c in $checks) {
  if ($ok[$c.Name]) { Write-Host "[OK]   $($c.Name)" } else { Write-Host "[FAIL] $($c.Name)  - check shramsetu\logs\"; $failed++ }
}

Write-Host ""
Write-Host "Desktop:  http://127.0.0.1:5199"
Write-Host "Phone:    https://192.168.1.70:5443   (accept the self-signed cert warning once; mic needs HTTPS)"
Write-Host "Gov login: ADMIN001 / Admin@123    Worker login: 9555500101..110 / Worker@123 or OTP"
if ($failed -gt 0) { exit 1 }
