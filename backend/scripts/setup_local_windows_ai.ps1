param(
  [string]$RuntimeDir = "G:\cleaneria-runtime",
  [string]$Python = "",
  [switch]$InstallDiffuEraserModels
)

$ErrorActionPreference = "Stop"

function Resolve-Python {
  if ($Python) { return $Python }
  $py311 = (& py -3.11 -c "import sys; print(sys.executable)" 2>$null)
  if ($LASTEXITCODE -eq 0 -and $py311) { return $py311.Trim() }
  $default = (& python -c "import sys; print(sys.executable)")
  return $default.Trim()
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtime = New-Item -ItemType Directory -Force -Path $RuntimeDir
$pythonExe = Resolve-Python
$venv = Join-Path $runtime.FullName "propainter-env"
$propainterRoot = Join-Path $runtime.FullName "ProPainter"
$diffueraserRoot = Join-Path $runtime.FullName "DiffuEraser"
$modelsRoot = Join-Path $runtime.FullName "diffueraser-models"

Write-Host "[1/6] Python base: $pythonExe"
if (!(Test-Path (Join-Path $venv "Scripts\python.exe"))) {
  & $pythonExe -m venv $venv
}
$venvPython = Join-Path $venv "Scripts\python.exe"

Write-Host "[2/6] Instalando dependencias Python leves no ambiente ProPainter"
& $venvPython -m pip install --upgrade pip wheel "setuptools<82"
& $venvPython -m pip install minio requests pyyaml tqdm scipy pillow imageio imageio-ffmpeg scikit-image matplotlib einops addict future timm
& $venvPython -c "import torch; raise SystemExit(0 if torch.cuda.is_available() else 1)"
if ($LASTEXITCODE -ne 0) {
  throw "Torch CUDA nao esta pronto em $venvPython. Instale PyTorch CUDA antes de processar com ProPainter."
}

Write-Host "[3/6] Instalando ProPainter pinado"
& python (Join-Path $root "scripts\install_propainter.py") --root $propainterRoot --weights-dir (Join-Path $propainterRoot "weights")

Write-Host "[4/6] Instalando DiffuEraser pinado"
& python (Join-Path $root "scripts\install_diffueraser.py") --code-only --root $diffueraserRoot

if ($InstallDiffuEraserModels) {
  Write-Host "[5/6] Baixando modelos DiffuEraser; isso pode demorar e ocupar dezenas de GB"
  & $venvPython -m pip install "huggingface-hub==0.23.4"
  & $venvPython (Join-Path $root "scripts\install_diffueraser.py") --models-only --models-root $modelsRoot
} else {
  Write-Host "[5/6] Modelos DiffuEraser pulados. Use -InstallDiffuEraserModels numa GPU maior."
}

$envFile = Join-Path $runtime.FullName "cleaneria-local.env"
@"
PROPAINTER_ROOT=$propainterRoot
PROPAINTER_WEIGHTS_DIR=$(Join-Path $propainterRoot "weights")
PROPAINTER_PYTHON=$venvPython
PROPAINTER_MAX_SIDE=720
PROPAINTER_FP16=1
DIFFUERASER_ROOT=$diffueraserRoot
DIFFUERASER_MODELS_ROOT=$modelsRoot
DIFFUERASER_PYTHON=$venvPython
CLEANER_AUTO_DIFFUERASER=1
"@ | Set-Content -Encoding ASCII $envFile

Write-Host "[6/6] Validando ProPainter"
$env:PROPAINTER_ROOT = $propainterRoot
$env:PROPAINTER_WEIGHTS_DIR = Join-Path $propainterRoot "weights"
$env:PROPAINTER_PYTHON = $venvPython
& python -c "import sys; sys.path.insert(0, 'backend'); from app.engines.propainter_official import propainter_status; print(propainter_status().as_dict())"

Write-Host "[ok] Ambiente salvo em $envFile"
