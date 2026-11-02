# Upload NOTAZOD period grades to Unimayor Campus
Browser automation (ego-browser) that uploads each student's NOTAZOD "Nota del corte" to the open period column of the Unimayor Campus grade form.
Branch `feature/campus-upload`. Tool lives in `tools/campus-upload/`.

## Specs
- S1: The human logs in; the tool never handles credentials. User: "que yo ingres la coantrasena y de ahi to hagas el proceso de verificar y su ir".
- S2: Verification by course and student code. User: "la verificaicon la hacemos por curso y por codigo de estudiantes para darle la nota". A Campus group is verified only when every student code in that group exists in one and the same NOTAZOD course.
- S3: The grade sent for each student is the NOTAZOD "Nota del corte" (activity average x activity% + exam x exam%, missing or pending grades count 0,0) for the period whose Campus column (`Nota 1`/`Nota 2`/`Nota 3`) is editable, written with one decimal and a comma (e.g. `4,7`).
- S4: User: "cunado este tood se guarda". Grades are saved only when every matched group is verified; if any group fails verification nothing is saved and the failures are reported. After saving, the tool reads the form back and confirms the stored values.

## Tasks
- T1 (S3) Read NOTAZOD grades read-only and compute period grades, with tests. Route: inline. Commit: pending
- T2 (S1, S2) Read Campus groups after human login, verify by course and code, print a dry-run report. Route: inline. Commit: pending
- T3 (S4) Fill the open column, save only when everything is verified, read back and confirm. Route: inline. Commit: pending
- T4 Document usage in `tools/campus-upload/README.md`. Route: inline. Commit: pending

## Log
- L1: "si la diea es subir al campus y que yo ingres la coantrasena y de ahi to hagas el proceso de verificar y su ir la verificaicon la hacemos por curso y por codigo de estudiantes para darle la nota cunado este tood se guarda"
- L2: Evidence: Campus names differ from NOTAZOD ("POO" vs "PROGRAMACIÓN ORIENTADA A OBJETOS I"); "Fundamentos de programacion" (13 students) maps to two Campus groups of 6, so matching is by student code, one NOTAZOD course can map to several Campus groups.
- L3: Evidence: form `wfCalificar.aspx`, inputs `...$nota_examen_{1,2,3}` (maxlength 3, comma decimals), only the open period is editable, `#ContentPlaceHolder1_btnGuardarNotas` is a plain submit with no confirmation dialog. Login has a 9-digit access code (2FA).
- L4: Decision: the Campus is production (no test Campus), so the tool runs as a dry run by default and saves only with an explicit `--save`. NOTAZOD database path is explicit and opened read-only.
