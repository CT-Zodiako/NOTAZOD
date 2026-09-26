# NOTAZOD MVP — grade entry vertical slice

Status: complete — user confirmed native persistence and keyboard flow

## Goal
Implement the first grade-entry slice for the active course period using the approved keyboard-first, one-student-at-a-time flow.

## Scope
- Show the selected course's students in a grade table.
- Provide one default activity and one exam for the active period.
- Enter/edit grades from a walkthrough modal, one student at a time.
- Enter saves and advances; Shift+Enter saves and goes back; Escape closes.
- Empty navigation records pending 0,0; invalid values block save/advance.
- Persist grades in SQLite and show pending/failing/pass states.

## Explicit non-goals
- Multi-period lifecycle and date locking; next slice.
- Configurable activity/exam percentages; next slice.
- Final/accumulated calculations; next slice.
- Grade export; next slice.

## Acceptance criteria
- [x] Grade table opens from a selected course.
- [x] Walkthrough identifies the student and item clearly.
- [x] Manual grade input validates 0,0–5,0 with one decimal.
- [x] Keyboard behavior is wired: Enter, Shift+Enter, Escape.
- [x] Grades survive app restart; user confirmed persistence.
- [x] Native macOS build and smoke test pass; user confirmed the flow works.
