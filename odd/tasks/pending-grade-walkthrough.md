# Pending-grade walkthrough

## Goal
When grading a specific activity, advance only through students whose grade for that activity is still pending, instead of traversing the full roster.

## Decision
- Selecting an activity starts at the first pending student for that activity.
- The walkthrough remains scoped to the selected activity.
- Students are evaluated as pending when their grade record is absent or has `pending = 1`; a saved numeric grade is complete.
- Once a student receives a numeric grade, the next step must skip them.

## Tasks
- [x] Preserve direct editing of an existing note.
- [x] Refactor walkthrough navigation to use the activity's pending students.
- [x] Preserve grade saving, empty-grade pending behavior, and modal boundaries.
- [ ] Verify with focused manual checks in NOTAZOD Test.

Build verification is complete: staging Tauri build and frontend build passed; the current staging app was rebuilt and reinstalled with bundle identifier `com.notazod.desktop.test`. Direct table/detail clicks now edit the selected student, while the top-level activity menu starts at the first pending student. Manual behavior confirmation remains pending.

## Acceptance criteria
- Opening an activity's grading action starts at the first pending student.
- Next and previous never navigate to a completed student for that activity.
- Saving a numeric grade advances to the next pending student.
- Saving an empty grade keeps the student pending and does not create a navigation loop.
- If no students are pending, the UI gives a clear message and does not open an unusable walkthrough.
- Other activities and production data behavior remain unchanged.

## Evidence

- Implementation: `app/src/App.tsx` now computes pending roster indexes per activity, starts at the first pending student, skips completed students after save, and reports when no students remain pending.
- Verification: `cd app && pnpm build` passed; `git diff --check` passed.
- Existing flow: `app/src/App.tsx` `openGradeWalkthrough` and `commitGrade` index into the full `students` array.
- Existing grade state: `Grade.pending` in `app/src/lib/db.ts`; `gradeFor` is already available in `App.tsx`.
- User decision: start from the first pending student.
