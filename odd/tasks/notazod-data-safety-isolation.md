# NOTAZOD data safety and environment isolation

## Goal
Prevent development work from opening or mutating the production SQLite database, while documenting the branch and database separation policy.

## Decisions
- Work on branch `feature/data-safety-isolation`; production code remains on `main`.
- Development uses an explicit database filename distinct from production.
- The database filename is selected by a Vite build-time environment variable and defaults safely to the development database for local development.
- SQLite database files are ignored by Git and never committed.
- The next safety slice adds an automatic internal snapshot plus manual export, while keeping soft-delete as a later follow-up.
- Staging must use a distinct Tauri application identifier, product name, updater configuration, and database name so testing cannot replace or open production.

## Tasks
- [x] Add environment-specific SQLite database naming.
- [x] Add a safe `.env.example` and Git ignore rules.
- [x] Document branch/database separation and operational rules.
- [x] Verify the frontend build and inspect the final diff.
- [x] Add an automatic internal backup before destructive operations.
- [x] Add manual backup export to a user-selected location.
- [x] Make course deletion transactional and verify recovery behavior.
- [x] Create isolated staging identity and database profile.
- [x] Document safe production-to-staging testing procedure.
- [x] Verify production and staging frontend/native builds.

## Acceptance criteria
- `pnpm dev` and `pnpm build` use `notazod-dev.db` by default.
- Production builds can explicitly set `VITE_NOTAZOD_DB_NAME=notazod.db`.
- No SQLite database files are tracked by Git.
- Documentation clearly states that Git branches do not isolate runtime data by themselves.
- Existing schema and application behavior remain unchanged apart from the database filename selection.
- Staging builds use `com.notazod.desktop.test`, `NOTAZOD Test`, and `notazod-test.db`.
- Production release workflow explicitly sets `VITE_NOTAZOD_DB_NAME=notazod.db`.
- Production and staging bundles can be built without the staging bundle replacing the production app.

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
- Commit: `335e050` (`feat: add database backup safeguards`).

### Staging installation isolation
- Goal: allow testing new features beside the live installed app without replacing it or opening its database.
- Staging identity: `NOTAZOD Test`, identifier `com.notazod.desktop.test`.
- Staging database: `notazod-test.db`; production remains `notazod.db`.
- Staging updater: disabled; staging must never consume production releases automatically.
- A production database copy may only be made while the production app is fully closed and must never overwrite the production file.
- Tasks: update build/profile configuration, document the copy procedure, verify staging build output and production isolation.
- Implementation: `app/src/lib/db.ts` resolves `notazod-test.db` whenever Vite's built-in `MODE === "staging"`, with no new env file or dependency; `app/package.json` adds `build:staging` (`vite build --mode staging`) and `tauri:build:staging` (`tauri build --config src-tauri/tauri.staging.conf.json`); `app/src-tauri/tauri.staging.conf.json` overrides `productName`/`identifier` to `NOTAZOD Test` / `com.notazod.desktop.test`, points `beforeBuildCommand` at the staging script, empties the updater `endpoints` array, and sets `createUpdaterArtifacts: false`.
- The Rust-side `tauri_plugin_updater` plugin registration in `src-tauri/src/lib.rs` is unchanged (out of this slice's edit surface); staging disables the updater functionally through an empty endpoint list and no updater artifacts, not by removing plugin registration.
- `.github/workflows/release.yml` now sets `VITE_NOTAZOD_DB_NAME: notazod.db` explicitly in the production release step's `env:` block.
- `docs/INSTALLATION.md` and `README.md` document the safe staging procedure: close production first, copy/export its DB without overwriting the original, build/install `NOTAZOD Test` separately, and understand old installed builds do not auto-back-up production data. No restore/migrate-back path is implemented.

### Staging build blocker fix: dialog plugin version mismatch
- Blocker: `tauri build --config src-tauri/tauri.staging.conf.json` failed before compilation because the Rust crate `tauri-plugin-dialog` was pinned at `2.7.3` (`app/src-tauri/Cargo.lock`) while `@tauri-apps/plugin-dialog` resolved to `2.8.1` via the `^2` range in `app/package.json`, and Tauri CLI 2.11.5 rejects that JS/Rust version skew.
- Fix: pinned `@tauri-apps/plugin-dialog` to the exact `2.7.3` in `app/package.json` and regenerated `app/pnpm-lock.yaml` via `pnpm install`. No Rust dependency or production runtime behavior changed.
- Verification: `cd app && pnpm tauri build --config src-tauri/tauri.staging.conf.json --bundles app --debug` compiled `tauri-plugin-dialog v2.7.3` and finished, bundling `NOTAZOD Test.app` successfully.
- Commit: `eaf2c8e` (`feat: add isolated staging build`).
