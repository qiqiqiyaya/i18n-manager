# i18n Manager · 多语言管理平台

轻量级、协作式的多语言翻译管理工具。全栈 Next.js 应用，无用户系统，数据全局共享，适合小型团队内部使用。

完整需求与技术约束见 [`i18nManager.md`](./i18nManager.md)；面向开发者的贡献指南见 [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md)；运维与部署见 [`docs/RUNBOOK.md`](./docs/RUNBOOK.md)。

## 技术栈

- **Next.js 16**（App Router, canary）+ **Express 5** 自定义服务器（同时处理 HTTP 与 WebSocket）
- **React 19** + **Ant Design 6** + **@monaco-editor/react**（JSON 代码编辑器）
- **Zustand 5** 状态管理 · **Socket.IO 4** 实时协作 · **RxJS 7** 响应式管道
- **Zod 4** 校验 · **pino** 日志 · **fs-extra** + **proper-lockfile** 原子文件写入
- **archiver** ZIP 导出 · **file-saver** 客户端下载

## 功能概览

- **项目管理**：创建、编辑、删除、搜索项目
- **双栏编辑器**：左栏 Schema（扁平键值对）+ 右栏译文（嵌套 JSON），均使用 Monaco Editor
- **多语言 Tab**：支持添加/切换/关闭语言 Tab，至少保留一个语言
- **实时协作**：Socket.IO 房间隔离，键级锁定（30s 超时），在线人数显示
- **自动保存**：RxJS 防抖 + 内容哈希去重 + Socket.IO 持久化
- **导入/导出**：JSON 文件导入（冲突预览 + Monaco DiffEditor 对比 + 三种合并策略），ZIP 导出
- **翻译参考**：编辑译文时浮层显示其他语言的对应译文和键说明
- **Schema 同步**：键增删/重命名自动同步到所有语言文件

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 准备环境变量（可选，已有默认值）
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
| `npm run start` | 生产模式启动 Next.js（不含 Express/Socket.IO） |
| `npm run start:server` | 完整启动（Express + Socket.IO + Next.js，含 AsyncLocalStorage 兼容修复，推荐） |
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
├── meta.json              # 项目元信息（id, title, description, createdAt, updatedAt）
├── schema.json            # 键结构定义（Record<string, string>，扁平化）
└── locales/
    ├── zh-CN.json         # 各语言译文（嵌套 JSON）
    └── en-US.json
```

## 项目结构

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 首页：项目列表
│   ├── projects/[id]/page.tsx  # 编辑器主页面
│   └── api/projects/           # RESTful API（9 个路由文件）
├── components/
│   ├── json-editor/            # MonacoEditor 封装
│   ├── project/                # SchemaEditor, LocaleEditor, LanguageTabs, Import/Export 对话框
│   ├── collaboration/          # OnlineBadge, LockIndicator
│   └── common/                 # SearchHighlight
├── hooks/                      # useSocket, useProjectEditor, useSearch
├── stores/                     # editorStore (Zustand), collaborationStore (Zustand)
├── lib/
│   ├── data-layer/             # io.ts, projects.ts, schema.ts, locales.ts, import-export.ts
│   ├── validation.ts           # Zod schemas
│   ├── socket-handler.ts       # Socket.IO 服务端事件处理
│   ├── api-wrapper.ts          # withApiHandler HOF + CustomError
│   └── utils.ts                # flatten/unflatten + 嵌套路径工具
└── types/                      # api.ts, project.ts, schema.ts, collaboration.ts
```

## 更多文档

- [`CLAUDE.md`](./CLAUDE.md) — AI 代理工作指南（架构、约束、Socket.IO 事件协议）
- [`AGENTS.md`](./AGENTS.md) — 各代理的项目特定指导
- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — 开发环境、脚本、测试、提交规范
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — 部署、健康检查、常见问题、回滚
- [`docs/CODEMAPS/`](./docs/CODEMAPS/) — 架构、前端、后端、数据、依赖 codemap
- [`docs/editor-large-data-optimization.md`](./docs/editor-large-data-optimization.md) — 编辑器大数据量优化（历史文档，已迁移至 Monaco Editor）
- [`i18nManager.md`](./i18nManager.md) — 完整需求与技术约束
