<!-- Generated: 2026-07-28 | Files scanned: 45 | Token estimate: ~650 -->

# i18n Manager Architecture

**Last Updated:** 2026-07-28
**Entry Points:** `server.ts`, `src/app/page.tsx`, `src/app/projects/[id]/page.tsx`

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js App Router (React 19 + Ant Design 6)             │  │
│  │  ┌───────────────────────────────┐  ┌──────────────────┐  │  │
│  │  │  Project List Page (/)        │  │  Editor Page     │  │  │
│  │  │  (home, create/edit projects) │  │  (/projects/[id])│  │  │
│  │  └───────────────────────────────┘  └──────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Zustand Stores: editorStore, collaborationStore     │ │  │
│  │  │  (schema, locales, online count, locks, dirty flag)  │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Monaco Editor (JSON mode) for Schema + Translations │ │  │
│  │  │  + DiffEditor for import conflict preview            │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Socket.IO Client (lock/unlock/schema:save/locale:save)│ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  RxJS Subjects (debounce search + editor auto-save)  │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         │                        │              │
│                         │ (HTTP/JSON API)        │ (WebSocket)  │
└─────────────────────────┼────────────────────────┼──────────────┘
                          │                        │
┌─────────────────────────▼────────────────────────▼──────────────┐
│                     Express 5 + Next.js Server                   │
│                    (server.ts - Custom Server)                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Socket.IO: lock/unlock/schema:updated/schema:save/       │  │
│  │  locale:save/online_count/overwritten/locale:synced       │  │
│  │  (room per project, key-level locks with 30s timeout)     │  │
│  │  (globalThis shared IO instance for cross-module access)  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js: App Router (pages + API routes)                 │  │
│  │  withApiHandler HOF for unified error handling            │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Data Layer (src/lib/data-layer/)                         │  │
│  │  ┌──────────────────────────────────────────────────────┐│  │
│  │  │  io.ts (atomic file writes, proper-lockfile, paths)  ││  │
│  │  │  projects.ts, schema.ts, locales.ts, import-export.ts ││  │
│  │  └──────────────────────────────────────────────────────┘│  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────────┐
│                    Local File System (DATA_DIR)               │
│  data/projects/{projectId}/                                  │
│    ├── meta.json                                             │
│    ├── schema.json                                           │
│    └── locales/{lang}.json                                   │
└───────────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. No Users, No Database
- No authentication, no user accounts
- Data globally shared
- Persistence via local JSON files only
- Client IP used as operator identifier for locks

### 2. Real-Time Collaboration via Socket.IO
- Room per project: `room:project-{projectId}`
- Key-level locks with timeout (30s, env `LOCK_TIMEOUT`)
- Optimistic lock (post-save overwrite)
- Lock messages: `lock`, `unlock`, `update`, `online_count`, `overwritten`
- Persistence events: `schema:save`, `locale:save` (primary save path, not HTTP PATCH)
- Schema conflict detection: timestamp-based rejection (`schema:rejected`)

### 3. Editor: Monaco Only
- Left: Schema Editor (JSON flat key: description)
- Right: Translation Editor (JSON nested)
- Both use `@monaco-editor/react`
- Import preview uses Monaco `DiffEditor`

### 4. Auto-Save Pipeline
- RxJS Subject + debounceTime (NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE, default 1s)
- Dedupe (hash compare with last saved)
- Socket.IO persistence (`schema:save` / `locale:save`)
- Atomic write on server
- WebSocket broadcast to other clients

### 5. Data Flow Direction
```
Editor (onChange) → RxJS Subject → debounceTime(1s) → distinctUntilChanged
  → parse JSON → hash compare → if changed:
    → update Zustand store (isDirty = true)
    → emit schema:save / locale:save via Socket.IO
    → server: atomic write → broadcast to room
```

### 6. Schema Change Propagation
```
User edits Schema → compute added/removed/renamed keys
  → applyLocaleSync() in Zustand (all open locale tabs)
  → schema:save via Socket.IO → server: syncSchemaChangesToLocales()
  → server: update all locale files on disk + broadcast locale:synced
```

## Entry Points

- **Server**: `server.ts` (Express 5 + Socket.IO + Next.js, requires `fix-async-storage.cjs`)
- **Home**: `src/app/page.tsx`
- **Editor**: `src/app/projects/[id]/page.tsx`
- **Data Layer**: `src/lib/data-layer/index.ts`
- **Socket Handler**: `src/lib/socket-handler.ts`

## Related Areas

- [Frontend Codemap](./frontend.md)
- [Backend Codemap](./backend.md)
- [Data Codemap](./data.md)
- [Dependencies Codemap](./dependencies.md)
