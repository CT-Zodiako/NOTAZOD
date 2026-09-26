# NOTAZOD MVP — grade template and import

Status: in progress — implementation complete, user smoke test pending

## Goal
Let teachers download a period grade template and import flexible CSV/HTML-table `.xls` grade files with a preview and explicit last-column exam choice.

## Scope
- Download template with student code/name and current period grade columns.
- Parse CSV and HTML-table `.xls` files.
- Match students by code.
- Treat grade columns as activities in order; optionally treat the last as Parcial.
- Preview row counts, unknown codes, invalid grades, and final mapping.
- Save only after explicit confirmation.

## Acceptance criteria
- [x] Template download works from the selected period.
- [x] Import preview asks whether the last grade column is Parcial.
- [x] Unknown codes and invalid rows are reported.
- [x] Confirmed import persists grades and creates missing activities.
- [ ] User smoke test with the real Excel file passes.
- [x] Frontend build and macOS `.app` bundle pass.
