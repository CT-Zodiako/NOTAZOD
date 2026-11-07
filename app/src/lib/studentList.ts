import type { CheckGroup } from "./campus";
import type { UploadCheck } from "./campusGrades";
import type { CourseColor } from "./db";

// Pure helpers for the course student list: heat-map tint, status filters and the Campus column.

export const PASSING_GRADE = 3;

const MIN_TINT = 10;
const MAX_TINT = 55;

type GradeLike = { studentId: string; itemId: string; value: number; pending: number };

export type HeatTint =
  | { kind: "graded"; token: "--color-grade-passing" | "--color-grade-failing"; percent: number }
  | { kind: "pending" }
  | { kind: "empty" };

// The tint grows with the distance from 3,0: 10% at 3,0, 55% at 0,0 (failing) or 5,0 (passing).
export function heatTint(grade: Pick<GradeLike, "value" | "pending"> | undefined): HeatTint {
  if (!grade) return { kind: "empty" };
  if (grade.pending) return { kind: "pending" };
  const passing = grade.value >= PASSING_GRADE;
  const span = passing ? 5 - PASSING_GRADE : PASSING_GRADE;
  const distance = Math.min(Math.abs(grade.value - PASSING_GRADE) / span, 1);
  return { kind: "graded", token: passing ? "--color-grade-passing" : "--color-grade-failing", percent: Math.round(MIN_TINT + distance * (MAX_TINT - MIN_TINT)) };
}

export function isAtRisk(periodGrade: number) {
  return periodGrade < PASSING_GRADE;
}

export function hasPendingGrade(grades: GradeLike[], studentId: string, itemIds: string[]) {
  return grades.some((grade) => grade.studentId === studentId && !!grade.pending && itemIds.includes(grade.itemId));
}

// State of a student's corte grade in the last "Verificar Campus" run; null when that run has no row for it.
export function campusStateFor(groups: CheckGroup[] | null, courseId: string, period: number, code: string): UploadCheck | null {
  if (!groups) return null;
  const wanted = code.trim();
  for (const group of groups) {
    if (group.status !== "verified" || group.courseId !== courseId) continue;
    const row = group.rows.find((item) => item.period === period && item.code.trim() === wanted);
    if (row) return row.state;
  }
  return null;
}

export function isMissingInCampus(state: UploadCheck | null) {
  return state === "missing" || state === "different";
}

export const STUDENT_FILTER = {
  ALL: "all",
  RISK: "risk",
  PENDING: "pending",
  CAMPUS: "campus",
} as const;

export type StudentFilter = (typeof STUDENT_FILTER)[keyof typeof STUDENT_FILTER];

export type StudentStatus = { periodGrade: number; hasPending: boolean; campus: UploadCheck | null };

export function matchesFilter(filter: StudentFilter, status: StudentStatus) {
  if (filter === STUDENT_FILTER.RISK) return isAtRisk(status.periodGrade);
  if (filter === STUDENT_FILTER.PENDING) return status.hasPending;
  if (filter === STUDENT_FILTER.CAMPUS) return isMissingInCampus(status.campus);
  return true;
}

export function countByFilter(statuses: StudentStatus[]): Record<StudentFilter, number> {
  const count = (filter: StudentFilter) => statuses.filter((status) => matchesFilter(filter, status)).length;
  return { all: count("all"), risk: count("risk"), pending: count("pending"), campus: count("campus") };
}

// Course color palette (S10, S13): each stored key maps to a design token, so it follows the light/dark theme.
export const COURSE_COLOR_SWATCHES = {
  primary: { token: "--color-action-primary", label: "Vino" },
  pink: { token: "--course-pink", label: "Rosa" },
  warning: { token: "--color-feedback-warning", label: "Naranja" },
  focus: { token: "--color-border-focus", label: "Dorado" },
  brown: { token: "--course-brown", label: "Café" },
  olive: { token: "--course-olive", label: "Oliva" },
  passing: { token: "--color-grade-passing", label: "Verde" },
  teal: { token: "--course-teal", label: "Turquesa" },
  blue: { token: "--course-blue", label: "Azul" },
  indigo: { token: "--course-indigo", label: "Índigo" },
  pending: { token: "--color-grade-pending", label: "Violeta" },
  locked: { token: "--color-grade-locked", label: "Azul acero" },
} as const satisfies Record<CourseColor, { token: string; label: string }>;

export function courseColorStyle(color: CourseColor) {
  return { "--course-color": `var(${COURSE_COLOR_SWATCHES[color].token})` };
}
