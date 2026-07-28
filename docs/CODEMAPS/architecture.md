<!-- Generated: 2026-07-26 | Files scanned: 45 | Token estimate: ~600 -->

# i18n Manager Architecture

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
│  │  │  (editor state, online count, locks, overwritten msg)│ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Monaco Editor (JSON mode) for Schema + Translations │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Socket.IO Client (lock/unlock/update events)        │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                         │                        │              │
│                         │ (HTTP/JSON API)        │ (WebSocket)  │
└─────────────────────────┼────────────────────────┼──────────────┘
                          │                        │
┌─────────────────────────▼────────────────────────▼──────────────┐
│                     Express + Next.js Server                    │
│                    (server.ts - Custom Server)                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Socket.IO: lock/unlock/update/online_count/overwritten   │  │
│  │  (room per project, key-level locks with timeout)          │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Next.js: App Router (pages + API routes)                 │  │
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
- Key-level locks with timeout (30s)
- Optimistic lock (post-save overwrite)
- Lock messages: `lock`, `unlock`, `update`, `online_count`, `overwritten`

### 3. Editor: Monaco Only
- Left: Schema Editor (JSON flat key: description)
- Right: Translation Editor (JSON nested)
- Both use `@monaco-editor/react`

### 4. Auto-Save Pipeline
- Debounce (NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE, default 1s)
- Dedupe (hash compare with last saved)
- Incremental diff (flattenObject → updates/deletes only)
- Atomic write on server
- WebSocket broadcast to other clients

### 5. Data Flow Direction
```
Editor (onChange) → Zustand (isDirty) → debounce → diff → PATCH API
                                            → atomic write → WS broadcast
```

## Entry Points

- **Server**: `server.ts` (Express + Socket.IO + Next.js)
- **Home**: `src/app/page.tsx`
- **Editor**: `src/app/projects/[id]/page.tsx`
- **Data Layer**: `src/lib/data-layer/index.ts`

