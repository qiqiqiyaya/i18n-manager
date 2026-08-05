# AGENTS.md

## Project-Specific Agent Guidance

This file provides project-specific guidance for AI agents working on the i18n Manager codebase.

### Key Context for All Agents

- **Stack**: Next.js 16 (App Router, canary) + Express 5 + Socket.IO 4 + React 19 + Ant Design 6 + Monaco Editor + Zustand 5 + RxJS 7 + Zod 4
- **No database**: All persistence is local JSON files under `data/projects/{projectId}/`
- **No auth**: No user system; client IP identifies operators for lock tracking
- **Language**: Code comments and UI text are in Chinese; documentation uses mixed Chinese/English
- **Server entry**: `server.ts` (not `next start`); must use `npm run start:server` for full functionality
- **Compatibility**: `fix-async-storage.cjs` is required for Next.js 16 canary; do not remove

### Agent-Specific Notes

#### planner
- When planning features, consult `i18nManager.md` section 6 for mandatory AI coding constraints
- Schema changes must propagate to all locale files (both in-memory via `applyLocaleSync` and on-disk via `syncSchemaChangesToLocales`)
- Socket.IO events (`schema:save`, `locale:save`) are the primary persistence path, not HTTP PATCH

#### architect
- The architecture is a single-process Node.js server: Express 5 wraps Next.js + Socket.IO on one HTTP server
- `withApiHandler` HOF wraps most API routes; import/export routes handle errors manually due to binary/multipart needs
- `globalThis` is used to share the Socket.IO instance across Next.js module bundling boundaries (`setIO`/`getIO` in `socket-handler.ts`)

#### code-reviewer
- Enforce: Monaco Editor only (no Ant Design Table/Tree for editing), RxJS for debounce (no raw setTimeout), immutable state updates in Zustand
- Check: `proper-lockfile` usage in `atomicWriteJson`, lock cleanup on disconnect, `beforeunload` handler for unsaved changes
- Watch for: `flattenObject` throws on arrays (by design), `flattenForImport` in import-export preserves arrays

#### tdd-guide
- No test runner is currently configured; when adding tests, set up Jest or Vitest first
- Data layer functions (`src/lib/data-layer/`) are the best candidates for initial unit tests
- Socket.IO handler tests should mock `Socket` and `Server` instances

#### security-reviewer
- No auth system by design; do not flag missing authentication as an issue
- Validate: file path traversal in API routes (projectId/lang params), JSON parse safety, proper-lockfile deadlock prevention
- Socket.IO CORS is currently `origin: '*'`; flag if this needs restriction for production

#### refactor-cleaner
- `JsonEditor.tsx` (old jsoneditor wrapper) is deprecated but still present; safe to remove
- `jsoneditor.d.ts` type declaration can be removed alongside `JsonEditor.tsx`
- `pino` is listed as a dependency but not used in any source file; consider removing or integrating

#### build-error-resolver
- Next.js 16 canary may have breaking changes; check `node_modules/next/dist/docs/` for current API
- `fix-async-storage.cjs` must be loaded via `--require` before `tsx` imports; if build fails with `AsyncLocalStorage` errors, verify this file is in the start command
- Express 5 uses `path-to-regexp v8` which does not support wildcard routes; the catch-all middleware uses no-path `use()` as a workaround

#### doc-updater
- `CLAUDE.md` is the primary reference for AI agents; keep it in sync with codebase changes
- `i18nManager.md` is the requirements document (section 6 = authoritative technical constraints)
- Auto-generated sections in `CONTRIBUTING.md` and `RUNBOOK.md` are marked with `<!-- AUTO-GENERATED -->` comments
- Codemaps in `docs/CODEMAPS/` should be regenerated when architecture changes

### Common Pitfalls

1. **Do not use `npm run dev` for testing real-time collaboration** -- it only starts Next.js without Express/Socket.IO
2. **Do not replace Monaco Editor** with any other editing component (Ant Design Table, Tree, etc.)
3. **Do not use raw `setTimeout`/`clearTimeout`** for debounce/throttle -- use RxJS `Subject` + `pipe(debounceTime(...))`
4. **Schema is nested** (`Record<string, any>`), matching the locale file structure; `flattenObject`/`unflattenObject` bridge the gap for flat-path operations (search, incremental transport, lock keyPath)
5. **Socket.IO instance sharing** uses `globalThis` because Next.js re-bundles API route modules into separate scopes
6. **`params` in App Router** is now `Promise<Record<string, string>>` in Next.js 16; must `await` before use
7. **`archiver` v7+ is ESM-only**: imports via `{ ZipArchive }` (named export, no default); `createRequire` does not work for ESM-only packages
8. **Homepage search**: frontend caches project list (`allProjects` state), filters locally via `useMemo` with 30s background refresh; search results highlight matched keywords via `SearchHighlight` component
