<!-- Generated: 2026-07-26 | Files scanned: 45 | Token estimate: ~700 -->

# Frontend Architecture

## Pages (App Router)

| Path | Component | Description |
|---|---|---|
| `/` | `src/app/page.tsx` | Project list: create/edit/delete projects, search |
| `/projects/[id]` | `src/app/projects/[id]/page.tsx` | Main editor: left (Schema), right (Translations Tabs) |
| `/projects/[id]/layout.tsx` | - | Layout wrapper (none currently) |
| `/app/layout.tsx` | - | Root layout (Ant Design ConfigProvider) |

## Page Tree

### Home Page (`/`)
```
HomePage (Client, axios + router)
├── Search Input (debounced keyword)
├── Project Cards (Card + Meta)
├── Create Project Modal (Antd Form)
└── Edit Project Modal (Antd Form)
```

### Editor Page (`/projects/[id]`)
```
ProjectEditorPage (Client)
├── Top Bar
│   ├── Back Button
│   ├── Project Title
│   ├── Global Search Input (placeholder only)
│   ├── OnlineBadge (collab status)
│   ├── Import Button
│   └── Export Button
├── Overwritten Message Banner (auto-hide 3s)
├── Left Panel
│   └── SchemaEditor (Monaco JSON)
└── Right Panel
    ├── LanguageTabs (antd Tabs, add lang, close tabs)
    └── LocaleEditor (Monaco JSON for active lang)
├── ImportPreviewDialog (modal with diff preview)
└── ExportSelectorDialog (checkbox + ZIP download)
```

## Components

### JSON Editor Components
- `MonacoEditor.tsx`: `@monaco-editor/react` wrapper, exposes editor instance via ref/imperative handle
- `JsonEditor.tsx`: (deprecated) old json-editor wrapper

### Project Components
- `SchemaEditor.tsx`: Left panel, connects to `useEditorStore`
- `LocaleEditor.tsx`: Right panel, connects to `useEditorStore`, auto-saves on change
- `LanguageTabs.tsx`: Tab list, "+" to open or add, close tabs
- `ImportPreviewDialog.tsx`: Upload JSON, show conflict preview, confirm
- `ExportSelectorDialog.tsx`: Choose languages, download ZIP

### Collaboration Components
- `OnlineBadge.tsx`: Shows current user count in project
- `LockIndicator.tsx`: (placeholder) shows locked keys

### Common Components
- `SearchHighlight.tsx`: (placeholder) search highlighting

## Custom Hooks (src/hooks/)

| Hook | Purpose |
|---|---|
| `useSocket({ projectId })` | Connects Socket.IO, sends `lock`/`unlock`, listens for `update`/`overwritten`/`online_count` |
| `useProjectEditor({ projectId })` | Load project, debounced auto-save, beforeunload prompt |
| `useSearch()` | (placeholder) global search |

## Zustand Stores (src/stores/)

### `useEditorStore` (src/stores/editorStore.ts)
State:
```typescript
{
  projectId: string | null;
  schema: SchemaObject;              // { [flatKey]: description }
  openLocales: { [lang]: TranslationObject };  // nested JSON
  activeLang: string | null;
  isDirty: boolean;
  isLoading: boolean;
}
```

Actions:
- `setProjectId()`, `setSchema()`, `updateSchema()`
- `openLocale(lang, translations)`, `closeLocale(lang)`
- `setActiveLang(lang)`, `updateTranslation(lang, translations)`
- `applyLocaleSync(addedKeys, removedKeys)`: sync schema changes to all open locales
- `setIsDirty()`, `setIsLoading()`, `reset()`

### `useCollaborationStore` (src/stores/collaborationStore.ts)
State:
```typescript
{
  onlineCount: number;
  lockedKeys: { [keyPath]: { ip, timestamp } };
  overwrittenMessage: string | null;
}
```

## Utilities (src/lib/utils.ts)

- `flattenObject(obj)` → `{ [flatPath]: value }` (sorted keys, rejects arrays)
- `unflattenObject(flat)` → nested object
- `setNestedValue(obj, path, value)`: set value at nested path (mutates obj)
- `keyExists(flattened, key)`: check key in flat object
- `getLeafPaths(obj, prefix)`: collect all leaf paths as dot-separated strings
- `createNestedFromPaths(paths)`: rebuild nested object from leaf paths (values = '')
- `findMissingPaths(oldObj, newObj, prefix)`: recursive diff for missing leaf paths
- `emptyTranslationsFromSchema(schema)`: generate empty translations matching schema shape
- `hasNestedPath(obj, path)`: check if path exists in nested object
- `deepClone(obj)`: JSON.parse/JSON.stringify clone

## Data Flow

### Editor → Auto-Save
```
Monaco onChange → updateSchema / updateTranslation
              → isDirty = true
              → debounce (1s)
              → compare hash with last saved
              → if changed: PATCH /api/.../keys (incremental)
              → on success: isDirty = false
              → broadcast update via Socket.IO
```

### Schema Changes Sync
```
User edits Schema → compute added/removed keys
                → applyLocaleSync() → all open locale tabs updated
                → auto-save → server syncs to all locale files on disk
```

### Socket Events
```
Client sends lock → server broadcasts lock to room
Client sends unlock → server broadcasts unlock
Server sends update → other clients merge diff locally
Server sends overwritten → banner shown for 3s
Server sends online_count → OnlineBadge updates
```

## Third-Party Frontend Libraries

- `react@19`: framework
- `next@16`: App Router, RSC
- `antd@6`: UI components, icons
- `@monaco-editor/react`: JSON editor
- `zustand`: state management
- `socket.io-client`: WebSocket
- `axios`: HTTP client
- `react-highlight-words`: search highlighting
- `file-saver`: ZIP download
- `rxjs`: (imported, ready for debounce/throttle pipelines)

