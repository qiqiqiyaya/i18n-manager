# CLAUDE.md

This file provides guidance to working with code in this repository.

## Project Overview

多语言管理平台（i18n Manager）—— 一个轻量级、协作式的多语言翻译管理工具。全栈 Next.js 应用，无用户系统，数据全局共享，适合小型团队内部使用。

**当前状态**：核心功能已实现并可运行。服务端 `server.ts` + Express 5/Socket.IO、数据层（原子写入 + 增量更新）、全部 RESTful API 路由、前端编辑器页面（Monaco Editor 双栏布局）、Zustand stores、Socket.IO 实时协作（在线人数 + Schema 时间戳冲突检测 + Schema/Locale 持久化保存）、导入/导出功能均已完成。`server.ts` 已可启动运行，`data/projects/` 自动创建。完整的需求技术文档在 `i18nManager.md`。

> **键级锁定已移除**（2026-08-09）。原实现服务端完整但客户端从未接线（`page.tsx` 未取用 `sendLock`/`sendUnlock`），属于死代码。已删除服务端 `lock`/`unlock` 处理器、客户端收发逻辑、`collaborationStore.locks`、`LockIndicator.tsx`、`LockMessage` 类型、`LOCK_TIMEOUT` 环境变量。**并发保护现由 Schema 时间戳冲突检测（`schema:rejected`）+ 数据层 `proper-lockfile` 原子写入承担**。若将来要重做锁，注意本项目**不做任何身份识别**（见核心架构决策 2），在 localhost 环境下无法区分操作者，难以自测。

> **值变更实时同步已修复**（2026-08-10）。此前修改 key 对应的 value 时其他客户端不更新，根因是"改 value 时 `addedKeys`/`removedKeys` 均为空数组"同时触发三处阻塞：① `SchemaEditor` 广播前有键增删条件门；② 服务端唯一的 `schema:updated` 广播点位于 `syncSchemaChangesToLocales` 末尾，而该函数在无键变更时提前 return；③ `locale:save` → `updateLocale` 完全没有广播代码（译文从来不同步）。修复内容：去掉条件门、新增 `locale:updated` 事件对、`schema:save` 补时间戳 gate、时间戳单调校准、`MonacoEditor.setValue` 改最小编辑保留 undo 栈。详见核心架构决策 9-11。

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

## 项目架构（与 i18nManager.md 同步）

实现目标架构的完整描述见 `i18nManager.md`，以下是关键要点：

### 技术栈
- **Next.js 16** (App Router, canary) + **Express 5** 自定义服务器（同时处理 HTTP 和 WebSocket）
- **React 19** + **Ant Design 6** + **@monaco-editor/react**（JSON 代码编辑器）
- **Zustand 5** 状态管理（协作状态、脏标记、在线人数）
- **Socket.IO 4** 实时协作（在线人数、Schema 时间戳冲突检测、Schema/Locale 持久化保存）
- **RxJS 7** 响应式编程（防抖、去重 Observable 管道，已用于搜索和编辑器自动保存）
- **Zod 4** 输入校验、**pino** 日志、**fs-extra** + **proper-lockfile** 原子文件写入
- **archiver** ZIP 导出打包、**file-saver** 客户端下载
- **Vitest 4** + **jsdom** + **@testing-library/react** 单元测试（8 个测试文件，无 E2E 框架）

### 核心架构决策
1. **数据持久化**：本地 JSON 文件系统（`data/projects/{projectId}/`），无外部数据库
2. **无用户系统**：数据全局共享，**不做任何身份识别**（既不用 IP 也不用 cookie/session）。在线人数按 Socket.IO 房间的 socket 连接数统计（`io.sockets.adapter.rooms.get(roomName).size`），因此同一浏览器开多个 tab 会各计一次，统计的是**连接数而非人数**
3. **编辑器**：两侧均使用 `@monaco-editor/react`（JSON 文本模式），左栏 Schema 编辑 + 右栏译文编辑
4. **实时协作**：Socket.IO 房间隔离（`room:project-{projectId}`）+ 在线人数广播。**无键级锁定**（已移除），并发保护依赖 Schema 时间戳冲突检测 + `proper-lockfile` 原子写入
5. **自动保存**：防抖触发（`NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE`），内容哈希去重 + 扁平化路径增量传输，`beforeunload` 提示未保存
6. **扁平化**：导入/导出/搜索/WebSocket/增量保存均通过 `flattenObject`/`unflattenObject`（`.` 分隔符）处理
7. **启动模式**：`node server.ts`（Express 包装 Next.js + 挂载 Socket.IO），开发可用 `npm run dev` + `start:server` 分离，生产推荐 `start:server`
8. **Socket.IO 持久化**：Schema 和 Locale 的保存通过 Socket.IO 事件（`schema:save`、`locale:save`）直接持久化到磁盘，替代 HTTP PATCH 增量接口
9. **Schema 冲突检测**：服务端维护模块级 Map（`globalSchemaTimestamps` + `globalAcceptedData`，按 `projectId` 索引），客户端发送变更时携带时间戳，服务端比对拒绝过期变更并回传最新已接受数据（`schema:rejected`）。**`schema:updated` 与 `schema:save` 共用同一套检测**——否则会出现"广播被拒但仍写盘"导致磁盘与所有客户端显示不一致
10. **时间戳单调校准**：时间戳仍由客户端 `Date.now()` 产生，但 `useSocket.nextTimestamp()` 会取 `max(Date.now(), lastAccepted + 1)`。客户端收到 `schema:rejected` 时记录服务端已接受的时间戳，使时钟落后的机器在首次被拒后立即追平，不会被永久拒绝
11. **接收端最小编辑**：`MonacoEditor.setValue` 内部走 `computeMinimalEdit`（`src/lib/monaco-edits.ts`）+ `model.pushEditOperations`，**不用 `editor.setValue`**。后者会整体替换 model 缓冲区、清空 undo/redo 栈、重置代码折叠状态——实时协作下别人每改一次值都会清掉本地这些状态。改为最小整行替换后 undo 栈是追加而非清空，且未触及的行保留折叠状态。光标由 Monaco 依编辑范围自动调整，**不要再手动保存/恢复光标位置**（那是为补偿 `setValue` 破坏性而存在的旧代码，已移除；保留会把光标拽回过期位置）

### 实际目录结构

```
project-root/
├── server.ts                  # Express 5 + Socket.IO 启动入口（已实现）
├── fix-async-storage.cjs      # Next.js 16 canary AsyncLocalStorage 兼容修复
├── next.config.ts             # Next.js 配置（reactCompiler: true）
├── package.json
├── .env.local                 # 环境变量
│
├── data/                      # 运行时自动创建
│   └── projects/
│       └── {projectId}/
│           ├── meta.json
│           ├── schema.json
│           └── locales/
│               └── zh-CN.json
│
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── layout.tsx         # 根布局（Geist 字体，zh-CN lang）
│   │   ├── page.tsx           # 首页：项目列表（Client Component，RxJS 搜索防抖）
│   │   ├── globals.css        # 全局样式（Tailwind 4）
│   │   ├── projects/[id]/
│   │   │   ├── page.tsx       # 编辑器主页面（Client Component）
│   │   │   └── layout.tsx     # 项目布局（透传 children）
│   │   └── api/projects/      # 全部 RESTful 接口已实现
│   │       ├── route.ts                        # GET/POST  项目列表/创建
│   │       ├── [id]/route.ts                   # GET/PUT/DELETE 项目
│   │       ├── [id]/schema/route.ts            # GET/PUT Schema
│   │       ├── [id]/schema/keys/route.ts       # PATCH Schema 增量
│   │       ├── [id]/locales/route.ts           # GET/POST 语言列表/添加
│   │       ├── [id]/locales/[lang]/route.ts    # GET/PUT/DELETE 语言文件
│   │       ├── [id]/locales/[lang]/keys/route.ts  # PATCH 译文增量
│   │       ├── [id]/import/route.ts            # POST 导入（multipart，手动错误处理）
│   │       └── [id]/export/route.ts            # POST 导出（ZIP 二进制流，手动错误处理）
│   │
│   ├── components/
│   │   ├── json-editor/
│   │   │   └── MonacoEditor.tsx   # @monaco-editor/react 封装（forwardRef + memo，暴露 getValue/setValue/find/formatDocument/getCursorPosition；setValue 走最小编辑保留 undo 栈）
│   │   ├── project/
│   │   │   ├── SchemaEditor.tsx       # 左栏 Schema 编辑器（RxJS 防抖解析 + 重命名检测 + Socket.IO 保存）
│   │   │   ├── LocaleEditor.tsx       # 右栏译文编辑器（RxJS 防抖 + 翻译参考浮层，光标事件驱动浮层）
│   │   │   ├── LanguageTabs.tsx       # 语言 Tab 栏（Ant Design Tabs + Dropdown 添加语言）
│   │   │   ├── ImportPreviewDialog.tsx # 导入预览对话框（Monaco DiffEditor 差异对比）
│   │   │   └── ExportSelectorDialog.tsx # 导出选择对话框（Checkbox + file-saver ZIP 下载）
│   │   ├── collaboration/
│   │   │   └── OnlineBadge.tsx       # 在线人数徽标（Ant Design Badge + TeamOutlined）
│   │   └── common/
│   │       └── SearchHighlight.tsx   # 搜索高亮组件（正则分割 + <mark> 标签）
│   │
│   ├── hooks/
│   │   ├── useSocket.ts          # Socket.IO 连接管理（update/schema:updated/schema:save/locale:save + 保存状态 RxJS 流）
│   │   ├── useProjectEditor.ts   # 项目加载 + beforeunload 未保存提示
│   │   └── useSearch.ts          # 全局跨语言搜索（遍历 openLocales 匹配译文内容）
│   ├── stores/
│   │   ├── editorStore.ts        # Zustand 编辑状态（schema/openLocales/activeLang/isDirty + applyLocaleSync 含 renameMap + setTranslation 远端更新不置 dirty）
│   │   └── collaborationStore.ts # 协作状态（onlineCount / overwrittenMessage / reset）
│   ├── lib/
│   │   ├── data-layer/
│   │   │   ├── index.ts           # 统一导出入口
│   │   │   ├── io.ts              # 文件 I/O 原语（atomicWriteJson: proper-lockfile → .tmp → rename）
│   │   │   ├── projects.ts        # 项目 CRUD（getAllProjects/searchProjects/createProject/updateProject/deleteProject/isProjectExists）
│   │   │   ├── schema.ts          # Schema 管理 + 增量更新 + 键变更同步到所有 locale 文件 + Socket.IO 广播
│   │   │   ├── locales.ts         # Locale 管理 + 增量更新 + 最后语言保护
│   │   │   └── import-export.ts   # 导入预览/执行 + 导出打包（archiver ZIP）
│   │   ├── validation.ts         # Zod 校验（projectTitle/lang/schemaObject/importStrategy/exportLanguages）
│   │   ├── socket-handler.ts     # WebSocket 服务端处理（schema:updated/schema:save 含时间戳 gate/locale:updated/locale:save/update/online_count/disconnect）
│   │   ├── monaco-edits.ts       # computeMinimalEdit 纯函数（行级前后缀裁剪，供 MonacoEditor.setValue 保留 undo 栈）
│   │   ├── api-wrapper.ts        # 统一 API 封装（withApiHandler HOF + CustomError）
│   │   └── utils.ts              # flattenObject/unflattenObject/setNestedValue/getLeafPaths/createNestedFromPaths/findMissingPaths/emptyTranslationsFromSchema/hasNestedPath/deepClone
│   └── types/
│       ├── api.ts                # ApiResponse<T> / ErrorCode 枚举
│       ├── project.ts            # ProjectMeta / ProjectCreateInput / ProjectUpdateInput
│       ├── schema.ts             # SchemaObject / TranslationObject
│       └── collaboration.ts      # SchemaUpdatedPayload / SchemaRejectedPayload / SchemaSavePayload / LocaleUpdatedPayload / LocaleSavePayload / SocketEvent / UpdatePayload / OverwrittenPayload / OnlineCountPayload
```

### 关键 API 约定
- 统一响应格式：`ApiResponse<T> = { code, message, data?, timestamp? }`
- 统一封装：`withApiHandler` HOF 包裹大部分 Route Handler（导入/导出接口因二进制流/ multipart 需求手动处理错误）
- HTTP 状态码 + 业务 code：200/0（成功），400/400（参数错误），404/404（资源不存在），409/409（导入冲突/语言已存在/最后语言保护），422/422（校验失败），500/500（服务器错误）
- 导出接口返回 `application/zip` 二进制流，不经过 `withApiHandler`
- 导入接口使用 `multipart/form-data`，手动处理错误（不经过 `withApiHandler`）

### Socket.IO 事件协议

**客户端 → 服务端**：
| 事件 | 载荷 | 说明 |
|------|------|------|
| `update` | `{ projectId, type, lang?, data }` | 通用数据更新广播。⚠️ `sendUpdate` 从未被 `page.tsx` 取用，是死代码 |
| `schema:updated` | `SchemaUpdatedPayload` | Schema 变更广播（含时间戳冲突检测）。**无条件发送**，改 value 时 addedKeys/removedKeys 为空数组也要发 |
| `schema:save` | `SchemaSavePayload` | Schema 持久化到磁盘（携带 `timestamp`，与 `schema:updated` 共用冲突检测） |
| `locale:updated` | `LocaleUpdatedPayload` | 译文变更广播（last-write-wins，不做拒绝） |
| `locale:save` | `LocaleSavePayload` | Locale 持久化到磁盘 |

**服务端 → 客户端**：
| 事件 | 载荷 | 说明 |
|------|------|------|
| `update` | `UpdatePayload` | 数据更新通知 |
| `online_count` | `{ count }` | 在线人数变更（connect/disconnect 时广播） |
| `schema:updated` | `SchemaUpdatedPayload` | Schema 变更广播 |
| `schema:rejected` | `{ reason, acceptedTimestamp, acceptedData }` | Schema 变更被拒绝（时间戳冲突）。客户端据此同步到最新版本并校准时间戳基准 |
| `schema:saved` | `{ success, projectId, error? }` | Schema 保存结果。被拒时也必须发（`success: false`），否则客户端 `saveStatus` 永久卡在 `'saving'` |
| `locale:updated` | `LocaleUpdatedPayload` | 译文变更广播（转发自其他客户端，用 `socket.to` 排除发起方） |
| `locale:saved` | `{ success, projectId, lang, error? }` | Locale 保存结果 |
| `locale:synced` | `{ projectId, addedKeys, removedKeys }` | Locale 同步通知 |
| `overwritten` | - | ⚠️ 客户端有监听，服务端暂无发送点（预留） |

> 键级锁定的 `lock`/`unlock` 事件已于 2026-08-09 移除，不再是协议的一部分。
>
> **接收端处理约定**：远端译文更新走 `editorStore.setTranslation`（不置 dirty），**不要用 `updateTranslation`**（会设 `isDirty: true`，导致收到别人的改动却显示"未保存"，还可能触发回存循环）。语义对照 `setSchema`。


## 重要设计约束

0. **Ant Design 组件开发**：编写涉及 Ant Design 组件的代码前，阅读 https://ant.design/llms.txt 并理解组件库 API，在编写 Ant Design 代码时使用这些知识。该文档包含全部 74 个组件的完整 API、版本变更和弃用标记（例如 Modal/Drawer 的 `maskClosable` 已弃用，应使用 `mask={{ closable: false }}`，自 6.3.0 起）

0.1 **Next.js API 必须查本地随包文档，不得凭记忆**：本项目使用 **Next.js 16 canary**（当前 `16.3.0-preview.10`），API 与训练数据中的 13/14/15 差异很大。编写或修改任何涉及 Next.js API 的代码前（Route Handler、`next.config.ts`、缓存/`revalidate`、`metadata`、Server/Client Component 边界、`proxy`、Turbopack 配置等），**先检索 `node_modules/next/dist/docs/`**——Next.js 16+ 把完整文档随包发布，版本与 `package.json` 里装的那个精确对应，不会过时。

   ```bash
   # 按关键字定位（441 个 md 文件，镜像 nextjs.org/docs 结构）
   grep -ril "<关键字>" node_modules/next/dist/docs/01-app/
   ```

   常用入口：
   - `01-app/01-getting-started/` —— 15-route-handlers / 08-caching / 06-fetching-data / 09-revalidating / 05-server-and-client-components
   - `01-app/03-api-reference/05-config/01-next-config-js/` —— `next.config.ts` 全部选项
   - `01-app/03-api-reference/04-functions/` · `03-file-conventions/` · `02-components/`
   - `01-app/08-turbopack.md`

   > `mcp__next-devtools__nextjs_docs` 只返回文档路径，不返回内容；拿到路径后仍需用 Read/Grep 自己读。**优先级高于任何在线 Next.js 文档和 Context7**——在线文档对应 stable 版，与本项目 canary 不一致。

0.2 **next-devtools MCP 运行时诊断**：dev server 在跑时（`npm run start:server`，端口 3000），优先用 MCP 查运行时真实状态，而不是靠读代码猜。适用场景：编译报错、路由是否注册、运行时异常、慢渲染排查。

   | 工具 | 用途 |
   |------|------|
   | `get_errors` | 配置错误 + 浏览器运行时错误 + 构建错误（带 source-map 栈） |
   | `get_compilation_issues` | 全路由模块图编译问题，**无需浏览器会话** |
   | `get_routes` | 文件系统扫描出的全部路由入口 |
   | `get_logs` | 返回 dev 日志文件路径（再自行 Read） |
   | `get_page_metadata` / `get_request_insights` | 页面渲染贡献者 / 请求时间线（后者需 `experimental.requestInsights`） |

   已实测的两个坑（2026-08-10 验证）：
   - **`nextjs_index` 必须显式传 `port: "3000"`**。不传时自动发现在本机失败，会误报 "No running Next.js dev servers"——但服务其实是好的，别据此判断服务没起。
   - **`nextjs_call` 的 `args` 参数当前有 bug**，schema 声明 `string` 而描述要求 object，带参工具（`get_routes` 的 `routerType` 过滤、`compile_route`、`get_server_action_by_id`）调不通。**绕法：直接 curl 打 MCP endpoint**，该路径参数传递正常：
     ```bash
     curl -s -X POST -H 'Content-Type: application/json' \
       -H 'Accept: application/json, text/event-stream' \
       -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"compile_route","arguments":{"routeSpecifier":"/projects/[id]"}}}' \
       http://localhost:3000/_next/mcp
     ```
   - 自定义 Express server（`start:server`）**不影响** `/_next/mcp` 挂载，MCP 照常可用。
1. **编辑器必须使用 `@monaco-editor/react`**，不得用 Ant Design Table/Tree 替代
2. **无键级锁定**：已于 2026-08-09 移除（详见 Project Overview）。若将来重做，须通过 Monaco 的 `onDidChangeCursorPosition` + WebSocket 实现，不得用 `setReadOnly(true)` 全局只读；注意该回调现已被 `LocaleEditor` 的翻译参考浮层占用，需叠加而非替换
3. **原子写入**：先写临时文件再 `fs.move` 替换，通过 `proper-lockfile` 互斥锁保护（重试 5 次，50-200ms 间隔）—— 这是当前并发安全的主要保障
4. **并发冲突处理**：依靠 Schema 时间戳比对（服务端 `globalSchemaTimestamps`）拒绝过期变更 + 客户端收到 `schema:rejected` 后自动同步到最新版本，而非悲观锁
5. **数组支持**：`flattenObject` 遇到数组时**原样保留该数组作为叶子值**（不展开为点分隔键，不抛错，见 commit `7e4e619`）；`import-export.ts` 中的 `flattenForImport` 同样保留数组值原样
6. **自动保存**：基于防抖（`NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE`）+ 内容哈希去重 + 扁平化路径增量传输，非定时轮询
7. **防抖/节流使用 RxJS**：涉及防抖（debounce）、去重（distinctUntilChanged）等响应式操作，应优先使用 **RxJS** `Observable` 管道处理，而非原生 `setTimeout`/`clearTimeout`。`rxjs` 已包含在 `package.json` 依赖中。典型场景：编辑器 `onChange` → `Subject` → `pipe(debounceTime(1000), distinctUntilChanged())` → 解析/保存
8. **Socket.IO 持久化优先**：Schema 和 Locale 的保存通过 Socket.IO 事件（`schema:save`、`locale:save`）直接持久化，HTTP PATCH 增量接口作为备用
9. **Schema 重命名检测**：`SchemaEditor` 使用启发式算法检测键重命名（同前缀不同末段），通过 `renameMap` 迁移译文值而非先删后增
10. **最后语言保护**：删除语言时，若为项目最后一个语言则返回 409 拒绝删除
11. **Next.js 16 canary 兼容**：`fix-async-storage.cjs` 通过 `--require` 在启动前注入 `globalThis.AsyncLocalStorage`

## 环境变量

来源：`.env.example`（复制为 `.env.local` 使用）。全部为非敏感配置，无密钥。

| 变量 | 必需 | 说明 | 默认值 |
|------|------|------|--------|
| `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` | 否 | 自动保存防抖延迟（毫秒），编辑器 `onChange` 经 RxJS `debounceTime` 后触发 | `1000` |
| `NEXT_PUBLIC_WS_URL` | 否 | 前端 Socket.IO 连接地址 | `http://localhost:3000` |
| `DATA_DIR` | 否 | 数据持久化根目录，项目写入 `{DATA_DIR}/projects/{projectId}/` | `./data` |
| `PORT` | 否 | HTTP/WebSocket 监听端口（`server.ts` 使用） | `3000` |

## 需求文档

完整的需求和技术约束见 `i18nManager.md`，所有实现细节以该文档第 6 节的 AI 编码约束为准。

> ⚠️ `i18nManager.md` 是**原始需求文档**，描述的是设计目标而非当前实现。其中关于键级锁定的章节与代码现状不符（锁已实现但未接线），以本文件为准。
