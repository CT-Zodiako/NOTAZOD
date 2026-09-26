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

A guided backup/restore flow is outside V1.

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
