# NOTAZOD automatic update slice

## Goal
Allow NOTAZOD to detect and install signed releases from GitHub Releases.

## Decisions
- Use the official Tauri updater plugin.
- Check for updates from the GitHub `latest.json` endpoint.
- Keep an explicit manual check action in the UI; automatic check on launch may be added only with a clear non-blocking notice.
- Never commit the private signing key.

## Tasks
- [x] Add Tauri updater dependencies and capability permission.
- [x] Add updater endpoint/public-key configuration.
- [x] Add a UI action to check, download, and install an update.
- [x] Update release workflow to create signed updater artifacts and publish `latest.json`.
- [ ] Generate/configure signing key outside Git and document required GitHub secrets. *(Maintainer action — see below.)*
- [x] Verify frontend/native builds (`pnpm build`, `cargo check`).

## Implementation notes
- `app/src-tauri/Cargo.toml`: `tauri-plugin-updater` is declared under a desktop-only target so mobile targets keep building.
- `app/src-tauri/src/lib.rs`: the plugin is registered inside `setup` behind `#[cfg(desktop)]`.
- `app/src-tauri/capabilities/default.json`: adds `updater:default`.
- `app/src-tauri/tauri.conf.json`: `plugins.updater.endpoints` points at the GitHub `latest.json` of the newest release, and `bundle.createUpdaterArtifacts` is enabled.
- `app/src/App.tsx`: the header action **Buscar actualizaciones** opens a modal covering checking, no update, available, installing (with progress), installed, and error states.

## Maintainer setup (required before the updater works)

1. Generate the signing keypair **outside the repository**:

   ```bash
   pnpm tauri signer generate -w ~/.tauri/notazod-updater.key
   ```

   Keep `~/.tauri/notazod-updater.key` private. Never commit it.

2. Copy the printed **public** key into `app/src-tauri/tauri.conf.json` at
   `plugins.updater.pubkey`, replacing the literal placeholder
   `PLACEHOLDER_REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY`. Builds cannot verify
   updates until this is replaced.

3. Add these GitHub repository secrets:

   | Secret | Value |
   | --- | --- |
   | `TAURI_SIGNING_PRIVATE_KEY` | contents of the private key file |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password chosen in step 1 (empty string if none) |

4. The release workflow currently creates **draft** releases. `latest.json` is only
   reachable at `/releases/latest/download/latest.json` once the release is published,
   so publish the draft to make an update visible to installed copies.

5. Bump `version` in `app/src-tauri/tauri.conf.json` for every release; that value is
   what the updater compares against the published `latest.json`.

## Acceptance criteria
- Existing app still opens without an update available.
- UI handles no update, available update, success, and failure states.
- Release workflow has no private key material in repository files.
- A release can publish updater metadata once the maintainer configures secrets.
