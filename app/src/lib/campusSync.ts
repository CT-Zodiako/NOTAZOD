// Pure planning for "Sincronizar cursos": decides, per Campus group, whether to create a course,
// add missing students to an existing one, or report a conflict. No I/O, so it runs under `node --test`.
import type { Student } from "./db";
import { classifyStudentRows, type StudentDraft } from "./validation.ts";

export type CampusCourseGroup = {
  key: string;
  program: string;
  group: string;
  module: string;
  schedule?: string;
  room?: string;
  students: StudentDraft[];
  expectedCount: number | null;
  // Campus grading form: the open period column, and the values of the periods before it.
  openColumn?: number | null;
  pastGrades?: { period: number; values: Record<string, string> }[];
};
// gradedPeriods: period numbers that already have at least one grade in NOTAZOD.
export type ExistingCourse = { id: string; name: string; semester: string; students: Student[]; gradedPeriods?: number[] };
export type PeriodImport = { period: number; grades: { code: string; value: number }[] };
export type PeriodSkip = { period: number; reason: string };
export type SkippedStudent = { row: StudentDraft; reason: string };
export type CampusGroupMetadata = { key: string; program: string; group: string; schedule: string; room: string };
const metadata = (g: CampusCourseGroup): CampusGroupMetadata => ({ key: g.key, program: g.program, group: g.group, schedule: g.schedule ?? "", room: g.room ?? "" });

export type SyncAction =
  | { campusGroups: CampusGroupMetadata[]; kind: "create"; groupKeys: string[]; courseName: string; semester: string; toAdd: StudentDraft[]; skipped: SkippedStudent[]; periodImports: PeriodImport[]; periodSkips: PeriodSkip[] }
  | { campusGroups: CampusGroupMetadata[]; kind: "add"; groupKeys: string[]; courseId: string; courseName: string; toAdd: StudentDraft[]; skipped: SkippedStudent[]; notInCampus: string[]; periodImports: PeriodImport[]; periodSkips: PeriodSkip[] }
  | { kind: "conflict"; groupKeys: string[]; reason: string };

// Same convention as the existing courses: first half of the year is "-1", second half "-2".
export function currentSemester(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() < 6 ? 1 : 2}`;
}

const codeOf = (value: { code: string }) => String(value.code).trim();

// Keeps rows in their original order and turns classifyStudentRows rejects into reasons.
function classify(rows: StudentDraft[], existing: Student[]) {
  const result = classifyStudentRows(rows, existing);
  const skipped = [...result.incomplete, ...result.invalid, ...result.duplicate].sort((a, b) => rows.indexOf(a.row) - rows.indexOf(b.row));
  return { toAdd: result.valid, skipped };
}

// The course holding most of the group's codes wins only when it clearly does: strictly more than
// any other course and at least half of the group. A student shared with another course does not move the match.
function matchCourse(group: CampusCourseGroup, courses: ExistingCourse[]) {
  const codes = group.students.map(codeOf);
  const scored = courses
    .map((course) => ({ course, overlap: codes.filter((code) => course.students.some((s) => codeOf(s) === code)).length }))
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  if (!scored.length) return { kind: "none" as const };
  const [best, second] = scored;
  if ((second && second.overlap === best.overlap) || best.overlap * 2 < codes.length) {
    return { kind: "ambiguous" as const, reason: `student codes are split across NOTAZOD courses: ${scored.map((s) => `${s.course.name} (${s.overlap})`).join(", ")}` };
  }
  return { kind: "match" as const, course: best.course };
}

// S4: past Campus periods (columns before the open one) are imported only into NOTAZOD periods
// that have no grades yet, and only for students that end up in the course.
function planPeriodImports(groups: CampusCourseGroup[], courseCodes: Set<string>, gradedPeriods: number[]) {
  const periodImports: PeriodImport[] = [];
  const periodSkips: PeriodSkip[] = [];
  if (groups.some((g) => g.openColumn === null)) {
    periodSkips.push({ period: 0, reason: "no se pudo identificar el corte abierto en el Campus; no se importan notas" });
    return { periodImports, periodSkips };
  }
  const periods = [...new Set(groups.flatMap((g) => (g.pastGrades ?? []).map((p) => p.period)))].sort((a, b) => a - b);
  for (const period of periods) {
    if (gradedPeriods.includes(period)) { periodSkips.push({ period, reason: `NOTAZOD ya tiene notas en el corte ${period}; no se modifica` }); continue; }
    const grades: { code: string; value: number }[] = [];
    for (const group of groups) {
      const values = group.pastGrades?.find((p) => p.period === period)?.values ?? {};
      for (const student of group.students) {
        const code = codeOf(student);
        const raw = values[code];
        if (raw === undefined || !courseCodes.has(code) || grades.some((g) => g.code === code)) continue;
        const value = /^\d(?:,\d)?$/.test(raw.trim()) ? Number(raw.trim().replace(",", ".")) : NaN;
        if (Number.isNaN(value) || value > 5) { periodSkips.push({ period, reason: `valor no válido para ${code}: ${raw}` }); continue; }
        grades.push({ code, value });
      }
    }
    if (grades.length) periodImports.push({ period, grades });
  }
  return { periodImports, periodSkips };
}

export function planCourseSync(groups: CampusCourseGroup[], courses: ExistingCourse[], semester: string): SyncAction[] {
  const current = courses.filter((course) => course.semester === semester);
  const plan: SyncAction[] = [];
  const merged = new Map<string, { groups: CampusCourseGroup[]; course: ExistingCourse }>();
  const creates: CampusCourseGroup[] = [];

  for (const group of groups) {
    if (group.expectedCount !== null && group.expectedCount !== group.students.length) {
      plan.push({ kind: "conflict", groupKeys: [group.key], reason: `read ${group.students.length} students but the Campus list says ${group.expectedCount}` });
      continue;
    }
    const match = matchCourse(group, current);
    if (match.kind === "ambiguous") { plan.push({ kind: "conflict", groupKeys: [group.key], reason: match.reason }); continue; }
    if (match.kind === "none") { creates.push(group); plan.push({ kind: "create", campusGroups: [metadata(group)], groupKeys: [group.key], courseName: "", semester, toAdd: [], skipped: [], periodImports: [], periodSkips: [] }); continue; }
    const entry = merged.get(match.course.id);
    if (entry) { entry.groups.push(group); continue; }
    merged.set(match.course.id, { groups: [group], course: match.course });
    plan.push({ kind: "add", campusGroups: [], groupKeys: [], courseId: match.course.id, courseName: match.course.name, toAdd: [], skipped: [], notInCampus: [], periodImports: [], periodSkips: [] });
  }

  // Fill in the merged "add" actions now that every group of each course is known.
  for (const action of plan) {
    if (action.kind !== "add") continue;
    const { groups: courseGroups, course } = merged.get(action.courseId)!;
    const known = new Set(course.students.map(codeOf));
    const seen = new Set<string>();
    const missing = courseGroups.flatMap((g) => g.students).filter((s) => !known.has(codeOf(s)) && !seen.has(codeOf(s)) && seen.add(codeOf(s)));
    const campusCodes = new Set(courseGroups.flatMap((g) => g.students.map(codeOf)));
    const classified = classify(missing, course.students);
    const finalCodes = new Set([...known, ...classified.toAdd.map(codeOf)]);
    Object.assign(action, classified, planPeriodImports(courseGroups, finalCodes, course.gradedPeriods ?? []), {
      groupKeys: courseGroups.map((g) => g.key),
      campusGroups: courseGroups.map(metadata),
      notInCampus: course.students.map(codeOf).filter((code) => !campusCodes.has(code)),
    });
  }

  // New course names come from the first module; add the group when the name would clash.
  const baseOf = (group: CampusCourseGroup) => group.module.split(";")[0].trim() || group.group;
  const taken = new Set(current.map((course) => course.name.trim().toLowerCase()));
  const counts = new Map<string, number>();
  creates.forEach((group) => counts.set(baseOf(group).toLowerCase(), (counts.get(baseOf(group).toLowerCase()) ?? 0) + 1));
  const createActions = plan.filter((action): action is Extract<SyncAction, { kind: "create" }> => action.kind === "create");
  creates.forEach((group, index) => {
    const base = baseOf(group);
    let name = taken.has(base.toLowerCase()) || (counts.get(base.toLowerCase()) ?? 0) > 1 ? `${base} - ${group.group}` : base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} - ${group.group} (${n})`;
    taken.add(name.toLowerCase());
    const classified = classify(group.students, []);
    Object.assign(createActions[index], { courseName: name }, classified, planPeriodImports([group], new Set(classified.toAdd.map(codeOf)), []));
  });
  return plan;
}
