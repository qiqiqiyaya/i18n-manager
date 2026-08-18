---
title: Socket.IO 事件协议
category: architecture
tags:
  - i18n-manager
  - Socket.IO
  - WebSocket
  - 实时协作
source:
  - "[[raw/i18nManager.md]]"
  - "[[raw/CODEMAPS/backend.md]]"
created: 2026-08-19
updated: 2026-08-19
aliases:
  - Socket.IO
  - WebSocket 协议
  - 事件协议
---

# Socket.IO 事件协议

> 实时协作的事件模型：按项目房间隔离；Schema 变更带时间戳冲突检测；Schema/Locale 保存经 Socket.IO 直写磁盘。

## 连接与房间

- 客户端连接时在 `query` 携带 `projectId` → 服务端 `socket.join(\`room:project-${projectId}\`)`。
- 无身份识别；在线人数 = 房间连接数（`online_count`）。

## 客户端 → 服务端

| 事件 | 载荷 | 说明 |
|------|------|------|
| `schema:updated` | `SchemaUpdatedPayload` | Schema 变更广播，**无条件发送**（改 value 时 addedKeys/removedKeys 为空数组也要发）；含时间戳冲突检测 |
| `schema:save` | `SchemaSavePayload` | Schema 持久化到磁盘（携带 `timestamp`，与 `schema:updated` 共用冲突检测） |
| `locale:updated` | `LocaleUpdatedPayload` | 译文变更广播（last-write-wins，不拒绝） |
| `locale:save` | `LocaleSavePayload` | Locale 持久化到磁盘 |
| `update` | `{ projectId, type, lang?, data }` | ⚠️ **死代码**：`sendUpdate` 从未被 `page.tsx` 取用 |

## 服务端 → 客户端

| 事件 | 载荷 | 说明 |
|------|------|------|
| `online_count` | `{ count }` | 在线人数变更 |
| `schema:updated` | `SchemaUpdatedPayload` | Schema 变更广播 |
| `schema:rejected` | `{ reason, acceptedTimestamp, acceptedData }` | Schema 变更被拒（时间戳冲突），客户端同步到最新 + 校准时间戳 |
| `schema:saved` | `{ success, projectId, error? }` | 保存回执；**被拒时也必须发**（`success:false`），否则客户端 `saveStatus` 卡在 `saving` |
| `locale:updated` | `LocaleUpdatedPayload` | 译文变更广播（`socket.to` 排除发起方） |
| `locale:saved` | `{ success, projectId, lang, error? }` | Locale 保存回执 |
| `locale:synced` | `{ projectId, addedKeys, removedKeys }` | Schema 键变更后同步通知 |
| `overwritten` | - | ⚠️ **预留**：客户端有监听，服务端暂无发送点 |

## 时间戳冲突检测流程

1. 客户端发送 `schema:updated`/`schema:save` 携带 `timestamp`。
2. 服务端与模块级 `globalSchemaTimestamps`（按 projectId）比对：
   - `timestamp < lastTimestamp` → 拒绝，回 `schema:rejected`（含最新已接受数据）。
   - `timestamp >= lastTimestamp` → 接受并广播。
3. 客户端收到 `schema:rejected` → 同步到 `acceptedData` + 记录 `lastAccepted` 校准时钟（`useSocket.nextTimestamp()` = `max(Date.now(), lastAccepted + 1)`）。

> **保存状态**：客户端 `useSocket` 维护 RxJS 保存状态流，"保存中"≥800ms、"已保存"2s 回 idle（详见 [[concepts/自动保存|自动保存]]）。

> [!note]
> `overwritten` 事件为预留（客户端有监听、服务端无发送点）；`update` 通用事件是死代码。

> [!warning] ⚠️ 文档矛盾
> `[[raw/CODEMAPS/backend.md|backend.md]]` 与 `[[raw/CONTRIBUTING.md|CONTRIBUTING]]` 仍列出 `lock`/`unlock` 事件。
> **权威状态**：键级锁定已于 2026-08-09 移除，`lock`/`unlock` 不再是协议的一部分（见 [[concepts/并发与冲突处理|并发与冲突处理]]）。

## 关联

- [[concepts/并发与冲突处理|并发与冲突处理]] — 冲突检测机制
- [[concepts/自动保存|自动保存]] — 保存事件流
- [[RESTful-API|RESTful API 契约]] — HTTP 备用路径
- [[数据层|数据层]] — 广播触发点
- [[features/编辑器|编辑器]] — 客户端接线
