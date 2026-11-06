# Student list redesign (artboard 03 "Panel lateral y mapa de calor")
Implements `design/lista-estudiantes/03-panel-mapa-calor.html` (chosen artboard; 01 and 02 are alternatives) in the real stack (React + Mantine, `app/src/App.tsx`, `app/src/App.css`, tokens in `app/src/tokens.css` / `design/system.md`).
Branch `feature/student-list-redesign`. Built and tried in NOTAZOD Test only.

## Specs
- S1: User: "damme un diseno apra donde esnta al sita de lo studintes y algo de colores tambien". The course view follows artboard 03: a left sidebar with the courses of the current semester (student count each, active course highlighted), a course header (name, group/room/split subtitle), corte tabs (Corte N · Cerrado/Abierto) and a students table. Colors come only from the design tokens and work in dark and light themes.
- S2: Heat-map grade cells. A graded cell is tinted with `--color-grade-passing` when the value is >= 3,0 and `--color-grade-failing` when < 3,0; the tint grows with the distance from 3,0 (about 10% at 3,0 up to about 55% at 0,0 or 5,0). A pending grade is violet (`--color-grade-pending`) with a striped background and reads "Pend."; an empty cell is muted "—". The "Nota del corte" cell uses `--color-grade-computedSurface` with red/green text. A legend line under the table explains the scale.
- S3: User comment on the artboard: "perdmeos funcainladiades ?". No existing functionality is lost. Every current action stays reachable: create course, delete course, sync courses, verify Campus, open Campus, upload to Campus, export/restore backup, check for updates, theme toggle, search (name, code or email), percent split editor (with the exam column name), add activity, add student, rename/delete activity from its header, open student detail from the name, edit a grade from its cell, Calificar per activity, Calificar grupo, roulette, export image, export template, close/reopen corte, grade history and undo, student groups (create, rename, delete, copy from another corte, drag/move students, students without group), and the accumulated / final grade columns.
- S4: Sidebar filters with counts: "Todos", "En riesgo" (Nota del corte < 3,0), "Con pendientes" (any pending grade in the active corte) and "Sin subir al Campus". The last one uses the result of the most recent "Verificar Campus" run in this session for the active corte; before any run it shows no count and a hint to run Verificar Campus.
- S5: A "Campus" column shows per student, for the active corte, "✓ Subida" (green), "Falta" (red) or "Distinta" (warning) from the last Verificar Campus run; "—" when there is no result for that student and corte.
- S6: A "Notas / Grupos" switch next to the corte tabs: "Notas" shows the grade table; "Grupos" shows the existing student groups UI for the active corte.
- S7: The home screen (no course selected) keeps working: course list, Crear curso, Sincronizar cursos, Verificar Campus.

## Tasks
- T1 (S2, S4, S5) Pure helpers with tests: heat tint for a grade, student status (risk/pending/ok) and filter predicates, Campus state lookup from CheckGroup results. Route: worker. Commit: pending
- T2 (S1, S3, S6, S7) Restructure the course view and sidebar in App.tsx/App.css with Mantine components and tokens, keeping every action of S3. Route: worker. Commit: pending
- T3 (S4, S5) Wire the last Verificar Campus result into the filter and the Campus column. Route: worker. Commit: pending
- T4 Build and install NOTAZOD Test, report the design handoff. Route: inline. Commit: n/a

## Log
- L1: "puede con gente sheel damme un diseno apra donde esnta al sita de lo studintes y algo de colores tambien"
- L2: Design `design/lista-estudiantes/` with artboards 01-planilla-color, 02-semaforo-filas, 03-panel-mapa-calor. Canvas comment 84sfnnpc on 03: "perdmeos funcainladiades ?"; 03 was updated to show every existing action and resolved.
- L3: User handed off 03 to implement ("Implement the design artboard design/lista-estudiantes/03-panel-mapa-calor.html"). 03 is the chosen artboard; 01 and 02 are alternatives.
- L4: Prior uncommitted work (Verificar Campus + exam column label) committed apart as 7a63ec5 on this branch before the redesign.
