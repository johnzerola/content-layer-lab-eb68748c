param(
  [string]$Python = $env:BANDIT_PYTHON,
  [string]$Checkout = $env:BANDIT_CHECKOUT,
  [string]$Checkpoint = $env:BANDIT_CHECKPOINT,
  [int]$Port = 8095
)

$ErrorActionPreference = 'Stop'
if (-not $Python) { $Python = (Get-Command python -ErrorAction Stop).Source }
if (-not $Checkout) { $Checkout = 'G:\dowloand\teste\audio-dialogue-singing-20260915\bandit-infer' }
if (-not $Checkpoint) { $Checkpoint = 'G:\dowloand\teste\audio-dialogue-singing-20260915\models\checkpoint-multi.ckpt' }

if (-not (Test-Path -LiteralPath $Checkout -PathType Container)) { throw "Checkout Bandit não encontrado: $Checkout" }
if (-not (Test-Path -LiteralPath $Checkpoint -PathType Leaf)) { throw "Checkpoint Bandit não encontrado: $Checkpoint" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'ffmpeg não está no PATH' }
if (-not $env:CLEANER_WORKER_SECRET -or $env:CLEANER_WORKER_SECRET.Length -lt 32) {
  throw 'Defina CLEANER_WORKER_SECRET (mínimo 32 caracteres) somente nesta sessão.'
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
$env:CORS_ORIGINS = if ($env:CORS_ORIGINS) { $env:CORS_ORIGINS } else { 'https://content-layer-lab.lovable.app,http://localhost:5173,http://127.0.0.1:5173' }
$env:CLEANER_STORAGE = (Join-Path $PSScriptRoot '..\storage\bandit-gpu')
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'

& $Python -c "import torch; assert torch.cuda.is_available(), 'CUDA indisponível neste Python'; print(torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) { throw 'O Python informado não tem CUDA disponível.' }
& $Python -c "import uvicorn, numpy, soundfile; print('runtime Bandit OK')"
if ($LASTEXITCODE -ne 0) { throw 'Runtime incompleto: instale uvicorn, numpy e soundfile no Python informado.' }

Write-Host "Bandit GPU em http://127.0.0.1:$Port (não é público por padrão)"
Write-Host 'Para uso remoto, abra um túnel de saída autenticado e configure CLEANER_WORKER_URL no backend web.'
Push-Location (Join-Path $PSScriptRoot '..')
try { & $Python -m uvicorn app.audio_worker_main:app --host 127.0.0.1 --port $Port }
finally { Pop-Location }
