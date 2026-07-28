# 多语言管理平台（i18n Manager）需求与技术设计文档

> **版本**：2.0  
> **最后更新**：2026-07-02  
> **状态**：已定稿，可供开发实施 

---

## 1. 项目概述

### 1.1 背景
本项目旨在为开发团队提供一个轻量级、协作式的多语言翻译管理工具。**不涉及用户系统**，无身份认证、权限控制，所有数据共享，适用于小型团队内部使用。

### 1.2 核心目标
- 管理多个“项目”，每个项目包含一组多语言翻译条目。
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
- 每个项目有一个**主表（Schema）**，定义所有翻译**键（Key）**及其**说明（Description）**。主表以扁平化的 `Record<string, string>` 存储（键→说明），译文则存储为JSON结构且支持JSON嵌套。
- 每个语言版本（如 en-US）存储为一个独立的翻译文件，其 JSON 结构与主表键一致（可嵌套），但属性值填写实际译文。

**编辑器布局与操作**：
- 编辑器采用**左右两栏布局**：
  - **左栏**：展示主表 Schema，用户可添加、修改、删除、重命名键，并为每个键填写说明文字。
  - **右栏**：顶部为**语言 Tab 栏**，每个 Tab 对应一个已打开的语言文件；下方展示当前选中语言的完整译文结构，用户可编辑任意节点的译文值。
- Tab 栏右侧的“＋”按钮用于打开更多已添加的语言，或添加全新的语言。

**编辑与保存流程**：
- 用户在任意一侧编辑时，系统**自动保存**变更（无需手动点击保存按钮），采用防抖、去重、增量传输策略（详见 6.6.3）。
- 若用户关闭浏览器或离开页面，系统应提示“有未保存更改，是否保存？”。

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
- 用户以 checkbox 列表勾选需要导出的语言（支持“全选”）。
- 系统将选中语言的译文文件打包为 ZIP 文件供下载，同时包含 `schema.json`。

### 2.3 协作与并发控制

#### 2.3.1 实时编辑感知
- 系统应实时显示当前编辑同一项目的在线人数（仅数字）。
- 当用户正在编辑某个键的译文时，其他在线用户应能看到该键处于“被编辑”状态（如只读提示）。

#### 2.3.2 冲突处理策略
- **采用乐观锁（后发覆盖）策略**：不阻塞用户编辑，任何修改均可保存。若发生覆盖（同一键被两人同时修改），后到达的修改覆盖先到达的（根据时间戳对比）。
- 被覆盖的用户界面应收到“该键已被他人更新”的**无感提示**（2～3秒自动消失），不阻塞用户操作。
- 所有覆盖行为应记录在操作日志中，便于事后追溯。

#### 2.3.3 防冲突锁定（视觉提示，不阻塞编辑）
- 当用户聚焦某个键时，该键应被标记为“正在被编辑”状态（如颜色高亮或锁图标），提示其他用户。
- 但**不禁止**其他用户编辑该键，仅作通知用途，最终以时间戳后发覆盖为准。
- 若用户长时间（如 30 秒）无操作，标记应自动释放，避免误导他人。

---

## 3. 技术约束、依赖与数据持久化

### 3.1 整体架构
- 全栈一体化：Next.js 16（App Router）+ 自定义 Node.js 服务器（Express）统一处理 HTTP 与 WebSocket。
- 前端：React 19（Next.js 16 内置），Ant Design 6 组件库。
- 实时协作：Socket.IO 4（服务端挂载于 Express，客户端使用 socket.io-client）。
- 数据持久化：本地 JSON 文件，无外部数据库，通过原子写入与互斥锁保障一致性。
- 无用户系统：用客户端 IP 区分操作者，数据全局共享。

### 3.2 前端依赖（精确版本）

| 类别             | 选型                      | 版本      | 说明                                                        |
| ---------------- | ------------------------- | --------- | ----------------------------------------------------------- |
| 核心框架         | **Next.js**               | `16.0.0`+ | App Router，React Server Components，自定义 `server.ts`     |
| UI 库            | **Ant Design**            | `6.0.0`+  | 最新大版本，配套 `@ant-design/icons`、`@ant-design/cssinjs` |
| JSON 编辑器      | **@monaco-editor/react**  | `4.7.0`+  | Monaco Editor 的 React 封装，提供高性能代码编辑与 Diff 对比 |
| 状态管理         | **Zustand**               | `5.0.0`+  | 管理协作状态、编辑器脏标记、在线人数                        |
| HTTP 客户端      | **axios**                 | `1.7.0`+  | 客户端请求 API，拦截器统一处理异常                          |
| WebSocket 客户端 | **socket.io-client**      | `4.8.0`+  | 自动重连、房间与事件绑定                                    |
| 搜索高亮         | **react-highlight-words** | `0.20.0`+ | 高亮匹配关键词                                              |
| 文件下载         | **file-saver**            | `2.0.5`   | 触发浏览器下载导出文件                                      |

### 3.3 后端依赖

| 类别         | 选型                | 版本      | 说明                         |
| ------------ | ------------------- | --------- | ---------------------------- |
| 运行时       | **Node.js**         | `22 LTS`  | 提供稳定的异步 I/O           |
| 自定义服务器 | **Express**         | `4.21.0`+ | 包装 Next.js，挂载 Socket.IO |
| 实时通信     | **Socket.IO**       | `4.8.0`+  | 房间广播、心跳、锁超时控制   |
| 文件操作     | **fs-extra**        | `11.3.0`+ | 原子写入 `outputJson` 等     |
| 并发锁       | **proper-lockfile** | `4.1.2`   | 防止文件并发写冲突           |
| 数据校验     | **zod**             | `3.24.0`+ | 验证 API 输入与文件结构      |
| 日志         | **pino**            | `9.6.0`+  | 结构化日志，性能优秀         |

### 3.4 实时协作约定
- **房间隔离**：客户端连接时发送 `join` 事件（参数 `projectId`），服务端加入 `room:project-{projectId}`。
- **消息类型**：
  - `lock` / `unlock`：键级锁定标记，含 `keyPath`, `language`, `ip`，超时 30 秒自动释放（仅用于视觉提示，不强制只读）。
  - `update`：主表或译文变更后广播（除发送者）。
  - `overwritten`：服务端通知被覆盖者。
  - `online_count`：房间人数广播。
- **冲突策略**：后发覆盖，被覆盖端无声提示 3 秒。

### 3.5 项目代码文件结构
```
project-root/
├── server.ts                     # Express + Socket.IO 启动入口
├── next.config.ts                # Next.js 配置（允许 ESM 等）
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
├── public/                       # 静态资源
│
└── src/
    ├── app/                      # Next.js App Router
    │   ├── layout.tsx
    │   ├── page.tsx              # 首页：项目列表
    │   ├── projects/
    │   │   └── [id]/
    │   │       ├── page.tsx      # 项目编辑器主页面
    │   │       └── layout.tsx
    │   └── api/                  # 所有 RESTful 接口
    │       ├── projects/
    │       │   ├── route.ts
    │       │   └── [id]/
    │       │       ├── route.ts
    │       │       ├── schema/
    │       │       │   └── route.ts
    │       │       ├── locales/
    │       │       │   ├── route.ts
    │       │       │   └── [lang]/
    │       │       │       └── route.ts
    │       │       ├── import/
    │       │       │   └── route.ts
    │       │       └── export/
    │       │           └── route.ts
    │
    ├── components/               # 共享 UI 组件
    │   ├── json-editor/
    │   │   └── MonacoEditor.tsx
    │   ├── project/
    │   │   ├── SchemaEditor.tsx
    │   │   ├── LocaleEditor.tsx
    │   │   ├── LanguageTabs.tsx
    │   │   ├── ImportPreviewDialog.tsx
    │   │   └── ExportSelectorDialog.tsx
    │   ├── collaboration/
    │   │   ├── OnlineBadge.tsx
    │   │   └── LockIndicator.tsx
    │   └── common/
    │       └── SearchHighlight.tsx
    │
    ├── hooks/                    # 自定义 Hooks
    │   ├── useSocket.ts
    │   ├── useProjectEditor.ts
    │   └── useSearch.ts
    │
    ├── stores/                   # Zustand stores
    │   ├── editorStore.ts
    │   └── collaborationStore.ts
    │
    ├── lib/                      # 服务端库与工具
    │   ├── data-layer/
    │   │   ├── index.ts           # 统一导出入口
    │   │   ├── io.ts              # 文件 I/O 原语（原子写入、读取、路径工具）
    │   │   ├── projects.ts        # 项目 CRUD
    │   │   ├── schema.ts          # Schema 管理 + 增量更新 + 键变更同步
    │   │   ├── locales.ts         # Locale 管理 + 增量更新
    │   │   └── import-export.ts   # 导入/导出
    │   ├── validation.ts
    │   ├── socket-handler.ts
    │   ├── api-wrapper.ts        # 统一 API 封装（见 6.1.3）
    │   └── utils.ts              # flattenObject / unflattenObject
    │
    └── types/                    # 全局 TypeScript 类型
        ├── api.ts                # 统一响应类型（见 6.1.1）
        ├── project.ts
        ├── schema.ts
        └── collaboration.ts
```

### 3.6 关键实施说明
- **Monaco Editor 集成**：`MonacoEditor.tsx` 为 `'use client'` 组件，使用 `@monaco-editor/react` 的 `<Editor />` 组件，通过 `onMount` 获取编辑器实例，暴露 `setValue`、`getValue`、`focus`、`find` 等方法。
- **自动保存**：`useProjectEditor` 根据 `.env` 中配置的防抖延迟，触发增量保存（详见 6.6.3）。
- **原子写入**：`data-layer/io.ts` 使用 `proper-lockfile` 锁定目标文件路径，写入临时文件后 `fs.rename` 替换，确保断电或并发安全。
- **启动方式**：`node server.ts`，开发环境可用 `nodemon`，生产环境搭配 PM2 或 Docker。

### 3.7 数据存储结构（文本型持久化）
系统运行时自动创建以下目录结构，按项目隔离所有数据：
```
/data/
  projects/
    {projectId}/
      meta.json       // 项目信息（标题、描述、时间戳）
      schema.json     // 主表（键-说明映射，扁平对象）
      locales/
        en-US.json    // 各语言译文（可嵌套）
        zh-CN.json
        ...
      history.json    // 操作日志（可选）
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
  CONFLICT = 409,         // 导入冲突（需二次确认）
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

在 Next.js App Router 中，使用 **高阶函数（HOF）** 统一封装所有 Route Handler。

**实现文件：`src/lib/api-wrapper.ts`**

```typescript
// src/lib/api-wrapper.ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiResponse, ErrorCode } from '@/types/api';

export type ApiHandler<T = any> = (
  req: Request,
  context: { params?: Record<string, string> }
) => Promise<T>;

export function withApiHandler<T>(
  handler: ApiHandler<T>
): (req: Request, context: { params?: Record<string, string> }) => Promise<NextResponse> {
  return async (req, context): Promise<NextResponse> => {
    try {
      const data = await handler(req, context);
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
        const message = `参数校验失败: ${error.errors.map(e => `${e.path.join('.')} ${e.message}`).join('; ')}`;
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

      return NextResponse.json(
        { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误，请稍后重试', timestamp: new Date().toISOString() } as ApiResponse,
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

**使用示例（`src/app/api/projects/[id]/route.ts`）**：

```typescript
import { withApiHandler } from '@/lib/api-wrapper';

export const GET = withApiHandler(async (req, { params }) => {
  const { id } = params;
  const project = await getProjectById(id);
  return { meta: project.meta, schema: project.schema, locales: project.locales };
});
```

#### 6.1.4 完整接口契约（逐条细化）

| 方法   | 路径                                     | 请求参数/体（详细类型）                                                                                                                                                                                                                  | 成功响应 `data` 结构（TypeScript）                                                                                                                                                                                  | 特殊错误码（除 400/404/500 外）                                                                                           |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/projects`                          | **Query**：<br/> - `keyword?: string`（模糊搜索，对 `title` 和 `description` 做 `includes` 匹配）                                                                                                                                        | `{ list: ProjectMeta[] }` <br/> 其中 `ProjectMeta = { id: string; title: string; description?: string; createdAt: string; updatedAt: string }`                                                                      | 无                                                                                                                        |
| POST   | `/api/projects`                          | **Body**：<br/> - `title: string`（必填，1~50 字符） <br/> - `description?: string`（可选，最大 200 字符）                                                                                                                               | `{ id: string; title: string; description?: string; createdAt: string }`                                                                                                                                            | `422`：标题为空或超长                                                                                                     |
| GET    | `/api/projects/[id]`                     | **Params**：`id`（UUID 格式）                                                                                                                                                                                                            | `{ meta: ProjectMeta; schema: SchemaObject; locales: string[] }` <br/> *注：`locales` 为已存在语言标识列表（如 `["en-US", "zh-CN"]`）*                                                                              | `404`：项目不存在                                                                                                         |
| PUT    | `/api/projects/[id]`                     | **Params**：`id` <br/> **Body**：<br/> - `title?: string` <br/> - `description?: string`                                                                                                                                                 | `{ meta: ProjectMeta }`（更新后的完整 meta）                                                                                                                                                                        | `404`：项目不存在                                                                                                         |
| DELETE | `/api/projects/[id]`                     | **Params**：`id`                                                                                                                                                                                                                         | `{ success: true }`                                                                                                                                                                                                 | `404`：项目不存在                                                                                                         |
| GET    | `/api/projects/[id]/schema`              | **Params**：`id`                                                                                                                                                                                                                         | `{ schema: SchemaObject }` <br/> `SchemaObject` 类型为 `Record<string, string>`（键 → 说明）                                                                                                                        | `404`：项目或 schema 文件不存在                                                                                           |
| PUT    | `/api/projects/[id]/schema`              | **Params**：`id` <br/> **Body**：<br/> - `schema: SchemaObject`（必须为 `Record<string, string>`，不能包含嵌套对象，否则返回 `422`）                                                                                                     | `{ schema: SchemaObject }`（更新后的完整 schema）                                                                                                                                                                   | `422`：schema 格式非法（含嵌套结构或非字符串值）<br/> `409`：新 schema 中键路径与现有语言文件合并时发生重名冲突（极罕见） |
| PATCH  | `/api/projects/[id]/schema/keys`         | **Params**：`id` <br/> **Body**：<br/> - `updates: Record<string, string>`（新增/修改的键值对，空字符串表示删除）<br/> - `deletes: string[]`（待删除的键列表，与 `updates` 中空值效果相同，二者可互用）                                  | `{ success: true; affectedKeys: string[] }`                                                                                                                                                                         | `422`：键名格式非法（含 `.` 等）<br/> `409`：与现有语言文件冲突（极少）                                                   |
| GET    | `/api/projects/[id]/locales`             | **Params**：`id`                                                                                                                                                                                                                         | `{ locales: string[] }`（已添加的语言列表）                                                                                                                                                                         | `404`：项目不存在                                                                                                         |
| POST   | `/api/projects/[id]/locales`             | **Params**：`id` <br/> **Body**：<br/> - `lang: string`（正则 `/^[a-zA-Z0-9_-]+$/`，如 `en-US`，长度 2~20 字符）                                                                                                                         | `{ lang: string; translations: TranslationObject }`（新生成的空译文对象，结构与当前 schema 扁平化后一致，但值为空字符串 `""`）                                                                                      | `409`：该语言已存在 <br/> `422`：语言标识格式非法                                                                         |
| GET    | `/api/projects/[id]/locales/[lang]`      | **Params**：`id`、`lang`                                                                                                                                                                                                                 | `{ lang: string; translations: TranslationObject }` <br/> `TranslationObject` 为 `Record<string, any>`（支持嵌套结构，需与 schema 扁平化后的键集合对应）                                                            | `404`：语言文件不存在                                                                                                     |
| PUT    | `/api/projects/[id]/locales/[lang]`      | **Params**：`id`、`lang` <br/> **Body**：<br/> - `translations: TranslationObject`（必须合法 JSON 对象，且内部所有键需是 schema 扁平化键的**超集**或**子集**，系统会合并/补空）                                                          | `{ lang: string; translations: TranslationObject }`（更新后的完整译文）                                                                                                                                             | `422`：译文对象包含 schema 中不存在的键（严格模式）                                                                       |
| PATCH  | `/api/projects/[id]/locales/[lang]/keys` | **Params**：`id`、`lang` <br/> **Body**：<br/> - `updates: Record<string, any>`（扁平路径 → 新值，值为 `null` 或 `undefined` 表示删除该路径）<br/> - `deletes: string[]`（待删除的扁平路径列表，与 `updates` 中空值等效）                | `{ success: true }`                                                                                                                                                                                                 | `422`：路径格式非法或值类型不匹配<br/> `404`：语言不存在                                                                  |
| DELETE | `/api/projects/[id]/locales/[lang]`      | **Params**：`id`、`lang`                                                                                                                                                                                                                 | `{ success: true }`                                                                                                                                                                                                 | `404`：语言文件不存在 <br/> `409`：若这是最后一个语言，不允许删除（至少保留一个）                                         |
| POST   | `/api/projects/[id]/import`              | **Params**：`id` <br/> **Body**（`multipart/form-data`）：<br/> - `file: File`（仅支持 `.json`）<br/> - `strategy?: 'overwrite' \| 'skip' \| 'merge'`（默认 `merge`）<br/> - `confirmed?: 'true' \| 'false'`（字符串形式，用于二次确认） | **首次请求（无 `confirmed`）**：<br/> `{ preview: { addedKeys: string[]; diffKeys: Array<{ key: string; oldVal: any; newVal: any }> } }` <br/> **确认请求（`confirmed: true`）**：<br/> `{ success: true }`         | `409`：检测到冲突，需要二次确认（HTTP 状态码 409）<br/> `422`：文件解析失败或键包含非法字符（如含 `.` 导致扁平化冲突）    |
| POST   | `/api/projects/[id]/export`              | **Params**：`id` <br/> **Body**：<br/> - `languages: string[]`（必填，至少选一个）                                                                                                                                                       | **不返回 JSON**，直接返回 `application/zip` 流。<br/> 响应头：`Content-Disposition: attachment; filename="project-{id}-locales.zip"`。<br/> ZIP 内文件结构：`schema.json` + `{lang}.json`（每个选中语言一个文件）。 | `400`：未选择任何语言 <br/> `404`：项目不存在 <br/> `500`：打包失败                                                       |

> **统一说明**：所有错误响应均遵循 `ApiResponse` 结构，`data` 字段在错误时省略或为 `null`。

### 6.2 编辑器 UI 布局与交互实现细节

#### 6.2.1 整体布局
主编辑器页面（`/projects/[id]`）采用**左右两栏布局**，两侧均使用 Monaco Editor 作为 JSON 代码编辑器。

- **顶部工具栏**：位于左右两栏上方，包含项目标题、**全局跨语言搜索框**（按译文内容在当前项目的所有语言文件中检索）、在线人数徽标，以及导入/导出操作按钮。
- **左栏（宽度占比 45%～50%）**：
  - 顶部为“主表 Schema”标题栏 + 编辑器内搜索输入框（调用 Monaco 的查找控件）。
  - 下方嵌入 Monaco Editor，展示当前项目的完整 Schema（**格式化的 JSON 对象**，内容为 `Record<string, string>`）。
  - 用户可直接修改 JSON 文本（增删改键和说明）。
- **右栏（宽度占比 50%～55%）**：
  - 顶部为**语言 Tab 栏**（使用 Ant Design `<Tabs>` 或自定义 Tab），每个 Tab 对应一个已打开的语言文件。
  - Tab 右侧有固定 **“＋”按钮**：下拉展示未打开的语言列表，以及“添加新语言”选项。
  - 下方嵌入 Monaco Editor，展示当前选中语言的**完整译文 JSON 对象**（可嵌套）。
  - **空状态**：当项目尚未添加任何语言时，右栏显示占位提示：“暂无语言，请点击 ‘＋’ 按钮添加”。添加第一个语言后自动打开该 Tab。

#### 6.2.2 Monaco Editor 实例配置（两侧通用）
```typescript
const monacoOptions = {
  language: 'json',
  theme: 'vs-dark',            // 可配置
  automaticLayout: true,
  formatOnPaste: true,
  formatOnType: true,
  readOnly: false,             // 根据锁定状态动态切换（仅视觉锁定，不强制只读）
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  tabSize: 2,
};
```

#### 6.2.3 数据联动与同步
- **Schema 变更**：用户编辑 Schema JSON 后，通过 `onChange` 事件获取新文本，解析为 JSON 对象。
  - 与旧 Schema 对比，计算**新增键**、**删除键**、**重命名键**（基于路径比对），然后同步应用到所有语言文件（新增键补空字符串，删除键移除对应键值，重命名键采用“先增后删”策略）。
  - 同步操作通过 API 批量保存，并广播 `update` 事件。
- **译文变更**：用户编辑某个语言 JSON 后，仅更新该语言文件，同样通过 API 保存并广播。
- **Tab 切换**：切换时，编辑器内容会更新为新的语言数据。

#### 6.2.4 键级锁定可视化（仅提示，不阻塞编辑）
- **目标**：在不影响用户编辑流畅性的前提下，提供其他用户正在编辑某个键的视觉提示。
- **实现方式**：
  - 用户在编辑器中**聚焦**某一行（通过光标位置）时，前端尝试推断当前光标所在的 JSON 键路径（可使用 `jsonc-parser` 或简单文本分析），若成功则向服务端发送 `lock` 消息（携带 `projectId`, `keyPath`, `language`）。
  - 服务端维护每个键的锁定状态（含锁持有者 IP 和超时时间），并广播给房间内其他客户端。
  - 其他客户端接收到 `lock` 后，**不禁止**用户编辑，而是在编辑器外部（如状态栏或悬浮提示）显示“该键正在被他人编辑”的标记。
  - 用户失去焦点（编辑器 blur 或光标移出）时，发送 `unlock`。
- **超时与异常处理**：
  - 服务端为每个锁定实例维护 `setTimeout`，超时时间由 `LOCK_TIMEOUT` 环境变量定义（默认 30000 毫秒）。
  - 超时自动释放锁并广播 `unlock`，避免残留标记。
  - 若客户端 socket 意外断开，服务端立即清除该客户端的所有锁并广播。
- **乐观锁冲突处理**：
  - 当用户保存修改时，若服务端检测到该键在上次读取后被其他人修改（版本号或时间戳比对），则采用**后发覆盖**策略，直接应用最新修改，并通知被覆盖的用户（通过 `overwritten` 消息）。
  - 被覆盖用户收到提示后，界面显示短暂通知“该键已被他人更新”，但不会阻塞其继续操作。

#### 6.2.5 搜索与高亮
- **编辑器内搜索**：调用 Monaco 的 `editor.getAction('actions.find')` 触发查找对话框，支持正则、大小写敏感等标准功能。
- **全局跨语言搜索**（按译文内容）：
  - 在顶部工具栏提供独立搜索输入框，用户输入关键词后，系统**遍历当前项目下的所有语言文件**，匹配译文内容（字符串匹配）。
  - 匹配结果以列表形式展示（包含语言、键路径、译文片段），点击结果项时：
    - 切换到对应语言 Tab；
    - 在编辑器中自动执行 `find` 操作，高亮该译文。
  - 该功能独立于编辑器实例，需在父组件中实现。

#### 6.2.6 译文输入联想（辅助参考）
- **触发时机**：当用户在某语言编辑器中聚焦光标，且系统能推断出当前编辑的键路径时。
- **展现形式**：在编辑器外（紧贴编辑器或跟随光标位置）显示一个**悬浮卡片**（使用 Ant Design `Popover` 或 `Tooltip`），内容包含：
  - **键名**（扁平化路径）
  - **说明**（来自 Schema 中该键的描述）
  - **其他已添加语言中的对应译文**（以列表形式展示，语言标识作为标签）
- **实现要点**：
  - 通过 Monaco 的 `onDidChangeCursorPosition` 监听光标位置，结合 JSON 解析推断路径。
  - 为了减少性能开销，可设置防抖（如 300ms）。
  - 若无法推断路径（如光标在 JSON 结构层），则不显示悬浮卡。

### 6.3 嵌套键的扁平化（Flatten）与还原（Unflatten）算法

以下场景需使用扁平化键路径：导入/导出预览、搜索关键词匹配、WebSocket 锁定消息中的 `keyPath` 传输、键重复检测、增量传输中的路径标识。

**扁平化规则**：
- 使用 `.` 作为分隔符，如 `{ "emp": { "name": "姓名" } }` → `{ "emp.name": "姓名" }`。
- 数组类型不支持（导入时若包含数组则拒绝并提示错误）。
- 深度优先遍历，按键名字典序排列。

**还原规则**：
- 将 `{"emp.name":"张三", "emp.age":30}` 还原为 `{"emp":{"name":"张三","age":30}}`。
- 若路径冲突，以最深层级为准并记录警告日志。

**工具函数**（`src/lib/utils.ts`）：
- `flattenObject(obj: Record<string, any>): Record<string, any>`
- `unflattenObject(flat: Record<string, any>): Record<string, any>`

**增量传输中的应用**：
- 在自动保存流程中，前端通过扁平化路径比对计算新旧数据的增量差异，生成 `updates` 和 `deletes` 数据。
- 服务端接收增量数据后，按扁平路径应用到当前数据，再还原为嵌套结构（`unflattenObject`）写入文件。
- 扁平化路径也用于 WebSocket 广播中的 `keyPath` 字段，确保增量变更消息精准定位到变更节点。

### 6.4 WebSocket 连接与锁机制实现

#### 6.4.1 身份标识与连接流程
无用户系统，通过客户端 IP 区分操作者（服务端获取）：
1. 前端创建 Socket.IO 客户端时，在 `query` 中携带 `projectId`。
2. 服务端从 `socket.handshake.headers` 提取 IP（优先 `x-forwarded-for`，否则 `socket.remoteAddress`，降级为 `socket.id`）。
3. 执行 `socket.join(\`room:project-${projectId}\`)`，并广播 `online_count`。

#### 6.4.2 锁定消息格式
```typescript
{
  type: 'lock' | 'unlock',
  projectId: string,
  keyPath: string,      // 扁平化路径，如 "emp.name"
  language: string,
  ip: string,           // 服务端填充
  timestamp: number
}
// 注：keyPath 采用扁平化路径，与增量传输中的路径格式保持一致
```

#### 6.4.3 超时管理（必须严格实现）
- 服务端为每个锁定实例维护一个独立的 `setTimeout`，超时时间由 `LOCK_TIMEOUT` 环境变量定义（默认 30000 毫秒）。
- **定时器清除条件**：收到客户端主动发出的 `unlock` 消息，或该客户端 socket 意外断开时，必须立即清除对应的定时器，并广播 `unlock`，防止残留锁阻塞他人。

#### 6.4.4 房间与消息广播
- 所有客户端连接时加入 `room:project-{projectId}` 房间。
- 消息类型：
  - `lock` / `unlock`：广播给房间内除发送者外的所有客户端。
  - `update`：主表或译文变更后广播（除发送者）。
  - `overwritten`：服务端通知被覆盖者（仅发送给被覆盖的客户端）。
  - `online_count`：房间人数变更时广播给所有客户端。

### 6.5 编辑器组件职责划分

- **主翻译界面（`/projects/[id]/page.tsx`）**：
  - 左栏 Schema 编辑：**使用 `@monaco-editor/react` 组件**，以 JSON 文本形式展示和编辑。
  - 右栏译文编辑：**同样使用 `@monaco-editor/react`**。
  - 禁止使用 Ant Design Table/Tree 替代。
- **辅助场景（弹窗/模态框）**：
  - 查看原始 JSON：使用相同的 Monaco 组件，设为只读。
  - 导入冲突预览：使用 Monaco Diff Editor 组件（`<DiffEditor />`）并排展示新旧差异。
- **`MonacoEditor` 封装要求**：
  - `'use client'`，使用 `@monaco-editor/react` 的 `<Editor />` 组件，通过 `onMount` 获取编辑器实例，暴露 `setValue`、`getValue`、`focus`、`find` 等方法。
  - 组件卸载时无需额外清理（React 自动处理）。

### 6.6 环境变量、启动初始化、自动保存与 Tab 管理

#### 6.6.1 环境变量
```env
NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE=1000   # 自动保存防抖延迟（毫秒）
LOCK_TIMEOUT=30000
NEXT_PUBLIC_WS_URL=http://localhost:3000
DATA_DIR=./data
```

#### 6.6.2 启动初始化（`server.ts`）
1. 检查 `DATA_DIR` 是否存在，若不存在则创建 `data/projects/`。
2. 加载 Express 中间件，挂载 Next.js 请求处理器。
3. 创建 HTTP 服务器并绑定 Socket.IO 实例。
4. 监听端口（默认 `3000`）。
5. 项目 ID 使用 `crypto.randomUUID()` 生成。
6. 所有 API 路由须用 try-catch 包裹，异常返回 `{ code: 500, message: error.message }`（实际已由 `withApiHandler` 统一处理）。

#### 6.6.3 自动保存与脏数据检测

**防抖策略**：
- 用户编辑触发 `onChange` 后，**不立即保存**。系统设置防抖延迟（默认 1000ms，由 `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` 环境变量配置）。
- 在防抖延迟期间，若用户继续编辑，则重置定时器；只有用户停止操作超过延迟时间后，才触发保存流程。
- 此策略大幅减少无效请求，避免高频编辑带来的网络和服务端压力。

**重复检测（去重）**：
- 触发保存前，比较当前数据与上次成功保存的数据（通过内容哈希或版本号比对）。
- 若两者完全一致，则跳过本次保存，不发起任何网络请求。
- 此策略避免因误触发（如光标移动但不涉及内容变更）导致的冗余保存。

**增量传输（最小数据量）**：
- 保存时，前端计算新旧数据的差异，仅将**变更的部分**发送给服务端。
- **Schema 变更**：发送 `{ updates: Record<string, string>, deletes: string[] }`，其中 `updates` 包含新增/修改的键值对，`deletes` 包含被删除的键列表。
- **译文变更**：同样基于扁平化路径，发送 `{ updates: Record<string, any>, deletes: string[] }`，其中 `updates` 包含变更的扁平键路径及新值，`deletes` 包含被删除的路径列表。
- 此策略将单次保存的数据量从数百 KB 降至数十字节，显著降低网络传输成本和磁盘 I/O。

**服务端处理**：
- 服务端接收到增量请求后，从磁盘读取当前数据，应用增量变更（新增/更新/删除），原子写入文件。
- 写入成功后，通过 WebSocket 广播**增量变更消息**（非全量），其他客户端收到后本地合并，无需重新加载整个文件。
- 服务端采用 `proper-lockfile` 确保文件写入的原子性和并发安全。

**浏览器关闭提示**：
- 监听 `beforeunload` 事件，若存在未成功保存的脏数据（`isDirty === true`），弹出“有未保存更改，是否离开？”确认框，防止数据丢失。

#### 6.6.4 多语言 Tab 管理
- **打开**：点击“＋”按钮，从下拉列表中选择未打开的语言，新增 Tab 并加载数据。
- **关闭**：点击 Tab 上的 `×`，移除 Tab（不删除文件），**至少保留一个 Tab**。
- **添加新语言**：在“＋”下拉菜单底部选择“添加新语言”，弹出 Modal 输入语言标识，调用 API 创建成功后自动打开。

### 6.7 注意事项

1. **JSON 格式化**：编辑器应在保存时自动格式化 JSON（调用 `editor.getAction('editor.action.formatDocument')`），以确保存储的 JSON 美观一致。
2. **JSON 校验**：若用户输入非法 JSON，应在保存时阻止并给出错误提示。
3. **性能优化**：对于大 JSON 文件，Monaco 本身性能优秀，但应避免频繁解析（如每次 `onChange` 都解析，应使用防抖或仅在保存时解析）。
4. **协作冲突处理**：采用乐观锁，后发覆盖，确保用户操作不被阻塞，同时通过通知提示用户冲突情况。
5. **锁定标记的准确性**：由于锁定基于光标位置推断路径，可能存在误判，需结合用户反馈迭代优化。

---

