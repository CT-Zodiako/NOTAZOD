# NOTAZOD branding assets

Place the replacement application logo here as:

```text
notazod-logo.png
```

Recommended source: a square PNG, at least 1024 × 1024 px, with transparent background if appropriate.

This file is used in the application header. To regenerate the native macOS/Windows icons from the same image, run from `app/`:

```bash
pnpm tauri icon public/branding/notazod-logo.png
```

The command updates `src-tauri/icons/`. Commit those generated files together with the source image.
