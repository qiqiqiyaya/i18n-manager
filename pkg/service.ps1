# i18n Manager Windows Service 管理脚本
# 需要管理员权限运行

param(
  [Parameter(Position=0)]
  [ValidateSet("install", "uninstall", "start", "stop", "status")]
  [string]$Action = "status"
)

$serviceName = "i18n-manager"
$appDir = Join-Path $PSScriptRoot "app"
$nodePath = Join-Path $PSScriptRoot "node" "node.exe"
$serverPath = Join-Path $appDir "server.ts"
$asyncFix = Join-Path $appDir "fix-async-storage.cjs"
$tsxPath = Join-Path $appDir "node_modules" "tsx" "dist" "esm" "index.mjs"

switch ($Action) {
  "install" {
    Write-Host "Installing service: $serviceName" -ForegroundColor Yellow
    $binaryPath = '"' + $nodePath + '" --require "' + $asyncFix + '" --import "' + $tsxPath + '" "' + $serverPath + '"'
    New-Service -Name $serviceName -BinaryPathName $binaryPath -DisplayName "i18n Manager" -Description "多语言管理平台服务" -StartupType Automatic
    sc.exe failure $serviceName reset=86400 actions=restart/60000/restart/120000/restart/300000
    Write-Host "Service installed. Starting..." -ForegroundColor Green
    Start-Service -Name $serviceName
    break
  }
  "uninstall" {
    Write-Host "Uninstalling service: $serviceName" -ForegroundColor Yellow
    Stop-Service -Name $serviceName -ErrorAction SilentlyContinue
    sc.exe delete $serviceName
    Write-Host "Service uninstalled" -ForegroundColor Green
    break
  }
  "start" {
    Start-Service -Name $serviceName
    Write-Host "Service started" -ForegroundColor Green
    break
  }
  "stop" {
    Stop-Service -Name $serviceName
    Write-Host "Service stopped" -ForegroundColor Yellow
    break
  }
  "status" {
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($svc) {
      Write-Host "Service: $serviceName - $($svc.Status)" -ForegroundColor Cyan
    } else {
      Write-Host "Service: $serviceName - NOT INSTALLED" -ForegroundColor Red
    }
    break
  }
}