# AGENTS.md

## Project-Specific Agent Guidance

This file provides project-specific guidance for AI agents working on the i18n Manager codebase.

### Key Context for All Agents

- **Stack**: Next.js 16 (App Router, canary) + Express 5 + Socket.IO 4 + React 19 + Ant Design 6 + Monaco Editor + Zustand 5 + RxJS 7 + Zod 4
- **No database**: local JSON files under `data/projects/{projectId}/`
- **No auth / no identity**: no user system; client IP is not used to identify operators
- **Language**: code comments and UI text are in Chinese
- **Server entry**: `server.ts`; use `npm run start:server` for full functionality (`npm run dev` lacks Express/Socket.IO)
- **Compatibility**: `fix-async-storage.cjs` is required for Next.js 16 canary; do not remove

### Knowledge Base

Project knowledge lives in `i18n-manager-docs/` (LLM Wiki pattern). **Reference `wiki/`, never `raw/`**:

- `wiki/` — distilled, authoritative pages. Start at `wiki/index.md`
- `raw/` — immutable source documents (read-only); `raw/i18nManager.md` §6 = authoritative AI coding constraints

Key pages: `wiki/architecture/系统架构.md` · `wiki/architecture/Socket.IO-协议.md` · `wiki/concepts/并发与冲突处理.md` · `wiki/concepts/约束与规范.md` · `wiki/sources/源文档索引.md`

### Agent-Specific Notes

#### planner
- Consult `wiki/sources/源文档索引.md` / `raw/i18nManager.md` §6 for mandatory coding constraints
- Schema changes must propagate to all locale files (`applyLocaleSync` in-memory + `syncSchemaChangesToLocales` on-disk)
- `schema:save`/`locale:save` (Socket.IO) are the primary persistence path, not HTTP PATCH

#### architect
- Single-process: Express 5 wraps Next.js + Socket.IO on one HTTP server
- `withApiHandler` HOF wraps most API routes; import/export handle errors manually (binary/multipart)
- Socket.IO instance shared via `globalThis` (`setIO`/`getIO` in `socket-handler.ts`)

#### code-reviewer
- Enforce: Monaco Editor only (no Ant Design Table/Tree), RxJS for debounce, immutable Zustand updates
- Check: `proper-lockfile` atomic writes, `beforeunload` for unsaved changes
- Note: `flattenObject` preserves arrays as leaf values (does not throw)

#### tdd-guide
- Vitest 4 + jsdom already configured — see `wiki/operations/贡献指南.md`
- Data layer (`src/lib/data-layer/`) is the best candidate for unit tests

#### security-reviewer
- No auth by design — do not flag missing authentication
- Validate: path traversal (projectId/lang params), JSON parse safety, proper-lockfile deadlock prevention

#### refactor-cleaner
- `JsonEditor.tsx` (old jsoneditor wrapper) + `jsoneditor.d.ts` are deprecated; safe to remove
- `pino` is listed as a dependency but unused — candidate to remove

#### build-error-resolver
- Next.js 16 canary: check `node_modules/next/dist/docs/` for current API (do not rely on memory)
- `fix-async-storage.cjs` must load via `--require` before `tsx`; verify start command on `AsyncLocalStorage` errors
- Express 5 `path-to-regexp` v8 has no wildcard routes; catch-all uses no-path `use()`

#### doc-updater
- `CLAUDE.md` is the primary agent reference; keep it in sync
- `i18n-manager-docs/raw/i18nManager.md` is the requirements doc (§6 authoritative)
- Regenerate codemaps → `wiki/sources/代码地图.md` when architecture changes

### Common Pitfalls

1. **`npm run dev` has no Express/Socket.IO** — use `npm run start:server` for real-time collaboration
2. **Monaco Editor only** — do not replace with Ant Design Table/Tree
3. **RxJS for debounce** — no raw `setTimeout`/`clearTimeout`
4. **Schema is nested** (`Record<string, any>`); `flattenObject`/`unflattenObject` bridge flat-path ops; **arrays preserved as leaf values**
5. **Socket.IO instance via `globalThis`** — Next.js re-bundles API route modules into separate scopes
6. **`params` is `Promise<Record<string, string>>`** in Next.js 16 — must `await` before use
7. **`archiver` v7+ is ESM-only** — import via named export `{ ZipArchive }`
8. **No key-level locking** — concurrent protection = Schema timestamp conflict detection + `proper-lockfile` atomic writes
