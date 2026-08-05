# i18n Manager 独立打包方案

> **最后更新**：2026-08-06
> **目标**：将应用打包为独立运行包，无需用户安装 Node.js，双击即可启动，支持注册为 Windows Service 实现开机自启。

---

## 1. 方案概述

使用 **Portable Node.js + 启动脚本** 方案：
1. 下载 Node.js 便携版（绿色版 zip）
2. 构建 Next.js 生产版本
3. 与应用文件捆绑
4. 通过 `.bat` / `.ps1` 脚本启动

**优点**：
- ✅ 100% 兼容当前技术栈（Next.js 16 + Express 5 + Socket.IO）
- ✅ 无需修改任何应用代码
- ✅ 双击即可运行，通过浏览器访问
- ✅ 可注册为 Windows Service 实现开机自启
- ✅ 可配合 NSIS/Inno Setup 制作安装程序

---

## 2. 使用方式

### 2.1 快速打包

```bash
# 完整打包（构建 + 下载 Node.js + 打包）
npm run package

# 仅打包（已有构建产物，跳过构建步骤）
npm run package:fast

# 仅打包（跳过 Node.js 下载，需手动放置 node/ 目录）
npm run package:no-dl
```

### 2.2 启动

打包完成后，输出目录为 `pkg/`。

**普通启动**：
```bash
双击 pkg/start.bat
# 或 PowerShell: .\pkg\start.ps1
```

然后打开浏览器访问 [http://localhost:3000](http://localhost:3000)。

**Windows Service（开机自启）**：
```powershell
# 以管理员身份打开 PowerShell，执行：
.\pkg\service.ps1 install    # 安装并启动服务
.\pkg\service.ps1 stop       # 停止服务
.\pkg\service.ps1 start      # 启动服务
.\pkg\service.ps1 status     # 查看服务状态
.\pkg\service.ps1 uninstall  # 卸载服务
```

---

## 3. 打包目录结构

```
pkg/
├── node/                # 便携版 Node.js（自动下载）
├── app/                 # 应用文件
│   ├── .next/           # Next.js 构建产物
│   ├── server.ts        # Express + Socket.IO 服务器
│   ├── fix-async-storage.cjs
│   ├── next.config.ts
│   ├── package.json
│   └── node_modules/    # 生产依赖
├── data/projects/       # 运行时数据（自动创建）
├── start.bat            # 普通启动（双击）
├── start-silent.bat     # 静默启动（无控制台窗口）
├── start.ps1            # PowerShell 启动
├── service.ps1          # Windows Service 管理
└── README.txt           # 使用说明
```

---

## 4. 打包脚本说明

### 4.1 主脚本 `scripts/package.js`

| 步骤 | 说明 |
|------|------|
| 1. 构建 Next.js | 执行 `npm run build` 生成 `.next/` |
| 2. 下载 Node.js | 从 `nodejs.org` 下载指定版本的便携版 zip 并解压 |
| 3. 复制应用文件 | 复制 `.next/`、`server.ts`、`fix-async-storage.cjs` 等 |
| 4. 复制 node_modules | 仅复制生产依赖 |
| 5. 创建启动脚本 | 生成 `.bat`、`.ps1`、`service.ps1` 等 |
| 6. 创建数据目录 | 创建 `data/projects/` 占位 |

### 4.2 命令行参数

```bash
node scripts/package.js [options]

--platform=win-x64     # 目标平台（默认 win-x64）
--no-build             # 跳过 Next.js 构建
--no-download          # 跳过 Node.js 下载（需手动放置）
```

### 4.3 启动脚本

**start.bat**：显示启动信息 → 启动 Node.js 进程 → 打开浏览器 → 等待用户关闭窗口。

**start-silent.bat**：纯启动，无控制台界面，适合 Windows Service 注册。

**start.ps1**：PowerShell 版本，支持 `$process.WaitForExit()` 阻塞等待。

**service.ps1**：Windows Service 管理，使用 PowerShell 内置的 `New-Service` 注册为系统服务，支持 `sc.exe failure` 配置自动重启。

---

## 5. 启动命令详解

实际启动命令等价于：

```bash
node \
  --require ./fix-async-storage.cjs \
  --import node_modules/tsx/dist/esm/index.mjs \
  server.ts
```

环境变量：
- `DATA_DIR` = `pkg/data/`
- `PORT` = `3000`

---

## 6. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `proper-lockfile` 文件锁行为 | 低 | 测试验证即可 |
| `tsx` 运行时性能略低于编译后运行 | 低 | 可额外编译 `server.ts` 为 `.js` 后启动 |
| 分发文件较大（~50MB + Node.js ~40MB） | 中 | 可用 UPX 压缩 Node.js 二进制 |
| Next.js 16 canary 更新引入兼容问题 | 中 | 锁定版本，测试后再更新 |

---

## 7. 后续优化方向

- [ ] **C# 启动器**：编写轻量 `.exe`（~10KB），替代 `.bat`，提供更好的用户体验
- [ ] **Inno Setup / NSIS 安装程序**：制作标准 Windows 安装包
- [ ] **UPX 压缩**：压缩 Node.js 二进制，减少分发体积
- [ ] **编译 server.ts**：使用 `esbuild` 或 `tsc` 预编译 `server.ts` 为 `.js`，减少启动时间
- [ ] **自动更新**：添加版本检查与自动更新机制
- [ ] **托盘图标**：系统托盘图标，方便管理服务状态

---

## 8. 技术细节

### 8.1 Node.js 便携版下载地址

```
https://nodejs.org/dist/v{version}/node-v{version}-{platform}.zip
```

当前配置：`v22.14.0`，`win-x64`

### 8.2 Windows Service 注册原理

使用 PowerShell `New-Service` cmdlet 创建 Windows Service：

```powershell
New-Service -Name "i18n-manager" `
  -BinaryPathName '"path\to\node.exe" --require "path\to\fix-async-storage.cjs" --import "path\to\tsx\index.mjs" "path\to\server.ts"' `
  -DisplayName "i18n Manager" `
  -Description "多语言管理平台服务" `
  -StartupType Automatic
```

配置失败自动重启：
```powershell
sc.exe failure "i18n-manager" reset=86400 actions=restart/60000/restart/120000/restart/300000
```
