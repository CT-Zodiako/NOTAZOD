# Home screen: weekly agenda (artboard 03 "Agenda de la semana")
Implements `design/inicio-cursos/03-agenda-semana.html` (chosen; 01 and 02 are alternatives) on the NOTAZOD home screen (no course selected), sized for a half-screen window (~820px) now that the Campus opens side by side.
Branch `feature/home-agenda` (on top of `feature/campus-split-window`). Built and tried in NOTAZOD Test only.

## Specs
- S1: User: "mejor si me gusta ahora dame un diseno de esto" (screenshot of the home screen with overlapping header buttons, semester badge cut to "20…" and course names broken letter by letter). The home header shows only the logo, the theme switch and a "⋯" menu holding Abrir Campus, Verificar Campus, Exportar copia de seguridad, Restaurar copia de seguridad, Buscar actualizaciones and Ver proyecto en GitHub (each with its outline icon). "Sincronizar cursos" and "Crear curso" sit next to the page title. Nothing overlaps or truncates at ~820px wide.
- S2: Title "Hoy, <weekday>" (e.g. "Hoy, lunes") from the local date.
- S3: A "Próxima clase" banner in the course color: the next class from now (today later than now, else the next day that has one), showing "Próxima clase · HH:MM" (prefixed with the weekday when it is not today, e.g. "Próxima clase · jueves 15:00"), the course name, "<group> · <room> · <N> estudiantes", and an "Abrir curso" button that opens that course. When no course has a parsable schedule, the banner says that the schedule comes from Sincronizar cursos.
- S4: A Mon–Fri timetable (5 columns; add Sáb only when some class falls on Saturday) built from each course's Campus groups' `schedule` strings, format "LUN 13:00-15:00; MIE 15:30-18:00" (day tokens LUN MAR MIE JUE VIE SAB DOM, accents allowed, case-insensitive; unparsable segments are ignored, never crash). Each slot shows the course (short name with ellipsis, full name as tooltip), "HH:MM–HH:MM" and the room, in the course color, sorted by start time; clicking it opens the course. Today's column header is highlighted. Two groups of the same course with the same day/time/room appear once.
- S5: Below, "Todos los cursos · <semester>": a compact 2-column list of the current-semester courses (color dot, name with ellipsis + tooltip, student count); clicking opens the course. Courses of other semesters stay reachable (e.g. a "Otros semestres" group below).
- S6: No existing home action is lost: create course, sync courses, verify Campus, open Campus, export/restore backup, check for updates, GitHub, theme toggle, open any course, the update/backup/restore messages and the empty state when there are no courses.
- S7: Colors only from tokens (course colors via the existing course palette); dark and light themes.

## Tasks
- T1 (S2, S3, S4) Pure schedule helpers with tests: parse schedule strings, build the week (dedupe, sort, Saturday rule), find the next class from a given date/time, weekday names. Route: worker. Commit: b4bd48c
- T2 (S1, S3-S7) Home screen layout in App.tsx/App.css with Mantine and tokens. Route: worker. Commit: b4bd48c
- T3 Build/install NOTAZOD Test, report handoff. Route: inline. Commit: n/a

## Log
- L1: "mejor si me gusta ahora dame un diseno de esto" (home screen screenshot).
- L2: Design `design/inicio-cursos/` with 01-lista-compacta, 02-tarjetas, 03-agenda-semana; user handed off 03 ("Implement the design artboard design/inicio-cursos/03-agenda-semana.html"). 01 and 02 are alternatives.
- L3: Evidence: campus_course_groups.schedule values in notazod-test.db: "LUN 16:00-18:00", "MAR 13:00-17:30", "LUN 13:00-15:00; MIE 15:30-18:00", "JUE 15:00-18:00; VIE 14:00-17:00".
- L4: Evidence: worker RED (stub module: 1 pass / 9 fail) then GREEN 10/10; suite 110/110; tsc clean; build:staging ok; parent re-ran tsc and tests (110/110). Judgment calls: Dom column added when a class falls on Sunday; a class in progress is not "next"; merged duplicate groups show the first group name; other semesters only in "Otros semestres"; new explicit empty state. Committed b4bd48c. Slice boundary: 6bcf61d (design+spec) + b4bd48c (~740 lines incl. three artboards).

