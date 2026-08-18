<!-- Generated: 2026-07-28 | Files scanned: 45 | Token estimate: ~600 -->

# Data Model & Persistence

**Last Updated:** 2026-08-05
**Entry Points:** `src/lib/data-layer/index.ts`, `src/lib/utils.ts`

## File Structure (DATA_DIR)

```
data/
└── projects/
    └── {projectId}/
        ├── meta.json              # Project metadata
        ├── schema.json            # Key definitions (flat Record<string, string>)
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
ProjectCreateInput = { title, description? }
ProjectUpdateInput = { title?, description? }
```

### schema.ts
```typescript
SchemaObject = Record<string, string>        // flat key -> description
TranslationObject = Record<string, any>       // nested JSON
```

### collaboration.ts
```typescript
LockMessage = { type, projectId, keyPath, language, ip, timestamp }
SchemaUpdatedPayload = { projectId, schema, addedKeys, removedKeys, renameMap?, timestamp, clientId }
SchemaRejectedPayload = { reason, acceptedTimestamp, acceptedData }
SchemaSavePayload = { projectId, schema, addedKeys, removedKeys }
LocaleSavePayload = { projectId, lang, translations }
SocketEvent = 'lock' | 'unlock' | 'update' | 'overwritten' | 'online_count' | 'join' | 'error' | 'schema:updated' | 'schema:rejected'
UpdatePayload = { projectId, type, lang?, data }
OverwrittenPayload = { keyPath, language, newValue }
OnlineCountPayload = { count }
```

## Data Transform Pipeline

### Flatten / Unflatten (src/lib/utils.ts)

```
Nested JSON → flattenObject → { "a.b.c": "value" }  (sorted keys, throws on arrays)
Flat paths  → unflattenObject → nested JSON           (path conflicts: deepest wins + warn)
```

Used in:
- Incremental diff (editor changes → updates/deletes)
- WebSocket lock messages (keyPath = flat string)
- Schema key propagation to all locale files
- Import preview (conflict detection)

### Additional Utility Functions (src/lib/utils.ts)

| Function | Purpose |
|---|---|
| `setNestedValue(obj, path, value)` | Set value at dot-separated path (mutates obj) |
| `keyExists(flattened, key)` | Check key in flat object |
| `getLeafPaths(obj, prefix)` | Collect all leaf paths as dot-separated strings |
| `createNestedFromPaths(paths)` | Rebuild nested object from leaf paths (values = '') |
| `findMissingPaths(oldObj, newObj, prefix)` | Recursive diff for missing leaf paths |
| `emptyTranslationsFromSchema(schema)` | Generate empty translations matching schema shape |
| `hasNestedPath(obj, path)` | Check if dot-separated path exists in nested object |
| `deepClone(obj)` | JSON.parse/JSON.stringify deep clone |

### Schema → Locale Synchronization

When Schema changes (key added/removed/renamed):
1. Compute `addedKeys` / `removedKeys` / `renameMap` (heuristic rename detection)
2. For each open locale tab (Zustand): `applyLocaleSync(addedKeys, removedKeys, renameMap)` — migrate values for renames
3. For each locale file on disk (server): `syncSchemaChangesToLocales()` — apply same diff
4. Broadcast `locale:synced` and `schema:updated` events to room

### Schema Empty Translation Generation

`createNestedFromPaths(paths)`: rebuilds nested object from flat key paths with all leaf values set to `''`. Used when adding a new language via `addLocale()`.

### Import Flow

Import JSON file (multipart):
1. Detect lang from filename (strip `.json`, validate regex)
2. Parse JSON content
3. If not confirmed: `previewImport()` → `{ addedKeys, diffKeys }` (409 response)
4. If confirmed + strategy: `executeImport()` → write file
   - `overwrite`: flat merge with import data taking priority
   - `skip`: flat merge with existing data taking priority
   - `merge` (default): only add keys not in existing data
5. New keys not in schema are added to schema with empty description
6. `flattenForImport()` preserves array values (unlike `flattenObject` which throws)

### Export Flow

POST with `{ languages: string[] }`:
- Read schema.json + selected {lang}.json files
- Bundle with `archiver` (ZIP, zlib level 9)
- Stream binary response (`application/zip`)
- Content-Disposition: `attachment; filename="project-{id}-locales.zip"`

## Concurrency & Atomicity Guarantees

### File Locks (proper-lockfile)
- Every write: lock → write .tmp → fs.move overwrite → unlock
- Lock per target file path
- Retries: 5 attempts, 50-200ms min/max timeout
- If file doesn't exist, create empty JSON first (proper-lockfile requires existing file)

### Optimistic Lock for Collisions
- No server-side locking on save
- Last write wins
- Previous writer gets `overwritten` message + 3s banner
- Schema changes: timestamp-based conflict detection (module-level `lastSchemaTimestamps`)

### Key-Level Lock (Visual Only)
- Not enforced on server (does not block editing)
- 30s timeout (env `LOCK_TIMEOUT`)
- Auto-release on disconnect (clear all socket locks + broadcast unlock)
- Per-socket lock tracking with independent timers

## Related Areas

- [Architecture Codemap](architecture.md)
- [Backend Codemap](backend.md)
- [Dependencies Codemap](dependencies.md)
