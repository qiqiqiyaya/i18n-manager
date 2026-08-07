# CLAUDE.md

This file provides guidance to working with code in this repository.

## Project Overview

多语言管理平台（i18n Manager）—— 一个轻量级、协作式的多语言翻译管理工具。全栈 Next.js 应用，无用户系统，数据全局共享，适合小型团队内部使用。

**当前状态**：核心功能已实现并可运行。服务端 `server.ts` + Express 5/Socket.IO、数据层（原子写入 + 增量更新）、全部 RESTful API 路由、前端编辑器页面（Monaco Editor 双栏布局）、Zustand stores、Socket.IO 实时协作（键级锁定 + Schema/Locale 持久化保存）、导入/导出功能均已完成。`server.ts` 已可启动运行，`data/projects/` 自动创建。完整的需求技术文档在 `i18nManager.md`。

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
```

> `start:server` 实际命令为 `node --require ./fix-async-storage.cjs --import tsx server.ts`，其中 `fix-async-storage.cjs` 修复 Next.js 16 canary 对 `globalThis.AsyncLocalStorage` 的检查兼容性。

## 项目架构（与 i18nManager.md 同步）

实现目标架构的完整描述见 `i18nManager.md`，以下是关键要点：

### 技术栈
- **Next.js 16** (App Router, canary) + **Express 5** 自定义服务器（同时处理 HTTP 和 WebSocket）
- **React 19** + **Ant Design 6** + **@monaco-editor/react**（JSON 代码编辑器）
- **Zustand 5** 状态管理（协作状态、脏标记、在线人数）
- **Socket.IO 4** 实时协作（键级锁定、冲突广播、Schema/Locale 持久化保存）
- **RxJS 7** 响应式编程（防抖、去重 Observable 管道，已用于搜索和编辑器自动保存）
- **Zod 4** 输入校验、**pino** 日志、**fs-extra** + **proper-lockfile** 原子文件写入
- **archiver** ZIP 导出打包、**file-saver** 客户端下载

### 核心架构决策
1. **数据持久化**：本地 JSON 文件系统（`data/projects/{projectId}/`），无外部数据库
2. **无用户系统**：客户端 IP 区分操作者，数据全局共享
3. **编辑器**：两侧均使用 `@monaco-editor/react`（JSON 文本模式），左栏 Schema 编辑 + 右栏译文编辑
4. **实时协作**：Socket.IO 房间隔离（`room:project-{projectId}`），键级锁定（30s 超时自动释放）
5. **自动保存**：防抖触发（`NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE`），内容哈希去重 + 扁平化路径增量传输，`beforeunload` 提示未保存
6. **扁平化**：导入/导出/搜索/WebSocket/增量保存均通过 `flattenObject`/`unflattenObject`（`.` 分隔符）处理
7. **启动模式**：`node server.ts`（Express 包装 Next.js + 挂载 Socket.IO），开发可用 `npm run dev` + `start:server` 分离，生产推荐 `start:server`
8. **Socket.IO 持久化**：Schema 和 Locale 的保存通过 Socket.IO 事件（`schema:save`、`locale:save`）直接持久化到磁盘，替代 HTTP PATCH 增量接口
9. **Schema 冲突检测**：服务端维护模块级时间戳（`lastSchemaTimestamps`），客户端发送变更时携带时间戳，服务端比对拒绝过期变更（`schema:rejected`）

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
│   │   │   ├── MonacoEditor.tsx   # @monaco-editor/react 封装（forwardRef + memo，暴露 getValue/setValue/find/formatDocument/getCursorPosition）
│   │   │   └── JsonEditor.tsx     # 旧版 jsoneditor 封装（已弃用，保留未删除）
│   │   ├── project/
│   │   │   ├── SchemaEditor.tsx       # 左栏 Schema 编辑器（RxJS 防抖解析 + 重命名检测 + Socket.IO 保存）
│   │   │   ├── LocaleEditor.tsx       # 右栏译文编辑器（RxJS 防抖 + 翻译参考浮层 + 锁定提示）
│   │   │   ├── LanguageTabs.tsx       # 语言 Tab 栏（Ant Design Tabs + Dropdown 添加语言）
│   │   │   ├── ImportPreviewDialog.tsx # 导入预览对话框（Monaco DiffEditor 差异对比）
│   │   │   └── ExportSelectorDialog.tsx # 导出选择对话框（Checkbox + file-saver ZIP 下载）
│   │   ├── collaboration/
│   │   │   ├── OnlineBadge.tsx       # 在线人数徽标（Ant Design Badge + TeamOutlined）
│   │   │   └── LockIndicator.tsx     # 锁定指示器（Tag + LockOutlined，读取 collaborationStore）
│   │   └── common/
│   │       └── SearchHighlight.tsx   # 搜索高亮组件（正则分割 + <mark> 标签）
│   │
│   ├── hooks/
│   │   ├── useSocket.ts          # Socket.IO 连接管理（lock/unlock/update/schema:updated/schema:save/locale:save）
│   │   ├── useProjectEditor.ts   # 项目加载 + beforeunload 未保存提示
│   │   └── useSearch.ts          # 全局跨语言搜索（遍历 openLocales 匹配译文内容）
│   ├── stores/
│   │   ├── editorStore.ts        # Zustand 编辑状态（schema/openLocales/activeLang/isDirty + applyLocaleSync 含 renameMap）
│   │   └── collaborationStore.ts # 协作状态（onlineCount/locks/overwrittenMessage + isLockedByOther）
│   ├── lib/
│   │   ├── data-layer/
│   │   │   ├── index.ts           # 统一导出入口
│   │   │   ├── io.ts              # 文件 I/O 原语（atomicWriteJson: proper-lockfile → .tmp → rename）
│   │   │   ├── projects.ts        # 项目 CRUD（getAllProjects/searchProjects/createProject/updateProject/deleteProject/isProjectExists）
│   │   │   ├── schema.ts          # Schema 管理 + 增量更新 + 键变更同步到所有 locale 文件 + Socket.IO 广播
│   │   │   ├── locales.ts         # Locale 管理 + 增量更新 + 最后语言保护
│   │   │   └── import-export.ts   # 导入预览/执行 + 导出打包（archiver ZIP）
│   │   ├── validation.ts         # Zod 校验（projectTitle/lang/schemaObject/importStrategy/exportLanguages）
│   │   ├── socket-handler.ts     # WebSocket 服务端处理（lock/unlock/schema:updated/schema:save/locale:save/online_count/disconnect 清理）
│   │   ├── api-wrapper.ts        # 统一 API 封装（withApiHandler HOF + CustomError）
│   │   └── utils.ts              # flattenObject/unflattenObject/setNestedValue/getLeafPaths/createNestedFromPaths/findMissingPaths/emptyTranslationsFromSchema/hasNestedPath/deepClone
│   └── types/
│       ├── api.ts                # ApiResponse<T> / ErrorCode 枚举
│       ├── project.ts            # ProjectMeta / ProjectCreateInput / ProjectUpdateInput
│       ├── schema.ts             # SchemaObject / TranslationObject
│       ├── collaboration.ts      # LockMessage / SchemaUpdatedPayload / SchemaSavePayload / LocaleSavePayload / SocketEvent / UpdatePayload / OverwrittenPayload / OnlineCountPayload
│       └── jsoneditor.d.ts       # 旧版 jsoneditor 类型声明（已弃用）
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
| `lock` | `{ projectId, keyPath, language }` | 请求键级锁定 |
| `unlock` | `{ projectId, keyPath, language }` | 释放键级锁定 |
| `update` | `{ projectId, type, lang?, data }` | 通用数据更新广播 |
| `schema:updated` | `SchemaUpdatedPayload` | Schema 变更广播（含时间戳冲突检测） |
| `schema:save` | `SchemaSavePayload` | Schema 持久化到磁盘 |
| `locale:save` | `LocaleSavePayload` | Locale 持久化到磁盘 |

**服务端 → 客户端**：
| 事件 | 载荷 | 说明 |
|------|------|------|
| `lock` | `LockMessage` | 广播锁定状态（除发送者） |
| `unlock` | `{ keyPath, language, ip, reason? }` | 广播解锁（超时/断连/主动） |
| `update` | `UpdatePayload` | 数据更新通知 |
| `online_count` | `{ count }` | 在线人数变更 |
| `overwritten` | - | 被覆盖通知 |
| `schema:updated` | `SchemaUpdatedPayload` | Schema 变更广播 |
| `schema:rejected` | `{ reason, acceptedTimestamp, acceptedData }` | Schema 变更被拒绝（时间戳冲突） |
| `schema:saved` | `{ success, projectId, error? }` | Schema 保存结果 |
| `locale:saved` | `{ success, projectId, lang, error? }` | Locale 保存结果 |
| `locale:synced` | `{ projectId, addedKeys, removedKeys }` | Locale 同步通知 |

## 重要设计约束

0. **Ant Design 组件开发**：编写涉及 Ant Design 组件的代码前，阅读 https://ant.design/llms.txt 并理解组件库 API，在编写 Ant Design 代码时使用这些知识。该文档包含全部 74 个组件的完整 API、版本变更和弃用标记（例如 Modal/Drawer 的 `maskClosable` 已弃用，应使用 `mask={{ closable: false }}`，自 6.3.0 起）
1. **编辑器必须使用 `@monaco-editor/react`**，不得用 Ant Design Table/Tree 或旧版 jsoneditor 替代
2. **键级锁定**通过 Monaco Editor 的 `onDidChangeCursorPosition` 回调 + WebSocket 消息实现，不得使用 `setReadOnly(true)` 全局只读
3. **原子写入**：先写临时文件再 `fs.move` 替换，通过 `proper-lockfile` 互斥锁保护（重试 5 次，50-200ms 间隔）
4. **WebSocket 锁超时**：30 秒自动释放，断连时立即清除定时器并广播 `unlock`
5. **数组支持**：`flattenObject` 遇到数组会抛出错误（不支持数组展开为点分隔键）；`import-export.ts` 中的 `flattenForImport` 保留数组值原样
6. **自动保存**：基于防抖（`NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE`）+ 内容哈希去重 + 扁平化路径增量传输，非定时轮询
7. **防抖/节流使用 RxJS**：涉及防抖（debounce）、去重（distinctUntilChanged）等响应式操作，应优先使用 **RxJS** `Observable` 管道处理，而非原生 `setTimeout`/`clearTimeout`。`rxjs` 已包含在 `package.json` 依赖中。典型场景：编辑器 `onChange` → `Subject` → `pipe(debounceTime(1000), distinctUntilChanged())` → 解析/保存
8. **Socket.IO 持久化优先**：Schema 和 Locale 的保存通过 Socket.IO 事件（`schema:save`、`locale:save`）直接持久化，HTTP PATCH 增量接口作为备用
9. **Schema 重命名检测**：`SchemaEditor` 使用启发式算法检测键重命名（同前缀不同末段），通过 `renameMap` 迁移译文值而非先删后增
10. **最后语言保护**：删除语言时，若为项目最后一个语言则返回 409 拒绝删除
11. **Next.js 16 canary 兼容**：`fix-async-storage.cjs` 通过 `--require` 在启动前注入 `globalThis.AsyncLocalStorage`

## 需求文档

完整的需求和技术约束见 `i18nManager.md`，所有实现细节以该文档第 6 节的 AI 编码约束为准。
