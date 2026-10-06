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
- Commit: `c02fab2` (`feat: add isolated staging build`).

### Controlled production-data clone
- Only copy after the production app is fully closed.
- Keep the original production database untouched and create a separate staging database copy.
- Verify the copied SQLite database before launching `NOTAZOD Test`.
- Copy evidence (2026-10-05): production integrity `ok`, 4 courses, 80 students, 334 grades; staging copy integrity `ok` with matching counts. Previous staging data was preserved in a timestamped sibling backup, not deleted.

### Safe backup restore
- Restore is staged, not applied in-place: select a backup, create a pending restore, then restart the app.
- On next launch, the native layer moves the current database to a timestamped pre-restore backup before applying the pending copy.
- Restore targets the active app's database name only; production and staging remain isolated by identifier and filename.
- Review follow-up: a failed rollback must never allow SQLite to create a new empty active database; failures must remain visible and recoverable.
- Implementation: `app/src-tauri/src/lib.rs` adds `stage_restore` (validates the database name is a plain filename and the source file starts with the SQLite header, copies to a temp file, then atomically renames to `<db>.pending-restore`) and `apply_pending_restore` (moves the current database and `-wal`/`-shm` sidecars to `<db>.before-restore-<timestamp>`, atomically renames the pending file into place, and rolls back the move on failure).
- `app/src/lib/db.ts` exposes `stageRestore()`/`applyPendingRestore()` using the existing `resolveDatabaseName()` resolver; `initDatabase()` calls `applyPendingRestore()` before opening SQLite, so production and staging each only ever restore into their own database file.
- `app/src/App.tsx` adds a "Restaurar copia de seguridad" header button using the native file-open dialog (single `.db` file), stages the restore, and tells the user to close/reopen the app; it never replaces the open database in-place and never auto-restarts.
- Documented in `docs/INSTALLATION.md` (new "Restart-based restore" subsection) and `README.md`, including the explicit warning not to select the production database while testing on the staging build.
- No new dependency; reuses the already-installed `tauri-plugin-dialog`.
- Verification: `cd app && pnpm build` passed; `cd app/src-tauri && cargo check` passed clean.

### Safety correction: sidecar rename failure must abort restore
- Bug: `apply_pending_restore` moved `-wal`/`-shm` sidecars with `if std::fs::rename(...).is_ok()`, silently discarding a rename failure instead of treating it as a restore failure. A failed sidecar move left the current database and whatever sidecars did succeed in an inconsistent state while still attempting to install the pending restore.
- Fix: a sidecar rename failure now immediately rolls back the database move (if any) and any sidecars already moved in this attempt, then returns `Err` without touching `pending_path`, so the pending restore remains available for retry on next launch. The success path and the existing rollback-on-install-failure behavior are unchanged.
- Verification: `cd app && cargo check --manifest-path src-tauri/Cargo.toml` passed clean.

### Safety correction: pending restore failure must not block app startup
- Bug: `initDatabase()` awaited `applyPendingRestore()` directly, so a rejected `apply_pending_restore` invocation (native error) would propagate out of `initDatabase()` and prevent `getDatabase()` from ever running, leaving the app unable to open even though the current database file is untouched by the rollback path.
- Fix: `initDatabase()` now wraps `applyPendingRestore()` in a `try/catch`, logs the failure, and continues on to open the current database. Native rollback behavior and the retained pending-restore file for retry are unchanged; the frontend simply no longer treats a failed restore attempt as fatal for startup.
- Verification: `pnpm build` and `cargo check --manifest-path src-tauri/Cargo.toml`.

### Safety correction: fatal rollback detection must not depend on moved_db
- Bug: `roll_back_and_report` only marked a restore failure as fatal when `moved_db` was true. If there was no pre-existing database (`moved_db` false) and the pending install failed, `db_path` remained absent and the function returned a recoverable error, so `initDatabase()` continued and `getDatabase()` would let SQLite silently create a new empty database in its place. A failed sidecar rollback (`-wal`/`-shm`) was also silently discarded instead of being treated as unsafe.
- Fix: fatal is now returned whenever `db_path.is_file()` cannot be confirmed after the rollback attempt, or when the database rollback or a sidecar rollback rename fails, regardless of `moved_db`. The pending restore file is still never touched on any failure path, so it remains available for retry. The fatal message now distinguishes the `moved_db` case (names the preserved pre-restore backup) from the no-prior-database case (no backup exists to point to) and tells the operator not to reopen the app until the database file's presence is manually confirmed.
- Verification: `cargo check --manifest-path src-tauri/Cargo.toml` passed clean.
- **Superseded by the hardening pass below**, which re-introduces a stop-the-world path specifically for the double-failure case this correction was too broad about (it treated *every* restore failure as safe to continue past, including the case where the active database could not be confirmed present).

### Hardening pass: fail closed on unconfirmed rollback, strengthen validation, surface failures visibly
- Review finding: the double-failure case (sidecar/install rename fails, then the rollback-to-pre-restore-backup rename also fails) left `db_path` missing. The frontend's broad `try/catch` around `applyPendingRestore()` then proceeded to `getDatabase()` regardless, and `Database.load` would silently create a new empty SQLite file in place of the lost active database. Failures were also console-only, and source validation only checked the 16-byte SQLite magic header.
- Fix (`app/src-tauri/src/lib.rs`): `apply_pending_restore` now returns a structured `RestoreError { fatal, message, backupPath }` (via `serde::Serialize`, so Tauri delivers it as a JS object, not a plain string) instead of `String`. A shared `roll_back_and_report` helper performs the rollback for both the sidecar-rename failure path and the final install-rename failure path, then explicitly checks `db_path.is_file()` after the rollback attempt:
  - *(Superseded by the "fatal rollback detection must not depend on moved_db" correction above: this bullet described the original `moved_db`-gated rule. See that section for the current, broader fatal condition.)* If a pre-existing database was moved aside (`moved_db`) and the rollback either errors or cannot be confirmed by `db_path.is_file()`, the error is `fatal: true` with `backupPath` set to the preserved pre-restore backup file path.
  - Otherwise (rollback confirmed, or there was no pre-existing database to protect) the error is `fatal: false`, and the message states the pending restore is retained for retry and the current database stays active.
  - No failure path deletes `pending_path`; a fatal or recoverable failure always leaves the pending restore file in place for another attempt.
- Fix (`app/src/lib/db.ts`): `initDatabase()` still swallows and logs recoverable restore failures before opening the current database, but now checks the thrown `RestoreError.fatal` flag first; a fatal error is re-thrown instead of being logged and ignored, so `getDatabase()`/`Database.load` is never reached and SQLite cannot create a replacement empty file.
- Fix (`app/src/App.tsx`): the startup effect's `.catch()` now distinguishes a fatal `RestoreError` from an ordinary "no courses yet" failure. A fatal error sets `fatalStartupError`, which short-circuits the component's render to a dedicated recovery screen (no `AppShell`, no course list) stating that NOTAZOD refused to open any database and showing the preserved pre-restore backup path from the error message. This replaces the prior console-only `console.error` behavior for this specific case.
- Validation strengthening (`app/src-tauri/src/lib.rs`): `is_sqlite_file` was replaced by `validate_sqlite_file`, used by both `stage_restore` (source file) and `apply_pending_restore` (pending file, re-validated before touching the active database). It rejects zero-length files, files too small to contain the full 100-byte header, a non-matching magic string, an invalid (non-power-of-two or <512) declared page size, and a file length that is not an exact multiple of the declared page size (catches truncation). This remains **not** a full SQLite integrity check (e.g. no `PRAGMA integrity_check`); doing that without adding a dependency (e.g. `rusqlite`) is impractical, so full page-level/btree integrity validation is a documented, known limitation.
- Limitation carried forward: no automated tests exist for this restore flow; verification below is manual compilation/build only.
- Verification: `cd app && pnpm build` passed (tsc + vite build). `cd app/src-tauri && cargo check --manifest-path Cargo.toml` passed clean; `cargo clippy --manifest-path Cargo.toml` also passed clean.
- Final fatal-path correction: rollback is fatal whenever active DB presence cannot be confirmed, including no-prior-database and sidecar rollback failures.
- Commit: `01aec36` (`feat: add safe backup restore`).
