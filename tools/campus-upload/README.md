# Campus upload

Uploads each student's NOTAZOD **Nota del corte** to the open period column (`Nota 1`, `Nota 2` or `Nota 3`) of the Unimayor Campus grade form, using an ego-browser window.

## Requirements

- ego-browser (Ego Lite) installed, with `ego-browser nodejs` on the `PATH`.
- Node.js 22.5 or newer on the `PATH` (`node:sqlite`).

## From NOTAZOD

Open a course and click **Subir al Campus**. NOTAZOD runs this tool for that course only (the script is embedded in the app through the `campus_upload` Tauri command): it first shows the verification preview, and saves only when you click **Guardar en el Campus**. Only the Campus groups of that course are checked and saved.

## Usage

```bash
# Dry run: reads and verifies everything, saves nothing.
tools/campus-upload/run.sh "<path-to-notazod.db>"

# Save: only when every matched group passes verification.
tools/campus-upload/run.sh "<path-to-notazod.db>" --save
```

1. The script opens the Campus in the browser. If there is no active session, it hands the browser to you: log in with your ID, password and access code, then give control back to the agent. The script never sees your credentials.
2. For every group in **Calificaciones > Notas**, it reads the grading form and verifies it:
   - every student code in the Campus group must belong to one and the same NOTAZOD course (a NOTAZOD course may be split across several Campus groups);
   - the number of students read must match the Campus list total;
   - the form must have exactly one open period column.
   A group with no student code in NOTAZOD is skipped.
3. It prints, per group, the current Campus value and the NOTAZOD value for each student, and writes a JSON report to `$TMPDIR`.
4. With `--save`, if every matched group is verified, it fills the open column, saves each group, then reopens it and confirms the stored values. If any group fails verification, nothing is saved.

The NOTAZOD database is opened read-only. Grades use the same formula NOTAZOD displays: the activity average times the activity percentage, plus the exam times the exam percentage. Missing or pending grades count as 0,0. Values are written with one decimal and a comma (`4,7`).

## Tests

```bash
node --test tools/campus-upload/*.test.mjs
```
