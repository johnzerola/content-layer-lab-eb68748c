param(
  [string]$Python = $env:BANDIT_PYTHON,
  [string]$Checkout = $env:BANDIT_CHECKOUT,
  [string]$Checkpoint = $env:BANDIT_CHECKPOINT,
  [string]$StorageDirectory = $env:BANDIT_STORAGE,
  [string]$PublicHostname,
  [switch]$CheckOnly,
  [int]$Port = 8095
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envFile = Join-Path $projectRoot '.env.local'
function Read-WorkerLocalValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { return $null }
  $line = Get-Content -LiteralPath $envFile -Encoding UTF8 |
    Where-Object { $_ -match ('^\s*' + [regex]::Escape($Name) + '\s*=') } |
    Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line -split '=', 2)[1].Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}
# Load only worker settings. Never print or regenerate the shared secret.
if (-not $env:CLEANER_WORKER_SECRET -or $env:CLEANER_WORKER_SECRET.Length -lt 32) {
  $env:CLEANER_WORKER_SECRET = Read-WorkerLocalValue 'CLEANER_WORKER_SECRET'
}
if (-not $Python -or (-not $PSBoundParameters.ContainsKey('Python') -and -not (Test-Path -LiteralPath $Python -PathType Leaf))) {
  $Python = Read-WorkerLocalValue 'BANDIT_PYTHON'
  if (-not $Python) {
    $knownPython = Join-Path $env:LOCALAPPDATA 'Temp\vaiviral-audio-separator-gpu\Scripts\python.exe'
    $Python = if (Test-Path -LiteralPath $knownPython -PathType Leaf) { $knownPython } else { (Get-Command python -ErrorAction Stop).Source }
  }
}
if (-not $Checkout) { $Checkout = Read-WorkerLocalValue 'BANDIT_CHECKOUT' }
if (-not $Checkpoint) { $Checkpoint = Read-WorkerLocalValue 'BANDIT_CHECKPOINT' }
if (-not $StorageDirectory) { $StorageDirectory = Read-WorkerLocalValue 'BANDIT_STORAGE' }
if (-not $Checkout) { $Checkout = 'G:\dowloand\teste\audio-dialogue-singing-20260915\bandit-infer' }
if (-not $Checkpoint) { $Checkpoint = 'G:\dowloand\teste\audio-dialogue-singing-20260915\models\checkpoint-multi.ckpt' }

if (-not (Test-Path -LiteralPath $Checkout -PathType Container)) { throw "Checkout Bandit não encontrado: $Checkout" }
if (-not (Test-Path -LiteralPath $Checkpoint -PathType Leaf)) { throw "Checkpoint Bandit não encontrado: $Checkpoint" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'ffmpeg não está no PATH' }
if (-not $env:CLEANER_WORKER_SECRET -or $env:CLEANER_WORKER_SECRET.Length -lt 32) {
  throw 'CLEANER_WORKER_SECRET ausente ou curto. Configure o mesmo segredo do backend em .env.local na raiz do projeto.'
}

$env:AUDIO_SEPARATION_ENGINE = 'bandit'
$env:AUDIO_SEPARATION_ENABLED = '1'
$env:BANDIT_PYTHON = $Python
$env:BANDIT_CHECKOUT = (Resolve-Path -LiteralPath $Checkout).Path
$env:BANDIT_CHECKPOINT = (Resolve-Path -LiteralPath $Checkpoint).Path
$env:BANDIT_DEVICE = 'cuda'
$env:CLEANER_ENV = 'development'
$env:CLEANER_BIND_PORT = [string]$Port
$env:CLEANER_ALLOWED_HOSTS = if ($env:CLEANER_ALLOWED_HOSTS) { $env:CLEANER_ALLOWED_HOSTS } else { 'localhost,127.0.0.1' }
if ($PublicHostname) {
  if ($PublicHostname -notmatch '^[A-Za-z0-9.-]+$') { throw 'PublicHostname deve ser somente o hostname, sem https:// ou caminho.' }
  $env:CLEANER_ALLOWED_HOSTS = ((($env:CLEANER_ALLOWED_HOSTS -split ',') + $PublicHostname) | Select-Object -Unique) -join ','
}
$env:CORS_ORIGINS = if ($env:CORS_ORIGINS) { $env:CORS_ORIGINS } else { 'https://content-layer-lab.lovable.app,http://localhost:5173,http://127.0.0.1:5173' }
# Keep temporary audio beside the model checkout, which may be on a data disk.
# An inherited CLEANER_STORAGE from an older launcher must not force C: again.
if (-not $StorageDirectory) { $StorageDirectory = Join-Path (Split-Path $env:BANDIT_CHECKOUT -Parent) 'bandit-gpu-storage' }
New-Item -ItemType Directory -Path $StorageDirectory -Force | Out-Null
$env:CLEANER_STORAGE = (Resolve-Path -LiteralPath $StorageDirectory).Path
$env:BANDIT_STORAGE = $env:CLEANER_STORAGE
& $Python -c "import os, shutil; from pathlib import Path; p=Path(os.environ['CLEANER_STORAGE']); free=shutil.disk_usage(p).free/1024**3; required=max(1,float(os.environ.get('CLEANER_MIN_FREE_GB','10')))+0.5; print(f'Audio storage: {p} | free: {free:.1f} GiB | required: {required:.1f} GiB'); assert free >= required, 'Insufficient storage. Choose -StorageDirectory on a disk with free space.'"
if ($LASTEXITCODE -ne 0) { throw 'Sem espaco para audio. Use -StorageDirectory em um disco com espaco livre.' }
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'

& $Python -c "import torch; assert torch.cuda.is_available(), 'CUDA indisponível neste Python'; print(torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) { throw 'O Python informado não tem CUDA disponível.' }
& $Python -c "import uvicorn, numpy, soundfile; print('runtime Bandit OK')"
if ($LASTEXITCODE -ne 0) { throw 'Runtime incompleto: instale uvicorn, numpy e soundfile no Python informado.' }
if ($CheckOnly) { Write-Host 'Configuracao validada. Nenhum servidor foi iniciado.'; return }
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  throw "A porta $Port ja esta ocupada pelo processo $($listener[0].OwningProcess). Na janela que mostra os acessos GET/POST, pressione Ctrl+C e execute este comando novamente. O worker existente nao foi alterado."
}

Write-Host "Bandit GPU em http://127.0.0.1:$Port (não é público por padrão)"
Write-Host 'Para uso remoto, abra um túnel de saída autenticado e configure CLEANER_WORKER_URL no backend web.'
Push-Location (Join-Path $PSScriptRoot '..')
try { & $Python -m uvicorn app.audio_worker_main:app --host 127.0.0.1 --port $Port }
finally { Pop-Location }
