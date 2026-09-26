# 7. Implementation plan — NOTAZOD

## Implementation context

- Target repository/application: `sandbox/notazod-app` (new production app; `sandbox/app` remains the reference prototype).
- Runtime and framework: Tauri 2 + Rust, React + TypeScript, Mantine.
- Development platform: macOS arm64.
- Supported platforms for the release: macOS, Windows, Linux.
- Package manager and commands: pnpm; `pnpm build`, `cargo check`, `pnpm tauri build`.
- Data migrations and persistence: embedded SQLite through `tauri-plugin-sql`; schema must evolve through explicit migrations.

## Vertical slices

| Order | Slice | User value / foundation | Dependencies | Allowed surfaces | Explicit non-goals | Acceptance evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Courses and students | Create courses, add students manually, import CSV, persist locally | Tauri shell, Mantine, SQLite | `src/App.tsx`, `src/lib/db.ts`, `src/lib/validation.ts`, `src/main.tsx`, `src/App.css`, `src/tokens.css`, `src-tauri/` | Grade entry, Excel import, signing, release automation | build, cargo check, bundle, native launch, restart smoke test | hardening |
| 2 | Grade entry | Load a course and enter grades through the approved keyboard-first flow | Slice 1, approved grade rules | grade table, grade modal, grade persistence/migration | final release, reports beyond approved CSV | unit, integration, keyboard, persistence, bundle | complete |
| 3 | Period lifecycle and exports | Lock periods, calculate grades, export approved CSV | Slice 2, domain rules | period state, calculations, export flow | cloud sync, multi-user roles | calculation fixtures, export fixtures, lifecycle tests | planned |

## Slice detail

### Slice 1: Courses and students

#### Behavior

- Create a course with name and semester.
- Open a course and view its student list.
- Add a student with five required fields.
- Import CSV and preview valid, duplicate, incomplete, and invalid rows.
- Persist course and student records in SQLite.

#### Data and migrations

- `courses` table with unique name/semester.
- `students` table with per-course uniqueness for code, document, and both emails.
- Next schema change must use a versioned migration rather than mutating the initial schema silently.

#### UI and component mapping

- Mantine shell, cards, modal, inputs, table, file picker, badges, and feedback.
- Custom domain behavior: course list, student table, student validation, CSV classification.
- All visual values come from generated NOTAZOD tokens.

#### Accessibility and responsive behavior

- Visible labels and field errors.
- Keyboard-accessible modals and buttons.
- Table remains usable at smaller laptop widths through horizontal scrolling.
- Errors are announced and tied to fields.

#### Tests and verification

- Unit: student validation and CSV classification.
- Integration: SQLite course/student CRUD and uniqueness constraints.
- UI/manual: create, restart, add student, invalid values, duplicate values, CSV groups, keyboard focus.
- Build/package: `pnpm build`, `cargo check`, `pnpm tauri build`.

#### Acceptance criteria

- [x] App launches as a Tauri desktop app on macOS.
- [x] Course creation and student table are implemented.
- [x] SQLite schema and repository calls are present.
- [x] Manual and CSV validation paths share validation rules.
- [ ] User confirms persistence after closing and reopening the app.
- [ ] User confirms keyboard/focus behavior in the native window.

#### Non-goals

- Excel import.
- Grade entry and calculations.
- Code signing and release automation.

#### Review evidence

- Files/surfaces reviewed: `sandbox/notazod-app/src`, `sandbox/notazod-app/src-tauri`.
- Commands run: `pnpm build`, `cargo check --manifest-path src-tauri/Cargo.toml`, `pnpm tauri build`.
- Expected output: successful frontend build, Rust check, `.app`, and `.dmg` bundle.
- Known limitations: native restart and keyboard smoke tests await user confirmation; CSV parser is intentionally limited to the MVP CSV shape.

## Implementation gates

- Phase 7 plan is approved.
- Slice 1 remains in hardening until the outstanding native smoke checks are confirmed.
- Slice 2 must not start until Slice 1 is accepted.

## Open TBDs

- None for the current slice; release readiness is a later phase.

## Approval

- Status: `approved`
- Approved by:
- Date:
