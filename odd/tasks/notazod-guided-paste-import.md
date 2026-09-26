# NOTAZOD — guided column paste import

Status: planned

## Goal
Replace file-based migration as the primary path with a clipboard-first wizard for student columns and period grades.

## Approved flow
- Required student columns: full name, code, document, institutional email, personal email.
- First pasted column establishes dynamic row count; later columns must match it.
- After student fields, ask each activity name and accept one pasted grade column at a time.
- Ask whether a final pasted column is the exam/Parcial.
- Show complete preview and confirm before persistence.

## Non-goals
- Fixed row count assumptions.
- Automatic column-header inference.
- Removing the existing file importer until guided paste is accepted.
