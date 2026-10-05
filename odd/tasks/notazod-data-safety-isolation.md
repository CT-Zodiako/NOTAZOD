# NOTAZOD data safety and environment isolation

## Goal
Prevent development work from opening or mutating the production SQLite database, while documenting the branch and database separation policy.

## Decisions
- Work on branch `feature/data-safety-isolation`; production code remains on `main`.
- Development uses an explicit database filename distinct from production.
- The database filename is selected by a Vite build-time environment variable and defaults safely to the development database for local development.
- SQLite database files are ignored by Git and never committed.
- The next safety slice adds an automatic internal snapshot plus manual export, while keeping soft-delete as a later follow-up.

## Tasks
- [x] Add environment-specific SQLite database naming.
- [x] Add a safe `.env.example` and Git ignore rules.
- [x] Document branch/database separation and operational rules.
- [x] Verify the frontend build and inspect the final diff.
- [x] Add an automatic internal backup before destructive operations.
- [x] Add manual backup export to a user-selected location.
- [x] Make course deletion transactional and verify recovery behavior.

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
- Commit: `cb6dd90` (`feat: isolate development database`).
- New decision: provide both automatic internal backups and manual export to a user-selected location.

### Dual-backup safety slice
- Added native Tauri command `resolve_backup_path` (`app/src-tauri/src/lib.rs`) to resolve/create `<app-data-dir>/backups` and return a timestamped, collision-safe snapshot path, keeping OS path handling native.
- Added `tauri-plugin-dialog` (Cargo.toml, package.json, capabilities) to let the user pick a manual export destination through the native save dialog instead of typing a path.
- `app/src/lib/db.ts`: `createInternalBackup` runs `VACUUM INTO $1` (parameterized, no path interpolation) before destructive deletes; `exportBackup` runs the same for manual export; `deleteCourse` now backs up, then wraps its deletes in `BEGIN`/`COMMIT` with `ROLLBACK` on failure, preserving the existing explicit delete order.
- `app/src/App.tsx`: added an "Exportar copia de seguridad" header button using `@tauri-apps/plugin-dialog`'s `save()`, plus success/error feedback text.
- Documentation: `docs/INSTALLATION.md` now documents automatic internal snapshots, manual export, and that backups must be copied to another disk for disaster recovery.
- Commit: `2032696` (`feat: add database backup safeguards`).
