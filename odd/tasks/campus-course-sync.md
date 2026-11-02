# Sync courses from the Unimayor Campus
A "Sincronizar cursos" button on the home screen reads every group in the Campus "Información estudiantes" page and creates or completes NOTAZOD courses with the current student columns.
Branch `feature/campus-course-sync` (based on `feature/open-campus-button`).

## Specs
- S1: User: "quiero un boton que este al incio que diga sincrocnizar cursos lo cual va a ir al capus y trae toda la finrmacion de los curso para crearlos como estac actualente resptando las coloumans que tengo acutalente". Campus columns map to NOTAZOD: NOMBRE → Nombre completo, CÓDIGO → Código, DOCUMENTO → Documento, CORREO 1 → Correo institucional, CORREO 2 → Correo personal. Plan de estudios and Estado financiero are not stored.
- S2: User chose "Solo agregar lo que falta": a Campus group whose students are already in a NOTAZOD course of the current semester (matched by code) only adds the missing students; nothing is deleted or modified. Groups without a match become new courses (module name, current semester). Students in NOTAZOD but not in the Campus are only reported.
- S3: A preview is shown first; nothing is created until the user confirms.
- S4: User: "en el caso de hacer un sicnrocnizacion y digmaos yo lo hagoen el corte 1 como lo hacemosp ara ir tomadno las notas de los pasado ejemplo estmaos enel 2 el uno esta cerrado pero ya esta subida en el campus cuando sicnroncizamoc que hacemos"; chose "Actividad Nota del Campus al 100%". Past periods are the Campus grade columns before the open one. For each past period with no grades in NOTAZOD: one activity "Nota del Campus" with the Campus value per student, split Actividades 100% / Parcial 0%, period closed. A period that already has grades in NOTAZOD is never touched (only reported). Future periods are ignored.

## Tasks
- T1 (S1, S2) Pure sync planner with tests. Route: inline. Commit: d453d92
- T2 (S1) Read "Información estudiantes" groups and students in the NOTAZOD Campus window. Route: inline. Commit: next commit (live read pending the user's test)
- T3 (S2, S3) Home button, preview, apply with a safety backup. Route: inline. Commit: next commit (live test pending)
- T4 (S4) Import past Campus period grades during sync, with tests (36/36). Route: inline. Commit: next commit (live test pending)

## Log
- L1: "quiero un boton que este al incio que diga sincrocnizar cursos lo cual va a ir al capus y trae toda la finrmacion de los curso para crearlos como estac actualente resptando las coloumans que tengo acutalente"
- L2: "en esta seccion [Informacion estudiantes], puedes extraer exporta l ifnroacmio del cruso" (screenshots: group list with "Consultar Estudiantes"; student table PLAN ESTUDIOS, DOCUMENTO, CÓDIGO, NOMBRE, CORREO 1, CORREO 2, ESTADO FINANCIERO).
- L3: Decision: user chose "Solo agregar lo que falta". Read the table in the DOM instead of the Exportar download.
- L4: Decision: a course matches a Campus group only when it holds strictly more of the group's codes than any other course and at least half of them; otherwise the group is a conflict. This keeps one shared student from pulling a whole group into the wrong course. Only courses of the current semester are matched.
- L5: "hay algo importnate en el caso de hacer un sicnrocnizacion y digmaos yo lo hagoen el corte 1 como lo hacemosp ara ir tomadno las notas de los pasado ejemplo estmaos enel 2 el uno esta cerrado pero ya esta subida en el campus cuando sicnroncizamoc que hacemos". Decision: activity "Nota del Campus" at 100%, close the period; never overwrite a period that already has grades.
- L6: User reported "database is locked" (code 5) after deleting the course "APP 2" and running the sync. Evidence: only the staging app had the file open (8 pooled connections); journal_mode was "delete" because the VACUUM INTO copies made today (test refresh and the production unification) drop WAL; notazod-dev.db had been WAL. Three internal backups were taken but no course was created, so nothing was applied. Likely trigger: deleteCourse runs BEGIN/COMMIT as separate calls on the plugin's connection pool, which can leave one connection inside an open transaction; in rollback-journal mode its read lock blocks every writer. Fix: initDatabase sets PRAGMA journal_mode = WAL on every start; after restart the test DB reports wal. Production notazod.db is also in "delete" mode until it runs this code. Follow-up: make multi-statement transactions safe on the pool.
