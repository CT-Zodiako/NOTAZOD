# Student Roulette

## Summary

Adds a per-course roulette to randomly pick one student from the currently selected course, for use during class (e.g. calling on someone at random).

## Scope

- Entry point: `Ruleta` button on the selected-course toolbar (`app/src/App.tsx`), next to the split/percentages button.
- Modal scoped strictly to `selectedCourse`: uses the `students` array as loaded for that course (full roster), independent of `studentSearch`, `gradeFilter`, `groupFilter`, and `viewMode`.
- Action: `Elegir al azar` picks one student uniformly at random via `Math.random()`.
- Visual feedback: while spinning, the modal cycles through random student names every 80ms for ~1.5s (`rouletteIntervalRef`), then settles on the final pick.
- Result: shows winner's full name and code (`rouletteWinner`).
- Re-spin: the button remains enabled after a result; clicking again resets and re-rolls.
- Disabled state: the toolbar button and the in-modal spin button are both disabled when `students.length === 0`.
- Read-only: the roulette never calls any create/update/delete database function. It does not depend on `activeState` (works on locked and active cutoffs alike).
- Cleanup: the spin interval is cleared on `closeRoulette` (explicit modal close) and on component unmount (`useEffect` cleanup), preventing leaks if the user navigates away mid-spin.

## Out of scope

- No persistence of roulette results.
- No weighting (e.g. excluding previously picked students) — each spin is independent and uniform over the full roster.
- No changes to grades, groups, or existing filters.

## Acceptance criteria

1. `Ruleta` button is visible only when a course is selected, and is disabled when that course has zero students.
2. Opening the modal shows the course name and the total student count for that course.
3. `Elegir al azar` is disabled while a spin is in progress and when there are no students.
4. After a spin completes, the modal shows the winner's full name and code.
5. The user can click `Elegir al azar` again after a result to get a new (uniformly random) pick.
6. Changing `studentSearch`, `gradeFilter`, or `groupFilter` has no effect on which students are eligible in the roulette.
7. Switching to a different course and reopening the roulette only offers that course's students.
8. Closing the modal (via `Cerrar` or unmounting the app) stops any in-flight spin interval; no console errors or leaked timers.
9. No grade, group, or student record is created, updated, or deleted as a result of using the roulette.
