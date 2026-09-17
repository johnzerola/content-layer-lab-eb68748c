param(
  [string]$InstallRoot = 'G:\VaiViral\chatscene-voice',
  [string]$HostearHost = '104.234.186.50',
  [string]$SshKey = "$env:USERPROFILE\.ssh\cleaneria_deploy",
  [int]$RemotePort = 18096
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $InstallRoot '.venv\Scripts\python.exe'
$tokenFile = Join-Path $InstallRoot 'relay-token'
if (-not (Test-Path -LiteralPath $python)) { throw "Python de voz nao encontrado em $python" }
if (-not (Test-Path -LiteralPath $SshKey)) { throw "Chave SSH nao encontrada em $SshKey" }
if (-not (Test-Path -LiteralPath $tokenFile) -or (Get-Item -LiteralPath $tokenFile).Length -lt 32) {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  [Convert]::ToBase64String($bytes) | Set-Content -LiteralPath $tokenFile -NoNewline
}
$token = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
$env:CHATSCENE_GPU_TOKEN = $token
$env:CHATSCENE_GPU_BIND = '127.0.0.1'
$env:CHATSCENE_GPU_PORT = '18096'
$env:CHATSCENE_GPU_IDLE_SECONDS = '600'
$env:CHATSCENE_VOICE_CONFIG = Join-Path $projectRoot 'backend/data/chatscene-voices/runtime.json'
$env:CHATSCENE_VOICE_PYTHON_PATH = $python
$relayScript = Join-Path $projectRoot 'backend/chatscene_voice/relay.py'
$processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$relayRunning = $processes | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -and $_.CommandLine.Contains($relayScript) }
$tunnelSignature = "127.0.0.1:${RemotePort}:127.0.0.1:18096"
$tunnelRunning = $processes | Where-Object { $_.Name -eq 'ssh.exe' -and $_.CommandLine -and $_.CommandLine.Contains($tunnelSignature) }
if (-not $relayRunning) {
  Start-Process -WindowStyle Hidden -FilePath $python -ArgumentList @('-u', $relayScript) -WorkingDirectory $projectRoot
}
if (-not $tunnelRunning) {
  Start-Process -WindowStyle Hidden -FilePath 'ssh.exe' -ArgumentList @('-N','-T','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-i',$SshKey,'-o','IdentitiesOnly=yes','-R',"127.0.0.1:${RemotePort}:127.0.0.1:18096",("root@" + $HostearHost))
}
Write-Host "GPU relay ativo em 127.0.0.1:18096; tunel Hostear:${RemotePort} -> GPU local. Token em $tokenFile"
