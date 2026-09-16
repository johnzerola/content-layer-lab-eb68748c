param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9.-]+$')]
  [string]$PublicHostname,
  [string]$TaskName = 'VaiViral Bandit GPU Worker',
  [switch]$Remove,
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'

if ($Remove) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarefa removida: $TaskName"
  exit 0
}

$launcher = (Resolve-Path (Join-Path $PSScriptRoot 'start_bandit_gpu_worker_background.ps1')).Path
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`" -PublicHostname `"$PublicHostname`""
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Description 'Inicia o worker Bandit V2 na GPU para o Editor V2.' `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

Write-Host "Inicialização automática instalada: $TaskName"
Write-Host "Host público permitido: $PublicHostname"

if ($StartNow) {
  $listener = Get-NetTCPConnection -LocalPort 8095 -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    Write-Host 'O worker já está ativo na porta 8095; a tarefa assumirá no próximo logon.'
  } else {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host 'Worker iniciado em segundo plano.'
  }
}
