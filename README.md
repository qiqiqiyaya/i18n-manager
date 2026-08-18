# i18n Manager · 多语言管理平台

轻量级、协作式的多语言翻译管理工具。全栈 Next.js 应用，无用户系统，数据全局共享，适合小型团队内部使用。

**技术栈**：Next.js 16 (canary) + Express 5 + Socket.IO 4 · React 19 + Ant Design 6 + Monaco Editor · Zustand 5 · RxJS 7 · Zod 4

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

## 功能概览

- **项目管理**：创建、编辑、删除、搜索项目
- **双栏编辑器**：左栏 Schema + 右栏译文，均使用 Monaco Editor
- **多语言 Tab**：添加/切换/关闭语言 Tab，至少保留一个语言
- **实时协作**：Socket.IO 房间隔离，Schema 时间戳冲突检测，在线人数显示
- **自动保存**：RxJS 防抖 + 内容哈希去重 + Socket.IO 持久化
- **导入/导出**：JSON 导入（冲突预览 + Monaco DiffEditor + 合并策略），ZIP 导出
- **翻译参考**：编辑译文时浮层显示其他语言的对应译文与键说明
- **Schema 同步**：键增删/重命名自动同步到所有语言文件

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
| `NEXT_PUBLIC_WS_URL` | 否 | 前端 Socket.IO 连接地址 | `http://localhost:3000` |
| `DATA_DIR` | 否 | 数据持久化根目录，默认 `./data` | `./data` |
| `PORT` | 否 | HTTP/WebSocket 监听端口，默认 `3000` | `3000` |
<!-- END AUTO-GENERATED:env -->

## 数据存储

本地 JSON 文件系统，无外部数据库，运行时自动创建：

```
data/projects/{projectId}/
├── meta.json              # 项目元信息
├── schema.json            # 键结构定义（嵌套 JSON）
└── locales/{lang}.json    # 各语言译文
```

## 文档

项目知识库位于 `i18n-manager-docs/`（`wiki/` 为提炼后的权威参考层，`raw/` 为原始源文档）。从 [`wiki/index.md`](./i18n-manager-docs/wiki/index.md) 开始阅读：

- [`wiki/overview.md`](./i18n-manager-docs/wiki/overview.md) — 平台总览
- [`wiki/architecture/目录结构.md`](./i18n-manager-docs/wiki/architecture/目录结构.md) — 代码结构
- [`wiki/operations/贡献指南.md`](./i18n-manager-docs/wiki/operations/贡献指南.md) — 开发环境、测试、提交规范
- [`wiki/operations/运行与部署.md`](./i18n-manager-docs/wiki/operations/运行与部署.md) — 部署、健康检查、回滚
- [`wiki/operations/打包分发.md`](./i18n-manager-docs/wiki/operations/打包分发.md) — 独立打包方案
- [`wiki/features/大数据优化.md`](./i18n-manager-docs/wiki/features/大数据优化.md) — 编辑器大数据量优化
- [`wiki/sources/源文档索引.md`](./i18n-manager-docs/wiki/sources/源文档索引.md) — 全部原始需求文档清单
- [`CLAUDE.md`](./CLAUDE.md) — AI 代理工作指南
