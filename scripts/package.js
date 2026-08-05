/**
 * i18n Manager 打包脚本
 *
 * 将应用打包为独立运行包（含便携版 Node.js），无需系统安装 Node.js。
 *
 * 用法：
 *   node scripts/package.js              # 打包当前平台（Windows）
 *   node scripts/package.js --platform=win-x64  # 指定目标平台
 *   node scripts/package.js --no-download       # 跳过 Node.js 下载
 */

import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { createWriteStream } from 'fs';
import https from 'https';
import http from 'http';
import { pipeline } from 'stream/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 配置
const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.resolve(ROOT, 'pkg');
const NODE_VERSION = '22.14.0';
const APP_NAME = 'i18n-manager';

// 解析参数
const args = process.argv.slice(2);
const PLATFORM = args.find(a => a.startsWith('--platform='))?.split('=')[1] || 'win-x64';
const SKIP_DOWNLOAD = args.includes('--no-download');
const SKIP_BUILD = args.includes('--no-build');

/**
 * 下载文件
 */
async function downloadFile(url, dest) {
  console.log(`  → 下载 ${path.basename(dest)}...`);
  const protocol = url.startsWith('https') ? https : http;
  await new Promise((resolve, reject) => {
    protocol.get(url, {
      headers: { 'User-Agent': 'i18n-manager-packager/1.0' },
      timeout: 120000
    }, async (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 处理重定向
        console.log(`  → 重定向到 ${res.headers.location}`);
        const redirectUrl = new URL(res.headers.location, url).toString();
        return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: HTTP ${res.statusCode}`));
        return;
      }
      const fileStream = createWriteStream(dest);
      await pipeline(res, fileStream);
      resolve();
    }).on('error', reject);
  });
}

/**
 * 解压 ZIP（使用 Node.js 内置的 zlib + 手动解析，或调用 tar）
 */
async function extractZip(zipPath, destDir) {
  console.log('  → 解压中...');
  // 使用系统自带的 tar 命令（Windows 10/11 内置）
  try {
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'pipe' });
  } catch {
    // fallback: 使用 PowerShell
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: 'pipe' }
    );
  }
  console.log('  → 解压完成');
}

async function main() {
  console.log(`\n=== i18n Manager 打包工具 ===\n`);
  console.log(`平台: ${PLATFORM}`);
  console.log(`输出目录: ${DIST}\n`);

  // 清空输出目录
  await fs.emptyDir(DIST);
  await fs.ensureDir(path.join(DIST, 'app'));

  // Step 1: 构建 Next.js
  if (!SKIP_BUILD) {
    console.log('[1/5] 构建 Next.js...');
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    console.log('');
  } else {
    console.log('[1/5] 跳过构建\n');
  }

  // Step 2: 下载便携版 Node.js
  if (!SKIP_DOWNLOAD) {
    console.log('[2/5] 下载便携版 Node.js...');
    const nodeZipUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${PLATFORM}.zip`;
    const nodeZipPath = path.join(DIST, 'node.zip');
    const nodeDir = path.join(DIST, 'node');

    try {
      await downloadFile(nodeZipUrl, nodeZipPath);
      await extractZip(nodeZipPath, DIST);
      // 解压后目录名类似 node-v22.14.0-win-x64，重命名为 node
      const extractedDir = fs.readdirSync(DIST).find(d => d.startsWith('node-v'));
      if (extractedDir) {
        await fs.move(path.join(DIST, extractedDir), nodeDir, { overwrite: true });
      }
      await fs.remove(nodeZipPath);
      console.log('  → Node.js 便携版就绪\n');
    } catch (err) {
      console.error(`  ⚠ 下载失败: ${err.message}`);
      console.error('  请手动下载 Node.js 便携版放到 pkg/node/ 目录');
      console.error(`  下载地址: ${nodeZipUrl}\n`);
    }
  } else {
    console.log('[2/5] 跳过 Node.js 下载\n');
  }

  // Step 3: 复制应用文件
  console.log('[3/5] 复制应用文件...');
  const appDir = path.join(DIST, 'app');

  // 生产构建产物
  const copyItems = [
    { src: '.next', dest: '.next' },
    { src: 'public', dest: 'public' },
    { src: 'package.json', dest: 'package.json' },
    { src: 'next.config.ts', dest: 'next.config.ts' },
    { src: 'server.ts', dest: 'server.ts' },
    { src: 'fix-async-storage.cjs', dest: 'fix-async-storage.cjs' },
  ];

  for (const item of copyItems) {
    const srcPath = path.join(ROOT, item.src);
    const destPath = path.join(appDir, item.dest);
    if (await fs.pathExists(srcPath)) {
      await fs.copy(srcPath, destPath);
      console.log(`  ✓ ${item.src}`);
    } else {
      console.log(`  ⚠ ${item.src} 不存在，跳过`);
    }
  }

  // 复制 node_modules（仅生产依赖）
  console.log('  → 复制 node_modules（生产依赖）...');
  await fs.ensureDir(path.join(appDir, 'node_modules'));
  const prodDeps = Object.keys(require(path.join(ROOT, 'package.json')).dependencies || {});
  for (const dep of prodDeps) {
    const depPath = path.join(ROOT, 'node_modules', dep);
    const destDepPath = path.join(appDir, 'node_modules', dep);
    if (await fs.pathExists(depPath)) {
      await fs.copy(depPath, destDepPath);
    }
  }
  // 复制 tsx（运行时需要）
  const tsxPath = path.join(ROOT, 'node_modules', 'tsx');
  if (await fs.pathExists(tsxPath)) {
    await fs.copy(tsxPath, path.join(appDir, 'node_modules', 'tsx'));
  }

  console.log('');

  // Step 4: 创建启动脚本
  console.log('[4/5] 创建启动脚本...');

  // 4a. 批处理启动脚本 (start.bat)
  const batContent = `@echo off
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

start "" /b "%~dp0node\\node.exe" ^
  --require "%~dp0app\\fix-async-storage.cjs" ^
  --import "%~dp0app\\node_modules\\tsx\\dist\\esm\\index.mjs" ^
  "%~dp0app\\server.ts"

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
`;

  await fs.writeFile(path.join(DIST, 'start.bat'), batContent, 'utf-8');
  console.log('  ✓ start.bat');

  // 4b. 静默启动脚本 (start-silent.bat - 无控制台窗口，适合 Windows Service)
  const silentBatContent = `@echo off
cd /d "%~dp0app"
set DATA_DIR=%~dp0data
set PORT=3000
start "" /b "%~dp0node\\node.exe" ^
  --require "%~dp0app\\fix-async-storage.cjs" ^
  --import "%~dp0app\\node_modules\\tsx\\dist\\esm\\index.mjs" ^
  "%~dp0app\\server.ts"
exit /b 0
`;

  await fs.writeFile(path.join(DIST, 'start-silent.bat'), silentBatContent, 'utf-8');
  console.log('  ✓ start-silent.bat');

  // 4c. PowerShell 启动脚本 (start.ps1)
  // 注：使用普通双引号避免 smart quote 语法问题
  const psContent = [
    '$ErrorActionPreference = "Stop"',
    '$appDir = Join-Path $PSScriptRoot "app"',
    '$nodePath = Join-Path $PSScriptRoot "node" "node.exe"',
    '$serverPath = Join-Path $appDir "server.ts"',
    '$asyncFix = Join-Path $appDir "fix-async-storage.cjs"',
    '$tsxPath = Join-Path $appDir "node_modules" "tsx" "dist" "esm" "index.mjs"',
    '$dataDir = Join-Path $PSScriptRoot "data"',
    '',
    'Write-Host "=== i18n Manager ===" -ForegroundColor Cyan',
    'Write-Host "Starting server..."',
    '',
    '$env:DATA_DIR = $dataDir',
    '$env:PORT = "3000"',
    '',
    '$process = Start-Process -FilePath $nodePath -ArgumentList @(',
    '  "--require", ("\\"" + $asyncFix + "\\"")',
    '  "--import", ("\\"" + $tsxPath + "\\"")',
    '  ("\\"" + $serverPath + "\\"")',
    ') -NoNewWindow -PassThru',
    '',
    'Write-Host "Server started on http://localhost:3000" -ForegroundColor Green',
    'Write-Host "Press Ctrl+C to stop"',
    '',
    '$process.WaitForExit()',
  ].join('\n');

  await fs.writeFile(path.join(DIST, 'start.ps1'), psContent, 'utf-8');
  console.log('  ✓ start.ps1');

  // 4d. Windows Service 注册脚本
  // 使用数组避免模板字面量中的反引号冲突
  const serviceLines = [
    '# i18n Manager Windows Service 管理脚本',
    '# 需要管理员权限运行',
    '',
    'param(',
    '  [Parameter(Position=0)]',
    '  [ValidateSet("install", "uninstall", "start", "stop", "status")]',
    '  [string]$Action = "status"',
    ')',
    '',
    '$serviceName = "i18n-manager"',
    '$appDir = Join-Path $PSScriptRoot "app"',
    '$nodePath = Join-Path $PSScriptRoot "node" "node.exe"',
    '$serverPath = Join-Path $appDir "server.ts"',
    '$asyncFix = Join-Path $appDir "fix-async-storage.cjs"',
    '$tsxPath = Join-Path $appDir "node_modules" "tsx" "dist" "esm" "index.mjs"',
    '',
    'switch ($Action) {',
    '  "install" {',
    '    Write-Host "Installing service: $serviceName" -ForegroundColor Yellow',
    '    $binaryPath = \'"\' + $nodePath + \'" --require "\' + $asyncFix + \'" --import "\' + $tsxPath + \'" "\' + $serverPath + \'"\'',
    '    New-Service -Name $serviceName -BinaryPathName $binaryPath -DisplayName "i18n Manager" -Description "多语言管理平台服务" -StartupType Automatic',
    '    sc.exe failure $serviceName reset=86400 actions=restart/60000/restart/120000/restart/300000',
    '    Write-Host "Service installed. Starting..." -ForegroundColor Green',
    '    Start-Service -Name $serviceName',
    '    break',
    '  }',
    '  "uninstall" {',
    '    Write-Host "Uninstalling service: $serviceName" -ForegroundColor Yellow',
    '    Stop-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '    sc.exe delete $serviceName',
    '    Write-Host "Service uninstalled" -ForegroundColor Green',
    '    break',
    '  }',
    '  "start" {',
    '    Start-Service -Name $serviceName',
    '    Write-Host "Service started" -ForegroundColor Green',
    '    break',
    '  }',
    '  "stop" {',
    '    Stop-Service -Name $serviceName',
    '    Write-Host "Service stopped" -ForegroundColor Yellow',
    '    break',
    '  }',
    '  "status" {',
    '    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '    if ($svc) {',
    '      Write-Host "Service: $serviceName - $($svc.Status)" -ForegroundColor Cyan',
    '    } else {',
    '      Write-Host "Service: $serviceName - NOT INSTALLED" -ForegroundColor Red',
    '    }',
    '    break',
    '  }',
    '}',
  ];
  const serviceContent = serviceLines.join('\n');

  await fs.writeFile(path.join(DIST, 'service.ps1'), serviceContent, 'utf-8');
  console.log('  ✓ service.ps1');

  // 4e. README.txt
  const readmeContent = `i18n Manager - 多语言管理平台
================================

快速启动：
  双击 start.bat，然后打开浏览器访问 http://localhost:3000

安装为 Windows 服务（开机自启）：
  以管理员身份打开 PowerShell，执行：
    .\\service.ps1 install

  卸载服务：
    .\\service.ps1 uninstall

目录结构：
  node/            便携版 Node.js
  app/             应用文件
    server.ts      Express + Next.js + Socket.IO 服务器
    .next/         Next.js 构建产物
    node_modules/  依赖
  data/            运行时数据（项目文件自动创建）
  start.bat        普通启动
  start.ps1        PowerShell 启动
  service.ps1      Windows Service 管理
`;

  await fs.writeFile(path.join(DIST, 'README.txt'), readmeContent, 'utf-8');
  console.log('  ✓ README.txt');
  console.log('');

  // Step 5: 创建数据目录占位
  console.log('[5/5] 创建数据目录...');
  await fs.ensureDir(path.join(DIST, 'data', 'projects'));
  console.log('  ✓ data/projects/');
  console.log('');

  // 计算打包大小
  console.log('=== 打包完成 ===\n');
  const size = await getDirSize(DIST);
  console.log(`输出目录: ${DIST}`);
  console.log(`总大小: ${(size / 1024 / 1024).toFixed(1)} MB`);
  console.log('');
  console.log('启动方式:');
  console.log('  1. 双击 pkg/start.bat');
  console.log('  2. 打开浏览器访问 http://localhost:3000');
  console.log('');
  console.log('Windows Service:');
  console.log('  PowerShell (管理员): .\\pkg\\service.ps1 install');
}

async function getDirSize(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirSize(fullPath);
    } else {
      total += (await fs.stat(fullPath)).size;
    }
  }
  return total;
}

main().catch(err => {
  console.error('\n打包失败:', err.message);
  process.exit(1);
});
