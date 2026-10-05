# NOTAZOD data safety and environment isolation

## Goal
Prevent development work from opening or mutating the production SQLite database, while documenting the branch and database separation policy.

## Decisions
- Work on branch `feature/data-safety-isolation`; production code remains on `main`.
- Development uses an explicit database filename distinct from production.
- The database filename is selected by a Vite build-time environment variable and defaults safely to the development database for local development.
- SQLite database files are ignored by Git and never committed.
- This slice does not yet implement backup/restore or soft-delete; those remain follow-up safety work.

## Tasks
- [x] Add environment-specific SQLite database naming.
- [x] Add a safe `.env.example` and Git ignore rules.
- [x] Document branch/database separation and operational rules.
- [x] Verify the frontend build and inspect the final diff.

## Acceptance criteria
- `pnpm dev` and `pnpm build` use `notazod-dev.db` by default.
- Production builds can explicitly set `VITE_NOTAZOD_DB_NAME=notazod.db`.
- No SQLite database files are tracked by Git.
- Documentation clearly states that Git branches do not isolate runtime data by themselves.
- Existing schema and application behavior remain unchanged apart from the database filename selection.

## Implementation notes
- Primary code surface: `app/src/lib/db.ts`.
- Configuration/documentation surfaces: `app/.env.example`, `.gitignore`, `docs/INSTALLATION.md`, `README.md`.
- Verification: `cd app && pnpm build` passed; `git diff --check` passed; SQLite database files remain ignored; `.env.example` is explicitly trackable.
- Commit: `ef63f75` (`feat: isolate development database`).
