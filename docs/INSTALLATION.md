# NOTAZOD installation guide

This guide covers the V1 desktop installation on macOS and Windows.

## Choose your path

| You are... | Follow |
|---|---|
| A teacher installing NOTAZOD | [End-user installation](#end-user-installation) |
| A developer running the project | [Developer setup](#developer-setup) |
| A maintainer publishing a release | [Release checklist](#release-checklist) |

## End-user installation

### macOS

#### Apple Silicon (M1/M2/M3/M4)

1. Open the project's **GitHub Releases** page.
2. Download the latest file ending in `_aarch64.dmg`.
3. Open the `.dmg` file.
4. Drag **NOTAZOD** into **Applications**.
5. Open `/Applications/NOTAZOD.app`.
6. If macOS asks for confirmation, choose **Open**.

#### Intel Mac

Download the Intel `.dmg` artifact when it is available. The file name normally ends in `x64.dmg`.

#### If macOS blocks the app

Only use this procedure when the installer came from the official project release:

1. Open **System Settings → Privacy & Security**.
2. Find the message that NOTAZOD was blocked.
3. Choose **Open Anyway**.
4. Reopen NOTAZOD from Applications.

Do not bypass macOS security for an installer from an unknown source.

### Windows

1. Open the project's **GitHub Releases** page.
2. Download the latest `.msi` installer. Use the `.exe` installer only when the release does not provide `.msi`.
3. Run the installer.
4. Follow the installation wizard.
5. Open **NOTAZOD** from the Start menu.

If Windows SmartScreen displays a warning, verify that the installer was downloaded from the official GitHub release before choosing **More info → Run anyway**. Signed installers will provide a better trust experience once code signing is configured.

## First launch

1. Create a course with its semester.
2. Add students manually, import a supported student list, or use **Importar notas** for the guided clipboard workflow.
3. Select a period from the **Corte** selector.
4. Configure the Activities/Parcial split if needed.
5. Enter grades or click a grade cell to edit it.

## Data location and backup

NOTAZOD stores data locally in SQLite through the Tauri SQL plugin. The exact application-data path is controlled by the operating system and application runtime. Before moving to a new computer:

- export the information you need;
- keep a copy of the local application data directory;
- do not edit the SQLite database manually while NOTAZOD is running.

#### Automatic internal backups

Before a course is permanently deleted, NOTAZOD automatically creates a consistent snapshot of the whole database using SQLite `VACUUM INTO`. Snapshots are written to a `backups` subdirectory inside the OS application-data directory, with a timestamped, collision-safe filename. These internal backups protect against mistakes during a single destructive action; they are **not** a substitute for an offsite or external copy.

#### Manual backup export

Use the **Exportar copia de seguridad** button in the app header to create a snapshot at a destination you choose through the native save dialog. This also uses `VACUUM INTO`, so the exported file is a consistent, standalone copy of the database that can be opened independently.

**Disaster recovery requires copying backups (automatic or exported) to another disk, drive, or cloud location.** Backups stored only on the same disk as the application data do not protect against disk failure, theft, or loss of the device.

#### Restart-based restore

Use the **Restaurar copia de seguridad** button in the app header to restore a previously exported `.db` file. Restore is **restart-based**, not instant:

1. You pick a single SQLite backup file through the native file-open dialog.
2. NOTAZOD validates it is a regular file, checks the SQLite header, and checks the file length is a non-zero multiple of the page size declared in that header (this rejects empty and truncated files), then copies it into the app-data directory as a pending restore. The currently open database is **not** touched yet. This is **not a full SQLite integrity check** (for example, it does not run `PRAGMA integrity_check`); a file can pass this validation and still contain corrupted page data.
3. The app tells you the restore is pending and asks you to close and reopen NOTAZOD.
4. On the next launch, before the database opens, NOTAZOD moves the current database (and any `-wal`/`-shm` sidecar files) to a timestamped `*.before-restore-<timestamp>` backup, then installs the pending file as the active database.

**Failure behavior:**

- If installing the pending file fails and the rollback is confirmed (the active database file is present again, with any moved `-wal`/`-shm` sidecars restored), NOTAZOD keeps the pending restore staged for another attempt on the next launch and logs the failure to the console.
- If the active database's presence cannot be confirmed after a rollback attempt for any reason — the pre-existing database could not be moved back into place, there was no pre-existing database and the pending install still failed, or a `-wal`/`-shm` sidecar rollback failed — NOTAZOD treats this as fatal: it refuses to open any database rather than risk SQLite silently creating a new empty one, and shows a blocking recovery screen. When a pre-restore backup exists, the screen names its path for manual recovery; when there was no pre-existing database, it says so and asks you to confirm the database file's presence manually. The pending restore is kept for retry in both cases.
- NOTAZOD never silently deletes the pending restore file or the current/backup database files on any failure path.

**Restore is intended only for the active, isolated installation you are running it from** (production restores into production, staging restores into staging). There is no migration path from a staging restore back into production. While testing on the `NOTAZOD Test` staging build, **do not select the production database file** (`notazod.db`) as the restore source — doing so copies production data into staging but never writes back, so it cannot corrupt production, though it does mix real and test data inside the staging profile.

### Branches do not isolate data

Git branches only separate code. They do not separate the SQLite database file on disk. Switching branches in the same working copy still points at the same database unless the database filename itself changes.

NOTAZOD selects the database filename from the `VITE_NOTAZOD_DB_NAME` environment variable (see `app/.env.example`):

- Unset (local development default): `notazod-dev.db`.
- Production release build: must explicitly set `VITE_NOTAZOD_DB_NAME=notazod.db`. This also applies to a production build made locally (`VITE_NOTAZOD_DB_NAME=notazod.db npx tauri build`); without it the app opens `notazod-dev.db` and does not see the production data.

This keeps development work, including work done on feature branches, out of the production database file.

### Testing new features without touching the installed production app

Use this procedure when you want to try a feature build while continuing to use the currently installed production NOTAZOD app for real course data.

**NOTAZOD Test** is a separate staging build with its own application identifier (`com.notazod.desktop.test`), its own product name, and its own database file (`notazod-test.db`). It installs alongside the production app instead of replacing it, and its updater is disabled so it can never automatically pull or overwrite a production release.

1. **Close the production NOTAZOD app completely** before doing anything else. Do not run production and staging against the same database at the same time.
2. If you want test data to resemble your real courses, make a copy of the production database file from the OS application-data directory, or use the in-app **Exportar copia de seguridad** export. Place the copy somewhere outside the production application-data directory.
3. **Never overwrite the original production database file.** Treat it as read-only during this procedure.
4. Build and install NOTAZOD Test:
   ```bash
   cd app
   pnpm build:staging
   pnpm tauri:build:staging
   ```
   Install the resulting `NOTAZOD Test` bundle. It installs beside the production `NOTAZOD` app because it uses a different identifier and product name.
5. Run **NOTAZOD Test** separately from production. It opens `notazod-test.db`, never `notazod.db`.
6. Understand that **NOTAZOD Test does not automatically back up production data.** Existing installed production builds have no automatic export of their own database; only the manual steps above, or the in-app backup/export feature on a version that has it, produce a copy.
7. This procedure does not restore or migrate test data back into production. Treat anything entered in NOTAZOD Test as disposable test data.

## Developer setup

### Requirements

- Node.js 20 or newer.
- pnpm.
- Rust stable and Cargo.
- Tauri 2 system prerequisites.
- Xcode Command Line Tools on macOS.
- WebView2 on Windows (normally installed with current Windows versions; install the official Evergreen WebView2 runtime if missing).

Install dependencies:

```bash
cd /Users/zodiako/DEV/NOTAZOD/app
pnpm install
```

Run the web development server:

```bash
pnpm dev
```

Run the desktop development application:

```bash
pnpm tauri dev
```

Build and verify the frontend:

```bash
pnpm build
```

Build a macOS application bundle:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer pnpm tauri build --bundles app
```

Build all configured installers for the current operating system:

```bash
pnpm tauri build
```

## Publish a release

The repository includes `.github/workflows/release.yml`. It builds macOS Apple Silicon and Windows installers in parallel and uploads them to a draft GitHub Release.

Create and push a version tag:

```bash
cd /Users/zodiako/DEV/NOTAZOD
git tag v0.1.0
git push origin v0.1.0
```

Or run the workflow manually from **GitHub → Actions → Release NOTAZOD → Run workflow** and provide a tag such as `v0.1.0`.

The workflow publishes:

- macOS Apple Silicon `.dmg`.
- Windows `.msi`.
- Windows NSIS `.exe`.

The release is created as a draft so the maintainer can verify the artifacts before making them public.

## Release checklist

- [ ] Update the version in `app/package.json` and `app/src-tauri/tauri.conf.json`.
- [ ] Confirm the production build sets `VITE_NOTAZOD_DB_NAME=notazod.db` (the release workflow sets this explicitly).
- [ ] Confirm `NOTAZOD Test` staging builds keep a distinct identifier, product name, and disabled updater.
- [ ] Run `pnpm build`.
- [ ] Run `cargo check --manifest-path src-tauri/Cargo.toml`.
- [ ] Build the macOS `.app` and `.dmg` artifacts.
- [ ] Build the Windows `.msi` artifact on Windows or a configured Windows CI runner.
- [ ] Test first launch, course creation, student import, guided paste, grade editing, period closure, and exports.
- [ ] Confirm the database migration starts correctly from an existing V1 installation.
- [ ] Publish artifacts and checksums to GitHub Releases.
- [ ] Document known issues and rollback instructions.

## Troubleshooting

### The app opens but the window is blank

Close NOTAZOD and reopen it. If the issue continues, download the installer again from the official release and reinstall it.

### The application is already open but does not show a new feature

Quit every running NOTAZOD window before opening the newly installed version. On macOS, launch the copy in `/Applications` rather than an older copy in Downloads.

### A grade cannot be edited

The selected period may be manually closed. Reopen the period from the course toolbar, then edit the grade.
