# NOTAZOD MVP — period lifecycle and calculations

Status: complete — user accepted manual closure, percentages, guards, image export, accumulated, and final grade

## Goal
Add the approved three-period model, configurable activity/exam percentages, lifecycle states, grade calculations, and image export.

## Scope
- Create and persist three manually managed periods per course.
- Track open and manually closed period states.
- Store activity/exam split per period; default 40/60; enforce total 100%.
- Associate grade items with a period.
- Calculate activity average, period grade, accumulated grade, and final grade.
- Prevent edits to manually closed periods; allow reopening.
- Export selected-period grades as a PNG with only student code and final period grade.

## Explicit non-goals
- Automatic updates and code signing.
- Multi-user sync or cloud backup.
- Mobile layouts.

## Verification evidence

- `pnpm build` passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- Tauri `.app` bundle passes with `pnpm tauri build --bundles app`.
- Full `.dmg` packaging currently fails in `bundle_dmg.sh`; app bundle itself is valid.

## Acceptance criteria
- [x] Course creation creates three open periods without date friction.
- [x] Open/closed state is manually controlled with close/reopen actions.
- [x] Activity/exam percentages and period calculations are wired for the active slice.
- [x] Accumulated grade and final grade are shown per student; final grade appears after all three cuts close.
- [x] Percentage editor validates a 100% total and closed-period writes are rejected in UI and SQLite.
- [x] Selected-period PNG export includes only student code and final period grade.
- [x] macOS native smoke test and persistence verification passed for manual closure, percentage, guard, image-export, accumulated, and final-grade flows.
