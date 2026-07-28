<!-- Generated: 2026-07-26 | Files scanned: 45 | Token estimate: ~700 -->

# Backend Architecture

## API Routes (Next.js App Router)

All JSON routes wrapped by `withApiHandler()` for unified error handling + `ApiResponse` envelope.

| Method | Path | Handler | Data Layer |
|---|---|---|---|
| `GET` | `/api/projects` | List + search | `getAllProjects()` / `searchProjects()` |
| `POST` | `/api/projects` | Create | `createProject()` |
| `GET` | `/api/projects/[id]` | Get single | `getProjectById()` |
| `PUT` | `/api/projects/[id]` | Update meta | `updateProject()` |
| `DELETE` | `/api/projects/[id]` | Remove project | `deleteProject()` |
| `GET` | `/api/projects/[id]/schema` | Get schema | `getSchema()` |
| `PUT` | `/api/projects/[id]/schema` | Overwrite schema | `updateSchema()` |
| `PATCH` | `/api/projects/[id]/schema/keys` | Incremental schema | `updateSchemaIncremental()` |
| `GET` | `/api/projects/[id]/locales` | List langs | `getLocales()` |
| `POST` | `/api/projects/[id]/locales` | Add lang | `addLocale()` |
| `GET` | `/api/projects/[id]/locales/[lang]` | Get translations | `getLocale()` |
| `PUT` | `/api/projects/[id]/locales/[lang]` | Overwrite translations | `updateLocale()` |
| `PATCH` | `/api/projects/[id]/locales/[lang]/keys` | Incremental translations | `updateLocaleIncremental()` |
| `DELETE` | `/api/projects/[id]/locales/[lang]` | Remove lang | `deleteLocale()` |
| `POST` | `/api/projects/[id]/import` | Import JSON (multipart) | `previewImport()` / `executeImport()` |
| `POST` | `/api/projects/[id]/export` | Export ZIP (binary stream) | `getExportData()` + archiver |

## Data Layer (src/lib/data-layer/)

### Module Organization

```
data-layer/
├── index.ts          (export all functions/types)
├── io.ts             (file I/O primitives, atomic writes, paths)
├── projects.ts       (project CRUD)
├── schema.ts         (schema management + incremental updates)
├── locales.ts        (locale management + incremental updates)
└── import-export.ts  (import preview + execution + export bundling)
```

### Key Functions by Module

#### io.ts
- `DATA_DIR`: from env (default `./data`)
- `getProjectDir(id)`: path to project
- `ensureProjectDir(id)`: mkdir if needed
- `atomicWriteJson(path, data)`: proper-lockfile → write temp → rename
- `readJson(path)`: safe read (returns null on error)

#### projects.ts
- `getAllProjects()`: list meta.json in data/projects/*
- `searchProjects(keyword)`: filter list by title/description
- `getProjectById(id)`: meta + schema + locales list
- `createProject(title, description)`: UUID id
- `updateProject(id, updates)`
- `deleteProject(id)`: rm -rf project dir
- `isProjectExists(id)`

#### schema.ts
- `getSchema(id)`: read schema.json
- `updateSchema(id, schema)`: full replace, atomic write
- `updateSchemaIncremental(id, updates, deletes)`: apply flattened path diff

#### locales.ts
- `getLocales(id)`: list .json files in locales/
- `addLocale(id, lang)`: create empty {lang}.json
- `getLocale(id, lang)`: read translations
- `updateLocale(id, lang, translations)`
- `updateLocaleIncremental(id, lang, updates, deletes)`
- `deleteLocale(id, lang)`

#### import-export.ts
- `previewImport(id, fileContent, fileName)`: detect lang from filename, diff
- `executeImport(id, fileContent, fileName, strategy)`: `overwrite` / `skip` / `merge`
- `getExportData(id, languages)`: { files: Array<{ name, content }> }

## Socket.IO (src/lib/socket-handler.ts)

- `setupSocketHandlers(io)`: attach to HTTP server
- `setIO(io)`: expose to data layer for broadcast
- Rooms: `room:project-{projectId}`
- Events: `join`, `lock`, `unlock`, `update`, `online_count`, `overwritten`
- Lock timeout: 30s from env `LOCK_TIMEOUT`
- Client identity: socket.handshake IP

## API Response Envelope (src/types/api.ts)

```typescript
{
  code: number;        // 0 = success, 400/404/409/422/500 = errors
  message: string;     // "ok" or error message
  data?: T;            // payload
  timestamp?: string;  // server ISO time
}
```

## Validation (src/lib/validation.ts)

Zod schemas:
- `projectTitleSchema`: 1-50 chars
- `projectDescriptionSchema`: max 200 chars
- `createProjectSchema`, `updateProjectSchema`
- `langSchema`: 2-20 chars, alphanum + _ + -
- `schemaObjectSchema`: Record<string, string> (no nesting)
- `translationObjectSchema`: Record<string, any>
- `importStrategySchema`: 'overwrite' | 'skip' | 'merge'
- `exportLanguagesSchema`: array of strings, min 1

