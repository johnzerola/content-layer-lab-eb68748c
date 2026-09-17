$ErrorActionPreference = 'Continue'
$createdNew = $false
$mutex = New-Object Threading.Mutex($true, 'Local\VaiViralChatSceneGpuRelaySupervisor', [ref]$createdNew)
if (-not $createdNew) {
  $mutex.Dispose()
  exit 0
}
try {
  while ($true) {
    try { & (Join-Path $PSScriptRoot 'start-chatscene-gpu-relay.ps1') | Out-Null }
    catch { Write-EventLog -LogName Application -Source 'Windows PowerShell' -EntryType Warning -EventId 1001 -Message $_.Exception.Message -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 30
  }
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
