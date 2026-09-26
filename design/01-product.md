# 1. Product

Product name: **NOTAZOD** (added in phase 3, K1).

## Problem statement

> Teachers struggle to record and compute student grades per grading period because they manage them in Excel (pains: building and maintaining formulas, computing grades manually, finding a student row by row). We need a single place to manage courses, their students, and grades, with period and final grades computed automatically.

## Proto-persona

### Teacher (only role)
- Context: manages grades in Excel today; used to spreadsheet-style editing. Enters grades anywhere: in class while grading on the spot, at the university, at home.
- Goal: record grades per course and period, and get computed grades without manual math.
- Frustration: Excel formulas, manual calculations, finding a student row by row.
- Primary device: laptop, own computer carried to class (derived from D10 + P2).
- Technical level: medium; expects minimal effort.
- Accessibility needs: none specific for now (baseline still applies, phase 5).

## Jobs To Be Done

- When I start a term, I want to set up my courses and their students, so I can record grades for each one.
- When I evaluate an activity, I want to enter grades quickly, one by one or for the whole course, so I don't waste time.
- When a grading period ends, I want period and final grades computed automatically, so I avoid calculation errors.

## Domain rules affecting UI

Each rule: **Rule** → **UI impact**. Calculation logic itself lives outside the design spec.

### D1 · Entities
- Course → 3 periods → each period has activities (1..n) + exactly one exam.
- Each course has its own independent student list; no cross-course matching.
- → UI: course list; course detail with student roster and per-period grade table.

### D2 · Formats and ranges
- Grade: 0,0–5,0, one decimal. Input accepts "." or ","; always displayed with comma.
- Student fields, all required: full name, institutional email, document ID, student code, personal email.
- Full name is written surnames first, then given names (e.g. "Gómez Pérez Laura María"); sorting by full name = sorting by surname.
- Unique within a course: code, document ID, institutional email, personal email.
- Dates: DD/MM/YYYY.
- → UI: grade input restricts range/precision and normalizes to comma; student form validates required + uniqueness per field.

### D3 · Computed values
- Activities component = simple average of the period's activities (equal weight).
- Period grade = activities % + exam %. Default 40/60; teacher-configurable per period of each course; must sum 100%. Locked periods: split cannot be changed.
- Final grade = P1·30% + P2·35% + P3·35%.
- Accumulated grade = sum of weighted grades of closed periods only, with % evaluated (30%, 65%, 100%). Intermediate: computed exact (phase 2).
- Every period always has one default activity (renamable; the last one cannot be deleted) and one built-in exam.
- Activities are created ad hoc, with a name, any time during the active period. Activities have only a name (no type field).
- → UI: computed cells read-only and visually distinct; split editor with sum = 100% validation, disabled on locked periods with reason; current split visible in the grade table; delete disabled on the last activity with reason.

### D4 · Rounding
- Half-up to one decimal (2,95 → 3,0; 2,94 → 2,9), applied ONLY to the final grade. Intermediates are computed exact.
- → UI: all values displayed with one decimal; pass/fail presentation for intermediate values follows the displayed rounded value; exact values remain available in a tooltip over computed cells (phase 4).

### D5 · Thresholds
- Passing grade 3,0.
- While a period is active, its period grade is "in progress": no failing/passing color (empty = 0,0 would flag everyone). Entered activity/exam grades below 3,0 are still flagged. Closed/intermediate displayed values at 3,0 or above are presented as passing. (Phase 4, C2.)
- → UI: grades below 3,0 flagged with color + icon + text; active period grade shown as "in progress" (neutral), explained in the legend.

### D6 · Period lifecycle and reminders
- Each period has start and end dates, entered at course creation. Start date is informative.
- States: upcoming → active → locked. Only the active period accepts grades.
- Locked when its end date passes; grades become read-only.
- Sequential: next period activates when the previous end date passes and its exam grades exist; missing grades count as 0,0 (D11), so in practice it activates at the end date.
- Reminders, in-app only:
  - Opening: "{course} · {period} is now open; upload grades until {end date}".
  - Closing: daily during the last 5 days (5, 4, 3, 2, 1): "{course} · {period} closes in {n} days ({end date})". No student counts.
- → UI: course creation asks 3 × start/end dates (end after start, periods in order); period status visible with dates; upcoming periods not editable and say which period must close first; locked periods show lock + reason; in-app reminder area.

### D7 · Editing
- Grades editable any number of times while the period is active. No history.
- Students: add one by one (same validation), edit (respecting uniqueness), remove.
- Remove: deletes all the student's grades, requires confirmation; allowed even with locked grades (exception to lock; confirmation must say locked grades are deleted too).
- Add after a period is locked: add-student form requires every activity grade and exam grade of each locked period; not saved until complete (exception to lock, scoped to that student).
- → UI: grade entry/edit in modal (phase 2, F4); add/edit student form; destructive confirmation; late-student form with locked-period grades.

### D8 · Volumes
- 30–35 students per course; up to 10 courses per teacher.
- Typically up to 5 activities per period, no hard limit.
- → UI: grade table ~35 rows × variable activity columns (design for 5, must not break beyond) + exam + computed columns. Sticky header and fixed student column (confirmed in phase 3, K4).

### D9 · Import / export
- Import students from CSV or Excel, during course creation (optional step) or later from the course student list (changed in phase 2, F2). Import is available only until Period 1 locks; afterwards students are added one by one with their locked-period grades (D7). CSV delimiter ";" or ",", auto-detected.
- Import duplicates (any unique field matches): row skipped, existing data kept, skipped rows reported.
- Import rows with missing required fields: skipped and reported in the preview with the missing field (phase 5). Rows with an invalid format (e.g. malformed email) are also skipped and reported (phase 5). Document ID and student code are alphanumeric (covers passports and foreign IDs); only non-empty and uniqueness are validated. Emails validated as email format (phase 5).
- Export grades as CSV (";" columns, comma decimals, values rounded to one decimal), full detail: student fields + each activity and exam + period grades (+ final).
- Export scope: one period, or all 3 with final. Only locked periods can be exported.
- Export student list (no grades) as CSV at any time.
- → UI: optional import step in course creation and import action on the course student list, both with preview (phase 2); import action disabled with reason once Period 1 locks; export actions enabled only when allowed, with reason when disabled.

### D10 · Connectivity
- Fully offline; data stored locally on the teacher's computer. No accounts, sync, or online features.
- No backup/restore for now (accepted risk).
- → UI: no login, network loading, or sync states.

### D11 · Missing values
- A student without a grade in an activity or exam counts as 0,0.
- A 0,0 recorded by skipping a student in the walk-through is marked pending (phase 2, F6).
- → UI: empty and pending cells must be clearly distinguishable from an entered 0,0 (success metric); explained in a legend.

### D12 · State dependencies
- Period N+1 depends on period N closing (D6).

## Success metrics

- Entering grades is faster than in Excel.
- Finding a student is easier than scanning rows in Excel.
- Editing a grade is easy and immediate.
- Missing grades are obvious at a glance.
- Grades can be entered one at a time without friction.

## Design implications

- Layout: desktop-first (laptop).
- Interfaces: single teacher app; no roles, no login.
- Usability principle: fewest clicks, least thinking. Grade entry via focused modal, one student at a time (changed in phase 2, F4); confirm only destructive actions.
- Quick entry: entering a single grade takes seconds, tolerant to interruptions (in-class grading).
- Search: find a student fast in every list and grade table (name, code, document).
- No formulas exposed: every computed value is automatic.
- Keyboard-first entry: Enter saves and advances, like moving down a spreadsheet column (changed in phase 2, F4).
- Language: Spanish only UI; DD/MM/YYYY; decimal comma.
- Density: compact (phase 3, K4). Reference 1920×1080 at 100% shows all 35 rows (24px, phase 4); smaller effective screens scroll, text never shrinks.
- Tone of voice (phase 3): friendly and warm; addresses the teacher as "tú" (e.g. "Guardaste la nota", "Te faltan 3 notas"). UI copy in Spanish.
