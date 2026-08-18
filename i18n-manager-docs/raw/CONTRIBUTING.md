# Contributing Guide

面向 i18n Manager 贡献者的开发指南。本文件的命令表、环境变量表与 API 参考均由源码生成，请勿手动编辑标记区块。

## 开发环境准备

### 前置要求

- **Node.js** >= 20（`@types/node ^20`）
- **npm**（仓库使用 `package-lock.json`）
- 支持 ES2022 的运行环境

### 安装步骤

```bash
git clone <repo-url>
cd i18n-manager
npm install
cp .env.example .env.local   # 按需调整环境变量（所有变量均有默认值，此步可选）
npm run start:server         # 启动完整服务
```

> 注意：`npm run start:server` 实际执行 `node --require ./fix-async-storage.cjs --import tsx server.ts`。`fix-async-storage.cjs` 修复 Next.js 16 canary 对 `globalThis.AsyncLocalStorage` 的检查，不可删除。

<!-- AUTO-GENERATED:scripts -->
## 可用脚本

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

<!-- AUTO-GENERATED:api -->
## API 参考

所有 JSON 接口返回统一响应封装 `ApiResponse<T>`：

```ts
{ code: number; message: string; data?: T; timestamp?: string }
```

业务错误码（`ErrorCode`）与 HTTP 状态码对应关系：

| code | HTTP | 含义 |
|------|------|------|
| `0` | 200 | 成功 |
| `400` | 400 | 参数错误 |
| `404` | 404 | 资源不存在 |
| `409` | 409 | 冲突（导入需确认/语言已存在/最后语言保护） |
| `422` | 422 | 校验失败（Zod） |
| `500` | 500 | 服务器错误 |

### 端点

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/projects` | 项目列表；`?keyword=` 支持模糊搜索 |
| `POST` | `/api/projects` | 创建项目（`title` 1-50 字符，`description` <=200 字符可选） |
| `GET` | `/api/projects/[id]` | 获取单个项目（meta + schema + locales 列表） |
| `PUT` | `/api/projects/[id]` | 更新项目元信息（`title`/`description`） |
| `DELETE` | `/api/projects/[id]` | 删除项目（递归删除目录） |
| `GET` | `/api/projects/[id]/schema` | 获取 Schema（扁平 `Record<string, string>`） |
| `PUT` | `/api/projects/[id]/schema` | 全量更新 Schema（`{ schema: Record<string,string> }`），自动同步键变更到所有语言文件 |
| `PATCH` | `/api/projects/[id]/schema/keys` | 增量更新 Schema（`{ updates, deletes, timestamp? }`，扁平化键），支持时间戳冲突检测 |
| `GET` | `/api/projects/[id]/locales` | 语言列表 |
| `POST` | `/api/projects/[id]/locales` | 添加语言（`{ lang }`，2-20 字符，`[a-zA-Z0-9_-]`），409 若已存在 |
| `GET` | `/api/projects/[id]/locales/[lang]` | 获取语言译文（嵌套 JSON） |
| `PUT` | `/api/projects/[id]/locales/[lang]` | 全量更新译文（`{ translations }`） |
| `DELETE` | `/api/projects/[id]/locales/[lang]` | 删除语言文件，409 若为最后一个语言 |
| `PATCH` | `/api/projects/[id]/locales/[lang]/keys` | 增量更新译文（`{ updates, deletes }`，扁平化路径） |
| `POST` | `/api/projects/[id]/import` | 导入 JSON 文件（multipart：`file`、`strategy`、`confirmed`）。未确认返回 409 预览；`strategy` 属 `overwrite`/`skip`/`merge`（默认 `merge`）。此接口不经过 `withApiHandler`，手动处理错误 |
| `POST` | `/api/projects/[id]/export` | 导出选中语言为 ZIP（`{ languages: string[] }`，至少 1 个），返回 `application/zip` 二进制流。此接口不经过 `withApiHandler` |

> 除导入/导出接口外，所有 JSON 接口均经 `withApiHandler` 封装并返回 `ApiResponse`。

### Socket.IO 事件

除 REST API 外，Schema 和 Locale 的持久化主要通过 Socket.IO 事件完成：

| 事件 | 方向 | 载荷 | 说明 |
|------|------|------|------|
| `schema:save` | 客户端 → 服务端 | `{ projectId, schema, addedKeys, removedKeys }` | Schema 持久化到磁盘 |
| `locale:save` | 客户端 → 服务端 | `{ projectId, lang, translations }` | Locale 持久化到磁盘 |
| `schema:updated` | 双向 | `SchemaUpdatedPayload` | Schema 变更广播（含时间戳冲突检测） |
| `lock` / `unlock` | 双向 | `{ projectId, keyPath, language }` | 键级锁定/解锁 |
| `online_count` | 服务端 → 客户端 | `{ count }` | 在线人数 |
| `overwritten` | 服务端 → 客户端 | - | 被覆盖通知 |
| `locale:synced` | 服务端 → 客户端 | `{ projectId, addedKeys, removedKeys }` | Locale 同步通知 |
<!-- END AUTO-GENERATED:api -->

## 测试

> 当前仓库尚未配置测试运行器。新增测试时请遵循 [.claude/rules/ecc/common/testing.md](../.claude/rules/ecc/common/testing.md)：
> 单元 + 集成 + E2E，最低 80% 覆盖率，采用 TDD（RED -> GREEN -> REFACTOR）与 AAA（Arrange-Act-Assert）结构。

推荐优先测试的模块：
- `src/lib/data-layer/` — 数据层函数（纯逻辑，易 mock fs-extra）
- `src/lib/utils.ts` — flatten/unflatten 工具函数
- `src/lib/validation.ts` — Zod schema 校验
- `src/lib/socket-handler.ts` — Socket.IO 事件处理（mock Socket/Server）

## 代码风格

- 遵循 [.claude/rules/ecc/common/coding-style.md](../.claude/rules/ecc/common/coding-style.md)：不可变数据、KISS/DRY/YAGNI、函数 <50 行、文件 <800 行。
- 防抖/节流/去重等响应式操作使用 **RxJS**，而非原生 `setTimeout`/`clearTimeout`。
- 编辑器必须使用 `@monaco-editor/react`，键级锁定通过 `onDidChangeCursorPosition` + WebSocket 实现，不得使用全局只读。
- 提交前运行 `npm run lint` 与 `npx tsc --noEmit`。

## 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>: <description>

<optional body>
```

类型：`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `ci`

## PR 提交清单

- [ ] `npm run lint` 通过
- [ ] `npx tsc --noEmit` 无类型错误
- [ ] `npm run build` 构建成功
- [ ] 新功能包含测试（目标覆盖率 >=80%）
- [ ] 无硬编码密钥、无 `console.log` 调试语句
- [ ] 分支与目标分支保持同步、无冲突
