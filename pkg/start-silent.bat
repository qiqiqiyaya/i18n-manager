@echo off
cd /d "%~dp0app"
set DATA_DIR=%~dp0data
set PORT=3000
start "" /b "%~dp0node\node.exe" ^
  --require "%~dp0app\fix-async-storage.cjs" ^
  --import "%~dp0app\node_modules\tsx\dist\esm\index.mjs" ^
  "%~dp0app\server.ts"
exit /b 0
