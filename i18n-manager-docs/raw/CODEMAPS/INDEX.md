# i18n Manager Codemaps

**Last Updated:** 2026-08-05

## Overview

i18n Manager is a lightweight, collaborative multilingual translation management tool. Full-stack Next.js 16 application with no user system, globally shared data, designed for small internal teams.

## Codemap Index

| Document | Area | Description |
|---|---|---|
| [architecture.md](architecture.md) | System | High-level architecture, data flow, key decisions, entry points |
| [frontend.md](frontend.md) | Client | Pages, components, hooks, stores, data flow, third-party libraries |
| [backend.md](backend.md) | Server | API routes, data layer, Socket.IO events, validation, response envelope |
| [data.md](data.md) | Persistence | File structure, type definitions, transform pipeline, concurrency guarantees |
| [dependencies.md](dependencies.md) | External | Runtime/dev dependencies, environment variables, version notes |

## Quick Reference

### Entry Points
- **Server**: `server.ts` (Express 5 + Socket.IO + Next.js)
- **Home Page**: `src/app/page.tsx`
- **Editor Page**: `src/app/projects/[id]/page.tsx`
- **Data Layer**: `src/lib/data-layer/index.ts`
- **Socket Handler**: `src/lib/socket-handler.ts`

### Key Technologies
- Next.js 16 (App Router, canary) + Express 5
- React 19 + Ant Design 6 + Monaco Editor
- Zustand 5 + Socket.IO 4 + RxJS 7
- Zod 4 + fs-extra + proper-lockfile

### Data Storage
- Local JSON files under `data/projects/{projectId}/`
- No database, no auth, no external services

### Related Documentation
- [`CLAUDE.md`](../../CLAUDE.md) — AI agent working guide
- [`AGENTS.md`](../../AGENTS.md) — Per-agent project guidance
- [`i18nManager.md`](../../i18nManager.md) — Full requirements and technical constraints
- [`docs/CONTRIBUTING.md`](CONTRIBUTING.md) — Development guide
- [`docs/RUNBOOK.md`](RUNBOOK.md) — Deployment and operations
