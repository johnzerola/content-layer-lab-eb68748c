param([string]$InstallRoot = 'G:\VaiViral\chatscene-voice', [ValidateSet('cpu','cuda')] [string]$Device = 'cuda')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $InstallRoot 'tmp') | Out-Null
$env:TEMP = Join-Path $InstallRoot 'tmp'
$env:TMP = $env:TEMP
$python = Join-Path $InstallRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python)) {
  py -3.11 -m venv (Join-Path $InstallRoot '.venv')
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 is required.' }
}
& $python -m pip install --use-feature=truststore --no-cache-dir --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'pip setup failed.' }
$index = if ($Device -eq 'cuda') { 'https://download.pytorch.org/whl/cu124' } else { 'https://download.pytorch.org/whl/cpu' }
& $python -m pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url $index
if ($LASTEXITCODE -ne 0) { throw 'PyTorch installation failed.' }
& $python -m pip install --no-cache-dir -r (Join-Path $projectRoot 'backend/chatscene_voice/requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Voice dependencies installation failed.' }
$env:HF_HOME = Join-Path $InstallRoot 'cache'
& $python (Join-Path $projectRoot 'backend/chatscene_voice/download.py') --directory (Join-Path $InstallRoot 'models')
if ($LASTEXITCODE -ne 0) { throw 'Model download failed.' }
& $python -c "from chatterbox.mtl_tts import ChatterboxMultilingualTTS; import torch; print('CUDA available:', torch.cuda.is_available())"
if ($LASTEXITCODE -ne 0) { throw 'Voice runtime import validation failed.' }
$configDirectory = Join-Path $projectRoot 'backend/data/chatscene-voices'
New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
@{ pythonPath = $python; modelPath = (Join-Path $InstallRoot 'models'); storagePath = (Join-Path $InstallRoot 'references'); device = $Device; ready = $true } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $configDirectory 'runtime.json') -Encoding UTF8
Write-Host 'ChatScene voice engine installed. Reload the voice panel.'
