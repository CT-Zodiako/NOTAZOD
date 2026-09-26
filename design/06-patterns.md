# 5. Patterns

## Forms and inputs

- Layout: single column, label above each field.
- Validation timing (A1): on blur for format and uniqueness within the course (e.g. "Ya hay un estudiante con ese código en este curso"); on save for required fields, focusing the first invalid one; error clears as soon as the value is valid.
- Error message format: "{What is wrong}. {How to fix}." in "tú" (e.g. "El correo no es válido. Revisa que tenga @").
- Save model (A2): grades save on each Enter/Next/Previous; forms save with their button. Closing a form with unsaved changes (Esc, X, Back to Home) asks "Tienes cambios sin guardar. ¿Descartarlos?" — only when something actually changed (discarding is destructive, consistent with D-implications).
- Submit button: disabled only while submitting (show loading), not for invalid forms.
- On submit error: focus first invalid field, show summary if > 3 errors.

## Feedback

| Situation | Pattern | Duration |
| --- | --- | --- |
| Action succeeded | toast (not per grade Enter in walk-through) | auto-dismiss 3s (C4) |
| Blocking error | inline alert | persistent |
| Destructive action | confirm dialog | until answered |
| Loading < 1s | none | |
| Loading > 1s | skeleton or spinner | |

## Import preview

- Three groups: rows to import · duplicates skipped (with the matching field) · invalid rows skipped (with the missing or malformed field).
- Skipped rows are listed so the teacher can add them by hand later.

## Empty, loading, error states

Every list/data screen defines an empty state with the next action (A4). Local offline app: no loading or network error states (data reads are instant).

| Situation | Message | Action |
| --- | --- | --- |
| Home, no courses | "Aún no tienes cursos. Crea el primero para empezar a calificar." | "Crear curso" |
| Course, no students | "Este curso no tiene estudiantes todavía." | "Agregar estudiante", "Importar" (only before Period 1 locks) |
| Search/filter, no results | "No hay estudiantes que coincidan." | "Limpiar búsqueda" |
| "Pending" filter, no results | "¡Todo al día! No hay notas pendientes en este corte." | — |
| Upcoming period tab | "Este corte abre el {fecha}. Primero debe cerrar el Corte {n}." | — |

## Layout

- Course student list: full width (table needs ~9 columns).
- Home: max content width 960px, centered.
- Modals: 480px wide; WalkthroughModal 560px.
- Page spacing: 24px (`primitive.space.6`).
- Desktop-first; below the reference viewport the table scrolls with sticky header and fixed name column (K4).

## Content and voice

- Tone: friendly and warm, "tú" (K9). UI copy in Spanish.
- Casing: sentence case for labels and buttons.
- Buttons use verbs: "Save changes", not "OK".

## Print and export

- No print layouts (A6). Output is CSV export only (D9).

## Accessibility

- Target: WCAG 2.2 AA (confirmed, A5).
- Never color alone: every status pairs color with icon or text; all color/status encodings and shortcuts explained in visible legends.
- Click targets >= 24px (rows 24px).
- Text contrast >= 4.5:1; UI/borders >= 3:1.
- Every action reachable by keyboard; logical tab order. Actions unavailable for a stated reason remain focusable with `aria-disabled` so the reason can be discovered.
- Focus visible at all times.
- Respect reduced-motion preference.
