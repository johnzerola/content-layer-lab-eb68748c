param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9.-]+$')]
  [string]$PublicHostname,
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$Python = $env:BANDIT_PYTHON
)

$ErrorActionPreference = 'Stop'

function Read-DotEnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match ('^' + [regex]::Escape($Name) + '=') } |
    Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line -split '=', 2)[1].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}

$envFile = Join-Path $ProjectRoot '.env.local'
if (-not $env:CLEANER_WORKER_SECRET) {
  $env:CLEANER_WORKER_SECRET = Read-DotEnvValue -Path $envFile -Name 'CLEANER_WORKER_SECRET'
}
if (-not $env:CLEANER_WORKER_SECRET -or $env:CLEANER_WORKER_SECRET.Length -lt 32) {
  throw 'CLEANER_WORKER_SECRET ausente ou curto no .env.local.'
}

if (-not $Python) {
  $knownPython = 'C:\Users\DINO\AppData\Local\Temp\vaiviral-audio-separator-gpu\Scripts\python.exe'
  $Python = if (Test-Path -LiteralPath $knownPython -PathType Leaf) {
    $knownPython
  } else {
    (Get-Command python -ErrorAction Stop).Source
  }
}

$env:BANDIT_PYTHON = $Python
$env:CLEANER_ALLOWED_HOSTS = "localhost,127.0.0.1,$PublicHostname"
$env:CORS_ORIGINS = 'https://content-layer-lab.lovable.app,http://localhost:5173,http://127.0.0.1:5173'

$logDirectory = Join-Path $ProjectRoot 'backend\storage\bandit-gpu\logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory ('worker-' + (Get-Date -Format 'yyyyMMdd') + '.log')

Set-Location -LiteralPath $ProjectRoot
Start-Transcript -Path $logPath -Append | Out-Null
try {
  & (Join-Path $ProjectRoot 'backend\scripts\run_bandit_gpu_worker.ps1') -Python $Python
  if ($LASTEXITCODE -ne 0) { throw "Bandit encerrou com código $LASTEXITCODE." }
} finally {
  Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
