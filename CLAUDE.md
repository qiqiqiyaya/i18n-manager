# CLAUDE.md

This file provides guidance to working with code in this repository.

## Project Overview

多语言管理平台（i18n Manager）—— 一个轻量级、协作式的多语言翻译管理工具。全栈 Next.js 应用，无用户系统，数据全局共享，适合小型团队内部使用。

**当前状态**：核心架构已搭建（服务端 `server.ts` + Express/Socket.IO、数据层、API 路由、前端编辑器页面、Zustand stores），`server.ts` 已可启动运行，`data/projects/` 自动创建。完整的需求技术文档在 `i18nManager.md`。

## Commands

```bash
# 开发
npm run dev          # Next.js 开发服务器（不含自定义服务器，仅页面开发）
npm run start:server # 完整启动（Express + Socket.IO + Next.js），推荐使用

# 构建
npm run build        # 生产构建

# 启动生产
npm run start        # 生产模式启动

# 代码检查
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript 类型检查
```

## 项目架构（与 i18nManager.md 同步）

实现目标架构的完整描述见 `i18nManager.md`，以下是关键要点：

### 技术栈
- **Next.js 16** (App Router) + **Express** 自定义服务器（同时处理 HTTP 和 WebSocket）
- **React 19** + **Ant Design 6** + **@monaco-editor/react**（JSON 代码编辑器）
- **Zustand** 状态管理（协作状态、脏标记、在线人数）
- **Socket.IO** 实时协作（键级锁定、冲突广播）
- **RxJS** 响应式编程（防抖、节流、合并、去重 Observable 管道）
- **Zod** 输入校验、**pino** 日志、**fs-extra** + **proper-lockfile** 原子文件写入

### 核心架构决策
1. **数据持久化**：本地 JSON 文件系统（`data/projects/{projectId}/`），无外部数据库
2. **无用户系统**：客户端 IP 区分操作者，数据全局共享
3. **编辑器**：两侧均使用 `@monaco-editor/react`（JSON 文本模式），左栏 Schema 编辑 + 右栏译文编辑
4. **实时协作**：Socket.IO 房间隔离（`room:project-{projectId}`），键级锁定（30s 超时自动释放）
5. **自动保存**：防抖触发（`NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE`），内容哈希去重 + 扁平化路径增量传输，`beforeunload` 提示未保存
6. **扁平化**：导入/导出/搜索/WebSocket/增量保存均通过 `flattenObject`/`unflattenObject`（`.` 分隔符）处理
7. **启动模式**：`node server.ts`（Express 包装 Next.js + 挂载 Socket.IO），开发可用 `npm run dev` + `start:server` 分离，生产推荐 `start:server`

### 实际目录结构

```
project-root/
├── server.ts                  # Express + Socket.IO 启动入口（已实现）
├── next.config.ts             # Next.js 配置
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
│   │   ├── layout.tsx         # 根布局
│   │   ├── page.tsx           # 首页：项目列表
│   │   ├── globals.css        # 全局样式
│   │   ├── projects/[id]/
│   │   │   ├── page.tsx       # 编辑器主页面
│   │   │   └── layout.tsx
│   │   └── api/projects/      # 全部 RESTful 接口已实现
│   │       ├── route.ts                        # GET/POST  项目列表/创建
│   │       ├── [id]/route.ts                   # GET/PUT/DELETE 项目
│   │       ├── [id]/schema/route.ts            # GET/PUT Schema
│   │       ├── [id]/schema/keys/route.ts       # PATCH Schema 增量
│   │       ├── [id]/locales/route.ts           # GET/POST 语言列表/添加
│   │       ├── [id]/locales/[lang]/route.ts    # GET/PUT/DELETE 语言文件
│   │       ├── [id]/locales/[lang]/keys/route.ts  # PATCH 译文增量
│   │       ├── [id]/import/route.ts            # POST 导入
│   │       └── [id]/export/route.ts            # POST 导出
│   │
│   ├── components/
│   │   ├── json-editor/
│   │   │   ├── MonacoEditor.tsx   # @monaco-editor/react 封装
│   │   │   └── JsonEditor.tsx     # 旧版 jsoneditor 封装（已弃用）
│   │   ├── project/
│   │   │   ├── SchemaEditor.tsx       # 左栏 Schema 编辑器
│   │   │   ├── LocaleEditor.tsx       # 右栏译文编辑器
│   │   │   ├── LanguageTabs.tsx       # 语言 Tab 栏
│   │   │   ├── ImportPreviewDialog.tsx # 导入预览对话框
│   │   │   └── ExportSelectorDialog.tsx # 导出选择对话框
│   │   ├── collaboration/
│   │   │   ├── OnlineBadge.tsx
│   │   │   └── LockIndicator.tsx
│   │   └── common/
│   │       └── SearchHighlight.tsx
│   │
│   ├── hooks/
│   │   ├── useSocket.ts          # Socket.IO 连接
│   │   ├── useProjectEditor.ts   # 项目加载/自动保存
│   │   └── useSearch.ts          # 全局搜索
│   ├── stores/
│   │   ├── editorStore.ts        # Zustand 编辑状态
│   │   └── collaborationStore.ts # 协作状态（锁定/覆盖）
│   ├── lib/
│   │   ├── data-layer/
│   │   ├── index.ts           # 统一导出入口
│   │   ├── io.ts              # 文件 I/O 原语（原子写入、读取、路径工具）
│   │   ├── projects.ts        # 项目 CRUD
│   │   ├── schema.ts          # Schema 管理 + 增量更新 + 键变更同步
│   │   ├── locales.ts         # Locale 管理 + 增量更新
│   │   └── import-export.ts   # 导入/导出
│   │   ├── validation.ts         # Zod 校验
│   │   ├── socket-handler.ts     # WebSocket 服务端处理
│   │   ├── api-wrapper.ts        # 统一 API 封装（withApiHandler）
│   │   └── utils.ts              # flattenObject / unflattenObject
│   └── types/
│       ├── api.ts                # ApiResponse / ErrorCode
│       ├── project.ts
│       ├── schema.ts
│       ├── collaboration.ts
│       └── jsoneditor.d.ts
```

### 关键 API 约定
- 统一响应格式：`ApiResponse<T> = { code, message, data?, timestamp? }`
- 统一封装：`withApiHandler` HOF 包裹所有 Route Handler
- HTTP 状态码 + 业务 code：200/0（成功），400/400（参数错误），404/404（资源不存在），409/409（导入冲突），422/422（校验失败），500/500（服务器错误）

## 重要设计约束

1. **编辑器必须使用 `@monaco-editor/react`**，不得用 Ant Design Table/Tree 或旧版 jsoneditor 替代
2. **键级锁定**通过 Monaco Editor 的 `onDidChangeCursorPosition` 回调 + WebSocket 消息实现，不得使用 `setReadOnly(true)` 全局只读
3. **原子写入**：先写临时文件再 `fs.rename` 替换，通过 `proper-lockfile` 互斥锁保护
4. **WebSocket 锁超时**：30 秒自动释放，断连时立即清除定时器
5. **数组支持**：导入时数组值会被保留为原始数组（JSON.stringify/parse 原生支持），不会展开为点分隔键
6. **自动保存**：基于防抖（`NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE`）+ 内容哈希去重 + 扁平化路径增量传输，非定时轮询
7. **防抖/节流使用 RxJS**：涉及防抖（debounce）、节流（throttle）、合并（merge）、去重（distinctUntilChanged）等响应式操作，应优先使用 **RxJS** `Observable` 管道处理，而非原生 `setTimeout`/`clearTimeout`。`rxjs` 已包含在 `package.json` 依赖中。典型场景：编辑器 `onChange` → `Subject` → `pipe(debounceTime(1000), distinctUntilChanged())` → 保存/校验

## 需求文档

完整的需求和技术约束见 `i18nManager.md`，所有实现细节以该文档第 6 节的 AI 编码约束为准。
