import { DatabaseSync } from "node:sqlite";

// Same formula as the NOTAZOD "Nota del corte" (periodCalculationFor in app/src/App.tsx).
// Missing and pending grades count as 0,0.
export function periodGrade(period, items, gradesByItem) {
  const valueOf = (item) => {
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
export function formatGrade(value) {
  return value.toFixed(1).replace(".", ",");
}

// A Campus group is verified only when every one of its student codes belongs to the same NOTAZOD course.
export function verifyGroup(group, courses) {
  const touched = courses.filter((course) => group.codes.some((code) => course.codes.has(code)));
  if (!touched.length) return { status: "unmatched" };
  const complete = touched.filter((candidate) => group.codes.every((code) => candidate.codes.has(code)));
  if (complete.length > 1) return { status: "failed", courseId: null, candidates: complete.map((c) => c.name), missingCodes: [], notInCampus: [], reason: `student codes match more than one NOTAZOD course: ${complete.map((c) => c.name).join(", ")}` };
  const course = complete[0]
    ?? touched.reduce((best, candidate) => countIn(group.codes, candidate) > countIn(group.codes, best) ? candidate : best);
  const missingCodes = group.codes.filter((code) => !course.codes.has(code));
  const notInCampus = [...course.codes].filter((code) => !group.codes.includes(code));
  if (missingCodes.length) return { status: "failed", courseId: course.id, missingCodes, notInCampus, reason: "student codes not found in one NOTAZOD course" };
  if (group.openColumn == null) return { status: "failed", courseId: course.id, missingCodes, notInCampus, reason: "no single open period column in the Campus form" };
  return { status: "verified", courseId: course.id, missingCodes, notInCampus };
}

function countIn(codes, course) {
  return codes.filter((code) => course.codes.has(code)).length;
}

export function planUpload(results) {
  const matched = results.filter((result) => result.status !== "unmatched");
  return { canSave: matched.length > 0 && matched.every((result) => result.status === "verified") };
}

// Opens the NOTAZOD database read-only; nothing in this tool writes to it.
export function loadNotazod(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const courseRows = db.prepare("SELECT id, name, semester FROM courses ORDER BY name").all();
    const students = db.prepare("SELECT id, course_id AS courseId, full_name AS fullName, code FROM students").all();
    const periods = db.prepare("SELECT id, course_id AS courseId, number, activity_percent AS activityPercent, exam_percent AS examPercent, closed FROM periods").all();
    const items = db.prepare("SELECT id, period_id AS periodId, is_exam AS isExam FROM grade_items").all();
    const grades = db.prepare("SELECT student_id AS studentId, item_id AS itemId, value, pending FROM grades").all();

    const courses = courseRows.map((course) => ({ ...course, codes: new Set(students.filter((s) => s.courseId === course.id).map((s) => String(s.code).trim())) }));
    const gradeFor = (courseId, periodNumber, code) => {
      const period = periods.find((p) => p.courseId === courseId && p.number === periodNumber);
      const student = students.find((s) => s.courseId === courseId && String(s.code).trim() === code);
      if (!period || !student) return null;
      const periodItems = items.filter((item) => item.periodId === period.id);
      const byItem = new Map(grades.filter((g) => g.studentId === student.id).map((g) => [g.itemId, g]));
      return periodGrade(period, periodItems, byItem);
    };
    const periodInfo = (courseId, periodNumber) => periods.find((p) => p.courseId === courseId && p.number === periodNumber) ?? null;
    const studentName = (courseId, code) => students.find((s) => s.courseId === courseId && String(s.code).trim() === code)?.fullName ?? null;
    return { courses, gradeFor, periodInfo, studentName };
  } finally {
    db.close();
  }
}
