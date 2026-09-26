# 2. Flows

## Key tasks (priority order)

| # | Task | Frequency | JTBD / rules |
| --- | --- | --- | --- |
| 1 | Enter grades for an activity or the exam | Daily, often on the spot | JTBD 2 · D2, D3, D11 |
| 2 | Create an activity in the active period | Frequent | D3 |
| 3 | Find a student and edit a grade | Frequent | P7 · D7 |
| 4 | Check reminders and period status | Frequent | D6 |
| 5 | Configure the activities/exam split of a period | Occasional | D3 |
| 6 | Add, edit, or remove a student | Occasional | D7 |
| 7 | Export a period or the student list | Per period | D9 |
| 8 | Create a course (dates, student import) | Once per term | JTBD 1 · D6, D9 |

## Entry point

- App opens on **Home**: course list + reminders.
- Reminders are non-intrusive: shown inline on Home (no modals, pop-ups, or blocking alerts).

## Global

- Color mode: follows the OS by default; a toggle available from every screen overrides it and the choice is remembered (added in phase 3, K3). Toggle lives in the AppHeader, right side (phase 4). AppHeader breadcrumb provides the way back to Home.

## Navigation

- Home → click course → **Course student list**.
- Grade entry happens in a **modal, one student at a time**, to make the current student unmistakable and prevent grading the wrong one. Two modes:
  - **Walk-through (by activity):** pick an activity or the exam → modal shows one student at a time (name and code prominent) → type grade → Enter saves and moves to the next student. For grading a whole course. Order: alphabetical by full name (surnames first). All students appear; if a student already has a grade it is shown and can be changed, or kept by pressing Enter. Enter on an empty field records 0,0 and advances; the teacher can update it later. A skipped 0,0 is marked **pending** and is visually distinct from an entered 0,0; entering a real grade clears the pending mark. When the period locks, pending marks are removed and those grades become a definitive 0,0.
- Walk-through has Previous and Next buttons to move between students. Next on an empty field behaves like Enter: records a pending 0,0. Previous on an empty field also records a pending 0,0 (any navigation away from an empty field records it). Students never reached in a walk-through stay empty.
- Each Enter saves immediately; closing the modal mid-way keeps every grade already entered (no final confirm step).
- Every color or status marker (pending, below 3,0, computed, locked) must be explained in a visible legend.
  - **Per student:** click a student in the list → modal shows that student's grades for the active period → enter or edit the needed one. For on-the-spot grading of a single student.

## Course student list (main course screen)

- Period tabs, search box, and legend share a single toolbar above the table (phase 4, to fit 35 rows of 24px).
- Layout: tabs Period 1 / 2 / 3, each with that period's detail (activities, exam, activities average, period grade) and its visible date range. Accumulated and final grades are always visible outside the tabs. Opens on the active period tab.
- Each row shows the student and ALL grades: every activity and exam of the 3 periods, period grades, accumulated grade, and final grade — including 0,0 and untouched values.
- Accumulated grade: how much of the final 100% the student has earned so far from closed periods (e.g. after period 1 closes: P1 × 30%). Sum of (period grade × weight) over closed periods only; shown with the % evaluated (30% → 65% → 100%). Computed exact, displayed with one decimal; equals the final grade when all 3 periods are closed.

## Flows

### Flow: create an activity (task 2)
- Entry: active period tab of the course student list.
- Steps: create activity → enter name → save → back to the list with the new (empty) activity column.
- Does NOT open the walk-through automatically; the teacher grades it whenever they want.

### Flow: enter grades for an activity or the exam (task 1)
- Entry: "Grade" button on the active period tab.
- Steps: Grade → choose activity or exam → walk-through modal (see Navigation) → close when done or interrupted.

### Flow: find a student and edit a grade (task 3)
- Entry: search box at the top of the period tab.
- Steps: type → list filters live (surname, name, code, document) → click student → per-student modal with the period's grades → edit → saved.

### Flow: check reminders and period status (task 4)
- Home top: reminders strip, one line per active reminder (e.g. "Period 1 · Math 10A closes in 3 days (15/10/2026)").
- Home course list: each course shows its active period, status, and days left.
- Course: each period tab shows status (upcoming, active, locked) and dates.
- Reminders cannot be dismissed; closing reminders stay visible until the period locks. Opening reminder is visible for the first 3 days of the period.

### Flow: configure the activities/exam split (task 5)
- Split per period is set during course creation (default 40/60) and can be edited later.
- Entry: current split shown on the period tab ("Activities 40% · Exam 60%") → click → small modal with two fields; editing one auto-completes the other to sum 100%.
- Saving recalculates all affected grades immediately.
- Editable for active and upcoming periods. Locked periods: split is read-only (shown with lock + reason, no modal on click).

### Flow: add, edit, or remove a student (task 6)
- Add: "Add student" button on the course student list → form with the 5 required fields. If any period is locked, the same form also requires every activity and exam grade of each locked period (D7); not saved until complete.
- Edit and remove: from the per-student modal (same one used to edit grades) → "Edit details" and "Remove from course".
- Remove asks for confirmation stating that all grades, including locked ones, are deleted (D7).

### Flow: export (task 7)
- Entry: "Export" button on the course student list → small modal with three options:
  - **One period:** choose which; only locked periods are selectable.
  - **All 3 periods + final:** enabled only when all 3 periods are locked.
  - **Student list:** no grades; always available.
- Unavailable options are shown disabled with the reason (e.g. "Available when Period 1 closes").
- File format per D9 (CSV, ";" separator, comma decimals, one decimal).

### Flow: create a course (task 8)
- Entry: Home → "Create course".
- 3-step wizard; Back keeps entered data; the course is created only when the last step is confirmed.
  1. **Course details:** name and semester, both required. Name + semester must be unique: a duplicate is blocked with an inline message and the teacher changes the name (e.g. "Calculus I A"). Semester format: year-term (e.g. "2026-2"), picked from year and term (1 or 2) lists, not free text.
  2. **Periods:** start/end dates for the 3 periods + split per period (default 40/60); validates end after start and periods in order.
  3. **Students:** upload CSV or an HTML-table `.xls` export → map Nombre, Documento, Código, Correo 1, and Correo 2 → preview valid, duplicate, incomplete, and invalid rows → confirm. Ignore Plan de estudios and Estado financiero.
- Step 3 is optional: the course can be created without students.
- Students can be added later from the course student list, one by one or by importing CSV/HTML-table `.xls` (same preview as step 3). Import is available only until Period 1 locks; afterwards the Import action is disabled with the reason ("Import is closed after Period 1; add students one by one") and students are added one by one with their locked-period grades.

## Screen inventory

| Screen / overlay | Type | Purpose | Tasks |
| --- | --- | --- | --- |
| Home | Screen | Reminders strip + course list with period status; "Create course" | 4, 8 |
| Create course wizard | Screen (3 steps) | Details → periods → optional student import | 8 |
| Course student list | Screen | Period tabs, search, legend, accumulated + final; actions: Grade, Create activity, Add student, Import, Export | 1–7 |
| Walk-through grading | Modal | One student at a time for an activity/exam; Previous/Next, Enter | 1 |
| Student modal | Modal | Student's period grades; Edit details, Remove | 3, 6 |
| Create activity | Modal | Name only | 2 |
| Split editor | Modal | Activities/exam % (auto 100%) | 5 |
| Student form | Modal | 5 fields (+ locked-period grades when late) | 6 |
| Import preview | Modal / wizard step | Rows to import, duplicates skipped | 6, 8 |
| Export | Modal | One period / all 3 + final / student list | 7 |
| Confirm remove | Dialog | Destructive confirmation | 6 |
