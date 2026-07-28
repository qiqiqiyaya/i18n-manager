<!-- Generated: 2026-07-26 | Files scanned: 45 | Token estimate: ~550 -->

# Data Model & Persistence

## File Structure (DATA_DIR)

```
data/
└── projects/
    └── {projectId}/
        ├── meta.json              # Project metadata
        ├── schema.json            # Key definitions (flat)
        └── locales/
            ├── zh-CN.json         # Translations (nested JSON)
            ├── en-US.json
            └── ...
```

## File Types

### meta.json
```json
{
  "id": "uuid",
  "title": "Project Title",
  "description": "Optional description",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### schema.json (flat, no nesting)
```json
{
  "common.ok": "OK button text",
  "common.cancel": "Cancel button text",
  "login.title": "Login page title",
  "login.submit": "Submit button label"
}
```

### {lang}.json (nested, any structure)
```json
{
  "common": {
    "ok": "确定",
    "cancel": "取消"
  },
  "login": {
    "title": "登录",
    "submit": "提交"
  }
}
```

## Type Definitions (src/types/)

### api.ts
```typescript
ApiResponse<T> = { code, message, data?, timestamp? }
ErrorCode = 0 | 400 | 404 | 409 | 422 | 500
```

### project.ts
```typescript
ProjectMeta = { id, title, description?, createdAt, updatedAt }
```

### schema.ts
```typescript
SchemaObject = Record<string, string>        // flat key -> description
TranslationObject = Record<string, any>       // nested JSON
```

### collaboration.ts
```typescript
LockMessage = { type, projectId, keyPath, language, ip, timestamp }
```

## Data Transform Pipeline

### Flatten / Unflatten (src/lib/utils.ts)

```
Nested JSON → flattenObject → { "a.b.c": "value" }
Flat paths  → unflattenObject → nested JSON
```

Used in:
- Incremental diff (editor changes → updates/deletes)
- WebSocket lock messages (keyPath = flat string)
- Schema key propagation to all locale files

### Schema → Locale Synchronization

When Schema changes (key added/removed):
1. Compute `addedKeys` / `removedKeys`
2. For each open locale tab (Zustand): `applyLocaleSync()`
3. For each locale file on disk (server): apply same diff
4. Broadcast update event to room

### Schema Empty Translation Generation

`emptyTranslationsFromSchema(schema)`: recursively creates a translation skeleton matching the schema structure, with all leaf values set to `''`. Used when adding a new language.

### Import Flow

Import JSON file (multipart):
1. Detect lang from filename
2. Parse JSON
3. If not confirmed: `previewImport()` → `{ addedKeys, diffKeys }`
4. If confirmed + strategy: `executeImport()` → write file
   - `overwrite`: replace existing
   - `skip`: keep existing
   - `merge`: merge, prefer incoming

### Export Flow

POST with `{ languages: string[] }`:
- Read schema.json + selected {lang}.json files
- Bundle with `archiver` (ZIP)
- Stream binary response (`application/zip`)

## Concurrency & Atomicity Guarantees

### File Locks (proper-lockfile)
- Every write: lock → write temp → rename → unlock
- Lock per target file path
- Timeouts to avoid deadlocks

### Optimistic Lock for Collisions
- No server-side locking on save
- Last write wins
- Previous writer gets `overwritten` message + 3s banner

### Key-Level Lock (Visual Only)
- Not enforced on server
- 30s timeout
- Auto-release on disconnect

