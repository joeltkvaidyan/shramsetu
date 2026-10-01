# ShramSetu - stop every service started by start-all.ps1.
# Kills ONLY the processes listening on the four dev ports - it never
# touches MongoDB or anything unrelated. Run start-all.ps1 to restart.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File stop-all.ps1
#
# NOTE: keep this file pure ASCII. PowerShell 5.1 reads BOM-less scripts
# as ANSI, so any em dash / smart quote corrupts string parsing.

$ports = @(8000, 8100, 5199, 5443)
$stopped = 0

function Get-PortPid([int]$Port) {
  $line = netstat -ano | Select-String -Pattern "[:.]$Port\s" |
          Select-String "LISTENING" | Select-Object -First 1
  if (-not $line) { return $null }
  $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
  $ownerPid = $parts[-1]
  if ($ownerPid -match '^\d+$') { return [int]$ownerPid }
  return $null
}

foreach ($port in $ports) {
  $procId = Get-PortPid $port
  if ($procId) {
    # Kill the whole tree (npm.cmd -> node.exe -> vite child, etc.)
    taskkill /PID $procId /T /F 2>$null | Out-Null
    Write-Host "[stopped] :$port (pid $procId)"
    $stopped++
  } else {
    Write-Host "[none]    :$port"
  }
}

# Give sockets a moment to release
Start-Sleep -Seconds 1

$stillOpen = @($ports | Where-Object { Get-PortPid $_ })
if ($stillOpen.Count -gt 0) {
  Write-Warning "Some ports still busy: $($stillOpen -join ', ') - wait a second and re-run, or check other terminals."
  exit 1
}
Write-Host ""
Write-Host "All ShramSetu services stopped. (MongoDB service untouched.)"
