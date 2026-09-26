# Tech notes — NOTAZOD

Implementation choices live here, outside `design/`, so the spec stays technology-agnostic.

| Date | Decision | Why |
| --- | --- | --- |
| 2026-09-25 | First implementation: functional HTML prototype, opened in the browser, offline, with sample data (1 course, 35 students) and browser storage. | Validate the spec (keyboard flow, contrast, 24px rows, 35 rows at 1920×1080, light/dark) before building the real app. |
| 2026-09-25 | Real app storage (SQLite, mentioned by the user) deferred until the prototype is reviewed. | Not needed to validate the design. |
| 2026-09-25 | Tokens are generated, never hand-written: `scripts/build-tokens.py design/04-tokens.json app/tokens.css`. Semantic references stay `var()` so dark overrides cascade. | Single source of truth; UI code reads only CSS custom properties. |
| 2026-09-25 | Nunito bundled as a variable font file (`app/fonts/Nunito.ttf`). | Offline; one file covers every weight. |
| 2026-09-26 | Production frontend selected: React + TypeScript. | Strong ecosystem for custom interactive components, animation, keyboard flows, and accessible primitives. |
| 2026-09-26 | Component kit selected: Mantine, themed from NOTAZOD tokens. | Prioritizes visual customization while providing ready-made interactive controls; domain components remain custom. |
| 2026-09-26 | Team accepts learning and maintaining Rust/Tauri. | Tauri remains the selected desktop direction; validate build pipeline and plugins before production implementation. |
| 2026-09-26 | Durable storage selected: embedded SQLite. | Supports reliable local transactions, structured grade data, and future queries without relying on browser storage. |
| 2026-09-26 | Initial distribution: GitHub Releases with automatic update checks and user-approved installation. | Keeps releases centralized while retaining user control; code-signing is deferred to release readiness. |
| 2026-09-26 | MVP development starts as a new React/Tauri app in parallel with the static prototype, using pnpm on macOS. | Preserves the prototype as a visual/behavior reference and avoids a risky migration before the first vertical slice is validated. |
| 2026-09-26 | Technology recommendation phase added; NOTAZOD delivery surface confirmed as an installable desktop application. Tauri + React/TypeScript is the provisional production direction, with Electron and PWA retained as comparison candidates. | Offline-first and desktop-oriented; final runtime choice awaits team capability and durability validation. |

## Prototype

- Open `sandbox/app/index.html` directly (double-click). No server, no internet.
- Review helpers: `?today=YYYY-MM-DD` fixes the date; `?reset=1` restores sample data.
- `app/muestra-importacion.csv`: 5 valid rows, 1 duplicate, 1 incomplete, 1 invalid email.

## Known prototype limits (not design decisions)

- Excel import is not read: the prototype asks to save as CSV. The real app needs a spreadsheet reader.
- Browser storage flushes to disk asynchronously: a browser crash can lose the last few seconds of grades. Observed while testing. The real app must write to its local file on every save.
- Storage is per browser and per file location; moving the folder or clearing site data loses the data.

## Verified (2026-09-25, Chrome, viewport 1920×960 ≈ 1920×1080 screen minus browser chrome)

- 35 of 35 rows visible, rows 24px, toolbar in one line, no page scroll.
- Text contrast: 0 elements below 4.5:1 in light and dark (course list, legend, walk-through, error, home, toast).
- Lighthouse accessibility 100, best practices 100.
- Keyboard: walk-through Enter / Shift+Enter / Esc, invalid grade blocks, empty = pending, focus returns to trigger; row Enter opens student; tabs with arrows.
- Forms: blur validation (format, uniqueness), save validation with focus on first error, summary when > 3 errors, unsaved-changes confirm.
- Import preview groups; export CSV with ";", comma decimals, UTF-8 BOM.
