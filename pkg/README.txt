i18n Manager - 多语言管理平台
================================

快速启动：
  双击 start.bat，然后打开浏览器访问 http://localhost:3000

安装为 Windows 服务（开机自启）：
  以管理员身份打开 PowerShell，执行：
    .\service.ps1 install

  卸载服务：
    .\service.ps1 uninstall

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
