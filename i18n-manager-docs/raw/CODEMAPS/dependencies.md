<!-- Generated: 2026-07-28 | Files scanned: 45 | Token estimate: ~500 -->

# Dependencies & External Integrations

**Last Updated:** 2026-08-05

## Runtime Dependencies (package.json)

### Web Framework
- `next@^16.3.0-preview.9`: App Router + custom server (canary)
- `react@19.2.7`, `react-dom@19.2.7`: UI library

### UI & Components
- `antd@^6.5.0`: Ant Design component library
- `@ant-design/icons@^6.3.2`: Icons
- `@monaco-editor/react@^4.7.0`: JSON code editor (includes DiffEditor for import preview)

### State & Real-Time
- `zustand@^5.0.14`: Client state management
- `socket.io@^4.8.3`: WebSocket server
- `socket.io-client@^4.8.3`: WebSocket client
- `rxjs@^7.8.2`: Reactive pipelines (used for search debounce + editor auto-save debounce)

### HTTP & File Handling
- `axios@^1.18.1`: HTTP client
- `express@^5.2.1`: Custom server (wraps Next.js)
- `archiver@^8.0.0`: ZIP export bundling
- `file-saver@^2.0.5`: Client-side download trigger

### Search & Highlight
- `react-highlight-words@^0.21.0`: Search highlighting

### File I/O & Persistence
- `fs-extra@^11.3.6`: Enhanced file system (ensureDir, writeJSON, move, remove)
- `proper-lockfile@^4.1.2`: File concurrency locks (retries: 5, 50-200ms)

### Validation
- `zod@^4.4.3`: Schema validation (project, lang, schema, import/export)

### Logging
- `pino@^10.3.1`: Structured logging (listed in dependencies but not currently used in source code)

## Dev Dependencies

- `typescript@^5`: Type checking
- `eslint@^9`, `eslint-config-next@16.3.0-canary.72`: Linting
- `tailwindcss@^4`, `@tailwindcss/postcss@^4`: CSS utility
- `tsx@^4.22.4`: TypeScript execute (for `server.ts` via `--import tsx`)
- `babel-plugin-react-compiler@1.0.0`: React Compiler (enabled in `next.config.ts`)
- `@types/express@^5.0.6`, `@types/fs-extra@^11.0.4`, `@types/proper-lockfile@^4.1.4`, `@types/archiver@^8.0.0`, `@types/file-saver@^2.0.7`: Type definitions
- `@types/node@^20`, `@types/react@^19`, `@types/react-dom@^19`: Core type definitions

## Environment Variables (.env.local)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` | No | `1000` | Debounce delay (ms) before auto-save (client-side) |
| `LOCK_TIMEOUT` | No | `30000` | Socket.IO key lock timeout (ms) (server-side) |
| `NEXT_PUBLIC_WS_URL` | No | `http://localhost:3000` | WebSocket endpoint (client-side, baked into build) |
| `DATA_DIR` | No | `./data` | Root for project JSON storage (server-side) |
| `PORT` | No | `3000` | HTTP/Socket.IO listen port (server-side) |

## External Services

None. i18n Manager has zero external service dependencies. It is fully self-contained:
- No database
- No auth provider
- No cloud storage
- No CDN assets
- No analytics/tracking

## Browser APIs & Features Used (Client-Side)

- WebSocket (Socket.IO transport)
- `beforeunload` (unsaved changes prompt)
- Monaco Editor (bundled via npm, loaded dynamically with `next/dynamic`)
- FileReader (import JSON preview)
- Blob/URL.createObjectURL (ZIP download via file-saver)
- `FormData` (import file upload)

## File System Permissions (Server-Side)

Requires read/write access to:
- `DATA_DIR` (default `./data`)
- `node_modules/.cache` (Next.js build cache)
- `.next` (Next.js build output)

## Build & Runtime Requirements

- Node.js 20+ (`@types/node ^20`)
- npm (lockfile `package-lock.json`)
- No native addons; pure JS/TS
- Cross-platform (Windows/macOS/Linux)
- `fix-async-storage.cjs` required for Next.js 16 canary compatibility

## Version Notes

- Uses Next.js 16 canary (`16.3.0-preview.9`, not stable)
- Uses React 19.2.7 (stable)
- Express 5.2.1 (stable, uses path-to-regexp v8 — no wildcard routes)
- Zod 4.4.3 (latest major)
- Zustand 5.0.14 (latest major)
- `pino` is listed but not used in any source file — candidate for removal or integration
- `react-highlight-words` is listed but `SearchHighlight.tsx` implements its own highlighting — candidate for removal

## Related Areas

- [Architecture Codemap](architecture.md)
- [Backend Codemap](backend.md)
- [Data Codemap](data.md)
