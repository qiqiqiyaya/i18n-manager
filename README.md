# i18n Manager · 多语言管理平台

轻量级、协作式的多语言翻译管理工具。全栈 Next.js 应用，无用户系统，数据全局共享，适合小型团队内部使用。

完整需求与技术约束见 [`i18nManager.md`](./i18nManager.md)；面向开发者的贡献指南见 [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md)；运维与部署见 [`docs/RUNBOOK.md`](./docs/RUNBOOK.md)。

## 技术栈

- **Next.js 16**（App Router）+ **Express 5** 自定义服务器（同时处理 HTTP 与 WebSocket）
- **React 19** + **Ant Design 6** + **@monaco-editor/react**（JSON 代码编辑器）
- **Zustand** 状态管理 · **Socket.IO** 实时协作 · **RxJS** 响应式管道
- **Zod** 校验 · **pino** 日志 · **fs-extra** + **proper-lockfile** 原子文件写入

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 准备环境变量
cp .env.example .env.local

# 3. 完整启动（Express + Socket.IO + Next.js，推荐）
npm run start:server
```

打开 [http://localhost:3000](http://localhost:3000) 查看项目列表页。

> `npm run dev` 仅启动 Next.js 页面开发服务器，不含自定义服务器与 WebSocket 协作；需要实时协作请使用 `npm run start:server`。

<!-- AUTO-GENERATED:scripts -->
## 可用命令

| Command | Description |
|---------|-------------|
| `npm run dev` | 启动 Next.js 开发服务器（仅页面开发，不含 Express/Socket.IO） |
| `npm run build` | 生产构建 |
| `npm run start` | 生产模式启动 Next.js |
| `npm run start:server` | 通过 `tsx` 启动完整服务（Express + Socket.IO + Next.js，推荐） |
| `npm run lint` | 运行 ESLint |
| `npx tsc --noEmit` | TypeScript 类型检查 |
<!-- END AUTO-GENERATED:scripts -->

<!-- AUTO-GENERATED:env -->
## 环境变量

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` | 否 | 自动保存防抖延迟（毫秒），默认 `1000` | `1000` |
| `LOCK_TIMEOUT` | 否 | 键级锁定超时（毫秒），默认 `30000` | `30000` |
| `NEXT_PUBLIC_WS_URL` | 否 | 前端 Socket.IO 连接地址 | `http://localhost:3000` |
| `DATA_DIR` | 否 | 数据持久化根目录，默认 `./data` | `./data` |
| `PORT` | 否 | HTTP/WebSocket 监听端口，默认 `3000` | `3000` |
<!-- END AUTO-GENERATED:env -->

## 数据存储

本地 JSON 文件系统，无外部数据库。运行时自动创建：

```
data/projects/{projectId}/
├── meta.json              # 项目元信息
├── schema.json            # 键结构定义（Record<string, string>，扁平化）
└── locales/
    └── zh-CN.json         # 各语言译文
```

## 更多文档

- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — 开发环境、脚本、测试、提交规范
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — 部署、健康检查、常见问题、回滚
- [`docs/editor-large-data-optimization.md`](./docs/editor-large-data-optimization.md) — 编辑器大数据量优化
- [`i18nManager.md`](./i18nManager.md) — 完整需求与技术约束
