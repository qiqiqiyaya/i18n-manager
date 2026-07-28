<!-- Generated: 2026-07-28 | Files scanned: 45 | Token estimate: ~750 -->

# Backend Architecture

**Last Updated:** 2026-07-28
**Entry Points:** `server.ts`, `src/lib/data-layer/index.ts`, `src/lib/socket-handler.ts`

## API Routes (Next.js App Router)

All JSON routes wrapped by `withApiHandler()` for unified error handling + `ApiResponse` envelope, except import (multipart) and export (binary stream) which handle errors manually.

| Method | Path | Handler | Data Layer | Notes |
|---|---|---|---|---|
| `GET` | `/api/projects` | List + search | `getAllProjects()` / `searchProjects()` | `?keyword=` for fuzzy search |
| `POST` | `/api/projects` | Create | `createProject()` | Zod: `createProjectSchema` |
| `GET` | `/api/projects/[id]` | Get single | `getProjectById()` | Returns meta + schema + locales list |
| `PUT` | `/api/projects/[id]` | Update meta | `updateProject()` | Zod: `updateProjectSchema` |
| `DELETE` | `/api/projects/[id]` | Remove project | `deleteProject()` | Recursively removes project dir |
| `GET` | `/api/projects/[id]/schema` | Get schema | `getSchema()` | Returns `Record<string, string>` |
| `PUT` | `/api/projects/[id]/schema` | Overwrite schema | `updateSchema()` | Zod: `schemaObjectSchema`; syncs keys to all locales |
| `PATCH` | `/api/projects/[id]/schema/keys` | Incremental schema | `updateSchemaIncremental()` | `{ updates, deletes, timestamp? }`; timestamp conflict detection |
| `GET` | `/api/projects/[id]/locales` | List langs | `getLocales()` | Returns locale file names |
| `POST` | `/api/projects/[id]/locales` | Add lang | `addLocale()` | Zod: `langSchema`; 409 if exists |
| `GET` | `/api/projects/[id]/locales/[lang]` | Get translations | `getLocale()` | Returns nested JSON |
| `PUT` | `/api/projects/[id]/locales/[lang]` | Overwrite translations | `updateLocale()` | Full replace |
| `PATCH` | `/api/projects/[id]/locales/[lang]/keys` | Incremental translations | `updateLocaleIncremental()` | `{ updates, deletes }` flat paths |
| `DELETE` | `/api/projects/[id]/locales/[lang]` | Remove lang | `deleteLocale()` | 409 if last locale |
| `POST` | `/api/projects/[id]/import` | Import JSON (multipart) | `previewImport()` / `executeImport()` | Manual error handling; 409 for conflict preview |
| `POST` | `/api/projects/[id]/export` | Export ZIP (binary stream) | `getExportData()` + archiver | Manual error handling; returns `application/zip` |

## Data Layer (src/lib/data-layer/)

### Module Organization

```
data-layer/
├── index.ts          (export all functions/types)
├── io.ts             (file I/O primitives, atomic writes, paths)
├── projects.ts       (project CRUD)
├── schema.ts         (schema management + incremental updates + key sync + Socket.IO broadcast)
├── locales.ts        (locale management + incremental updates + last-locale guard)
└── import-export.ts  (import preview + execution + export bundling)
```

### Key Functions by Module

#### io.ts
- `DATA_DIR`: from env (default `./data`)
- `getProjectDir(id)`: path to project directory
- `ensureProjectDir(id)`: mkdir if needed (including locales/ subdir)
- `atomicWriteJson(path, data)`: proper-lockfile (5 retries, 50-200ms) → write .tmp → fs.move overwrite
- `readJson(path, defaultValue)`: safe read (returns defaultValue on error/missing)

#### projects.ts
- `getAllProjects()`: list meta.json in data/projects/*, sorted by updatedAt desc
- `searchProjects(keyword)`: filter list by title/description (case-insensitive includes)
- `getProjectById(id)`: meta + schema + locales list; 404 if meta.json missing
- `createProject(title, description)`: UUID id, writes meta.json + empty schema.json
- `updateProject(id, updates)`: merge updates into meta, update updatedAt; 404 if missing
- `deleteProject(id)`: fs.remove entire project dir; 404 if missing
- `isProjectExists(id)`: check meta.json exists

#### schema.ts
- `getSchema(id)`: read schema.json; 404 if project missing
- `updateSchema(id, schema)`: full replace, compute added/removed keys, sync to all locale files, broadcast via Socket.IO
- `updateSchemaIncremental(id, updates, deletes, clientTimestamp?)`: apply flattened path diff, timestamp conflict detection (409 if stale), sync to locales, broadcast
- Internal: `syncSchemaChangesToLocales(projectId, addedKeys, removedKeys)` — updates all locale files on disk + emits `locale:synced` and `schema:updated` via Socket.IO
- Module-level: `lastSchemaTimestamps: Map<string, number>` for HTTP API conflict detection

#### locales.ts
- `getLocales(id)`: list .json files in locales/ dir
- `addLocale(id, lang)`: create empty translations from schema keys; 404 if project missing, 409 if lang exists
- `getLocale(id, lang)`: read translations; 404 if file missing
- `updateLocale(id, lang, translations)`: full replace; 404 if file missing
- `updateLocaleIncremental(id, lang, updates, deletes)`: flatten → apply diff → unflatten → atomic write
- `deleteLocale(id, lang)`: remove file; 404 if missing, 409 if last locale

#### import-export.ts
- `previewImport(id, fileContent, fileName)`: detect lang from filename, flatten import data, compare with existing schema/locale → `{ addedKeys, diffKeys }`
- `executeImport(id, fileContent, fileName, strategy)`: `overwrite` / `skip` / `merge` (default); also syncs new keys to schema
- `getExportData(id, languages)`: read schema.json + selected locale files → `{ files: Array<{ name, content }> }`
- Internal: `flattenForImport(obj, prefix)` — like flattenObject but preserves array values (does not throw)

## Socket.IO (src/lib/socket-handler.ts)

- `setupSocketHandlers(io)`: attach to HTTP server
- `setIO(io)` / `getIO()`: expose IO instance via `globalThis` for cross-module access
- Rooms: `room:project-{projectId}`
- Client identity: `x-forwarded-for` header or `socket.handshake.address` or `socket.id`
- Lock timeout: 30s from env `LOCK_TIMEOUT`
- Per-socket lock tracking: `Map<string, LockEntry>` with `setTimeout` per lock
- Schema timestamp conflict: `globalSchemaTimestamps: Map<string, number>` + `globalAcceptedData: Map<string, any>`

### Events (Server-side handling)

| Event | Direction | Action |
|---|---|---|
| `lock` | Client → Server | Store lock + set timeout, broadcast to room (except sender) |
| `unlock` | Client → Server | Clear timeout + remove lock, broadcast to room |
| `update` | Client → Server | Broadcast to room (except sender) |
| `schema:updated` | Client → Server | Timestamp conflict check; accept & broadcast or reject with `schema:rejected` |
| `schema:save` | Client → Server | Call `updateSchemaIncremental()`, emit `schema:saved` result |
| `locale:save` | Client → Server | Call `updateLocale()`, emit `locale:saved` result |
| `disconnect` | Internal | Clear all socket locks + broadcast unlock, update online count |

## API Response Envelope (src/types/api.ts)

```typescript
ApiResponse<T> = {
  code: number;        // 0 = success, 400/404/409/422/500 = errors
  message: string;     // "ok" or error message
  data?: T;            // payload
  timestamp?: string;  // server ISO time
}
```

## Validation (src/lib/validation.ts)

Zod schemas:
- `projectTitleSchema`: 1-50 chars
- `projectDescriptionSchema`: max 200 chars, optional
- `createProjectSchema`, `updateProjectSchema`
- `langSchema`: 2-20 chars, regex `/^[a-zA-Z0-9_-]+$/`
- `schemaObjectSchema`: `Record<string, string>` (no nesting, refine check)
- `translationObjectSchema`: `Record<string, any>`
- `importStrategySchema`: `'overwrite' | 'skip' | 'merge'` (default `merge`)
- `exportLanguagesSchema`: array of strings, min 1
- `searchKeywordSchema`: string, max 100, optional

## Related Areas

- [Architecture Codemap](./architecture.md)
- [Data Codemap](./data.md)
- [Frontend Codemap](./frontend.md)
