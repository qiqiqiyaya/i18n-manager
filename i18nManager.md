# 多语言管理平台（i18n Manager）需求与技术设计文档

> **版本**：2.3
> **最后更新**：2026-08-09
> **状态**：核心功能已实现，文档与代码同步
> 
> **重要更新**：
> - 键级锁定功能已于 2026-08-09 移除（客户端从未接线的死代码）
> - 并发保护由 Schema 时间戳冲突检测 + proper-lockfile 原子写入承担
> - 数组支持已修复：`flattenObject` 遇到数组时保留原样，不再抛错
> - 添加了测试栈相关信息

---

## 1. 项目概述

### 1.1 背景
本项目旨在为开发团队提供一个轻量级、协作式的多语言翻译管理工具。**不涉及用户系统**，无身份认证、权限控制，所有数据共享，适用于小型团队内部使用。

### 1.2 核心目标
- 管理多个"项目"，每个项目包含一组多语言翻译条目。
- 提供可视化编辑器（多语言编辑器），高效编辑键值对及多语言译文。
- 支持导入/导出、冲突检测与协作提示。

---

## 2. 功能需求与交互流程

### 2.1 项目管理（CRUD）

**字段**：
- `id`：主键（UUID）
- `title`：项目标题（必填）
- `description`：项目描述（可选）

**操作**：
- 创建、编辑、删除、查询项目列表（支持按标题/描述模糊搜索）。

### 2.2 多语言翻译管理

#### 2.2.1 关系说明
- 翻译信息隶属于某个**项目**，通过 `projectId` 关联（弱关联：仅存储ID，不强制外键约束）。
- 一个项目可包含**多个**语言版本（如 en-US、zh-CN、ja-JP 等）。

#### 2.2.2 核心编辑器交互流程

**数据结构定义**：
- 每个项目有一个**主表（Schema）**，定义所有翻译**键（Key）**及其**说明（Description）**。Schema 以**嵌套 JSON 对象**存储（`Record<string, any>`），支持嵌套结构（如 `{ "emp": { "name": "姓名" } }`），叶子节点值为说明字符串，非叶子节点为嵌套对象。
- 每个语言版本（如 en-US）存储为一个独立的翻译文件，其 JSON 结构与 Schema 嵌套结构一致，但叶子节点填写实际译文。

**编辑器布局与操作**：
- 编辑器采用**左右两栏布局**：
  - **左栏**：展示主表 Schema，用户可添加、修改、删除、重命名键，并为每个键填写说明文字。
  - **右栏**：顶部为**语言 Tab 栏**，每个 Tab 对应一个已打开的语言文件；下方展示当前选中语言的完整译文结构，用户可编辑任意节点的译文值。
- Tab 栏右侧的"+"按钮用于打开更多已添加的语言，或添加全新的语言。

**编辑与保存流程**：
- 用户在任意一侧编辑时，系统**自动保存**变更（无需手动点击保存按钮），采用防抖、去重、增量传输策略（详见 6.6.3）。
- 保存通过 Socket.IO 事件（`schema:save`、`locale:save`）直接持久化到磁盘，HTTP PATCH 增量接口作为备用。
- 若用户关闭浏览器或离开页面，系统应提示"有未保存更改，是否保存？"。

**键名唯一性校验**：
- 当用户添加或重命名键时，系统应自动检测该键是否已存在于主表中。若重复，应高亮提示并引导用户跳转至已存在的键位置。

**搜索能力**：
- **编辑器内搜索**：在当前编辑器内容中按键名或说明搜索，自动展开并高亮匹配节点。
- **全局跨语言搜索**：在编辑器顶部提供独立搜索框，支持**按译文内容**在当前项目的所有已添加语言文件中检索，结果以列表形式呈现。

**输入辅助（翻译参考）**：
- 当用户编辑某个键的译文时，系统应弹出浮层（悬浮卡片），显示该键在其他已添加语言中的译文，以及键名和说明，辅助翻译一致性。

#### 2.2.3 导入（仅支持 JSON）
- 用户上传 JSON 文件，系统根据**文件名**自动识别语言标识（如 `zh-CN.json` → 语言为 `zh-CN`）。
- 导入前自动检测冲突：
  - 显示**新增键**（主表中不存在）、**已有键但译文不同**（高亮差异）。
  - 用户确认后，选择合并策略（覆盖、跳过、仅新增）执行导入。
- 导入后自动更新主表及所有语言文件。

#### 2.2.4 导出
- 用户以 checkbox 列表勾选需要导出的语言（支持"全选"）。
- 系统将选中语言的译文文件打包为 ZIP 文件供下载，同时包含 `schema.json`。

### 2.3 协作与并发控制

#### 2.3.1 实时编辑感知
- 系统应实时显示当前编辑同一项目的在线人数（仅数字）。

#### 2.3.2 冲突处理策略
- **采用乐观锁（后发覆盖）策略**：不阻塞用户编辑，任何修改均可保存。若发生覆盖（同一键被两人同时修改），后到达的修改覆盖先到达的（根据时间戳对比）。
- 被覆盖的用户界面应收到"该键已被他人更新"的**无感提示**（2～3秒自动消失），不阻塞用户操作。
- Schema 变更采用**时间戳冲突检测**：客户端发送变更时携带时间戳，服务端比对拒绝过期变更（`schema:rejected`），客户端收到后自动同步到最新已接受的数据。

#### 2.3.3 并发与一致性保障
- **原子写入**：所有文件写入通过 `proper-lockfile` 实现互斥锁，先写临时文件再替换，确保断电或并发安全。
- **Schema 时间戳冲突检测**：服务端维护模块级时间戳，过期变更被拒绝并返回最新已接受数据。

---

## 3. 技术约束、依赖与数据持久化

### 3.1 整体架构
- 全栈一体化：Next.js 16（App Router, canary）+ 自定义 Node.js 服务器（Express 5）统一处理 HTTP 与 WebSocket。
- 前端：React 19（Next.js 16 内置），Ant Design 6 组件库。
- 实时协作：Socket.IO 4（服务端挂载于 Express，客户端使用 socket.io-client）。
- 数据持久化：本地 JSON 文件，无外部数据库，通过原子写入与互斥锁保障一致性。
- 无用户系统：用客户端 IP 区分操作者，数据全局共享。
- 响应式编程：RxJS 7 用于防抖、去重等响应式操作（搜索防抖、编辑器自动保存）。

### 3.2 前端依赖（精确版本）

| 类别             | 选型                      | 版本          | 说明                                                        |
| ---------------- | ------------------------- | ------------- | ----------------------------------------------------------- |
| 核心框架         | **Next.js**               | `16.3.0-preview` | App Router，React Server Components，自定义 `server.ts`     |
| UI 库            | **Ant Design**            | `6.5.0`+      | 最新大版本，配套 `@ant-design/icons` 6.x                    |
| JSON 编辑器      | **@monaco-editor/react**  | `4.7.0`+      | Monaco Editor 的 React 封装，提供高性能代码编辑与 Diff 对比 |
| 状态管理         | **Zustand**               | `5.0.0`+      | 管理协作状态、编辑器脏标记、在线人数、保存状态              |
| HTTP 客户端      | **axios**                 | `1.18.0`+     | 客户端请求 API，拦截器统一处理异常                          |
| WebSocket 客户端 | **socket.io-client**      | `4.8.0`+      | 自动重连、房间与事件绑定                                    |
| 响应式编程       | **RxJS**                  | `7.8.0`+      | 防抖（debounceTime）、去重（distinctUntilChanged）等响应式管道 |
| 文件下载         | **file-saver**            | `2.0.5`       | 触发浏览器下载导出文件                                      |
| CSS 框架         | **Tailwind CSS**          | `4.x`         | 全局样式与工具类                                            |

> **注意**：`react-highlight-words` 在 `package.json` 中存在但实际未使用。搜索高亮功能由 `SearchHighlight.tsx` 组件通过正则分割 + `<mark>` 标签自行实现。

### 3.3 后端依赖

| 类别         | 选型                | 版本      | 说明                         |
| ------------ | ------------------- | --------- | ---------------------------- |
| 运行时       | **Node.js**         | `22 LTS`  | 提供稳定的异步 I/O           |
| 自定义服务器 | **Express**         | `5.2.0`+  | 包装 Next.js，挂载 Socket.IO |
| 实时通信     | **Socket.IO**       | `4.8.0`+  | 房间广播、心跳、实时协作   |
| 文件操作     | **fs-extra**        | `11.3.0`+ | 原子写入 `outputJson` 等     |
| 并发锁       | **proper-lockfile** | `4.1.2`   | 防止文件并发写冲突           |
| 数据校验     | **zod**             | `4.4.0`+  | 验证 API 输入与文件结构      |
| 日志         | **pino**            | `10.3.0`+ | 结构化日志，性能优秀         |
| ZIP 打包     | **archiver**        | `8.0.0`+  | 导出 ZIP 文件打包（v7+ 为 ESM only，使用 `ZipArchive` 命名导入，无 default export） |
| TypeScript 执行 | **tsx**          | `4.22.0`+ | 开发环境直接运行 TypeScript（`server.ts`） |

### 3.4 实时协作约定
- **房间隔离**：客户端连接时在 `query` 中携带 `projectId`，服务端自动加入 `room:project-{projectId}`。
- **消息类型**：
  - `update`：主表或译文变更后广播（除发送者）。
  - `overwritten`：服务端通知被覆盖者。
  - `online_count`：房间人数广播。
  - `schema:updated`：Schema 变更广播（含时间戳冲突检测）。
  - `schema:rejected`：Schema 变更被拒绝（时间戳冲突，返回最新已接受数据）。
  - `schema:save` / `schema:saved`：Schema 持久化保存请求与回执。
  - `locale:save` / `locale:saved`：Locale 持久化保存请求与回执。
  - `locale:synced`：Locale 同步通知（Schema 键变更后广播）。
- **冲突策略**：后发覆盖，被覆盖端无声提示 3 秒；Schema 变更采用时间戳冲突检测，过期变更被拒绝。

### 3.5 项目代码文件结构
```
project-root/
├── server.ts                     # Express 5 + Socket.IO 启动入口
├── fix-async-storage.cjs         # Next.js 16 canary AsyncLocalStorage 兼容修复
├── next.config.ts                # Next.js 配置（reactCompiler: true）
├── package.json
├── .env.local                    # 环境变量
│
├── data/                         # 运行时自动创建，数据根目录
│   └── projects/
│       └── {projectId}/
│           ├── meta.json
│           ├── schema.json
│           └── locales/
│               ├── zh-CN.json
│               └── en-US.json
│
└── src/
    ├── app/                      # Next.js App Router
    │   ├── layout.tsx            # 根布局（Geist 字体，zh-CN lang）
    │   ├── page.tsx              # 首页：项目列表（Client Component，全量缓存 + 本地过滤 + RxJS 搜索防抖 + 关键词高亮）
    │   ├── globals.css           # 全局样式（Tailwind 4）
    │   ├── projects/
    │   │   └── [id]/
    │   │       ├── page.tsx      # 项目编辑器主页面（Client Component）
    │   │       └── layout.tsx    # 项目布局（透传 children）
    │   └── api/                  # 所有 RESTful 接口
    │       └── projects/
    │           ├── route.ts                        # GET/POST  项目列表/创建
    │           └── [id]/
    │               ├── route.ts                    # GET/PUT/DELETE 项目
    │               ├── schema/
    │               │   ├── route.ts                # GET/PUT Schema
    │               │   └── keys/
    │               │       └── route.ts            # PATCH Schema 增量
    │               ├── locales/
    │               │   ├── route.ts                # GET/POST 语言列表/添加
    │               │   └── [lang]/
    │               │       ├── route.ts            # GET/PUT/DELETE 语言文件
    │               │       └── keys/
    │               │           └── route.ts        # PATCH 译文增量
    │               ├── import/
    │               │   └── route.ts                # POST 导入（multipart）
    │               └── export/
    │                   └── route.ts                # POST 导出（ZIP 二进制流）
    │
    ├── components/               # 共享 UI 组件
    │   ├── json-editor/
    │   │   └── MonacoEditor.tsx   # @monaco-editor/react 封装（forwardRef + memo）
    │   ├── project/
    │   │   ├── SchemaEditor.tsx       # 左栏 Schema 编辑器（RxJS 防抖解析 + 重命名检测 + Socket.IO 保存）
    │   │   ├── LocaleEditor.tsx       # 右栏译文编辑器（RxJS 防抖 + 翻译参考浮层）
    │   │   ├── LanguageTabs.tsx       # 语言 Tab 栏（Ant Design Tabs + Dropdown 添加语言）
    │   │   ├── ImportPreviewDialog.tsx # 导入预览对话框（Monaco DiffEditor 差异对比）
    │   │   └── ExportSelectorDialog.tsx # 导出选择对话框（Checkbox + file-saver ZIP 下载）
    │   ├── collaboration/
    │   │   └── OnlineBadge.tsx       # 在线人数徽标（Ant Design Badge + TeamOutlined）
    │   └── common/
    │       └── SearchHighlight.tsx   # 搜索高亮组件（正则分割 + <mark> 标签）
    │
    ├── hooks/                    # 自定义 Hooks
    │   ├── useSocket.ts          # Socket.IO 连接管理（schema:updated/schema:save/locale:save + 保存状态流）
    │   ├── useProjectEditor.ts   # 项目加载 + beforeunload 未保存提示
    │   └── useSearch.ts          # 全局跨语言搜索（遍历 openLocales 匹配译文内容）
    │
    ├── stores/                   # Zustand stores
    │   ├── editorStore.ts        # 编辑状态（schema/openLocales/activeLang/isDirty/saveStatus/saveError + applyLocaleSync/reconcileSchemaInLocales）
    │   └── collaborationStore.ts # 协作状态（onlineCount/overwrittenMessage + setOnlineCount/setOverwrittenMessage/reset）
    │
    ├── lib/                      # 服务端库与工具
    │   ├── data-layer/
    │   │   ├── index.ts           # 统一导出入口
    │   │   ├── io.ts              # 文件 I/O 原语（atomicWriteJson: proper-lockfile → .tmp → rename）
    │   │   ├── projects.ts        # 项目 CRUD（getAllProjects/searchProjects/createProject/updateProject/deleteProject/isProjectExists）
    │   │   ├── schema.ts          # Schema 管理 + 增量更新 + 键变更同步到所有 locale 文件 + Socket.IO 广播
    │   │   ├── locales.ts         # Locale 管理 + 增量更新 + 最后语言保护
    │   │   └── import-export.ts   # 导入预览/执行 + 导出打包（archiver ZIP）
    │   ├── validation.ts         # Zod 校验（projectTitle/lang/schemaObject/importStrategy/exportLanguages）
    │   ├── socket-handler.ts     # WebSocket 服务端处理（schema:updated/schema:save/locale:save/online_count/disconnect 清理）
    │   ├── api-wrapper.ts        # 统一 API 封装（withApiHandler HOF + CustomError）
    │   └── utils.ts              # flattenObject/unflattenObject/setNestedValue/getLeafPaths/createNestedFromPaths/findMissingPaths/emptyTranslationsFromSchema/hasNestedPath/deepClone/deepMergeTemplate
    │
    └── types/                    # 全局 TypeScript 类型
        ├── api.ts                # ApiResponse<T> / ErrorCode 枚举
        ├── project.ts            # ProjectMeta / ProjectCreateInput / ProjectUpdateInput
        ├── schema.ts             # SchemaObject / TranslationObject（均为 Record<string, any>，支持嵌套）
        └── collaboration.ts      # SchemaUpdatedPayload / SchemaSavePayload / LocaleSavePayload / SocketEvent / UpdatePayload / OverwrittenPayload / OnlineCountPayload / SchemaRejectedPayload
```

### 3.6 关键实施说明
- **Monaco Editor 集成**：`MonacoEditor.tsx` 为 `'use client'` 组件，使用 `forwardRef` + `memo` 封装，通过 `dynamic(() => import('@monaco-editor/react'))` 实现 SSR 安全加载。通过 `onMount` 获取编辑器实例，暴露 `getValue`、`setValue`、`focus`、`find`、`formatDocument`、`getEditor`、`getCursorPosition` 等方法。
- **自动保存**：编辑器通过 RxJS `Subject` + `debounceTime` + `distinctUntilChanged` 管道防抖解析，解析成功后通过 Socket.IO 事件（`schema:save`、`locale:save`）持久化到磁盘。保存状态通过 `editorStore.saveStatus` 追踪（`idle`/`dirty`/`saving`/`saved`/`error`），并在编辑器工具栏/状态栏实时显示。
- **原子写入**：`data-layer/io.ts` 使用 `proper-lockfile` 锁定目标文件路径（重试 5 次，50-200ms 间隔），写入临时文件后 `fs.move` 替换，确保断电或并发安全。
- **启动方式**：`node --require ./fix-async-storage.cjs --import tsx server.ts`，其中 `fix-async-storage.cjs` 修复 Next.js 16 canary 对 `globalThis.AsyncLocalStorage` 的检查兼容性。开发环境可用 `npm run dev`（仅 Next.js 开发服务器），生产推荐 `npm run start:server`。
- **空嵌套对象处理**：`flattenObject` 遇到空嵌套对象 `{}` 时保留为叶子节点（值为空字符串 `""`），`deepMergeTemplate` 确保空嵌套对象的译文保持为 `{}` 而非被错误存储为 `""`。

### 3.7 数据存储结构（文本型持久化）
系统运行时自动创建以下目录结构，按项目隔离所有数据：
```
/data/
  projects/
    {projectId}/
      meta.json       // 项目信息（标题、描述、时间戳）
      schema.json     // 主表（嵌套 JSON 对象，键→说明/子对象）
      locales/
        en-US.json    // 各语言译文（嵌套结构，与 schema 一致）
        zh-CN.json
        ...
```
**要求**：
- 读写操作保证**原子性**（先写临时文件再替换，由 `data-layer/io.ts` 统一实现）。
- 服务层处理并发写入（通过 `proper-lockfile` 实现文件锁或互斥锁）。
- 所有文件均采用 UTF-8 编码，JSON 格式需合法且支持嵌套结构。

---

## 4. 附录：典型使用场景
1. 开发人员创建项目 `App_i18n`。
2. 产品经理录入主表键：`login_title`、`login_btn` 及说明。
3. 翻译人员添加语言 `zh-CN`、`en-US`，分别填入译文。
4. 导出时选择两种语言，生成文件交给前端集成。
5. 若多人同时编辑，系统提示冲突，引导导出备份。

---

## 6. AI 编码强制性约束（必读）

本章节为面向 AI 代码生成的**唯一技术权威依据**。所有实现细节以本章为准，第 2 节中的业务描述如有技术歧义，均以本章约束为准。

### 6.1 RESTful API 详细契约（细化版）

#### 6.1.1 统一响应模型（TypeScript 类型定义）

所有接口（除导出接口 `POST /api/projects/[id]/export` 外）必须遵循以下统一响应结构。引入 **泛型** `ApiResponse<T>` 以精确描述 `data` 字段。

```typescript
// src/types/api.ts

/**
 * 统一 API 响应结构
 * @template T data 字段的具体类型
 */
export interface ApiResponse<T = any> {
  /** 业务状态码：0 表示成功，非 0 表示失败（详见错误码枚举） */
  code: number;
  /** 提示信息，成功时为 "ok" 或自定义成功信息，失败时为具体错误描述 */
  message: string;
  /** 实际载荷数据，成功时必填，失败时可能为 null 或省略 */
  data?: T;
  /** 可选字段：服务端时间戳（便于客户端对齐时间） */
  timestamp?: string;
}

/**
 * 业务错误码枚举（code 字段取值）
 */
export enum ErrorCode {
  SUCCESS = 0,
  BAD_REQUEST = 400,      // 参数校验失败
  NOT_FOUND = 404,        // 资源不存在
  CONFLICT = 409,         // 导入冲突（需二次确认）/ 语言已存在 / 最后语言保护
  INTERNAL_ERROR = 500,   // 服务器内部错误
  VALIDATION_ERROR = 422, // Zod 校验未通过
}
```

#### 6.1.2 HTTP 状态码与业务 `code` 的映射规则

| 场景分类               | HTTP 状态码 | 响应体中的 `code` | 说明                                                                            |
| ---------------------- | ----------- | ----------------- | ------------------------------------------------------------------------------- |
| **请求处理成功**       | `200`       | `0`               | 业务执行成功，`data` 字段包含有效数据。                                         |
| **客户端参数错误**     | `400`       | `400`             | 请求体格式错误、必填字段缺失、语言标识格式非法等。                              |
| **资源不存在**         | `404`       | `404`             | 项目 ID 或语言标识在服务端不存在。                                              |
| **导入冲突需二次确认** | `409`       | `409`             | 导入时检测到键冲突，首次请求返回预览，需客户端携带 `confirmed: true` 再次上传。 |
| **数据校验失败**       | `422`       | `422`             | Zod 校验报错（如 `SchemaObject` 不符合格式要求）。                              |
| **服务器内部错误**     | `500`       | `500`             | 文件写入失败、锁获取超时、未知异常等。                                          |

#### 6.1.3 统一封装实现（中间件 / 高阶函数）

在 Next.js App Router 中，使用 **高阶函数（HOF）** 统一封装大部分 Route Handler。

**实现文件：`src/lib/api-wrapper.ts`**

```typescript
// src/lib/api-wrapper.ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiResponse, ErrorCode } from '@/types/api';

export type ApiHandler<T = any> = (
  req: Request,
  context: { params: Record<string, string> }
) => Promise<T>;

export function withApiHandler<T>(
  handler: ApiHandler<T>
): (req: Request, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req, context): Promise<NextResponse> => {
    try {
      // Next.js 16 中 context.params 为 Promise，需 await
      const params = await context.params;
      const data = await handler(req, { params });
      const responseBody: ApiResponse<T> = {
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data,
        timestamp: new Date().toISOString(),
      };
      return NextResponse.json(responseBody, { status: 200 });
    } catch (error) {
      console.error('[API Error]', error);

      if (error instanceof ZodError) {
        const message = `参数校验失败: ${error.message}`;
        return NextResponse.json(
          { code: ErrorCode.VALIDATION_ERROR, message, timestamp: new Date().toISOString() } as ApiResponse,
          { status: 422 }
        );
      }

      if (error instanceof CustomError) {
        return NextResponse.json(
          { code: error.code, message: error.message, timestamp: new Date().toISOString() } as ApiResponse,
          { status: error.httpStatus }
        );
      }

      const message = error instanceof Error ? error.message : '服务器内部错误，请稍后重试';
      return NextResponse.json(
        { code: ErrorCode.INTERNAL_ERROR, message, timestamp: new Date().toISOString() } as ApiResponse,
        { status: 500 }
      );
    }
  };
}

export class CustomError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public httpStatus: number = 400
  ) {
    super(message);
    Object.setPrototypeOf(this, CustomError.prototype);
  }
}
```

**重要说明**：
- 导入接口（`POST /api/projects/[id]/import`）和导出接口（`POST /api/projects/[id]/export`）因 multipart/二进制流需求，**不经过 `withApiHandler`**，手动处理错误。
- Next.js 16 中 `context.params` 为 `Promise<Record<string, string>>`，`withApiHandler` 内部自动 `await` 后传递给 handler。

**使用示例（`src/app/api/projects/[id]/route.ts`）**：

```typescript
import { withApiHandler } from '@/lib/api-wrapper';

export const GET = withApiHandler(async (req, { params }) => {
  const project = await getProjectById(params.id);
  return project;
});
```

#### 6.1.4 完整接口契约（逐条细化）

| 方法   | 路径                                     | 请求参数/体（详细类型）                                                                                                                                                                                                                  | 成功响应 `data` 结构（TypeScript）                                                                                                                                                                                  | 特殊错误码（除 400/404/500 外）                                                                                           |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/projects`                          | **Query**：<br/> - `keyword?: string`（模糊搜索，对 `title` 和 `description` 做 `includes` 匹配）                                                                                                                                        | `{ list: ProjectMeta[] }` <br/> 其中 `ProjectMeta = { id: string; title: string; description?: string; createdAt: string; updatedAt: string }`                                                                      | 无                                                                                                                        |
| POST   | `/api/projects`                          | **Body**：<br/> - `title: string`（必填，1~50 字符） <br/> - `description?: string`（可选，最大 200 字符）                                                                                                                               | `{ id: string; title: string; description?: string; createdAt: string }`                                                                                                                                            | `422`：标题为空或超长                                                                                                     |
| GET    | `/api/projects/[id]`                     | **Params**：`id`（UUID 格式）                                                                                                                                                                                                            | `{ meta: ProjectMeta; schema: SchemaObject; locales: string[] }` <br/> *注：`locales` 为已存在语言标识列表（如 `["en-US", "zh-CN"]`），`schema` 为嵌套 JSON 对象*                                                    | `404`：项目不存在                                                                                                         |
| PUT    | `/api/projects/[id]`                     | **Params**：`id` <br/> **Body**：<br/> - `title?: string` <br/> - `description?: string`                                                                                                                                                 | `{ meta: ProjectMeta }`（更新后的完整 meta）                                                                                                                                                                        | `404`：项目不存在                                                                                                         |
| DELETE | `/api/projects/[id]`                     | **Params**：`id`                                                                                                                                                                                                                         | `{ success: true }`                                                                                                                                                                                                 | `404`：项目不存在                                                                                                         |
| GET    | `/api/projects/[id]/schema`              | **Params**：`id`                                                                                                                                                                                                                         | `{ schema: SchemaObject }` <br/> `SchemaObject` 类型为 `Record<string, any>`（支持嵌套结构，叶子节点为说明字符串）                                                                                                    | `404`：项目或 schema 文件不存在                                                                                           |
| PUT    | `/api/projects/[id]/schema`              | **Params**：`id` <br/> **Body**：<br/> - `schema: SchemaObject`（必须为合法 JSON 对象，支持嵌套结构）                                                                                                                                     | `{ schema: SchemaObject }`（更新后的完整 schema）                                                                                                                                                                   | `422`：schema 格式非法（非对象或数组）<br/> `409`：新 schema 中键路径与现有语言文件合并时发生重名冲突（极罕见）         |
| PATCH  | `/api/projects/[id]/schema/keys`         | **Params**：`id` <br/> **Body**：<br/> - `updates: Record<string, any>`（新增/修改的键值对，空字符串表示删除，嵌套对象保留原样）<br/> - `deletes: string[]`（待删除的键列表）<br/> - `timestamp?: number`（可选，客户端时间戳用于冲突检测） | `{ success: true; affectedKeys: string[] }`                                                                                                                                                                         | `409`：时间戳冲突（Schema 已被其他用户更新）<br/> `422`：键名格式非法                                                   |
| GET    | `/api/projects/[id]/locales`             | **Params**：`id`                                                                                                                                                                                                                         | `{ locales: string[] }`（已添加的语言列表）                                                                                                                                                                         | `404`：项目不存在                                                                                                         |
| POST   | `/api/projects/[id]/locales`             | **Params**：`id` <br/> **Body**：<br/> - `lang: string`（正则 `/^[a-zA-Z0-9_-]+$/`，如 `en-US`，长度 2~20 字符）                                                                                                                         | `{ lang: string; translations: TranslationObject }`（新生成的空译文对象，结构与当前 schema 嵌套结构一致，叶子值为空字符串 `""`）                                                                                      | `409`：该语言已存在 <br/> `422`：语言标识格式非法                                                                         |
| GET    | `/api/projects/[id]/locales/[lang]`      | **Params**：`id`、`lang`                                                                                                                                                                                                                 | `{ lang: string; translations: TranslationObject }` <br/> `TranslationObject` 为 `Record<string, any>`（支持嵌套结构，与 schema 嵌套结构对应）                                                                      | `404`：语言文件不存在                                                                                                     |
| PUT    | `/api/projects/[id]/locales/[lang]`      | **Params**：`id`、`lang` <br/> **Body**：<br/> - `translations: TranslationObject`（必须合法 JSON 对象，系统会合并/补空）                                                                                                                | `{ lang: string; translations: TranslationObject }`（更新后的完整译文）                                                                                                                                             | `404`：语言文件不存在                                                                                                     |
| PATCH  | `/api/projects/[id]/locales/[lang]/keys` | **Params**：`id`、`lang` <br/> **Body**：<br/> - `updates: Record<string, any>`（扁平路径 → 新值，值为 `null` 或 `undefined` 表示删除该路径）<br/> - `deletes: string[]`（待删除的扁平路径列表）                                        | `{ success: true }`                                                                                                                                                                                                 | `404`：语言不存在                                                                                                         |
| DELETE | `/api/projects/[id]/locales/[lang]`      | **Params**：`id`、`lang`                                                                                                                                                                                                                 | `{ success: true }`                                                                                                                                                                                                 | `404`：语言文件不存在 <br/> `409`：若这是最后一个语言，不允许删除（至少保留一个）                                         |
| POST   | `/api/projects/[id]/import`              | **Params**：`id` <br/> **Body**（`multipart/form-data`）：<br/> - `file: File`（仅支持 `.json`）<br/> - `strategy?: 'overwrite' \| 'skip' \| 'merge'`（默认 `merge`）<br/> - `confirmed?: 'true' \| 'false'`（字符串形式，用于二次确认） | **首次请求（无 `confirmed`）**：<br/> `{ preview: { addedKeys: string[]; diffKeys: Array<{ key: string; oldVal: any; newVal: any }> }, lang: string }` <br/> **确认请求（`confirmed: true`）**：<br/> `{ success: true; importedLang: string }` | `409`：检测到冲突，需要二次确认（HTTP 状态码 409）<br/> `422`：文件解析失败或键包含非法字符                                |
| POST   | `/api/projects/[id]/export`              | **Params**：`id` <br/> **Body**：<br/> - `languages: string[]`（必填，至少选一个）                                                                                                                                                       | **不返回 JSON**，直接返回 `application/zip` 流。<br/> 响应头：`Content-Disposition: attachment; filename="project-{id}-locales.zip"`。<br/> ZIP 内文件结构：`schema.json` + `{lang}.json`（每个选中语言一个文件）。 | `400`：未选择任何语言 <br/> `404`：项目不存在 <br/> `500`：打包失败                                                       |

> **统一说明**：所有错误响应均遵循 `ApiResponse` 结构，`data` 字段在错误时省略或为 `null`。导入/导出接口因特殊需求手动处理错误，不经过 `withApiHandler`。

### 6.2 编辑器 UI 布局与交互实现细节

#### 6.2.1 整体布局
主编辑器页面（`/projects/[id]`）采用**左右两栏布局**，两侧均使用 Monaco Editor 作为 JSON 代码编辑器。

- **顶部工具栏**：位于左右两栏上方，包含项目标题、**全局跨语言搜索框**（按译文内容在当前项目的所有语言文件中检索）、在线人数徽标，以及导入/导出操作按钮。
- **左栏（宽度占比 50%）**：
  - 顶部为工具栏（"添加键"按钮 + "格式化"按钮 + 保存状态/JSON 校验指示器）。
  - 下方嵌入 Monaco Editor，展示当前项目的完整 Schema（**格式化的 JSON 对象**，支持嵌套结构）。
  - 用户可直接修改 JSON 文本（增删改键和说明）。
- **右栏（宽度占比 50%）**：
  - 顶部为**语言 Tab 栏**（使用 Ant Design `<Tabs>`），每个 Tab 对应一个已打开的语言文件。
  - Tab 右侧有固定 **"+"按钮**：下拉展示未打开的语言列表，以及"添加新语言"选项。
  - 下方嵌入 Monaco Editor，展示当前选中语言的**完整译文 JSON 对象**（可嵌套）。
  - **空状态**：当项目尚未添加任何语言时，右栏显示占位提示："暂无语言，请点击 '+' 按钮添加"。添加第一个语言后自动打开该 Tab。

#### 6.2.2 Monaco Editor 实例配置（两侧通用）
```typescript
const DEFAULT_OPTIONS = {
  language: 'json',
  theme: 'vs-dark',
  automaticLayout: true,
  formatOnPaste: true,
  formatOnType: false,            // 注意：实际为 false，非 true
  readOnly: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'off',
  lineNumbers: 'on',
  folding: true,
  renderWhitespace: 'selection',
  bracketPairColorization: { enabled: true },
};
```

#### 6.2.3 数据联动与同步
- **Schema 变更**：用户编辑 Schema JSON 后，通过 RxJS `Subject` + `debounceTime` 防抖管道获取新文本，解析为 JSON 对象。
  - 与旧 Schema 对比（扁平化后），计算**新增键**、**删除键**、**重命名键**（基于启发式算法：同前缀不同末段），然后同步应用到所有语言文件（新增键补空字符串，删除键移除对应键值，重命名键采用迁移值策略而非先删后增）。
  - 同步操作通过 Socket.IO 事件（`schema:save`）持久化，并广播 `schema:updated` 事件。
- **译文变更**：用户编辑某个语言 JSON 后，同样通过 RxJS 防抖管道，仅更新该语言文件，通过 Socket.IO 事件（`locale:save`）持久化。
- **Tab 切换**：切换时，编辑器内容会更新为新的语言数据。

#### 6.2.4 冲突处理与视觉提示
- **乐观锁冲突处理**：
  - Schema 变更采用**时间戳冲突检测**：客户端发送 `schema:updated` 事件时携带时间戳，服务端比对拒绝过期变更（`schema:rejected`），客户端收到后自动同步到最新已接受的数据。
  - 被覆盖用户收到 `overwritten` 提示后，界面显示短暂通知"该键已被他人更新"（3 秒自动消失），但不会阻塞其继续操作。

#### 6.2.5 搜索与高亮
- **编辑器内搜索**：调用 Monaco 的 `editor.getAction('actions.find')` 触发查找对话框，支持正则、大小写敏感等标准功能。
- **全局跨语言搜索**（按译文内容）：
  - 在顶部工具栏提供独立搜索输入框，用户输入关键词后，系统**遍历当前项目下的所有已打开语言文件**（`openLocales`），递归匹配译文内容（字符串 `includes` 匹配）。
  - 匹配结果以列表形式展示（包含语言、键路径、译文片段），点击结果项时：
    - 切换到对应语言 Tab；
    - 在编辑器中自动执行 `find` 操作，高亮该译文。
  - 该功能独立于编辑器实例，由 `useSearch` hook 实现。
- **搜索高亮组件**：`SearchHighlight.tsx` 通过正则分割 + `<mark>` 标签实现关键词高亮，不依赖 `react-highlight-words` 库。

#### 6.2.6 译文输入联想（辅助参考）
- **触发时机**：当用户在某语言编辑器中聚焦光标，且系统能推断出当前编辑的键路径时。
- **展现形式**：在编辑器外（紧贴编辑器）显示一个**悬浮卡片**（使用 Ant Design `Popover`），内容包含：
  - **键名**（扁平化路径）
  - **说明**（来自 Schema 中该键的描述）
  - **其他已添加语言中的对应译文**（以列表形式展示，语言标识作为 `Tag` 标签）
- **实现要点**：
  - 通过 Monaco 的 `onDidChangeCursorPosition` 监听光标位置，结合正则匹配推断路径。
  - 为了减少性能开销，使用 RxJS 防抖（与自动保存共享 `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` 延迟）。
  - 若无法推断路径（如光标在 JSON 结构层），则不显示悬浮卡。

### 6.3 嵌套键的扁平化（Flatten）与还原（Unflatten）算法

以下场景需使用扁平化键路径：导入/导出预览、搜索关键词匹配、键重复检测、增量传输中的路径标识。

**扁平化规则**：
- 使用 `.` 作为分隔符，如 `{ "emp": { "name": "姓名" } }` → `{ "emp.name": "姓名" }`。
- 数组类型保留原样：`flattenObject` 和 `import-export.ts` 中的 `flattenForImport` 遇到数组时保留该数组作为叶子值，不展开为点分隔键，不抛错。
- 深度优先遍历，按键名字典序排列。
- **空嵌套对象**：`flattenObject` 遇到空嵌套对象 `{}` 时保留为叶子节点（值为空字符串 `""`），如 `{ "yiku": {} }` → `{ "yiku": "" }`。`deepMergeTemplate` 在还原时确保空嵌套对象的译文保持为 `{}` 而非 `""`。

**还原规则**：
- 将 `{"emp.name":"张三", "emp.age":30}` 还原为 `{"emp":{"name":"张三","age":30}}`。
- 若路径冲突，以最深层级为准并记录警告日志。

**工具函数**（`src/lib/utils.ts`）：
- `flattenObject(obj: Record<string, any>): Record<string, any>` — 扁平化嵌套对象
- `unflattenObject(flat: Record<string, any>): Record<string, any>` — 还原为嵌套对象
- `setNestedValue(obj, path, value)` — 按点分隔路径设置嵌套值
- `getLeafPaths(obj, prefix?)` — 获取所有叶子路径（空嵌套对象也视为叶子）
- `createNestedFromPaths(paths)` — 根据叶子路径数组重建嵌套对象（叶子值设为空字符串）
- `findMissingPaths(oldObj, newObj, prefix?)` — 递归对比找出缺失的叶子路径
- `emptyTranslationsFromSchema(schema)` — 根据 schema 结构生成空翻译对象（递归，嵌套对象保持嵌套）
- `hasNestedPath(obj, path)` — 检测点分隔路径是否在嵌套对象中存在
- `deepClone(obj)` — 深拷贝对象（JSON.parse/JSON.stringify）
- `deepMergeTemplate(target, source)` — 递归深度合并：source（模板）覆盖 target，保留 target 已有值；当 source 有嵌套对象但 target 是基本类型时，用 source 结构覆盖（确保空嵌套对象保持为 `{}` 而非 `""`）

**增量传输中的应用**：
- 在自动保存流程中，前端通过扁平化路径比对计算新旧数据的增量差异，生成 `updates` 和 `deletes` 数据。
- 服务端接收增量数据后，按扁平路径应用到当前数据，再还原为嵌套结构（`unflattenObject`）写入文件。
- 扁平化路径也用于 WebSocket 广播中的 `keyPath` 字段，确保增量变更消息精准定位到变更节点。

### 6.4 WebSocket 连接与实时协作实现

#### 6.4.1 连接流程
无用户系统，通过 Socket.IO 实现实时协作：
1. 前端创建 Socket.IO 客户端时，在 `query` 中携带 `projectId`。
2. 执行 `socket.join(\`room:project-${projectId}\`)`，并广播 `online_count`。

#### 6.4.2 Socket.IO 事件协议

**客户端 → 服务端**：

| 事件 | 载荷 | 说明 |
|------|------|------|
| `update` | `{ projectId, type, lang?, data }` | 通用数据更新广播 |
| `schema:updated` | `SchemaUpdatedPayload` | Schema 变更广播（含时间戳冲突检测） |
| `schema:save` | `SchemaSavePayload` | Schema 持久化到磁盘 |
| `locale:save` | `LocaleSavePayload` | Locale 持久化到磁盘 |

**服务端 → 客户端**：

| 事件 | 载荷 | 说明 |
|------|------|------|
| `update` | `UpdatePayload` | 数据更新通知 |
| `online_count` | `{ count }` | 在线人数变更 |
| `overwritten` | - | ⚠️ 客户端有监听，服务端暂无发送点（预留） |
| `schema:updated` | `SchemaUpdatedPayload` | Schema 变更广播 |
| `schema:rejected` | `{ reason, acceptedTimestamp, acceptedData }` | Schema 变更被拒绝（时间戳冲突） |
| `schema:saved` | `{ success, projectId, error? }` | Schema 保存结果 |
| `locale:saved` | `{ success, projectId, lang, error? }` | Locale 保存结果 |
| `locale:synced` | `{ projectId, addedKeys, removedKeys }` | Locale 同步通知 |

**载荷类型定义**（`src/types/collaboration.ts`）：

```typescript
export interface SchemaUpdatedPayload {
  projectId: string;
  schema: Record<string, any>;
  addedKeys: string[];
  removedKeys: string[];
  renameMap?: Record<string, string>;  // 重命名映射（旧键 → 新键）
  timestamp: number;
  clientId: string;
}

export interface SchemaRejectedPayload {
  reason: 'stale_timestamp';
  acceptedTimestamp: number;
  acceptedData: SchemaUpdatedPayload;
}

export interface SchemaSavePayload {
  projectId: string;
  schema: Record<string, any>;
  addedKeys: string[];
  removedKeys: string[];
}

export interface LocaleSavePayload {
  projectId: string;
  lang: string;
  translations: Record<string, any>;
}

export interface UpdatePayload {
  projectId: string;
  type: 'schema' | 'locale';
  lang?: string;
  data: any;
}

export interface OverwrittenPayload {
  keyPath: string;
  language: string;
  newValue: any;
}

export interface OnlineCountPayload {
  count: number;
}
```

#### 6.4.3 房间与消息广播
- 所有客户端连接时加入 `room:project-{projectId}` 房间。
- 消息类型：
  - `update`：主表或译文变更后广播（除发送者）。
  - `overwritten`：服务端通知被覆盖者（仅发送给被覆盖的客户端）。
  - `online_count`：房间人数变更时广播给所有客户端。
  - `schema:updated`：Schema 变更后广播（除发送者），含时间戳冲突检测。
  - `schema:rejected`：仅发送给被拒绝的客户端。
  - `schema:saved` / `locale:saved`：仅发送给发起保存的客户端。
  - `locale:synced`：广播给房间内所有客户端。

#### 6.4.4 Schema 时间戳冲突检测
- 服务端维护模块级 `globalSchemaTimestamps: Map<string, number>` 和 `globalAcceptedData: Map<string, any>`。
- 客户端发送 `schema:updated` 时携带 `timestamp`，服务端与 `globalSchemaTimestamps` 比对：
  - 若 `timestamp < lastTimestamp`，拒绝并返回 `schema:rejected`（含最新已接受数据）。
  - 若 `timestamp >= lastTimestamp`，接受并广播给房间内其他客户端。
- HTTP PATCH 接口（`/api/projects/[id]/schema/keys`）同样支持可选的 `timestamp` 参数进行冲突检测（`lastSchemaTimestamps` 在 `schema.ts` 模块级维护）。

#### 6.4.5 Socket.IO 持久化保存
- Schema 和 Locale 的保存通过 Socket.IO 事件（`schema:save`、`locale:save`）直接持久化到磁盘，替代 HTTP PATCH 增量接口作为主要保存路径。
- 保存结果通过 `schema:saved` / `locale:saved` 回执返回给发起保存的客户端。
- 客户端 `useSocket` hook 维护 RxJS 保存状态流（`savingStart$` + `saveResult$`），确保 "保存中" 状态至少显示 800ms（避免一闪而过），"已保存" 状态 2s 后自动回到 idle。

### 6.5 编辑器组件职责划分

- **主翻译界面（`/projects/[id]/page.tsx`）**：
  - 左栏 Schema 编辑：**使用 `@monaco-editor/react` 组件**，以 JSON 文本形式展示和编辑。
  - 右栏译文编辑：**同样使用 `@monaco-editor/react`**。
  - 禁止使用 Ant Design Table/Tree 替代。
- **辅助场景（弹窗/模态框）**：
  - 查看原始 JSON：使用相同的 Monaco 组件，设为只读。
  - 导入冲突预览：使用 Monaco Diff Editor 组件（`<DiffEditor />`）并排展示新旧差异。
- **`MonacoEditor` 封装要求**：
  - `'use client'`，使用 `forwardRef` + `memo` 封装，通过 `dynamic(() => import('@monaco-editor/react'))` 实现 SSR 安全加载。
  - 通过 `onMount` 获取编辑器实例，暴露 `getValue`、`setValue`、`focus`、`find`、`formatDocument`、`getEditor`、`getCursorPosition` 等方法。
  - 组件卸载时无需额外清理（React 自动处理）。
  - 粘贴时自动格式化（`onDidPaste` → `editor.action.formatDocument`）。

### 6.6 环境变量、启动初始化、自动保存与 Tab 管理

#### 6.6.1 环境变量
```env
NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE=1000   # 自动保存防抖延迟（毫秒），编辑器 onChange 经 RxJS debounceTime 后触发保存
NEXT_PUBLIC_WS_URL=http://localhost:3000  # 前端 Socket.IO 连接地址
DATA_DIR=./data                       # 数据持久化根目录，项目文件写入 {DATA_DIR}/projects/{projectId}/
# PORT=3000                           # HTTP/WebSocket 监听端口（server.ts 使用，默认 3000）
```

#### 6.6.2 启动初始化（`server.ts`）
1. 检查 `DATA_DIR` 是否存在，若不存在则创建 `data/projects/`。
2. 加载 Express 5 中间件（无路径 `use()` 兜底处理，因 Express 5 path-to-regexp v8 不支持通配符），挂载 Next.js 请求处理器。
3. 创建 HTTP 服务器并绑定 Socket.IO 实例（CORS 允许所有来源）。
4. 设置 Socket.IO 事件处理器（`setupSocketHandlers`），暴露 IO 实例供 data-layer 广播使用（`setIO`，通过 `globalThis` 跨 Next.js 打包边界共享）。
5. 监听端口（默认 `3000`，可通过 `PORT` 环境变量配置）。
6. 项目 ID 使用 `crypto.randomUUID()` 生成。
7. 所有 API 路由须用 try-catch 包裹，异常返回 `{ code: 500, message: error.message }`（实际已由 `withApiHandler` 统一处理，导入/导出接口手动处理）。
8. **启动命令**：`node --require ./fix-async-storage.cjs --import tsx server.ts`，其中 `fix-async-storage.cjs` 通过 `--require` 在启动前注入 `globalThis.AsyncLocalStorage`，修复 Next.js 16 canary 兼容性。

#### 6.6.3 自动保存与脏数据检测

**防抖策略**：
- 用户编辑触发 `onChange` 后，**不立即保存**。系统设置防抖延迟（默认 1000ms，由 `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` 环境变量配置）。
- 在防抖延迟期间，若用户继续编辑，则重置定时器；只有用户停止操作超过延迟时间后，才触发保存流程。
- **使用 RxJS**：`Subject` + `debounceTime` + `distinctUntilChanged` 管道替代手动 `setTimeout`/`clearTimeout`。
- 此策略大幅减少无效请求，避免高频编辑带来的网络和服务端压力。

**重复检测（去重）**：
- 触发保存前，比较当前数据与上次成功保存的数据（通过 `JSON.stringify` 内容哈希比对）。
- 若两者完全一致，则跳过本次保存，不发起任何网络请求。
- 此策略避免因误触发（如光标移动但不涉及内容变更）导致的冗余保存。

**Socket.IO 持久化保存（主要路径）**：
- Schema 保存：编辑器解析成功后，通过 `sendSchemaSave` 发送 `schema:save` 事件，服务端调用 `updateSchema` 直接写入嵌套对象。
- Locale 保存：编辑器解析成功后，通过 `sendLocaleSave` 发送 `locale:save` 事件，服务端调用 `updateLocale` 直接写入嵌套对象。
- 保存回执：服务端通过 `schema:saved` / `locale:saved` 返回结果，客户端更新 `saveStatus`。

**保存状态指示器**：
- `editorStore.saveStatus` 类型为 `'idle' | 'dirty' | 'saving' | 'saved' | 'error'`，`saveError` 存储错误信息。
- Schema 编辑器在右上角工具栏显示保存状态图标（已保存/未保存/保存中/保存失败/JSON 错误）。
- Locale 编辑器在底部状态栏显示保存状态。
- "保存中"状态至少显示 800ms（避免一闪而过），"已保存"状态 2s 后自动回到 idle。

**增量传输（HTTP PATCH 备用路径）**：
- HTTP PATCH 接口（`/api/projects/[id]/schema/keys`、`/api/projects/[id]/locales/[lang]/keys`）作为备用保存路径。
- 保存时，前端计算新旧数据的差异，仅将**变更的部分**发送给服务端。
- **Schema 变更**：发送 `{ updates: Record<string, any>, deletes: string[], timestamp?: number }`。
- **译文变更**：同样基于扁平化路径，发送 `{ updates: Record<string, any>, deletes: string[] }`。
- 服务端接收增量请求后，从磁盘读取当前数据，应用增量变更（新增/更新/删除），原子写入文件。

**浏览器关闭提示**：
- 监听 `beforeunload` 事件，若存在未成功保存的脏数据（`isDirty === true`），弹出"有未保存更改，是否离开？"确认框，防止数据丢失。

#### 6.6.4 多语言 Tab 管理
- **打开**：点击"+"按钮，从下拉列表中选择未打开的语言，新增 Tab 并加载数据。
- **关闭**：点击 Tab 上的 `x`，移除 Tab（不删除文件），**至少保留一个 Tab**。
- **添加新语言**：在"+"下拉菜单底部选择"添加新语言"，弹出 Modal 输入语言标识，调用 API 创建成功后自动打开。

### 6.7 测试与构建

#### 6.7.1 测试栈
项目使用 **Vitest 4** 作为测试框架，配合 **jsdom** 和 **@testing-library/react** 进行前端组件测试，**@vitest/coverage-v8** 生成测试覆盖率报告。

**测试文件**（共 7 个，172 个测试）：
- `src/lib/utils.test.ts` — 工具函数测试
- `src/lib/validation.test.ts` — 验证函数测试
- `src/lib/data-layer/io.test.ts` — 文件 I/O 测试
- `src/stores/editorStore.test.ts` — 编辑器状态管理测试
- `src/stores/collaborationStore.test.ts` — 协作状态管理测试
- `src/hooks/useSearch.test.ts` — 搜索 hook 测试
- `src/components/common/SearchHighlight.test.tsx` — 搜索高亮组件测试

**测试命令**：
```bash
npm test              # 运行所有测试
npm run test:watch    # 监听模式运行测试
npm run test:coverage # 生成测试覆盖率报告
```

#### 6.7.2 构建与打包
项目提供以下打包脚本：
```bash
npm run build         # Next.js 生产构建
npm run package       # 完整打包（含依赖）
npm run package:fast  # 快速打包（不含依赖）
npm run package:no-dl # 打包（不含下载功能）
```

### 6.8 注意事项

1. **JSON 格式化**：编辑器应在保存时自动格式化 JSON（调用 `editor.getAction('editor.action.formatDocument')`），以确保存储的 JSON 美观一致。粘贴时也会自动格式化。
2. **JSON 校验**：若用户输入非法 JSON，应在保存时阻止并给出错误提示（Monaco 编辑器标记红色波浪线 + 工具栏/状态栏错误提示）。
3. **性能优化**：对于大 JSON 文件，Monaco 本身性能优秀，但应避免频繁解析（使用 RxJS 防抖管道，仅在防抖延迟后解析）。
4. **协作冲突处理**：Schema 变更采用时间戳冲突检测（过期变更被拒绝），译文变更采用乐观锁后发覆盖，确保用户操作不被阻塞，同时通过通知提示用户冲突情况。
5. **Schema 重命名检测**：`SchemaEditor` 使用启发式算法检测键重命名（同前缀不同末段），通过 `renameMap` 迁移译文值而非先删后增，避免译文数据丢失。
6. **最后语言保护**：删除语言时，若为项目最后一个语言则返回 409 拒绝删除。
7. **Next.js 16 canary 兼容**：`fix-async-storage.cjs` 通过 `--require` 在启动前注入 `globalThis.AsyncLocalStorage`。
8. **空嵌套对象处理**：`flattenObject` 遇到空嵌套对象 `{}` 时保留为叶子节点（值为空字符串 `""`），`deepMergeTemplate` 确保还原时空嵌套对象保持为 `{}` 而非被错误存储为 `""`。
9. **防抖/节流使用 RxJS**：涉及防抖（debounce）、去重（distinctUntilChanged）等响应式操作，应优先使用 **RxJS** `Observable` 管道处理，而非原生 `setTimeout`/`clearTimeout`。典型场景：编辑器 `onChange` → `Subject` → `pipe(debounceTime(1000), distinctUntilChanged())` → 解析/保存。
10. **Socket.IO 持久化优先**：Schema 和 Locale 的保存通过 Socket.IO 事件（`schema:save`、`locale:save`）直接持久化，HTTP PATCH 增量接口作为备用。
11. **Express 5 路由变更**：Express 5（path-to-regexp v8）不支持通配符路径，`server.ts` 使用无路径 `use()` 作为兜底处理所有非 Socket.IO 请求。
12. **数组支持**：`flattenObject` 和 `import-export.ts` 中的 `flattenForImport` 遇到数组时保留该数组作为叶子值，不展开为点分隔键，不抛错。

---
