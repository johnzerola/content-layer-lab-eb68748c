$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$venvPath = Join-Path $projectRoot "backend/.venv"
$pythonPath = Join-Path $venvPath "Scripts/python.exe"
$modelPath = Join-Path $projectRoot "backend/models/piper"

if (-not (Test-Path -LiteralPath $pythonPath)) {
  python -m venv $venvPath
}

& $pythonPath -m pip install "piper-tts==1.8.0"
& $pythonPath -m piper.download_voices --data-dir $modelPath pt_BR-faber-medium

Write-Host "Voz Piper/Faber instalada em $modelPath"
