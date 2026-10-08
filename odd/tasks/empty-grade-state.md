# Empty grade state

## Goal
Keep a missing grade as the original empty state (`—`), not pending or a numeric grade. Ctrl+Enter restores this state.

## Scope
- A missing grade row is the untouched/original state.
- Explicit pending remains distinct from missing.
- Ctrl+Enter clears the current student's grade row and returns to `—`.
- Preserve existing production/staging isolation.

## Tasks
- [x] Add grade-row deletion/reset persistence.
- [x] Add Ctrl+Enter handling and empty-state UI semantics.
- [x] Preserve walkthrough navigation and calculation behavior intentionally.
- [x] Verify staging build and focused grading flow.
- [x] Fix grading walkthrough to include absent (`—`) rows as gradeable, not just explicit pending rows.

## Evidence
- `app/src/App.tsx:558-563` (`gradeableStudentIndexes`) now treats a row as gradeable when the grade is absent (original empty state) OR explicitly `pending = 1`; it no longer excludes absent rows the way the old `pendingStudentIndexes` did, which caused "No hay estudiantes pendientes..." to fire incorrectly when all grades were still untouched.
- `app/src/App.tsx` walkthrough entry (`openGradeWalkthrough`) and advance (`advanceGradeWalkthrough`) both use `gradeableStudentIndexes`, so selecting an activity/partial starts at the first absent-or-pending student and numeric grading advances through the same set.
- The modal header label now reads `Por calificar X de Y` (previously `Pendiente X de Y`) to avoid implying absent rows are explicit pending, per the required semantic distinction.
- `app/src/App.tsx:765-777` clears the current grade through `deleteGrade` and advances via `navigateGrade` (sequential, clamped) so `Quitar nota` never closes the grading modal.
- `app/src/App.tsx:1235` binds grading shortcuts at the modal level: Ctrl+Enter (`Quitar nota`), Escape (close modal), and `l`/`h` (case-insensitive) for next/previous student navigation; the visible hint lists all shortcuts and the note input keeps autofocus.
- `app/src/lib/db.ts:297-302` deletes the grade row while preserving the closed-period guard.
- User-provided screenshot confirms `—` is the intended empty visual state.
- User-provided screenshot showed selecting an activity/partial incorrectly surfaced "No hay estudiantes pendientes..." for untouched (`—`) students; root cause was `pendingStudentIndexes` requiring an explicit `pending` grade row, excluding absent rows from navigation.
- Verification: `npx tsc --noEmit`, `npm run build`, and `pnpm tauri:build:staging` passed. Latest bundle was installed/opened as `/Applications/NOTAZOD Test.app`; runtime Tauri click-through remains pending.
- The grading modal keeps all three action buttons on one non-wrapping row and removes the explanatory shortcut line beneath them; shortcuts remain available through the buttons and keyboard handling.
- Native review: started for the current candidate, but the provider capture failed twice because the reviewer payload was not valid JSON; no review authority was consumed.
