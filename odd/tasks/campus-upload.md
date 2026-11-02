# Upload NOTAZOD period grades to Unimayor Campus
Browser automation (ego-browser) that uploads each student's NOTAZOD "Nota del corte" to the open period column of the Unimayor Campus grade form.
Branch `feature/campus-upload`. Tool lives in `tools/campus-upload/`.

## Specs
- S1: The human logs in; the tool never handles credentials. User: "que yo ingres la coantrasena y de ahi to hagas el proceso de verificar y su ir".
- S2: Verification by course and student code. User: "la verificaicon la hacemos por curso y por codigo de estudiantes para darle la nota". A Campus group is verified only when every student code in that group exists in one and the same NOTAZOD course.
- S3: The grade sent for each student is the NOTAZOD "Nota del corte" (activity average x activity% + exam x exam%, missing or pending grades count 0,0) for the period whose Campus column (`Nota 1`/`Nota 2`/`Nota 3`) is editable, written with one decimal and a comma (e.g. `4,7`).
- S5: User: "probemos co nel de fundamentos dep rogramacion pero que la preuba sea desde el boton". A "Subir al Campus" button inside NOTAZOD runs the upload for the selected course only: it first shows the verification preview in the app, and saves only after the user confirms there. Only the Campus groups of that course are saved, and S2/S4 apply to them.
- S4: User: "cunado este tood se guarda". Grades are saved only when every matched group is verified; if any group fails verification nothing is saved and the failures are reported. After saving, the tool reads the form back and confirms the stored values.

## Tasks
- T1 (S3) Read NOTAZOD grades read-only and compute period grades, with tests. Route: inline. Commit: 18b7842
- T2 (S1, S2) Read Campus groups after human login, verify by course and code, print a dry-run report. Route: inline. Commit: 1e6dcb5
- T3 (S4) Fill the open column, save only when everything is verified, read back and confirm. Route: inline. Commit: 1e6dcb5 (save path written; not yet run against the Campus)
- T4 Document usage in `tools/campus-upload/README.md`. Route: inline. Commit: 1e6dcb5, fix in next commit

- T5 (S5) Course-scoped upload in the tool (`courseId`), with tests. Route: inline. Commit: pending
- T6 (S5) Tauri command that runs the embedded tool through ego-browser and returns the report. Route: inline. Commit: pending
- T7 (S5) "Subir al Campus" button, preview and confirm in App.tsx; first real save with Fundamentos de programacion. Route: inline. Commit: pending

## Log
- L1: "si la diea es subir al campus y que yo ingres la coantrasena y de ahi to hagas el proceso de verificar y su ir la verificaicon la hacemos por curso y por codigo de estudiantes para darle la nota cunado este tood se guarda"
- L2: Evidence: Campus names differ from NOTAZOD ("POO" vs "PROGRAMACIÓN ORIENTADA A OBJETOS I"); "Fundamentos de programacion" (13 students) maps to two Campus groups of 6, so matching is by student code, one NOTAZOD course can map to several Campus groups.
- L3: Evidence: form `wfCalificar.aspx`, inputs `...$nota_examen_{1,2,3}` (maxlength 3, comma decimals), only the open period is editable, `#ContentPlaceHolder1_btnGuardarNotas` is a plain submit with no confirmation dialog. Login has a 9-digit access code (2FA).
- L4: Decision: the Campus is production (no test Campus), so the tool runs as a dry run by default and saves only with an explicit `--save`. NOTAZOD database path is explicit and opened read-only.
- L5: Evidence: first dry run read only 6/27, 7/22, 15/18, 2/6 students because the table was read while the page was still streaming. Fixed by waiting for document completion and failing any group whose read count differs from the Campus list total. Second dry run against notazod-test.db: 27, 22, 18, 6, 6 students, all 5 groups verified, database hash unchanged.
- L6: Evidence: corte 1 computed from NOTAZOD (4,9 / 5,0 / 4,8 for 220126027, 220126014, 220126021) equals the values already stored in the Campus. notazod-test.db is a 2026-10-05 copy without corte 2 grades.
- L7: Slice boundary: commits 18b7842 + 1e6dcb5 reached ~400 lines; the remaining work (first real --save) is a separate step that needs the user's decision on the source database.
- L8: Evidence: independent verify (Risk item 1) passed S1 and S3 and failed S2/S4 on one blocker: a Campus group whose codes all appear in more than one NOTAZOD course (e.g. same cohort in POO I and POO II) was verified against the first course by name. Fixed: such groups fail as ambiguous (regression test added, 13/13 pass). Advisory applied: the report is written and saved groups listed when a --save run stops midway. Dry run re-run: 5/5 groups verified, DB hash unchanged.
- L9: "probemos co nel de fundamentos dep rogramacion pero que la preuba sea desde el boton"
- L10: Slice boundary: commits 5bdb97b (staging dev command) and 5bc7279 (delete activities, image export) are earlier unrelated work committed apart; the button is a new slice.
