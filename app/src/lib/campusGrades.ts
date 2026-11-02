// Pure grade and verification logic for the Campus upload. No I/O, so it runs under `node --test`.

export type GradeState = { value: number; pending: number };
export type PeriodWeights = { activityPercent: number; examPercent: number };
export type CourseCodes = { id: string; name: string; codes: Set<string> };
export type CampusGroupInput = { name: string; codes: string[]; openColumn: number | null };
export type Verification = {
  status: "verified" | "failed" | "unmatched";
  courseId?: string | null;
  candidateIds?: string[];
  candidates?: string[];
  missingCodes?: string[];
  notInCampus?: string[];
  reason?: string;
};

// Same formula as the NOTAZOD "Nota del corte" (periodCalculationFor in App.tsx).
// Missing and pending grades count as 0,0.
export function periodGrade(period: PeriodWeights, items: { id: string; isExam: number }[], gradesByItem: Map<string, GradeState>) {
  const valueOf = (item: { id: string }) => {
    const grade = gradesByItem.get(item.id);
    return grade && !grade.pending ? grade.value : 0;
  };
  const activities = items.filter((item) => !item.isExam);
  const exam = items.find((item) => item.isExam);
  const activityAverage = activities.length ? activities.reduce((sum, item) => sum + valueOf(item), 0) / activities.length : 0;
  const examValue = exam ? valueOf(exam) : 0;
  return activityAverage * period.activityPercent / 100 + examValue * period.examPercent / 100;
}

// Matches how NOTAZOD displays a grade, which is what the teacher reviewed.
export function formatGrade(value: number) {
  return value.toFixed(1).replace(".", ",");
}

function countIn(codes: string[], course: CourseCodes) {
  return codes.filter((code) => course.codes.has(code)).length;
}

// A Campus group is verified only when every one of its student codes belongs to exactly one NOTAZOD course.
export function verifyGroup(group: CampusGroupInput, courses: CourseCodes[]): Verification {
  const touched = courses.filter((course) => group.codes.some((code) => course.codes.has(code)));
  if (!touched.length) return { status: "unmatched" };
  const complete = touched.filter((candidate) => group.codes.every((code) => candidate.codes.has(code)));
  if (complete.length > 1) return { status: "failed", courseId: null, candidateIds: complete.map((c) => c.id), candidates: complete.map((c) => c.name), missingCodes: [], notInCampus: [], reason: `student codes match more than one NOTAZOD course: ${complete.map((c) => c.name).join(", ")}` };
  const course = complete[0] ?? touched.reduce((best, candidate) => countIn(group.codes, candidate) > countIn(group.codes, best) ? candidate : best);
  const missingCodes = group.codes.filter((code) => !course.codes.has(code));
  const notInCampus = [...course.codes].filter((code) => !group.codes.includes(code));
  if (missingCodes.length) return { status: "failed", courseId: course.id, missingCodes, notInCampus, reason: "student codes not found in one NOTAZOD course" };
  if (group.openColumn == null) return { status: "failed", courseId: course.id, missingCodes, notInCampus, reason: "no single open period column in the Campus form" };
  return { status: "verified", courseId: course.id, missingCodes, notInCampus };
}

// Keeps the groups of one NOTAZOD course, plus ambiguous groups that could belong to it.
// Without a course, every group is in scope.
export function scopeToCourse<T extends Verification>(results: T[], courseId: string | undefined): T[] {
  if (!courseId) return results;
  return results.filter((result) => result.courseId === courseId || result.candidateIds?.includes(courseId));
}

export function planUpload(results: Verification[]) {
  const matched = results.filter((result) => result.status !== "unmatched");
  return { canSave: matched.length > 0 && matched.every((result) => result.status === "verified") };
}

export type CampusDataRows = {
  courses: { id: string; name: string }[];
  students: { id: string; courseId: string; fullName: string; code: string }[];
  periods: { id: string; courseId: string; number: number; activityPercent: number; examPercent: number; closed: number }[];
  items: { id: string; periodId: string | null; isExam: number }[];
  grades: { studentId: string; itemId: string; value: number; pending: number }[];
};

// Builds lookups over plain database rows: course codes, period info and each student's period grade.
export function buildCampusData(rows: CampusDataRows) {
  const codeOf = (student: { code: string }) => String(student.code).trim();
  const courses: CourseCodes[] = rows.courses.map((course) => ({ id: course.id, name: course.name, codes: new Set(rows.students.filter((s) => s.courseId === course.id).map(codeOf)) }));
  const periodInfo = (courseId: string, periodNumber: number) => rows.periods.find((p) => p.courseId === courseId && p.number === periodNumber) ?? null;
  const gradeFor = (courseId: string, periodNumber: number, code: string) => {
    const period = periodInfo(courseId, periodNumber);
    const student = rows.students.find((s) => s.courseId === courseId && codeOf(s) === code);
    if (!period || !student) return null;
    const periodItems = rows.items.filter((item) => item.periodId === period.id);
    const byItem = new Map(rows.grades.filter((g) => g.studentId === student.id).map((g) => [g.itemId, g]));
    return periodGrade(period, periodItems, byItem);
  };
  return { courses, gradeFor, periodInfo };
}
