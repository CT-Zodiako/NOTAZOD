# Student groups by period

## Goal
Organize students into optional groups per course period while preserving the existing individual grade records and grading workflow.

## Product decisions
- Groups are persisted per course period; one period may have groups while another has none.
- The roster can toggle between the existing list view and a grouped view.
- Students are assigned to groups with a per-student `Mover a grupo…` selector; unassigned students remain visible as `Sin grupo`. Drag-and-drop was removed as unreliable in the packaged app.
- Assigning a grade to a group for an activity writes the same value to every member's individual `grades(student_id, item_id)` row.
- Individual edits remain allowed after a group grade is applied; there is no permanent group-grade linkage.
- Activities remain transversal across the roster and are still created and managed normally.

## Tasks
- [x] Add safe per-period group schema, migration initialization, and CRUD.
- [x] Add group management and selector-based membership assignment.
- [x] Add list/group view toggle with unassigned students visible.
- [x] Keep grouped view limited to names, codes, and organization controls.
- [x] Keep all grading actions in list view.
- [x] Use compact grouped rows to reduce wasted space.
- [x] Filter the normal list by active-period group.
- [x] Add normal-list group grading that updates individual rows.
- [x] Redesign grouped view as a horizontal two-pane layout: left pane lists unassigned students, right pane holds group creation and group cards.
- [x] Auto-generate sequential default group names (`Grupo N`) from the highest existing `Grupo N`, so blank input never collides with a deleted group's old name.
- [x] Add cross-cutoff group copy (names + memberships) from the group management modal.
- [x] Remove drag-and-drop from the grouped view; keep the selector as the only assignment method and add a `Sacar del grupo` button beside each assigned student.
- [x] Render real group cards in a responsive two-column grid (`base: 1`, `md: 2`).
- [ ] Verify persistence, individual overrides, pending navigation, and production isolation.

## Acceptance criteria
- Existing list view remains available and unchanged for individual grading.
- Group view organizes every student under its assigned group or `Sin grupo`.
- Group membership survives restart and is isolated by course period.
- A group activity grade creates/updates one individual grade row per member.
- Editing one member afterward changes only that member's row.
- Pending navigation remains activity-scoped and skips completed students.
- A period without groups behaves like the current roster.
- Production database and production installation are not opened or modified during testing.

## Evidence
- `app/src/lib/db.ts` adds `groups`, `group_members`, membership CRUD, and transactional `saveGroupGrade` while keeping `grades` unchanged.
- `app/src/App.tsx` adds list/group toggle, selector-based organization, group management, compact grouped rows limited to names/codes plus assignment controls; list view adds group filtering and group grading.
- Frontend and staging builds passed; NOTAZOD Test was rebuilt/reinstalled with identifier `com.notazod.desktop.test`.
- Manual staging verification remains pending.

## Cross-cutoff group copy decision (2026-10-05)
- Users can copy another cutoff's groups (same course only) into the active, open cutoff from the group management modal, selecting any cutoff except the active one as source.
- Copying replaces both group names and student memberships in the destination cutoff; if the destination already has groups, the UI requires an explicit confirmation before replacing them, since the copy is destructive to the current group organization.
- `copyGroupsFromPeriod` in `app/src/lib/db.ts` validates both periods belong to the same course, the destination is open, deletes the destination's existing groups/memberships, then inserts new independent group rows (new ids) for the destination period and recreates memberships only for students who belong to the same course.
- Drag-and-drop membership assignment was removed entirely (it was unreliable in the packaged desktop app); the per-student `Mover a grupo…` selector and the `Sacar del grupo` button are now the supported way to assign and remove group membership.

## Layout decision (2026-10-05)
- Grouped view uses a fixed-width left pane (`Estudiantes sin grupo`) and a flexible right pane holding the create-group control and group cards.
- `Calificar grupo` and `Eliminar grupo` stay on each group card; grouped view still carries no grade data.
- Creating a group with a blank name assigns the next sequential `Grupo N`, computed from the highest existing `Grupo N` suffix among current groups (not a running counter), so deleting a group never causes a duplicate name on the next auto-created group.

## Drag-and-drop removal decision (2026-10-06)
- All drag-and-drop UI and handlers (draggable rows, `onDragStart`/`onDrop`/`onPointerUp` fallback, the dashed `Sin grupo` drop target, and the associated refs `draggedStudentRef`, `pointerDragStartRef`, `pointerDragMovedRef`) were removed from the grouped organizer because drag-and-drop was unreliable in the packaged app.
- Each assigned student's row in a group card now shows a `Mover a grupo…` selector plus a `Sacar del grupo` button; the button calls the existing `handleDropOnGroup(null, studentId)` path, which immediately updates local membership state (so the student reappears in the left `Estudiantes sin grupo` list) and is disabled when the active cutoff is locked.
- Real group cards render in a `SimpleGrid` with `cols={{ base: 1, md: 2 }}` instead of a single stacked column.

## Design notes
- Prefer `groups(period_id, name, sort_order)` and `group_members(group_id, student_id)` with uniqueness preventing one student from belonging to multiple groups in the same period.
- Keep `grades` unchanged; group grading is an explicit transactional/batched write over existing rows.
- Use native HTML drag-and-drop or the existing UI primitives without adding a dependency unless exploration proves it necessary.
