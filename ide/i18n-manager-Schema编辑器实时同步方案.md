# Schema 编辑器实时同步方案分析

> 主表 Schema 编辑器如何做到让多语言编辑器实时更新

---

## 1. 当前状态分析

### 数据流概览

```
User types in SchemaEditor (Monaco)
  → handleChange → debouncedParseAndSync (1s debounce)
    → JSON.parse + flattenObject
    → updateSchema(flatKeys)        // 更新 editorStore.schema
    → updateTranslation(lang, ...)  // 仅对 NEW 键添加空占位符
    → 设置 isDirty = true
      → useProjectEditor 检测到 isDirty
        → debouncedSave (1s debounce)
          → saveSchemaIncremental()     // HTTP PATCH /api/projects/{id}/schema/keys
            → data-layer: updateSchemaIncremental()
              → 写入 schema.json
              → syncSchemaChangesToLocales()  // 写入 locale 文件，通过 Socket.IO 广播
          → saveLocalesIncremental()
```

### 现有机制

| 组件 | 机制 |
|------|------|
| **SchemaEditor → Store (本地)** | `debouncedParseAndSync` 调用 `updateSchema`，仅处理新键的 locale 同步 |
| **SchemaEditor → Store (外部)** | `useEffect` 监听 `schema`，外部变化时（WebSocket）更新 Monaco 内容 |
| **服务端同步** | `syncSchemaChangesToLocales` 读取所有 locale 文件，添加/删除键，广播 `locale:synced` |
| **客户端接收** | `useSocket` 监听 `locale:synced`，调用 `applyLocaleSync` |
| **LocaleEditor 响应** | `useEffect` 监听 `openLocales`，变化时更新 Monaco |

### 五大关键缺口

| # | 问题 | 影响 |
|---|------|------|
| 1 | Schema 变更未通过 WebSocket 广播 | 用户 A 改 Schema，用户 B 完全不知情 |
| 2 | 本地只同步新增键，未处理删除和重命名 | 删键后 Locale 编辑器不会实时移除 |
| 3 | 无重命名检测 | `user.name` → `user.fullName` 被视为删+增，翻译值丢失 |
| 4 | Schema 编辑器未监听 WebSocket Schema 更新 | 别人改了 Schema，当前编辑器不会刷新 |
| 5 | 未保存变更冲突 | 用户编辑中时 Schema 变更可能导致内容不一致 |

---

## 2. 核心问题

当用户编辑 Schema（左栏）时，以下操作必须在**所有已连接的客户端**上实时生效：

| Schema 操作 | 本地 Locale 编辑器 | 远程 Locale 编辑器 |
|---|---|---|
| 新增键 `user.email` | 插入空值 `""` | 插入空值 `""` |
| 删除键 `user.name` | 删除所有 locale 中的 `user.name` | 同上 |
| 重命名 `user.name` → `user.fullName` | 迁移旧翻译值到新键 | 同上 |
| 编辑已有键的描述 | 不影响 locale 值 | 不影响 locale 值 |
| 快速连续编辑 | 防抖合并 | 防抖合并 |

---

## 3. 架构设计

### 3.1 Schema 变更检测策略

SchemaEditor 已有 1 秒防抖解析。关键：**不要每次按键都传播到 locale 编辑器**。等待防抖稳定且 JSON 有效后，计算新旧 Schema 的 diff。

**检测逻辑**（解析成功后计算）：

```
oldFlatKeys = flattenObject(oldSchema) 的键集合
newFlatKeys = flattenObject(newSchema) 的键集合

addedKeys   = newFlatKeys - oldFlatKeys
removedKeys = oldFlatKeys - newFlatKeys
```

### 3.2 传播路径

```
Schema Editor (用户 A)
  │-- 本地: updateStore.schema, applyLocaleSync(addedKeys, removedKeys)
  │-- Socket: 发送 'schema:updated' 事件
  │     { addedKeys, removedKeys, schema, timestamp, clientId }
  ▼
Socket.IO 服务端
  │-- 广播到房间（排除发送者）
  ▼
Schema Editor (用户 B)            Locale Editor (用户 B)
  │-- 收到 'schema:updated'         │-- 收到 'schema:updated'
  │-- setSchema(schema)             │-- applyLocaleSync(added, removed)
  │-- 更新 Monaco 内容               │-- 更新 Monaco 内容
```

### 3.3 重命名检测（启发式）

```typescript
const renameMap: Record<string, string> = {};
for (const removed of removedKeys) {
  const removedParts = removed.split('.');
  const removedPrefix = removedParts.slice(0, -1).join('.');
  const removedLast = removedParts[removedParts.length - 1];
  for (const added of newKeys) {
    const addedParts = added.split('.');
    const addedPrefix = addedParts.slice(0, -1).join('.');
    if (removedPrefix === addedPrefix && removedLast !== addedParts[addedParts.length - 1]) {
      renameMap[removed] = added;
      break;
    }
  }
}
```

---

## 4. 冲突解决策略：时间戳 + 最后写入者胜出

### 4.1 设计原则

使用**时间戳机制**判断冲突：每次 Schema 变更携带 `timestamp` 和 `clientId`，服务端比较时间戳决定哪个变更生效。

**为什么不用 isEditingRef（放弃该方案）：**

- `isEditingRef` 只能阻止本地 UI 更新，无法解决真正的数据冲突
- 它会让用户以为修改已保存，但实际上被后续 Schema 变更覆盖
- 时间戳方案更明确：后来的修改覆盖之前的

### 4.2 时间戳冲突解决流程

```
客户端 A (t=100)                   客户端 B (t=200)
  │                                    │
  │-- 发送 schema:updated (t=100)      │-- 发送 schema:updated (t=200)
  │                                    │
  ▼                                    ▼
            Socket.IO 服务端
              │
              │-- 比较时间戳
              │-- t=200 > t=100 → B 的变更生效
              │-- 广播 B 的变更给所有人（含 A）
              │-- 记录 lastAcceptedTimestamp = 200
              ▼
           所有客户端
              │-- 应用 t=200 的 Schema
              │-- 同步 locale
```

### 4.3 具体实现

**客户端发送变更**：

```typescript
// SchemaEditor.tsx
const sendSchemaUpdate = (addedKeys, removedKeys, schema) => {
  const timestamp = Date.now();
  sendUpdate({
    type: 'schema:updated',
    data: {
      schema,
      addedKeys,
      removedKeys,
      timestamp,
      clientId: socket.id,
    },
  });
};
```

**服务端处理冲突**：

```typescript
// socket-handler.ts
const lastSchemaTimestamps = new Map<string, number>(); // projectId → timestamp

socket.on('schema:updated', (data) => {
  const { projectId, timestamp } = data;
  const lastTimestamp = lastSchemaTimestamps.get(projectId) || 0;

  if (timestamp < lastTimestamp) {
    // 旧变更，丢弃
    socket.emit('schema:rejected', {
      reason: 'stale_timestamp',
      acceptedTimestamp: lastTimestamp,
      acceptedData: lastAcceptedData.get(projectId),
    });
    return;
  }

  // 新变更，接受并广播
  lastSchemaTimestamps.set(projectId, timestamp);
  lastAcceptedData.set(projectId, data);
  socket.to(roomName).emit('schema:updated', data);
});
```

**客户端收到拒绝时回滚**：

```typescript
// useSocket.ts
socket.on('schema:rejected', (data) => {
  // 显示提示："Schema 已被其他用户更新，已回滚到最新版本"
  setSchema(data.acceptedData.schema);
  applyLocaleSync(data.acceptedData.addedKeys, data.acceptedData.removedKeys);
  showWarning('Schema 已被其他用户更新');
});
```

### 4.4 编辑中保护 + 时间戳

即使使用时间戳方案，用户正在编辑时也不应强制刷新编辑器内容。结合方案：

```
用户 B 正在编辑 Monaco 编辑器
  │
  │-- 收到 schema:updated (时间戳较新)
  │
  ├── 如果用户正在编辑（isEditingRef = true）：
  │     │-- 更新 store（openLocales 更新）
  │     │-- 不强制刷新 Monaco 编辑器
  │     │-- 显示警告横幅："Schema 已更新，保存后应用新结构"
  │     │-- 用户完成编辑后，保存时自动合并最新 Schema
  │
  └── 如果用户未在编辑（isEditingRef = false）：
        │-- 更新 store
        │-- 直接刷新 Monaco 编辑器内容
```

### 4.5 与自动保存的协同

```
用户 A 修改 Schema（t=100）
  │-- 防抖 1s → 本地更新
  │-- 发送 WebSocket → 服务端广播
  │
  │-- 防抖 1s → 自动保存 (t=200)
  │-- HTTP PATCH → 服务端写入文件
  │
  如果 t=100 和 t=200 之间用户 B 的变更 (t=150) 已生效：
    │-- 自动保存时发送的是 t=100 的 Schema
    │-- 服务端检测到 t=100 < lastAccepted(150)
    │-- 拒绝保存，返回 409 Conflict
    │-- 客户端收到 409，重新加载最新 Schema
```

---

## 5. 完整数据流图

```
SchemaEditor (用户 A)
  │
  │-- handleChange (每次按键)
  │     │-- set editorText（本地状态）
  │     │-- debouncedParseAndSync (1s)
  │           │
  │           │-- JSON.parse + flatten
  │           │-- computeDiff(oldSchema, newSchema)
  │           │     │-- addedKeys, removedKeys, renameCandidates
  │           │
  │           │-- updateSchema(clean)          → editorStore.schema
  │           │-- applyLocaleSync(added, removed) → editorStore.openLocales
  │           │     │
  │           │     ▼
  │           │  LocaleEditor (用户 A)
  │           │  useEffect → Monaco.setValue()
  │           │  （isEditingRef=true 时不刷新）
  │           │
  │           │-- sendUpdate({
  │           │     type: 'schema:updated',
  │           │     data: { schema, addedKeys, removedKeys, timestamp, clientId }
  │           │   })
  │                 │
  │                 ▼
  │           Socket.IO 服务端
  │           │-- 比较时间戳
  │           │-- 新则广播到房间（排除发送者）
  │           │-- 旧则返回 schema:rejected
  │                 │
  │                 ▼
  │           useSocket (用户 B)
  │           │-- 收到 schema:updated
  │           │     │-- setSchema(schema)       → editorStore.schema
  │           │     │-- applyLocaleSync(added, removed)
  │           │     │     │
  │           │     │     ▼
  │           │     │  LocaleEditor (用户 B)
  │           │     │  useEffect → isEditingRef ?
  │           │     │    true: 仅更新 store, 不刷编辑器, 显示警告
  │           │     │    false: 更新编辑器内容
  │           │     │
  │           │     ▼
  │           │  SchemaEditor (用户 B)
  │           │  useEffect → Monaco.setValue()
  │
  │-- 自动保存（通过 useProjectEditor）
        │-- HTTP PATCH /api/projects/{id}/schema/keys
        │-- HTTP PATCH /api/projects/{id}/locales/{lang}/keys
        │-- 服务端检测时间戳冲突 → 409 → 客户端重载
```

---

## 6. 分步实现计划

### Step 1: 新增 `schema:updated` 事件类型

**文件**: `src/types/collaboration.ts`

```typescript
export interface SchemaUpdatedPayload {
  projectId: string;
  schema: Record<string, any>;
  addedKeys: string[];
  removedKeys: string[];
  timestamp: number;      // 新增
  clientId: string;       // 新增
}

export type SocketEvent =
  | 'lock' | 'unlock' | 'update'
  | 'overwritten' | 'online_count'
  | 'join' | 'error'
  | 'schema:updated'
  | 'schema:rejected';   // 新增
```

### Step 2: 服务端 WebSocket 处理器（含时间戳冲突检测）

**文件**: `src/lib/socket-handler.ts`

```typescript
const lastSchemaTimestamps = new Map<string, number>();
const lastAcceptedData = new Map<string, any>();

socket.on('schema:updated', (data: SchemaUpdatedPayload) => {
  const roomName = `room:project-${data.projectId}`;
  const lastTimestamp = lastSchemaTimestamps.get(data.projectId) || 0;

  if (data.timestamp < lastTimestamp) {
    // 旧变更，拒绝
    socket.emit('schema:rejected', {
      reason: 'stale_timestamp',
      acceptedTimestamp: lastTimestamp,
      acceptedData: lastAcceptedData.get(data.projectId),
    });
    return;
  }

  // 新变更，接受并广播
  lastSchemaTimestamps.set(data.projectId, data.timestamp);
  lastAcceptedData.set(data.projectId, data);
  socket.to(roomName).emit('schema:updated', data);
});
```

### Step 3: 增强 `applyLocaleSync` + 新增 `reconcileSchemaInLocales`

**文件**: `src/stores/editorStore.ts`

添加 `renameMap` 参数，支持翻译值迁移：

```typescript
applyLocaleSync: (addedKeys, removedKeys, renameMap?) =>
  set((state) => {
    if (!addedKeys.length && !removedKeys.length && !renameMap) return state;
    const newOpenLocales: Record<string, TranslationObject> = {};
    for (const [lang, translations] of Object.entries(state.openLocales)) {
      const flatCurrent = flattenObject(translations);
      // 处理重命名：迁移旧值到新键
      if (renameMap) {
        for (const [oldKey, newKey] of Object.entries(renameMap)) {
          if (oldKey in flatCurrent) {
            flatCurrent[newKey] = flatCurrent[oldKey];
            delete flatCurrent[oldKey];
          }
        }
      }
      // 新增空键
      for (const key of addedKeys) {
        if (!(key in flatCurrent)) flatCurrent[key] = '';
      }
      // 删除旧键
      for (const key of removedKeys) {
        delete flatCurrent[key];
      }
      newOpenLocales[lang] = unflattenObject(flatCurrent);
    }
    return { openLocales: newOpenLocales };
  }),
```

### Step 4: SchemaEditor 广播变更 + 时间戳

**文件**: `src/components/project/SchemaEditor.tsx`

```typescript
// 在 debouncedParseAndSync 中：
const oldKeys = Object.keys(schemaRef.current);
const newKeys = Object.keys(clean).filter(k => !(k in schemaRef.current));
const removedKeys = oldKeys.filter(k => !(k in clean));

// 重命名检测
const renameMap = detectRenames(removedKeys, newKeys);

// 本地更新
if (newKeys.length || removedKeys.length) {
  applyLocaleSync(newKeys, removedKeys, renameMap);
}

// WebSocket 广播 + 时间戳
if (newKeys.length || removedKeys.length) {
  sendUpdate({
    type: 'schema:updated',
    data: {
      schema: clean,
      addedKeys: newKeys,
      removedKeys,
      renameMap: Object.keys(renameMap).length ? renameMap : undefined,
      timestamp: Date.now(),
      clientId: socket.id,
    },
  });
}
```

### Step 5: useSocket 处理 schema:updated + schema:rejected

**文件**: `src/hooks/useSocket.ts`

```typescript
// 收到 Schema 更新
socket.on('schema:updated', (data) => {
  setSchema(data.schema);
  applyLocaleSync(data.addedKeys, data.removedKeys, data.renameMap);
});

// 收到拒绝（时间戳冲突）
socket.on('schema:rejected', (data) => {
  // 回滚到最新版本
  setSchema(data.acceptedData.schema);
  applyLocaleSync(data.acceptedData.addedKeys, data.acceptedData.removedKeys);
  // 显示提示
  setWarning('Schema 已被其他用户更新，已同步到最新版本');
});
```

### Step 6: LocaleEditor 编辑中保护

**文件**: `src/components/project/LocaleEditor.tsx`

```typescript
// useRef 追踪编辑状态
const isEditingRef = useRef(false);
const [schemaChangeWarning, setSchemaChangeWarning] = useState(false);

// 监听 openLocales 变化
useEffect(() => {
  if (isEditingRef.current) {
    // 用户正在编辑，不刷新编辑器
    setSchemaChangeWarning(true);
    return;
  }
  // 用户不在编辑，直接更新
  const content = JSON.stringify(openLocales[activeLang], null, 2);
  editorRef.current?.setValue(content);
  setSchemaChangeWarning(false);
}, [openLocales]);

// 用户保存时合并最新 Schema
const handleSave = () => {
  // 保存时会读取最新 store 中的 openLocales
  // 已经包含了 applyLocaleSync 的结果
  saveToServer();
  setSchemaChangeWarning(false);
};
```

### Step 7: 服务端文件保存时的时间戳校验

**文件**: `src/lib/data-layer/schema.ts` / API 路由

```typescript
// 在 updateSchemaIncremental 中
export async function updateSchemaIncremental(
  projectId: string,
  addedKeys: string[],
  removedKeys: string[],
  clientTimestamp: number
): Promise<void> {
  // 读取最后接受的时间戳
  const lastTimestamp = await getLastSchemaTimestamp(projectId);

  if (clientTimestamp < lastTimestamp) {
    throw new SchemaConflictError('Schema has been updated by another user');
  }

  // 正常写入
  // ...
  await setLastSchemaTimestamp(projectId, clientTimestamp);
}
```

### Step 8: RxJS 优化（可选）

**文件**: `src/components/project/SchemaEditor.tsx`

```typescript
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

useEffect(() => {
  const subject = new Subject<string>();
  const subscription = subject.pipe(
    debounceTime(PARSE_DEBOUNCE),
    distinctUntilChanged()
  ).subscribe((rawText) => {
    // 解析 + diff + 同步逻辑
  });
  return () => subscription.unsubscribe();
}, []);
```

---

## 7. 边界情况处理

| 场景 | 方案 |
|------|------|
| **用户 A 和 B 同时修改 Schema** | 时间戳比较，后来的覆盖先前的。被覆盖方收到 `schema:rejected` 回滚 |
| **用户正在编辑时 Schema 被更新** | 不强制刷新编辑器，显示黄色警告横幅，保存时自动合并最新 Schema |
| **键重命名导致翻译值迁移** | `renameMap` 参数将旧值迁移到新键，避免翻译丢失 |
| **快速连续 Schema 编辑** | 1s 防抖 + `distinctUntilChanged` 合并重复变更 |
| **断开重连后 Schema 同步** | 服务端文件保存时广播完整 Schema，重连客户端重新获取 |
| **数组值处理** | `flattenObject` 对数组抛出异常，`applyLocaleSync` 捕获并跳过该 locale |
| **自动保存时的冲突** | HTTP PATCH 携带时间戳，服务端检测冲突返回 409，客户端重载 |

---

## 8. 修改文件清单

| 文件 | 变更内容 |
|------|---------|
| `src/types/collaboration.ts` | 新增 `SchemaUpdatedPayload`、`schema:rejected` 事件 |
| `src/lib/socket-handler.ts` | 新增 `schema:updated` 处理器 + 时间戳冲突检测 |
| `src/stores/editorStore.ts` | 增强 `applyLocaleSync`（renameMap），新增 `reconcileSchemaInLocales` |
| `src/components/project/SchemaEditor.tsx` | 完整 diff 计算 + WebSocket 广播 + 时间戳 + 重命名检测 |
| `src/hooks/useSocket.ts` | 监听 `schema:updated` + `schema:rejected` |
| `src/components/project/LocaleEditor.tsx` | 编辑中保护 + 警告横幅 + 保存时合并 |
| `src/lib/data-layer/schema.ts` | 保存时时间戳校验 + 冲突异常 |
| API 路由 `src/app/api/projects/[id]/schema/keys/route.ts` | 携带时间戳参数，返回 409 冲突 |

---

## 9. 时间戳冲突解决流程图

```
用户 A (t=100)              用户 B (t=200)              服务端
    │                           │                          │
    │── schema:updated ────────►│                          │
    │   (t=100)                 │                          │
    │                           │── schema:updated ───────►│
    │                           │   (t=200)                │── lastTimestamp=0
    │                           │                          │── t=200 > 0 → 接受
    │                           │                          │── lastTimestamp=200
    │                           │◄── broadcast ───────────│
    │◄── broadcast ─────────────│                          │
    │   (t=200)                 │                          │
    │                           │                          │
    │── schema:updated ────────►│                          │
    │   (t=100) ← 旧变更!       │                          │
    │                           │                          │── t=100 < 200 → 拒绝
    │◄── schema:rejected ──────│                          │
    │   回滚到 t=200            │                          │
```

---

> **总结**：时间戳 + 最后写入者胜出（LWW）策略为 Schema 编辑器实时同步提供了清晰、可预期的冲突解决机制。配合编辑中保护（不强制刷新 UI），既保证了数据一致性，又避免了打断用户工作流。实现涉及 8 个文件的核心修改，建议按 Step 1 → 8 的顺序逐步实施。
