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

## How it works

- `app/src-tauri/src/lib.rs`: `campus_open` creates the `campus` window (navigation locked to `campus2.unimayor.edu.co`, no capability, so the page cannot call the app). `campus_eval` runs a synchronous script in that window and returns its JSON result, only while it shows the Campus host.
- `app/src-tauri/src/campus_init.js`: injected into every Campus page; answers dialogs only while an upload runs.
- `app/src/lib/campus.ts`: the upload flow. `app/src/lib/campusGrades.ts`: pure grade and verification logic.

## Tests

```bash
cd app && npm test
```
