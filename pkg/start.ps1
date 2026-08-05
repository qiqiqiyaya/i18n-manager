$ErrorActionPreference = "Stop"
$appDir = Join-Path $PSScriptRoot "app"
$nodePath = Join-Path $PSScriptRoot "node" "node.exe"
$serverPath = Join-Path $appDir "server.ts"
$asyncFix = Join-Path $appDir "fix-async-storage.cjs"
$tsxPath = Join-Path $appDir "node_modules" "tsx" "dist" "esm" "index.mjs"
$dataDir = Join-Path $PSScriptRoot "data"

Write-Host "=== i18n Manager ===" -ForegroundColor Cyan
Write-Host "Starting server..."

$env:DATA_DIR = $dataDir
$env:PORT = "3000"

$process = Start-Process -FilePath $nodePath -ArgumentList @(
  "--require", ("\"" + $asyncFix + "\"")
  "--import", ("\"" + $tsxPath + "\"")
  ("\"" + $serverPath + "\"")
) -NoNewWindow -PassThru

Write-Host "Server started on http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop"

$process.WaitForExit()