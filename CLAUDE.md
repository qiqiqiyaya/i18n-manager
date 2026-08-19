# CLAUDE.md

This file provides guidance to working with code in this repository.

## Project Overview

多语言管理平台（i18n Manager）—— 轻量级、协作式多语言翻译管理工具。全栈 Next.js 16（canary）+ Express 5 + Socket.IO，无用户系统、数据全局共享。核心功能已实现并可运行（`server.ts` 启动，`data/projects/` 自动创建）。完整需求技术文档见下方「知识库：i18n-manager-docs」。

> **待办**：`monaco-editor@0.56.1` 发布后升级并移除 FindWidget 悬停闪烁工作区（`globals.css` 的 `.context-view` 规则等），详见 `i18n-manager-docs/wiki/bugs/FindWidget悬停闪烁.md`。
>
> ⚠️ 但 `find.addExtraSpaceOnTop: false`（`MonacoEditor.DEFAULT_OPTIONS` 与 `ImportPreviewDialog` DiffEditor）是**有意的产品决策**，升级后**必须保留**：它让查找框纯悬浮右上角、不插入顶部 ViewZone（~33px 空白区、内容下移）。0.56.1 的 #5442 修复只解决 containing block 定位（悬停闪烁），与此无关。

## 知识库：i18n-manager-docs

`i18n-manager-docs/` 是本项目的**项目级知识库**（LLM Wiki 模式）：`raw/` 存原始源文档（不可变、只读），`wiki/` 存提炼后的知识（引用参考层）。

- **引用以 `wiki/` 为准**：引用项目知识一律链接 `i18n-manager-docs/wiki/` 下的页面，不要引用 `raw/` 下的原始文件。例：`wiki/architecture/系统架构.md`、`wiki/bugs/FindWidget悬停闪烁.md`
- **`raw/` 只读**：原始文档不可变；知识有出入时修正 `wiki/` 页面
- **`.claudian/` 已 gitignore**：Claudian 本地会话数据，不提交
- **维护时机**：整理/提炼流程仅在用户要求处理 `i18n-manager-docs/raw/` 下原始文档时执行；日常开发中知识库仅作参考

## Commands

```bash
# 开发
npm run dev          # Next.js 开发服务器（不含自定义服务器，仅页面开发）
npm run start:server # 完整启动（Express + Socket.IO + Next.js），推荐使用

# 构建
npm run build        # 生产构建

# 启动生产
npm run start        # 生产模式启动（仅 Next.js，不含 Express/Socket.IO）

# 代码检查
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript 类型检查

# 测试（Vitest + jsdom，无 E2E）
npm test             # 单次运行全部单测
npm run test:watch   # watch 模式
npm run test:coverage # 覆盖率报告（@vitest/coverage-v8）

# 打包分发
npm run package         # 完整打包（含构建 + 下载 Node 运行时）
npm run package:fast    # 跳过构建
npm run package:no-dl   # 跳过运行时下载
```

> `start:server` 实际命令为 `node --require ./fix-async-storage.cjs --import tsx server.ts`，其中 `fix-async-storage.cjs` 修复 Next.js 16 canary 对 `globalThis.AsyncLocalStorage` 的检查兼容性。

## 架构速览

详细架构见知识库 `i18n-manager-docs/wiki/architecture/`：

| 主题 | wiki 页面 |
|------|-----------|
| 系统架构 / 技术栈 | `architecture/系统架构.md` · `architecture/技术栈.md` |
| 目录结构 | `architecture/目录结构.md` |
| RESTful API 契约 | `architecture/RESTful-API.md` |
| Socket.IO 事件协议 | `architecture/Socket.IO-协议.md` |
| 数据层 | `architecture/数据层.md` |
| 关键概念 | `concepts/并发与冲突处理.md` · `concepts/自动保存.md` · `concepts/扁平化算法.md` · `concepts/约束与规范.md` |

代码大致分层：`src/app`（页面 + RESTful API 路由）、`src/components`、`src/hooks`、`src/stores`（Zustand）、`src/lib`（`data-layer/` 数据层 + `socket-handler.ts` + `monaco-edits.ts`）、`src/types`；数据落在 `data/projects/{projectId}/`。

**必须记住的架构事实**：

- 数据持久化在本地 JSON（`meta.json` + `schema.json` + `locales/{lang}.json`），无外部数据库
- **无用户系统**：不做任何身份识别；在线人数 = Socket.IO 房间**连接数**（多 tab 各计一次）
- **无键级锁定**（2026-08-09 移除）：并发保护 = Schema 时间戳冲突检测（`schema:rejected`）+ `proper-lockfile` 原子写入
- **Socket.IO 持久化优先**：Schema/Locale 经 `schema:save`/`locale:save` 直写磁盘，HTTP PATCH 为备用
- **扁平化**：导入/导出/搜索/增量保存均走 `flattenObject`/`unflattenObject`（`.` 分隔符）；数组原样保留为叶子值

## 关键约定（改代码前必读）

0. **Ant Design 组件开发**：先读 https://ant.design/llms.txt（全部组件 API、弃用标记），再动手。例如 `maskClosable` 已弃用，改用 `mask={{ closable: false }}`
1. **Next.js 16 canary：API 不得凭记忆**：涉及 Route Handler、`next.config.ts`、缓存、metadata、Server/Client 边界、Turbopack 等，先查本地随包文档（版本精确对应，优先于在线文档/Context7）：
   ```bash
   grep -ril "<关键字>" node_modules/next/dist/docs/01-app/
   ```
   常用入口：`01-app/01-getting-started/`、`01-app/03-api-reference/`、`01-app/08-turbopack.md`。`mcp__next-devtools__nextjs_docs` 只返回路径，仍需自行 Read
2. **next-devtools MCP 运行时诊断**：dev server 在跑时（端口 3000）优先用 MCP 查真实状态而非读代码猜（`get_errors`/`get_compilation_issues`/`get_routes`）。⚠️ 两个坑：`nextjs_index` 必须显式传 `port: "3000"`（否则误报无 dev server）；`nextjs_call` 的 `args` 参数有 bug，带参工具改用 curl 打 `/_next/mcp`
3. **编辑器必须使用 `@monaco-editor/react`**，不得用 Ant Design Table/Tree 替代
4. **远端译文更新走 `editorStore.setTranslation`**（不置 dirty），**不要用 `updateTranslation`**（会置 dirty → 显示未保存 + 回存循环）；语义对照 `setSchema`
5. **Monaco 更新走最小编辑**：`MonacoEditor.setValue` 内部用 `computeMinimalEdit` + `model.pushEditOperations`，**不要用 `editor.setValue`**（清空 undo/折叠栈）；**不要手动保存/恢复光标**（Monaco 自动调整）
6. **RxJS 防抖/去重**：debounce、distinctUntilChanged 等用 RxJS `Observable` 管道，不用原生 `setTimeout`/`clearTimeout`
7. **原子写入**：所有文件写入经 `proper-lockfile` 互斥 + `.tmp` 替换（`data-layer/io.ts`）
8. **最后语言保护**：删除最后一个语言返回 409 拒绝
9. **光标回调占用**：`onDidChangeCursorPosition` 现被 `LocaleEditor` 翻译参考浮层占用，新增光标类功能需叠加而非替换
10. **Next.js 16 canary 兼容**：`fix-async-storage.cjs` 经 `--require` 注入 `globalThis.AsyncLocalStorage`

## 环境变量

来源：`.env.example`（复制为 `.env.local` 使用）。全部为非敏感配置，无密钥。

| 变量 | 必需 | 说明 | 默认值 |
|------|------|------|--------|
| `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` | 否 | 自动保存防抖延迟（毫秒） | `1000` |
| `NEXT_PUBLIC_WS_URL` | 否 | 前端 Socket.IO 连接地址 | `http://localhost:3000` |
| `DATA_DIR` | 否 | 数据持久化根目录 | `./data` |
| `PORT` | 否 | HTTP/WebSocket 监听端口 | `3000` |

## 需求文档

完整的需求和技术约束见 `i18n-manager-docs/wiki/sources/源文档索引.md`，所有实现细节以 `raw/i18nManager.md` 第 6 节「AI 编码强制性约束」为准。

> ⚠️ `raw/i18nManager.md` 是原始需求文档，描述设计目标而非当前实现（如键级锁定章节与现状不符）；当前实现以本文件及知识库 `wiki/` 层为准。
