# 4. Components

## Inventory

| Component | Category | Used in screens | Status |
| --- | --- | --- | --- |
| Button (primary, secondary, danger, ghost) | action | all | approved |
| IconButton (theme toggle, close) | action | all | approved |
| TextInput | form | student form, create activity, course wizard | approved |
| GradeInput (0–5, one decimal, accepts . or ,) | form | walk-through, student modal, late-student form | approved |
| Select (year, term) | form | course wizard | approved |
| DateInput (DD/MM/YYYY) | form | course wizard | approved |
| FileUpload (CSV/Excel) | form | course wizard, import | approved |
| SplitInput (two %, auto-complete to 100) | form | split editor, course wizard | approved |
| GradeTable (sticky header + name column, status cells) | data display | course student list | approved |
| CourseCard | data display | home | approved |
| SearchBox (live filter) | form | course student list | approved |
| StatusBadge (pending, locked, failing) | feedback | table, tabs, home | approved |
| ReminderStrip | feedback | home | approved |
| Legend | feedback | course student list | approved |
| InlineMessage (error, disabled reason) | feedback | forms, disabled actions | approved |
| Toast (short confirmation, e.g. "Estudiante agregado") | feedback | all save actions | approved |
| PeriodTabs | navigation | course student list | approved |
| WizardSteps | navigation | course wizard | approved |
| AppHeader | navigation | all | approved |
| Modal | overlay | all modals | approved |
| WalkthroughModal (Previous/Next, Enter) | overlay | grading | approved |
| ConfirmDialog | overlay | remove student | approved |
| Tooltip (exact value of computed cells) | overlay | course student list | approved |
| KeymapHint (footer strip) + ShortcutsPopover | feedback | walk-through, course student list | approved |

## AppHeader decisions

- Single thin row. Left: "NOTAZOD" + breadcrumb (e.g. "Inicio › Cálculo I · 2026-2"; "Inicio" links Home). Right: color mode IconButton (sun/moon).

## GradeTable decisions

- Always sorted alphabetically by full name (surnames first); no column sorting.
- Quick filters in the toolbar: "Pending" and "Below 3,0". Both apply to the open period tab: "Below 3,0" uses the displayed rounded period grade; "Pending" = any pending grade in that period. Filters combine with search. On the active period tab, "Below 3,0" is disabled with reason ("Available when the period closes"), because the active period grade is "in progress" (D5).
- Legend entries: failing, pending, passing, computed, in progress, locked, empty.
- Live search filters rows; no pagination (≤35 rows); sticky header + fixed name column.
- No inline editing: row click opens the student modal.
- Rows 24px (min click target).
- Computed cells show one decimal; hovering shows a Tooltip with the exact value (e.g. "Exacto: 3,4667").

## GradeInput decisions

- Accepts 0,0–5,0 with at most one decimal; "." or "," as separator, displayed with comma.
- Invalid value (out of range, more than one decimal, non-numeric) + Enter/Next/Previous: does not save, does not advance; field shows error state with the reason (e.g. "La nota va de 0,0 a 5,0"). Typing is not blocked.
- Empty + Enter/Next/Previous: records pending 0,0 (03-flows).

## WalkthroughModal keymap

| Key | Action |
| --- | --- |
| Enter | Save and go to next student |
| Shift + Enter | Save and go to previous student |
| Esc | Close modal (entered grades already saved) |
| Tab | Move through modal buttons (Previous, Next, Close) |

- Previous/Next buttons show their shortcut.
- A visible keymap legend is required (user request, C3):
  - WalkthroughModal: fixed, small footer strip, always visible ("Enter siguiente · Shift+Enter anterior · Esc cerrar").
  - Course student list: "Atajos" button in the toolbar next to the legend; opens the full shortcut list.

Categories: action · form · feedback · navigation · layout · data display · overlay

---

## Component spec template (copy per component)

### {Component}

Purpose: one line.
When NOT to use:

Anatomy:
- {part} — token: {component.x.y}

Variants: {e.g. primary | secondary | ghost | danger}
Sizes: {sm | md | lg} — min touch target 44x44px

States (all required for interactive components):

| State | Visual change | Tokens |
| --- | --- | --- |
| default | | |
| hover | | |
| focus-visible | visible ring, never removed | |
| active/pressed | | |
| disabled | `aria-disabled`, remains focusable when a reason is discoverable; no activation | |
| loading | | |
| error | | |

Behavior: keyboard, click/tap, async.
Accessibility: role, label source, announced state.
Content rules: label length, casing, icon usage.

---

## Required spec: TextInput (baseline for all form fields)

Anatomy: label (always visible, never placeholder-only) · required/optional marker · field · helper text · error message · optional prefix/suffix icon. Disabled actions keep keyboard focus with `aria-disabled` when a reason must be discoverable; use native `disabled` only when no explanation is needed.

States: default · hover · focus-visible · filled · disabled · read-only · error · success(optional).

Rules:
- Label above the field; error below replaces helper text.
- Error = color + icon + text (never color alone).
- Placeholder only shows an example format, never instructions.
- Mark the minority: if most fields are required, mark "optional" ones.

---

## Component specs

Proposed details confirmed by the user in phase 4 (C4).
All interactive components: focus-visible ring (`semantic.color.border.focus`), never removed; disabled actions with a user-facing reason remain focusable via `aria-disabled`, do not activate, and expose the reason via InlineMessage or Tooltip.

### Button
Purpose: trigger an action.
Variants: primary (wine, one per view) · secondary (outline) · danger (remove only) · ghost (low emphasis, e.g. "Atajos").
Size: height 32px, radius `radius.sm` (6px), label + optional 16px icon.
States: default · hover (`action.primaryHover`) · focus-visible · pressed · disabled (with reason) · loading (not expected: local app).
Content: verb first, sentence case, Spanish, "tú" ("Calificar", "Agregar estudiante", "Exportar").

### IconButton
Purpose: compact action (theme toggle, close). 32×32px, icon 20px. Always has an accessible label ("Cambiar a modo oscuro", "Cerrar").

### TextInput
See baseline spec below. Uniqueness errors inline per field (student form, course name + semester).

### GradeInput
Extends TextInput. Large, centered value in WalkthroughModal (font.size.2xl); standard size in student modal and late-student form.
States: empty · filled · pending (violet + clock + "pendiente") · error (coral + icon + reason) · read-only (locked periods, lock icon).
Behavior: see "GradeInput decisions" and keymap. Accepts "." or ","; normalizes to comma on save.

### Select
Year and term (1, 2) in the course wizard. Keyboard: arrows + type-ahead.

### DateInput
DD/MM/YYYY. Typed or picked. Errors: end before start; periods out of order (message names the conflicting period).

### FileUpload
Accepts CSV or Excel. Drop zone + "Elegir archivo" button. After selection, goes to import preview (rows to import, duplicates skipped with reason). Wrong type → InlineMessage.

### SplitInput
Two percentage fields (Actividades, Parcial). Editing one auto-completes the other to 100. Integers 0–100. Read-only with lock + reason on locked periods.

### GradeTable
See "GradeTable decisions". Cell types:
| Cell | Look |
| --- | --- |
| Entered grade | plain text; coral + alert icon if < 3,0 |
| Pending | violet + clock icon |
| Empty | neutral dash "—" |
| Computed (activities avg, period, accumulated, final) | soft gold background, not editable, tooltip with exact value |
| Period grade, active period | "in progress" neutral, no pass/fail color |
| Locked period values | lock icon in tab/header, read-only |
Row: hover highlight, whole row clickable (opens student modal), 24px.
Activity headers on the active period are buttons: click opens the activity modal (rename; delete disabled with reason on the last one), per D3. Split headers ("Actividades 40%", "Parcial 60%") open the split editor; locked periods show lock + reason.

### CourseCard
Home list item: course name · semester · active period + status + days left (e.g. "Corte 1 · activo · cierra en 3 días"). Whole card clickable.

### SearchBox
Live filter by surname, name, code, document; accent-insensitive. Placeholder "Nombre, código o documento" (shortened in IMPLEMENT so the toolbar fits one line at the reference viewport). No visible label: see Open TBDs. Clear button when filled. Empty result → "No hay estudiantes que coincidan".

### StatusBadge
Icon + short text + color: pending, locked, failing, in progress. Never color alone.

### ReminderStrip
Home top. One line per active reminder; not dismissible; no modal. Order: closest deadline first. Empty → strip hidden.

### Legend
Toolbar item on the course student list; lists every status: failing, pending, passing, computed, in progress, locked, empty. Opens as a small popover (not always expanded, to save toolbar space).

### InlineMessage
Error or disabled-reason text next to the element. Error = coral + icon + text.

### Toast
Non-blocking confirmation after save actions ("Estudiante agregado"). Bottom-right, auto-dismiss 3s, never steals focus. Not used for grade Enter in the walk-through (would be noise every few seconds).

### PeriodTabs
Corte 1 / 2 / 3, each with StatusBadge (upcoming, active, locked) and dates. Opens on the active period. Keyboard: arrows move between tabs.

### WizardSteps
Three steps (Datos, Cortes, Estudiantes) with current step highlighted; Back keeps data; step 3 has "Omitir" (skip) and "Crear curso".

### AppHeader
See "AppHeader decisions".

### Modal
Title · content · actions (primary right). Esc closes. Focus trapped inside; focus returns to the trigger on close. Radius `radius.md`.

### WalkthroughModal
Extends Modal. Shows activity/exam name, position ("12 de 35"), student full name and code prominent, GradeInput, Previous/Next buttons with shortcut labels, KeymapHint footer. Motion: subtle transition between students; never blocks typing.

### ConfirmDialog
Destructive confirmation only (remove student). Title states the action; body states consequences ("Se borrarán todas sus notas, incluidas las de cortes cerrados"); buttons: "Cancelar" (default focus) and danger "Sacar del curso".

### Tooltip
Exact value of computed cells on hover. Delay 300ms.

### KeymapHint + ShortcutsPopover
Footer strip in WalkthroughModal; "Atajos" ghost button in course toolbar opens the full list.
