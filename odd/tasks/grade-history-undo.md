# Grade history and contextual undo

## Goal
Add durable local history for grade changes and safely undo the latest change for the student/activity currently being edited.

## Decision
- Undo is contextual: only the current student + activity pair can be undone.
- History is append-only and records previous/new value, pending state, action, and timestamp.
- Undo restores the latest non-undone mutation and marks that history entry undone, preventing accidental repeated toggling.
- Missing grade rows remain the original `—` state; explicit pending remains distinct.
- Scope is grade mutations only; groups, student records, attendance, and Supabase are excluded.

## Tasks
- [x] Add idempotent grade history schema and persistence.
- [x] Add contextual undo operation with closed-period guard.
- [x] Add history/undo controls to grading UI.
- [x] Build and verify NOTAZOD Test.

## Acceptance criteria
- Numeric, pending, and clear mutations append history records.
- History can be viewed for the current student/activity.
- Undo restores the prior state, updates the grid, and cannot affect another student/activity.
- Undo is unavailable for a closed period or when no non-undone history exists.
- Production database and installed production app remain untouched.

## Verification
- `npx tsc --noEmit` passed.
- `pnpm tauri:build:staging` passed with only a non-blocking JS chunk-size warning.
- Latest staging bundle installed/opened at `/Applications/NOTAZOD Test.app`; bundle `com.notazod.desktop.test`.
- Live manual undo/history flow remains pending.
- Native review capture was blocked because the provider returned an incomplete JSON reviewer payload; no review authority was consumed.
