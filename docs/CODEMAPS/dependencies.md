<!-- Generated: 2026-07-26 | Files scanned: 45 | Token estimate: ~450 -->

# Dependencies & External Integrations

## Runtime Dependencies (package.json)

### Web Framework
- `next@16.0.0-canary.72`: App Router + custom server
- `react@19.2.7`, `react-dom@19.2.7`: UI library

### UI & Components
- `antd@6.x`: Ant Design component library
- `@ant-design/icons@6.x`: Icons
- `@monaco-editor/react@4.x`: JSON code editor

### State & Real-Time
- `zustand@5.x`: Client state management
- `socket.io@4.x`: WebSocket server
- `socket.io-client@4.x`: WebSocket client
- `rxjs@7.x`: Reactive pipelines (ready for debounce/throttle)

### HTTP & Forms
- `axios@1.x`: HTTP client
- `react-highlight-words@0.x`: Search highlighting

### File I/O & Persistence
- `express@5.x`: Custom server
- `fs-extra@11.x`: Enhanced file system
- `proper-lockfile@4.x`: File concurrency locks
- `archiver@8.x`: ZIP export bundling
- `file-saver@2.x`: Client-side download

### Validation
- `zod@4.x`: Schema validation

### Logging
- `pino@10.x`: Structured logging

## Dev Dependencies
- `typescript@5.x`: Type checking
- `eslint`: Linting
- `tailwindcss@4.x`, `@tailwindcss/postcss`: CSS utility
- `tsx`: TypeScript execute (for server.ts)
- `babel-plugin-react-compiler`: React Compiler

## Environment Variables (.env.example)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` | No | `1000` | Debounce delay (ms) before auto-save |
| `LOCK_TIMEOUT` | No | `30000` | Socket.IO key lock timeout (ms) |
| `NEXT_PUBLIC_WS_URL` | No | `http://localhost:3000` | WebSocket endpoint |
| `DATA_DIR` | No | `./data` | Root for project JSON storage |
| `PORT` | No | `3000` | HTTP/Socket.IO listen port |

## External Services

None. i18n Manager has zero external service dependencies. It is fully self-contained:
- No database
- No auth provider
- No cloud storage
- No CDN assets
- No analytics/tracking

## Browser APIs & Features Used (Client-Side)

- WebSocket (Socket.IO)
- `beforeunload` (unsaved changes prompt)
- Monaco Editor (bundled via npm)
- FileReader (import JSON preview)
- Blob/URL.createObjectURL (ZIP download)

## File System Permissions (Server-Side)

Requires read/write access to:
- `DATA_DIR` (default `./data`)
- `node_modules/.cache` (Next.js build cache)
- `.next` (Next.js build output)

## Build & Runtime Requirements

- Node.js 20+
- npm (lockfile `package-lock.json`)
- No native addons; pure JS/TS
- Cross-platform (Windows/macOS/Linux)

## Version Notes

- Uses Next.js 16 canary (not stable)
- Uses React 19 (stable)
- Express 5 (stable)
- No server actions (RSC not used)

