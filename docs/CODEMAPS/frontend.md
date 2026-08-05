<!-- Generated: 2026-07-28 | Files scanned: 45 | Token estimate: ~750 -->

# Frontend Architecture

**Last Updated:** 2026-08-05
**Entry Points:** `src/app/page.tsx`, `src/app/projects/[id]/page.tsx`

## Pages (App Router)

| Path | Component | Type | Description |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Client | Project list: create/edit/delete projects, RxJS debounced search |
| `/projects/[id]` | `src/app/projects/[id]/page.tsx` | Client | Main editor: left (Schema), right (Translations Tabs) |
| `/projects/[id]/layout.tsx` | - | Server | Layout wrapper (transparent pass-through) |
| `/app/layout.tsx` | - | Server | Root layout (Geist fonts, zh-CN lang, metadata) |

## Page Tree

### Home Page (`/`)
```
HomePage (Client, axios + router + RxJS Subject for search)
├── Search Input (debounced 300ms via RxJS debounceTime + distinctUntilChanged; frontend cache + local filter + keyword highlight)
├── Project Cards (Ant Design Card + Meta, hoverable, click to navigate)
│   └── Actions: EditOutlined, DeleteOutlined
├── Create Project Modal (Ant Design Form, title 1-50 chars, description max 200)
└── Edit Project Modal (Ant Design Form, same fields)
```

### Editor Page (`/projects/[id]`)
```
ProjectEditorPage (Client, uses useProjectEditor + useSocket hooks)
├── Top Bar
│   ├── Back Button (ArrowLeftOutlined, navigate to /)
│   ├── Project Title (loaded from API)
│   ├── Global Search Input (placeholder, keyword state)
│   ├── OnlineBadge (collaborationStore.onlineCount)
│   ├── Import Button (opens ImportPreviewDialog)
│   └── Export Button (opens ExportSelectorDialog)
├── Overwritten Message Banner (auto-hide 3s, yellow background)
├── Left Panel (50% width)
│   ├── "主表 Schema" header
│   └── SchemaEditor (Monaco JSON, RxJS debounced parse + save)
└── Right Panel (50% width)
    ├── LanguageTabs (Ant Design Tabs card type, Dropdown for add/open)
    └── LocaleEditor (Monaco JSON, RxJS debounced parse + save + reference popover)
├── ImportPreviewDialog (modal with Monaco DiffEditor for conflict diff)
└── ExportSelectorDialog (Checkbox list + ZIP download via file-saver)
```

## Components

### JSON Editor Components
- **`MonacoEditor.tsx`**: `@monaco-editor/react` wrapper (`forwardRef` + `memo`)
  - Dynamic import via `next/dynamic` (SSR safe)
  - Exposes: `getValue`, `setValue`, `focus`, `find`, `formatDocument`, `getEditor`, `getCursorPosition`
  - Handles value prop sync with cursor/scroll position preservation
  - `fromUserRef` flag prevents cursor jump on user-initiated changes
  - Auto-format on paste
  - Default options: vs-dark theme, JSON language, minimap off, tabSize 2, bracketPairColorization enabled

- **`JsonEditor.tsx`**: (deprecated) old `jsoneditor` library wrapper — still present but not used in production components

### Project Components
- **`SchemaEditor.tsx`**: Left panel editor
  - Connects to `useEditorStore` (schema, openLocales, updateSchema, applyLocaleSync)
  - RxJS Subject + `debounceTime(PARSE_DEBOUNCE)` + `distinctUntilChanged` for debounced JSON parsing
  - Heuristic rename detection: same prefix, different last segment → `renameMap`
  - JSON validation with Monaco markers (red squiggly lines)
  - Validation status indicator (green/yellow/red dot)
  - Toolbar: "添加键" button (auto-generate unique key), "格式化" button
  - Sends `schema:updated` + `schema:save` via Socket.IO on changes
  - `isEditingRef` prevents external store updates from overwriting user input

- **`LocaleEditor.tsx`**: Right panel editor
  - Connects to `useEditorStore` (activeLang, openLocales, schema, updateTranslation)
  - RxJS Subject + `debounceTime(PARSE_DEBOUNCE)` + `distinctUntilChanged` for debounced parsing
  - Translation reference popover: shows key name, description, other language translations
  - Key path inference from cursor position (regex on line content)
  - Lock indicators: shows count of keys locked by others in current language
  - Schema change warning: when user is editing and external schema update arrives
  - JSON validation status bar (green checkmark / red X)
  - Sends `locale:save` via Socket.IO on changes
  - Empty state: "暂无语言，请点击 '+' 按钮添加"

- **`LanguageTabs.tsx`**: Tab management
  - Ant Design `<Tabs>` with card type
  - "+" Dropdown: list unopened locales + "添加新语言" option
  - Close button on each tab (×), auto-switch to first remaining tab
  - Add language modal with Input for lang identifier

- **`ImportPreviewDialog.tsx`**: Import workflow
  - Ant Design `<Upload.Dragger>` for file selection
  - First request: 409 response with preview data
  - Preview tabs: "新增键" (count), "差异键" (Monaco DiffEditor side-by-side), "完整文件预览"
  - Strategy selector: merge (default) / overwrite / skip
  - Confirm button sends `confirmed=true` + strategy

- **`ExportSelectorDialog.tsx`**: Export workflow
  - Checkbox list with "全选" (indeterminate state)
  - Downloads ZIP via `file-saver` `saveAs()`

### Collaboration Components
- **`OnlineBadge.tsx`**: Ant Design `<Badge>` + `<TeamOutlined>`, reads `collaborationStore.onlineCount`
- **`LockIndicator.tsx`**: Ant Design `<Tag>` + `<LockOutlined>`, reads `collaborationStore.isLockedByOther()`

### Common Components
- **`SearchHighlight.tsx`**: Custom regex-based highlighting with `<mark>` tags (does not use `react-highlight-words`)

## Custom Hooks (src/hooks/)

| Hook | Purpose | Key Details |
|---|---|---|
| `useSocket({ projectId })` | Socket.IO connection management | Connects on mount, disconnects on unmount; returns `sendLock`, `sendUnlock`, `sendUpdate`, `sendSchemaUpdated`, `sendSchemaSave`, `sendLocaleSave`, `socketId` |
| `useProjectEditor({ projectId })` | Project loading + unsaved changes guard | Loads project + all locales on mount; `beforeunload` handler checks `isDirty`; `reset()` on unmount |
| `useSearch({ projectId })` | Global cross-language search | Searches all `openLocales` for matching translation values; returns `{ keyword, setKeyword, results }` |

## Zustand Stores (src/stores/)

### `useEditorStore` (src/stores/editorStore.ts)
State:
```typescript
{
  projectId: string | null;
  schema: SchemaObject;              // { nested key: description/object }
  openLocales: { [lang]: TranslationObject };  // nested JSON per language
  activeLang: string | null;
  isDirty: boolean;
  isLoading: boolean;
}
```

Actions:
- `setProjectId()`, `setSchema()`, `updateSchema()` (sets isDirty)
- `openLocale(lang, translations)`: merge schema keys into translations (fill missing with '')
- `closeLocale(lang)`: remove tab, auto-switch activeLang
- `setActiveLang(lang)`, `updateTranslation(lang, translations)` (sets isDirty)
- `applyLocaleSync(addedKeys, removedKeys, renameMap?)`: sync schema changes to all open locales (flatten → apply diff → unflatten, with rename migration)
- `reconcileSchemaInLocales(newSchema)`: full reconciliation of locale keys against new schema
- `setIsDirty()`, `setIsLoading()`, `reset()`

### `useCollaborationStore` (src/stores/collaborationStore.ts)
State:
```typescript
{
  onlineCount: number;
  locks: Record<string, LockInfo>;   // key = "language:keyPath"
  overwrittenMessage: string | null;
}
```

Actions:
- `setOnlineCount(count)`
- `addLock(lock)`: key = `${language}:${keyPath}`
- `removeLock(language, keyPath)`
- `isLockedByOther(language, keyPath, myIp)`: checks if lock exists and IP differs
- `setOverwrittenMessage(message)`, `reset()`

## Data Flow

### Editor → Auto-Save
```
Monaco onChange → setEditorText + isEditingRef = true
  → RxJS Subject.next(value)
  → debounceTime(1s) + distinctUntilChanged
  → parseLogic: JSON.parse → hash compare → if changed:
    → updateSchema / updateTranslation in Zustand (isDirty = true)
    → sendSchemaSave / sendLocaleSave via Socket.IO
    → server: atomic write → broadcast to room
  → on blur: isEditingRef = false, immediate validation
```

### Schema Changes Sync
```
User edits Schema → compute added/removed/renamed keys
  → applyLocaleSync() in Zustand (all open locale tabs, with renameMap migration)
  → sendSchemaUpdated + sendSchemaSave via Socket.IO
  → server: updateSchemaIncremental() → syncSchemaChangesToLocales()
  → server: update all locale files on disk + broadcast locale:synced + schema:updated
```

### Socket Events (Client-side handling in useSocket)
```
lock → addLock to collaborationStore
unlock → removeLock from collaborationStore
update → setSchema or updateTranslation in editorStore
overwritten → setOverwrittenMessage (3s auto-clear)
online_count → setOnlineCount
locale:synced → applyLocaleSync in editorStore
schema:updated → setSchema + applyLocaleSync in editorStore
schema:rejected → setSchema from acceptedData + overwrittenMessage (5s auto-clear)
```

## Third-Party Frontend Libraries

| Library | Version | Usage |
|---|---|---|
| `react` | 19.2.7 | UI framework |
| `next` | 16.3.0-canary | App Router, dynamic imports |
| `antd` | ^6.5.0 | UI components (Card, Modal, Tabs, Form, Input, Button, Badge, Tag, Tooltip, Popover, Alert, Upload, Select, Checkbox, Space, Spin, Empty) |
| `@ant-design/icons` | ^6.3.2 | Icons (PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, etc.) |
| `@monaco-editor/react` | ^4.7.0 | JSON code editor + DiffEditor |
| `zustand` | ^5.0.14 | State management (editorStore, collaborationStore) |
| `socket.io-client` | ^4.8.3 | WebSocket (auto-reconnect, room join) |
| `axios` | ^1.18.1 | HTTP client (API calls, multipart upload, blob download) |
| `rxjs` | ^7.8.2 | Subject + debounceTime + distinctUntilChanged (search + editor) |
| `file-saver` | ^2.0.5 | ZIP download trigger |
| `react-highlight-words` | ^0.21.0 | Listed but not used (SearchHighlight has custom implementation) |

## Related Areas

- [Architecture Codemap](./architecture.md)
- [Backend Codemap](./backend.md)
- [Data Codemap](./data.md)
