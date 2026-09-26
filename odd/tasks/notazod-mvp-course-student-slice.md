# NOTAZOD MVP — courses and students vertical slice

Status: in progress — validation implementation complete; user smoke test pending

## Goal
Build the first Tauri + React + Mantine + SQLite vertical slice for creating courses and managing students.

## Scope
- Create a course with the approved name and semester fields.
- Persist courses in embedded SQLite.
- Add students manually with the approved five required fields and validation.
- Import students from CSV or HTML-table `.xls` with preview, duplicate detection, incomplete/invalid row reporting; map Nombre, Documento, Código, Correo 1, and Correo 2 while ignoring Plan de estudios and Estado financiero.
- Persist students in SQLite and show the course student list.
- Preserve the approved design tokens and component patterns.

## Confirmed delivery choices
- First vertical slice: courses and students.
- Student entry: manual form and CSV import.
- Excel import: deferred.
- First development platform: macOS.
- New React/Tauri application created in parallel; preserve `sandbox/app` as the reference prototype.
- Package manager: pnpm (installed via Corepack; version 12.6.0).

## Environment evidence

- Node v24.19.0.
- pnpm v12.6.0.
- React/Tauri scaffold created at `sandbox/notazod-app`.
- Frontend build passes with `pnpm build`.
- `pnpm tauri info` recognizes Xcode 27.0 when `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` is set.
- `pnpm tauri build` passes after Xcode license acceptance and produces `NOTAZOD.app` and `NOTAZOD_0.1.0_aarch64.dmg`.
- The release app launches successfully on macOS arm64.

## Hardening pass

- Verify SQLite data survives app restart.
- Validate required fields, email formats, and duplicate rows before insert.
- Show CSV preview grouped into valid, duplicate, incomplete, and invalid rows.
- Ensure modal and table interactions are keyboard accessible.

## Explicit non-goals
- Binary Excel workbook import; defer to a later extension. HTML-table `.xls` exports are supported because the current source file uses that format.
- Grade entry and calculation; implement in the next slice.
- Code signing and release automation; release-readiness phase.

## Acceptance criteria
- App launches as a desktop Tauri shell on the development platform. ✅
- React UI consumes the NOTAZOD token system through Mantine theme integration. ✅
- Course and student data survives app restart. ✅ (SQLite plugin/schema wired; full restart CRUD test remains a follow-up.)
- SQLite write permission explicitly enabled with `sql:allow-execute` in Tauri capabilities.
- Manual, CSV, and provided HTML-table `.xls` paths share validation rules. ✅ User confirmed the 27-row `.xls` import.
- Accessibility and keyboard behavior match the approved design. 🔲 User smoke test pending.
- SQLite schema/migrations are documented. ✅

## Hardening evidence

- Shared validation added in `src/lib/validation.ts` for required fields, email format, duplicates, and CSV row classification.
- Import preview reports valid, duplicate, incomplete, and invalid groups.
- `pnpm build`, `cargo check`, and `pnpm tauri build` pass.
- Updated `NOTAZOD.app` launched on macOS arm64.
- Initial course creation was blocked because `sql:default` omitted write permission; fixed by adding `sql:allow-execute`.
- User confirmed the provided `.xls` import works. Restart persistence and keyboard/focus smoke tests remain.
