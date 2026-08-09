# Plan: 实时协作值变更同步

**Source**: 会话讨论（4 轮迭代）
**Complexity**: MEDIUM-HIGH
**Created**: 2026-08-10

## Summary

修复"修改 key 对应的 value 后其他客户端不更新"的缺陷，覆盖主表 Schema 与译文两侧。同时把 Monaco 的
`setValue` 全量替换改为最小编辑（保住接收端 undo 栈与折叠状态），并为客户端时间戳加入校准以避免时钟慢
的机器被永久拒绝。在线人数保持 socket 连接数语义不变，仅修正 CLAUDE.md 中错误的"IP 区分操作者"描述。

## 需求决策

| # | 需求 | 决策 |
|---|---|---|
| 1 | 在线人数语义 | 保持 socket 连接数，仅修文档 |
| 2 | 值变更广播 | Schema 与译文双向都要 |
| 3 | 时间戳来源 | 保持客户端 `Date.now()`，不改服务端版本号 |
| 4 | 接收端状态保护 | 选项 B：最小编辑替代 `setValue` |
| 5 | 时钟校准 | 纳入实施 |
| 6 | R8 | 一并修（两侧 `isEditingRef` 行为对齐） |

## 要修的缺陷

改 value 时 `addedKeys` / `removedKeys` 均为空数组，导致：

| # | 缺陷 | 阻塞点 |
|---|---|---|
| D1 | Schema 值变更不广播 | `SchemaEditor.tsx:220` 条件门 |
| D2 | 服务端保存后也不广播 | `schema.ts:142` 提前 return，广播点在 `schema.ts:202` |
| D3 | 译文完全不同步 | `locales.ts:74-96` 无任何广播代码 |
| R8 | 两侧 `isEditingRef` 重置行为不一致 | `LocaleEditor.tsx:181` 有重置，`SchemaEditor` 无 |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 事件命名 | `socket-handler.ts:51,71` | `xxx:updated`（广播）/ `xxx:save`（持久化）成对 |
| 排除发起方 | `socket-handler.ts:47,67` | `socket.to(roomName).emit(...)` |
| 时间戳 gate | `socket-handler.ts:52-62` | 模块级 Map + 回传已接受数据 |
| 增量编辑 | `SchemaEditor.tsx:419-433` | `executeEdits` + `isProgrammaticChangeRef` 包裹 |
| 纯函数抽取 | `utils.ts:233,303` | `determineInsertionPath` / `buildInsertEdit` |
| 接收侧保护 | `SchemaEditor.tsx:104-108` | `isEditingRef` 为真时只警告不覆盖 |
| 测试 | `src/lib/utils.test.ts` | Vitest + AAA |

## 关键设计决策

### 决策 1：`setValue` 内部改为最小编辑
不新增 API，直接替换 `MonacoEditor` 的 `setValue` 实现。全部 5 个调用点语义一致，零调用点改动。
新建纯函数 `computeMinimalEdit(oldText, newText)`：行级公共前缀/后缀裁剪 → 返回单个编辑操作或 `null`。
`executeEdits` 是追加到 undo 栈，`setValue` 是清空——仅此切换就修好最难受的问题。

### 决策 2：跟着 B 一起清掉手动光标恢复
`SchemaEditor.tsx:130-142` / `LocaleEditor.tsx:94-106` 的光标恢复是为补偿 `setValue` 破坏性而存在。
改成最小编辑后 Monaco 自动正确调整光标，这些代码反而会把光标强行拽回过期位置，必须一并移除。

### 决策 3：Schema 时间戳 gate 补到 `schema:save`
去掉条件门后 gate 从"仅键增删触发"变成"每次值编辑触发"，暴露既有不一致：
`schema:updated` 被拒但 `schema:save` 仍无条件写盘 → 磁盘与所有客户端显示不一致。
修法：`SchemaSavePayload` 加 `timestamp`，复用同一个 `globalSchemaTimestamps`。
gate 用 `<` 而非 `<=`，保证同一次编辑的 updated/save 携带相同时间戳时不自我阻塞。
被拒时须同时发 `schema:rejected` 和 `schema:saved{success:false}`，否则 `saveStatus` 永久卡 `'saving'`。

### 决策 4：时间戳生成上移到 `useSocket`
校准逻辑必须和 `schema:rejected` 处理器同处。`nextTimestamp() = max(Date.now(), lastAccepted + 1)`。
副作用：`sendSchemaUpdated` 签名收窄，`socketId` prop 可从 `SchemaEditor` 移除。

### 决策 5：译文 v1 不做拒绝，走 last-write-wins
`locale:save` 对磁盘无条件覆盖。若广播做 gate 而持久化不做，会重演决策 3 的不一致。
载荷带 `timestamp`/`clientId` 留口，但不设 gate。

### 决策 6：远端译文更新用新的 `setTranslation`
`updateTranslation` 会设 `isDirty: true`，收到别人的译文却显示"未保存"是错的。
新增 `setTranslation`：同样 sanitize，但不动 dirty 标记（对照 `setSchema`）。

## Files to Change

| # | File | Action | Why |
|---|---|---|---|
| 1 | `src/lib/monaco-edits.ts` | CREATE | `computeMinimalEdit` 纯函数（utils.ts 已 353 行） |
| 2 | `src/lib/monaco-edits.test.ts` | CREATE | 纯函数单测 |
| 3 | `src/components/json-editor/MonacoEditor.tsx` | UPDATE | `setValue` 与 value prop effect 改最小编辑 |
| 4 | `src/types/collaboration.ts` | UPDATE | 载荷类型扩展 |
| 5 | `src/stores/editorStore.ts` | UPDATE | 新增 `setTranslation` |
| 6 | `src/lib/socket-handler.ts` | UPDATE | `schema:save` gate；`locale:updated` 转发 |
| 7 | `src/hooks/useSocket.ts` | UPDATE | 时钟校准；`sendLocaleUpdated`；监听 `locale:updated` |
| 8 | `src/components/project/SchemaEditor.tsx` | UPDATE | 删条件门/光标恢复；`handleSort` 补广播；R8 |
| 9 | `src/components/project/LocaleEditor.tsx` | UPDATE | 补广播；删光标恢复 |
| 10 | `src/app/projects/[id]/page.tsx` | UPDATE | 透传 `sendLocaleUpdated` |
| 11 | `src/stores/editorStore.test.ts` | UPDATE | 测 `setTranslation` |
| 12 | `CLAUDE.md` | UPDATE | IP 说法 + 事件表 + 最小编辑机制 |

## Tasks

> 排序原则：先建缓解措施（Phase 1-2），再提升广播频率（Phase 3-4）。
> 避免中间态出现"频繁清 undo 栈"的糟糕体验。

### Phase 1 — 最小编辑纯函数
- **Action**: 新建 `src/lib/monaco-edits.ts`，实现 `computeMinimalEdit`。行级公共前缀 P / 后缀 S
  裁剪（须保证 `P + S <= min(oldLen, newLen)` 防重叠），返回单个整行范围替换
- **Mirror**: `utils.ts:303` `buildInsertEdit` 的纯函数 + 编辑描述对象风格
- **边界用例**: 内容相同（`null`）、纯插入、纯删除、仅首行改、仅末行改、全文改、空串互转、单行文件
- **Validate**: `npm test -- monaco-edits`

### Phase 2 — 接入 Monaco 并清理补偿代码
- **Action**:
  - `MonacoEditor.tsx:159-167` `setValue` 改用 `computeMinimalEdit` + `pushEditOperations`
  - `MonacoEditor.tsx:140` value prop effect 同样改造，移除 `:142-151` 手动光标恢复
  - 移除 `SchemaEditor.tsx:130-142`、`LocaleEditor.tsx:94-106` 手动光标/滚动恢复
- **Validate**: `npx tsc --noEmit` + 手测项 5/6
- **⚠️ 此阶段完成后停下，等用户确认无回归再继续**

### Phase 3 — Schema 值变更广播 + gate + 时钟校准
- **Action**:
  - `useSocket.ts` 加 `lastAcceptedTimestampRef` + `nextTimestamp()`；`schema:rejected` 记录
  - `sendSchemaUpdated` / `sendSchemaSave` 内部注入 timestamp
  - `SchemaEditor.tsx:220` 去掉条件门
  - `SchemaEditor.tsx:492` `handleSort` 补 `sendSchemaUpdated`
  - `socket-handler.ts` `schema:save` 加 gate
  - R8: `SchemaEditor` 的 `parseLogic` 里重置 `isEditingRef`
- **Validate**: 双窗口手测改 value；冲突后核对磁盘

### Phase 4 — 译文广播
- **Action**:
  - `editorStore.ts` 加 `setTranslation`
  - `socket-handler.ts` 加 `locale:updated` 处理器
  - `useSocket.ts` 加 `sendLocaleUpdated` + 监听
  - `LocaleEditor.tsx:188`/`:125` 补广播
  - `page.tsx:120` 透传
- **Mirror**: `socket-handler.ts:46-48` 转发形状
- **Validate**: `npm test -- editorStore` + 双窗口手测

### Phase 5 — 文档与全量验证
- **Action**: `CLAUDE.md` 第 59 行 IP 说法 → "在线人数按 Socket.IO 房间连接数统计，同一浏览器多 tab
  各计一次，不做身份识别"；事件表补 `locale:updated`；记录最小编辑机制；`sendUpdate` 标注死代码

## Validation

```bash
npx tsc --noEmit
npm run lint
npm test
```

手工验证（`npm run start:server`，两浏览器窗口开同一项目）：

| # | 步骤 | 期望 |
|---|---|---|
| 1 | 左栏改某 key 的 value | 对端左栏更新，不显示"未保存" |
| 2 | 右栏改译文 | 对端右栏更新，不显示"未保存" |
| 3 | 增删 key | 两侧更新，译文键同步 |
| 4 | 点"排序" | 对端两侧顺序同步 |
| 5 | 对端折叠 JSON 节点后本端改 value | 对端折叠状态保持 ← B 验收 |
| 6 | 对端改完失焦，本端改 value，对端 Ctrl+Z | 对端能撤回自己的操作 ← B 验收 |
| 7 | 两窗口同时编同一 key | 较早方收 `schema:rejected` 自动同步，磁盘与两端一致 |
| 8 | 一端打字中对端提交 | 打字方显警告，内容不被覆盖 |
| 9 | 系统时钟慢 5 分钟后编辑 | 首次被拒后后续编辑能成功 ← 校准验收 |

## Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | `setValue` 是共享原语，改内部实现影响全部 5 个调用点 | 中 | Phase 1 单测覆盖边界；Phase 2 独立验证后再进 Phase 3。**本方案最大单点风险** |
| R2 | 行级裁剪对"全文重排"退化为整文档替换 | 低 | 退化后仍优于 `setValue`（undo 栈保留）。点"排序"会命中，可接受 |
| R3 | 移除手动光标恢复后行为回归 | 中 | 手测项 5/6 覆盖；改动局限 3 处 |
| R4 | 跨机器时钟偏移 | 低（已缓解） | 决策 4 的校准 |
| R5 | 同一次编辑收到 2 个 `schema:rejected` | 低 | 同步操作幂等，仅日志噪音 |
| R6 | 增删键时对端收 2 次 `schema:updated` | 低 | 内容相同 → `computeMinimalEdit` 返回 `null` → 无操作。已知项 |
| R7 | `schema.ts:202` 用 `io.to` 给发起方回声 | 低 | 同 R6 |
| R9 | `i18nManager.md:106` 同样写着 IP 说法 | — | 该文件是原始需求文档，本次不动 |

## Acceptance

- [ ] 改 Schema 值 → 对端更新，无虚假 dirty
- [ ] 改译文 → 对端更新，无虚假 dirty
- [ ] 键增删 / 排序 → 对端更新
- [ ] 对端 undo 栈在收到远端更新后仍可用
- [ ] 对端折叠状态在收到远端更新后保持
- [ ] 冲突拒绝后磁盘与所有端一致
- [ ] 时钟慢的客户端不被永久拒绝
- [ ] `tsc --noEmit` / `lint` / `test` 全绿
- [ ] `CLAUDE.md` IP 说法已修正，事件表含 `locale:updated`

## 工时

| 阶段 | 工时 |
|---|---|
| Phase 1 纯函数 + 单测 | 1.5h |
| Phase 2 接入 + 清理 | 1.5h |
| Phase 3 Schema + gate + 校准 + R8 | 1.75h |
| Phase 4 译文 | 1h |
| Phase 5 文档 + 手测 9 项 | 1h |
| **合计** | **6.75h** |
