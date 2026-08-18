---
title: RESTful API 契约
category: architecture
tags:
  - i18n-manager
  - API
  - REST
  - 契约
source:
  - "[[raw/i18nManager.md]]"
  - "[[raw/CODEMAPS/backend.md]]"
  - "[[raw/CONTRIBUTING.md]]"
created: 2026-08-19
updated: 2026-08-19
aliases:
  - REST API
  - API 契约
  - 接口
---

# RESTful API 契约

> 统一响应信封 + 统一错误处理 + 完整端点表。除导入/导出外，所有 JSON 接口经 `withApiHandler` 封装。

## 统一响应模型

```ts
interface ApiResponse<T = any> {
  code: number;        // 0 成功，非 0 失败
  message: string;     // "ok" 或错误描述
  data?: T;            // 载荷
  timestamp?: string;  // 服务端 ISO 时间
}
```

`ErrorCode`：`SUCCESS=0`、`BAD_REQUEST=400`、`NOT_FOUND=404`、`CONFLICT=409`、`VALIDATION_ERROR=422`、`INTERNAL_ERROR=500`。

## HTTP 状态码与业务 code 映射

| 场景 | HTTP | code |
|------|------|------|
| 请求处理成功 | 200 | 0 |
| 客户端参数错误 | 400 | 400 |
| 资源不存在 | 404 | 404 |
| 导入冲突需二次确认 / 语言已存在 / 最后语言保护 | 409 | 409 |
| Zod 校验失败 | 422 | 422 |
| 服务器内部错误 | 500 | 500 |

## 统一封装（withApiHandler）

- `src/lib/api-wrapper.ts`：HOF 包裹 handler，内部 try/catch，统一组装 `ApiResponse` 与状态码。
- `CustomError`：携带 `code` + `httpStatus`，业务逻辑主动抛出。
- **导入/导出接口例外**：multipart / 二进制流，手动处理错误，不经过 HOF。
- **Next.js 16 注意**：`context.params` 为 `Promise<Record<string, string>>`，HOF 内部自动 `await`。

## 端点表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表；`?keyword=` 对 title/description 模糊搜索 |
| POST | `/api/projects` | 创建（`title` 1-50 必填，`description` ≤200 可选） |
| GET | `/api/projects/[id]` | meta + schema + locales 列表 |
| PUT | `/api/projects/[id]` | 更新 meta |
| DELETE | `/api/projects/[id]` | 删除项目（递归删目录） |
| GET | `/api/projects/[id]/schema` | 获取 Schema |
| PUT | `/api/projects/[id]/schema` | 全量覆盖 Schema，同步键变更到所有语言文件 |
| PATCH | `/api/projects/[id]/schema/keys` | 增量（`{ updates, deletes, timestamp? }`）；时间戳冲突返回 409 |
| GET | `/api/projects/[id]/locales` | 语言列表 |
| POST | `/api/projects/[id]/locales` | 添加语言（`{ lang }` 2-20 字符 `[a-zA-Z0-9_-]`）；已存在 409 |
| GET | `/api/projects/[id]/locales/[lang]` | 获取译文（嵌套 JSON） |
| PUT | `/api/projects/[id]/locales/[lang]` | 全量覆盖译文 |
| DELETE | `/api/projects/[id]/locales/[lang]` | 删除语言；最后语言 409 |
| PATCH | `/api/projects/[id]/locales/[lang]/keys` | 增量（`{ updates, deletes }` 扁平路径） |
| POST | `/api/projects/[id]/import` | 导入（multipart：`file`/`strategy`/`confirmed`）；未确认返回 409 预览 |
| POST | `/api/projects/[id]/export` | 导出 ZIP（`{ languages: string[] }` ≥1）；返回 `application/zip` |

## 增量契约要点

- **Schema 增量**：`updates: Record<string, any>`（扁平路径，空串表示删除）+ `deletes: string[]` + 可选 `timestamp`（冲突检测 → 409）。
- **译文增量**：`updates`（扁平路径 → 新值，`null`/`undefined` 删除）+ `deletes`。
- **导出响应头**：`Content-Disposition: attachment; filename="project-{id}-locales.zip"`；ZIP 内含 `schema.json` + 各选中语言 `{lang}.json`。

## 关联

- [[Socket.IO-协议|Socket.IO 协议]] — 持久化主路径
- [[数据层|数据层]] — handler 调用的模块
- [[entities/项目|项目]] / [[entities/语言文件|语言文件]]
- [[features/导入导出|导入导出]] — import/export 端点
- [[concepts/扁平化算法|扁平化算法]] — 增量路径表示
