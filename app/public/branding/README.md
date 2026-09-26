# NOTAZOD branding assets

Place the replacement application logo here as:

```text
notazod-logo.png
```

Recommended source: a square PNG, at least 1024 × 1024 px, with transparent background if appropriate.

`notazod-logo.png` is the wide logo used in the application header. The square `notazod-app-icon.png` is the adapted source for the macOS/Windows application icon.

To regenerate the native icons after changing the source, run from `app/`:

```bash
pnpm tauri icon public/branding/notazod-app-icon.png
```

The command updates `src-tauri/icons/`. Commit those generated files together with both source images.
