# Design Spec — NOTAZOD

Single source of truth for UI. Technology-agnostic.

## Status

| Phase | File | Status |
| --- | --- | --- |
| 1. Product | 01-product.md | approved |
| 2. Technology | 02-technology.md | approved |
| 3. Flows | 03-flows.md | approved |
| 4. Tokens | 04-tokens.json | approved |
| 5. Components | 05-components.md | approved |
| 6. Patterns | 06-patterns.md | approved |
| 7. Implementation | 07-implementation.md | approved |

Status values: `pending` · `draft` · `approved`

## Decision log

| Id | Question | Answer | Phase file |
| --- | --- | --- | --- |
| P1 | Who uses the system? | Teacher only | 01-product.md |
| T1 | Product shape | Installable offline desktop grade-management application; browser prototype retained | 02-technology.md |
| T2 | Candidate runtimes | PWA, Electron, and Tauri compared; Tauri provisionally recommended | 02-technology.md |
| T3 | UI framework | React + TypeScript | 02-technology.md |
| T4 | Component library | Mantine selected; project tokens remain the source of visual identity | 02-technology.md |
| T5 | Runtime capability | Team accepts learning and maintaining Rust/Tauri | 02-technology.md |
| T6 | Durable storage | SQLite embedded in the Tauri application | 02-technology.md |
| M1 | MVP vertical slice | Courses and students: manual form + CSV import; binary Excel deferred | 02-technology.md |
| M2 | Student source file | Support CSV and HTML-table `.xls`; import Nombre, Documento, Código, Correo 1, Correo 2; ignore Plan de estudios and Estado financiero | 03-flows.md |
| D2 | Grade scale | 0.0–5.0, one decimal | 01-product.md |
| D5 | Passing grade | 3.0 | 01-product.md |
| D4 | Rounding method | Half-up to one decimal | 01-product.md |
| D3 | Grading periods and weights | 3 periods: 30% / 35% / 35% | 01-product.md |
| D3 | Period grade composition | Activities 40% + exam 60% by default; teacher can change the split (70/30, 50/50...) | 01-product.md |
| D3 | Split configuration scope | Per period of each course | 01-product.md |
| D1 | Activities per period | Variable count, typed (assignment, presentation, quiz...); exam is a single grade | 01-product.md |
| D3 | Activities combination | Simple average, equal weight | 01-product.md |
| D4 | Rounding step | Final grade only; intermediates computed exact | 01-product.md |
| D6 | Period lifecycle | Start/end dates per period, set at course creation; grades editable until end date | 01-product.md |
| D6 | After period end date | Locked, grades read-only | 01-product.md |
| D6 | Reminders | Alert when upload window opens and when it is about to close | 01-product.md |
| D6 | Upload window | Grades can be entered any time until the period end date; start date is informative | 01-product.md |
| D6 | Period sequence | Period 2 activates after period 1 closes; period 3 after period 2 | 01-product.md |
| D6 | Activation condition | End date passed AND all grades of previous period entered | 01-product.md |
| D1 | Activity creation | Teacher creates named activities ad hoc during the active period | 01-product.md |
| D3 | Exam | Mandatory per period | 01-product.md |
| D1 | Period structure | Always activities (1..n) + exactly one exam; exam exists by default | 01-product.md |
| D11 | Zero activities | Never happens: every period always has at least one activity | 01-product.md |
| D6 | Closing reminder cadence | Escalating, several reminders before end date | 01-product.md |
| D6 | First closing reminder | 5 days before end date | 01-product.md |
| D6 | Closing reminder schedule | Daily for the last 5 days (5, 4, 3, 2, 1) | 01-product.md |
| D6 | Reminder channel | In-app only | 01-product.md |
| D6 | Closing reminder content | Course, period, days left, end date; no student counts | 01-product.md |
| D6 | Opening reminder content | Course, period, now open, upload deadline | 01-product.md |
| D7 | Editing and history | Editable while period active; no history | 01-product.md |
| D8 | Volumes | 30–35 students per course; max 10 courses per teacher | 01-product.md |
| D8 | Activities per period | Typically up to 5; no hard limit | 01-product.md |
| D9 | Import/export | Import student list; export grades | 01-product.md |
| D2 | Required student fields | All 5 required | 01-product.md |
| D1 | Student list scope | Each course has its own independent list | 01-product.md |
| D2 | Unique student fields | Code, document ID, institutional email, personal email | 01-product.md |
| D2 | Uniqueness scope | Within each course only; no cross-course matching | 01-product.md |
| D9 | Duplicates on import | Skipped and reported; only new students imported | 01-product.md |
| D9 | Partial match on import | Skipped; existing data kept | 01-product.md |
| D7 | Student list editing | Editable manually after import | 01-product.md |
| D7 | Manual add/remove | Add manually allowed; remove deletes grades, requires confirmation | 01-product.md |
| D7 | Remove with locked grades | Allowed at any time; exception to lock rule | 01-product.md |
| D7 | Add after period locked | Teacher must enter the new student's grades for locked periods | 01-product.md |
| D7 | Late grades timing | Entered in the add-student form; not saved until complete | 01-product.md |
| D7 | Late grades granularity | Every activity + exam of each locked period | 01-product.md |
| D9 | Import availability | Only during course creation; later, add one by one | 01-product.md |
| D9 | Export format | CSV | 01-product.md |
| D9 | Export content | Full detail: activities, exams, period grades, final | 01-product.md |
| D9 | Export precision | Rounded to one decimal | 01-product.md |
| D9 | Export scope | Per period, or all 3 periods | 01-product.md |
| D10 | Connectivity | Fully offline, local data on teacher's computer; no online features | 01-product.md |
| P3 | Primary device | Desktop/laptop (derived from D10) | 01-product.md |
| D10 | Backup/restore | Not for now (accepted risk) | 01-product.md |
| P7 | Current tool | Excel | 01-product.md |
| P7 | Main pains | Formulas, manual calculation, finding a student row by row | 01-product.md |
| P6 | Decimal separator | Accepts "." and ","; always displayed with comma | 01-product.md |
| D9 | CSV export delimiter | Semicolon columns, comma decimals | 01-product.md |
| D9 | CSV import delimiter | ";" or ",", auto-detected | 01-product.md |
| P6 | Language and date format | Spanish only; DD/MM/YYYY | 01-product.md |
| P4 | Technical level | Medium; must be as intuitive as possible, fewest clicks | 01-product.md |
| P5 | Accessibility needs | None specific for now | 01-product.md |
| P2 | Usage context | Varied: in class (on the spot), university, home | 01-product.md |
| D3 | Activity fields | Name only, no type | 01-product.md |
| F1 | Key tasks and priority | 8 tasks confirmed, grade entry first, course creation last | 03-flows.md |
| F2 | App entry point | Course list + non-intrusive reminders | 03-flows.md |
| F2 | Course entry | Course click opens student list | 03-flows.md |
| F4 | Grade entry mode | Modal, one student at a time, to avoid wrong-student errors | 03-flows.md |
| F4 | Modal modes | Both: walk-through by activity, and per student | 03-flows.md |
| F4 | Walk-through order | Alphabetical by full name (surnames first) | 03-flows.md |
| F4 | Walk-through scope | All students; existing grade shown, editable, Enter keeps it | 03-flows.md |
| F6 | Enter on empty field | Records 0,0 and advances; editable later | 03-flows.md |
| F6 | Skipped 0,0 | Marked pending, visually distinct; legend explains every color/status | 03-flows.md |
| F6 | Pending at lock | Becomes definitive 0,0 | 03-flows.md |
| F6 | Walk-through navigation | Previous and Next buttons | 03-flows.md |
| F6 | Next on empty field | Same as Enter: pending 0,0 | 03-flows.md |
| F6 | Previous on empty field | Also pending 0,0 | 03-flows.md |
| F2 | Student list content | All grades of all periods + period, accumulated, and final grades | 03-flows.md |
| D3 | Accumulated grade | Closed periods only, weighted sum + % evaluated | 01-product.md |
| F2 | Walk-through entry | "Grade" button, then choose activity or exam | 03-flows.md |
| F2 | Find and edit | Live search box on period tab → click student → per-student modal | 03-flows.md |
| F2 | Reminders and status | Home strip + per-course status line + status on period tabs | 03-flows.md |
| F2 | Reminder dismissal | Not dismissible; always visible | 03-flows.md |
| F2 | Opening reminder window | First 3 days of the period | 03-flows.md |
| F2 | Split configuration | Set at course creation; editable later via modal, auto-complete to 100%; recalculates | 03-flows.md |
| F2 | Split on locked periods | Not editable; read-only with lock + reason | 03-flows.md |
| F2 | Split on locked periods | Not editable; only active and upcoming | 03-flows.md |
| F2 | Manage students | Add button on list (form + locked-period grades if any); edit/remove from per-student modal, remove confirms | 03-flows.md |
| F2 | Export flow | Export button → modal: one locked period / all 3 + final / student list; unavailable options disabled with reason | 03-flows.md |
| F2 | Create course | 3-step wizard: details → periods (dates + split) → students import with preview; created on final confirm | 03-flows.md |
| F2 | Course fields | Name + semester | 03-flows.md |
| F2 | Import optional / later | Step 3 optional; import also available later from the student list (replaces D9 "only during creation") | 03-flows.md |
| K1 | Existing brand | None; own identity from scratch. Product name: NOTAZOD | 04-tokens.json |
| K2 | Visual personality | Friendly and warm: livelier colors, rounded corners, close tone | 04-tokens.json |
| K3 | Color modes | Light and dark | 04-tokens.json |
| K4b | Minimum screen | 13" laptop | 04-tokens.json |
| K4 | Density | Compact; goal: all 35 students visible without scroll (feasibility depends on screen, see K4b) | 04-tokens.json |
| K4c | Reference viewport | 1920×1080 at 100%: 35 rows of 22px (raised to 24px in C2), 13px text; smaller screens scroll with sticky header + fixed name column, text never shrinks | 04-tokens.json |
| K5 | Corner style | Soft: 6px controls, 8px modals/cards, table cells square | 04-tokens.json |
| K6 | Motion | Subtle (120–200ms); off with reduced motion | 04-tokens.json |
| K6b | Motion vs input | Animation never delays typing | 04-tokens.json |
| K7 | Status colors | Livelier: failing coral red, pending amber, passing soft green (computed grades), computed = soft brand tint, locked slate blue, empty neutral dash; always + icon/text | 04-tokens.json |
| K1b | Brand color | Wine red + gold; failing → bright coral, pending → violet (off amber), computed surface → soft gold | 04-tokens.json |
| K7b | Palette adjustments | Computed surface soft gold (not wine); green and coral darkened for contrast on it | 04-tokens.json |
| K3b | Dark palette | Approved; focus ring gold in dark (not wine) | 04-tokens.json |
| K10 | Visual refresh | Dark professional theme: graphite/navy surfaces, muted rose primary, gold focus accent, manual light/dark toggle | 04-tokens.json, sandbox/notazod-app |
| K8 | Typeface | Nunito everywhere (digits verified tabular by default); bundled locally | 04-tokens.json |
| K9 | Tone of voice | Friendly, "tú" | 01-product.md |
| C2 | Row height vs target size | Rows 24px (WCAG min target); tabs + search + legend in one toolbar to keep 35 rows | 04-tokens.json |
| C2 | Table sorting | Always alphabetical by surname; no column sort | 05-components.md |
| C2 | Quick filters | Yes: Pending, Below 3,0 | 05-components.md |
| C2 | "Below 3,0" scope | Period grade of the open tab | 05-components.md |
| C2 | Active period grade | "In progress": no pass/fail color until lock; filter disabled on active tab | 01-product.md |
| C3 | Invalid grade | Not saved, does not advance, error with reason; typing not blocked | 05-components.md |
| C3 | Walk-through keymap | Enter next, Shift+Enter previous, Esc close, Tab buttons; visible keymap legend required | 05-components.md |
| C3 | Keymap legend placement | Footer strip in walk-through; "Atajos" button in course toolbar | 05-components.md |
| C5 | Icons | Outline, rounded; 16px (table/buttons), 20px (header) | 04-tokens.json |
| C4 | AppHeader | NOTAZOD + breadcrumb left, theme toggle right, single thin row | 05-components.md |
| D4b | Exact values | Tooltip on hover over computed cells | 05-components.md |
| C4 | Component specs | 24 specs written; 9 proposals approved (button 32px, big grade in walk-through, integer split, reminder order, legend popover, toast 3s, no toast per Enter, "12 de 35", Cancel default focus) | 05-components.md |
| A1 | Validation timing | Blur: format + uniqueness; save: required, focus first error; clear on valid | 06-patterns.md |
| A2 | Unsaved changes | Confirm before discarding, only if changed | 06-patterns.md |
| A4 | Empty states | 5 empty states with next action; no loading/network states | 06-patterns.md |
| D9b | Import incomplete rows | Skipped and reported with missing field | 01-product.md |
| D9c | Import invalid-format rows | Same as incomplete: skipped and reported | 01-product.md |
| D2b | Document ID and code format | Both alphanumeric; only non-empty + unique validated | 01-product.md |
| A7 | Layout | Forms single column; course list full width; home max 960px; modals 480px, walk-through 560px; page padding 24px | 06-patterns.md |
| A5 | Accessibility target | WCAG 2.2 AA | 06-patterns.md |
| A6 | Print | No print; CSV export only | 06-patterns.md |
| C1 | Component inventory | 22 components confirmed, incl. Toast for non-blocking confirmations | 05-components.md |
| K3 | Mode selection | Follows OS by default; in-app toggle overrides and is remembered | 03-flows.md |
| F2 | Import after lock | Only until Period 1 locks; then disabled with reason, add one by one | 03-flows.md |
| F2 | Semester format | Year-term (2026-2), picked from lists | 03-flows.md |
| F2 | Duplicate course | Name + semester unique; duplicate blocked, teacher renames | 03-flows.md |
| F7 | After creating activity | Returns to the list; grading is started separately | 03-flows.md |
| F2 | Student list layout | Tabs per period (opens on active); accumulated and final always visible | 03-flows.md |
| F6 | Interrupted walk-through | Each Enter saves immediately; closing keeps entered grades | 03-flows.md |
| D2 | Full name format | Surnames first, then given names | 01-product.md |
| P8 | Success metrics | Faster entry, easier search, easy editing, visible missing grades, one-by-one entry | 01-product.md |
| D9 | Export availability | Grades: locked periods only. Student list (no grades): any time | 01-product.md |
| D9 | Import format and fields | CSV or Excel; full name, institutional email, document ID, student code, personal email | 01-product.md |
| D11 | Min-one-activity enforcement | Each period starts with one default activity; last one cannot be deleted | 01-product.md |
| D3 | Missing grade | A student without a grade in an activity or exam counts as 0.0 | 01-product.md |
| I1 | Accumulated grade color | Pace-based: green when the average over evaluated weight is ≥ 3,0 | 01-product.md |
| I2 | Intermediate threshold display | Pass/fail presentation follows the displayed rounded value; exact value remains in tooltip | 01-product.md |
| I3 | Search label | Visible compact label: “Buscar estudiante” | 03-flows.md, 05-components.md |
| I4 | Disabled action focus | Keep focusable with `aria-disabled` when a reason must be discoverable | 05-components.md |
| I5 | Locked empty/pending values | Consolidate visually to definitive 0,0 | 01-product.md, 05-components.md |
| I6 | End-day reminder | Use “cierra hoy” | 03-flows.md |
| I7 | Period dates | Show date range directly in tabs and in tooltip | 03-flows.md, 05-components.md |
| I8 | Proposed tokens | Approve after contrast and target-size verification | 04-tokens.json |

## Open TBDs

Technology phase:
- Code-signing details remain for the release-readiness phase.

Future changes must update the relevant phase and changelog.

Visual refresh decision: the original friendly wine/gold treatment was rejected as visually unpleasant. The approved direction is dark professional, with a restrained graphite/navy foundation, muted rose actions, and gold reserved for focus.

Resolved in prototype completion:
- Accumulated grade color follows pace: green when the average over evaluated weight is ≥ 3,0.
- Intermediate values use the displayed rounded value for pass/fail presentation; exact values remain available in tooltips.
- Search has a visible compact label.
- Disabled actions remain keyboard-focusable with `aria-disabled` and an exposed reason.
- Empty and pending values in locked periods display as definitive 0,0.
- End-day reminders say “cierra hoy”.
- Period dates are visible in tabs and remain available in the tooltip.
- All implementation-proposed tokens are approved after light/dark contrast and target-size verification.

## Changelog

| Date | Phase | Change | Impacted UI |
| --- | --- | --- | --- |
| 2026-09-25 | 1 | Phase 1 approved | — (no UI yet) |
| 2026-09-26 | 2 | Technology recommendation drafted: compare PWA, Electron, and Tauri; provisionally recommend Tauri for installable offline desktop delivery | `02-technology.md`, `sandbox/tech-notes.md` |
| 2026-09-26 | 2 | T1 approved: NOTAZOD is an installable desktop application, not a browser-only PWA | `02-technology.md`, `sandbox/tech-notes.md` |
| 2026-09-26 | 2 | T3 approved: React + TypeScript for the production frontend | `02-technology.md`, `sandbox/tech-notes.md` |
| 2026-09-26 | 2 | T4 approved: Mantine selected as the component kit; project tokens remain authoritative | `02-technology.md`, `sandbox/tech-notes.md` |
| 2026-09-26 | 2 | T5 approved: team accepts learning and maintaining Rust/Tauri | `02-technology.md`, `sandbox/tech-notes.md` |
| 2026-09-26 | 2 | T6 approved: SQLite embedded for durable local storage | `02-technology.md`, `sandbox/tech-notes.md` |
| 2026-09-26 | 2 | T7 approved: automatic updates offered from GitHub Releases | `02-technology.md`, `sandbox/tech-notes.md` |
| 2026-09-26 | 2 | M1 approved: first vertical slice covers courses and students with manual and CSV entry; binary Excel is deferred | `02-technology.md`, `odd/tasks/notazod-mvp-course-student-slice.md` |
| 2026-09-26 | 3 | M2 approved: accept the provided HTML-table `.xls` export and ignore Plan de estudios and Estado financiero | `03-flows.md`, `sandbox/notazod-app/src/App.tsx` |
| 2026-09-26 | 7 | Implementation plan approved: vertical slices, explicit non-goals, acceptance evidence, and migration gates | `07-implementation.md` |
| 2026-09-26 | 4 | K10 approved: dark professional visual refresh with refined theme tokens and manual mode toggle | `04-tokens.json`, `sandbox/notazod-app/src/tokens.css`, `sandbox/notazod-app/src/main.tsx`, `sandbox/notazod-app/src/App.tsx` |
| 2026-09-25 | 1 | D3: new computed value, accumulated grade (from phase 2) | — (no UI yet) |
| 2026-09-25 | 1 | D11: skipped 0,0 marked pending, legend required (from F6) | — (no UI yet) |
| 2026-09-25 | 1 | D2: full name format is surnames first (from F4) | — (no UI yet) |
| 2026-09-25 | 1 | Design implications: in-place grid editing replaced by modal one-student-at-a-time entry (from F4) | — (no UI yet) |
| 2026-09-25 | 1 | D3: split cannot be changed on locked periods (from F2, task 5) | — (no UI yet) |
| 2026-09-25 | 2 | Phase 2 approved | — (no UI yet) |
| 2026-09-25 | 3 | Phase 3 approved | — (no UI yet) |
| 2026-09-25 | 4 | Phase 4 approved | — (no UI yet) |
| 2026-09-25 | 5 | Phase 5 approved; spec complete | — (no UI yet) |
| 2026-09-25 | 3 | IMPLEMENT: component.input.radius md → sm (K5 says controls use 6px; template leftover) | sandbox/app |
| 2026-09-25 | 3 | IMPLEMENT: dark border.default #52525B → #71717A (2.3:1 failed WCAG 1.4.11 3:1 for input borders) — proposed | sandbox/app |
| 2026-09-25 | 3 | IMPLEMENT: dark feedback.error/success/warning added (light values were ~3:1 on dark) — proposed | sandbox/app |
| 2026-09-25 | 3 | IMPLEMENT: missing tokens added as proposed (see Open TBDs) | sandbox/app |
| 2026-09-25 | 4 | IMPLEMENT: SearchBox placeholder shortened; activity/split header behavior documented | sandbox/app |
| 2026-09-25 | 3 | New layout tokens (from A7) | — (no UI yet) |
| 2026-09-25 | 1 | D9: incomplete import rows skipped and reported (from phase 5) | — (no UI yet) |
| 2026-09-25 | 3 | component.table.rowHeight 22px → 24px (from C2, target size) | — (no UI yet) |
| 2026-09-25 | 2 | Course list: tabs, search, legend in one toolbar (from C2) | — (no UI yet) |
| 2026-09-25 | 1 | D5: active period grade shown as "in progress", no pass/fail color (from C2) | — (no UI yet) |
| 2026-09-25 | 3 | New token semantic.color.grade.inProgress (from C2) | — (no UI yet) |
| 2026-09-25 | 3 | New icon tokens (from C5) | — (no UI yet) |
| 2026-09-25 | 1 | D4: exact values via tooltip (from phase 4) | — (no UI yet) |
| 2026-09-25 | 1 | Product name NOTAZOD added (from K1) | — (no UI yet) |
| 2026-09-25 | 2 | Global color mode toggle added (from K3) | — (no UI yet) |
| 2026-09-25 | 1 | Density decided; sticky header + fixed student column confirmed (from K4) | — (no UI yet) |
| 2026-09-25 | 1 | D9: import no longer only at course creation; optional step + later import from student list (from F2, task 8) | — (no UI yet) |
| 2026-09-26 | 0.3 | Prototype TBDs resolved: pace-based accumulated color, displayed-value threshold presentation, visible search label, focusable disabled actions, locked 0,0 consolidation, end-day copy, visible tab dates, and proposed tokens approved | `sandbox/app` toolbar, tabs, grade table, reminders, tokens |
