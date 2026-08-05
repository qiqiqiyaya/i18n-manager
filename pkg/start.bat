@echo off
title i18n Manager
cd /d "%~dp0app"

set DATA_DIR=%~dp0data
set PORT=3000

echo ========================================
echo    i18n Manager - 多语言管理平台
echo ========================================
echo.
echo 正在启动服务...
echo.

start "" /b "%~dp0node\node.exe" ^
  --require "%~dp0app\fix-async-storage.cjs" ^
  --import "%~dp0app\node_modules\tsx\dist\esm\index.mjs" ^
  "%~dp0app\server.ts"

echo 服务已启动！
echo.
echo 请打开浏览器访问: http://localhost:3000
echo.
echo 按任意键打开浏览器...
pause >nul
start http://localhost:3000
echo.
echo 关闭此窗口不会停止服务。
echo 如需停止服务，请按 Ctrl+C 或关闭命令行窗口。
echo.
pause
