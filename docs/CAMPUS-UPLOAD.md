# Campus upload

Uploads each student's NOTAZOD **Nota del corte** to the open period column (`Nota 1`, `Nota 2` or `Nota 3`) of the Unimayor Campus grade form. Everything runs inside NOTAZOD: no external browser or tool is needed.

## Use

1. Open a course and click **Subir al Campus**, then **Verificar en el Campus**.
2. NOTAZOD opens the Campus in its own window. If there is no active session, log in there with your ID, password and access code. NOTAZOD never sees your credentials; it continues once the group list loads.
3. For every Campus group, NOTAZOD reads the grading form and verifies it:
   - every student code in the group must belong to exactly one NOTAZOD course (a course may be split across several Campus groups);
   - the number of students read must match the Campus list total;
   - the form must have exactly one open period column.
4. The preview shows, for the groups of the selected course, the current Campus value and the NOTAZOD value of each student.
5. **Guardar en el Campus** saves only when every group of that course verified. NOTAZOD fills the open column, saves each group (accepting only the Campus "¿Esta seguro?" confirmation), reopens it and confirms the stored values. It stops at the first group that does not confirm.

Grades use the formula NOTAZOD displays: activity average times the activity percentage plus the exam times the exam percentage; missing or pending grades count as 0,0. Values are written with one decimal and a comma (`4,7`). The database is only read.

## Check uploaded grades

**Verificar Campus** (home screen) answers "are all my grades in the Campus?" without writing anything. It reads every Campus grading form, matches each group to a NOTAZOD course by student code (no open column needed), and, for every period that has at least one grade in NOTAZOD, compares each student's Campus value with the NOTAZOD **Nota del corte**:

- **Subida**: same value with one decimal (`4,7` and `4,7`).
- **Falta**: the Campus cell is empty, or it is `0,0` while NOTAZOD has a grade.
- **Distinta**: the Campus has another value.

The result shows, per course, `Corte N: subidas/total` and the students that are missing or different. Groups that cannot be verified and Campus groups without a NOTAZOD course are listed separately.

## Sync courses

**Sincronizar cursos** (home screen) reads every group of the Campus **Información estudiantes** page in the same NOTAZOD window and maps NOMBRE, CÓDIGO, DOCUMENTO, CORREO 1 and CORREO 2 to the NOTAZOD student columns. Plan de estudios and estado financiero are not stored.

- A group whose students are mostly in one course of the current semester only adds the students that course is missing. Several Campus groups can complete the same course.
- A group with no matching course becomes a new course named after its first module (the group is appended if the name would repeat).
- Nothing is deleted or modified. Students that are in NOTAZOD but not in the Campus, rows with missing or invalid data, and groups split across courses are only reported.
- Periods already closed in the Campus (the grade columns before the open one) are imported only into NOTAZOD periods that have no grades yet: one activity **Nota del Campus** with each student's Campus value, the split set to Actividades 100% / Parcial 0%, and the period closed, so the period and accumulated grades match the Campus. A period that already has grades in NOTAZOD is never changed. Later periods are ignored.
- A preview comes first; **Crear y agregar** takes an internal backup and then creates the courses and students.

## How it works

- `app/src-tauri/src/lib.rs`: `campus_open` creates the `campus` window (navigation locked to `campus2.unimayor.edu.co`, no capability, so the page cannot call the app). `campus_eval` runs a synchronous script in that window and returns its JSON result, only while it shows the Campus host.
- `app/src-tauri/src/campus_init.js`: injected into every Campus page; answers dialogs only while an upload runs.
- `app/src/lib/campus.ts`: the upload, check and sync readers. `app/src/lib/campusGrades.ts` and `app/src/lib/campusSync.ts`: pure grade, verification and sync planning logic.

## Tests

```bash
cd app && npm test
```
