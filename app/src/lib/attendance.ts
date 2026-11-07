import { dayLabel, formatTime, parseSchedule } from "./schedule.ts";

// Attendance (odd/tasks/attendance.md): pure rules for roll calls, corrections and totals.
// A session has 1-6 class hours; each student has one state per hour and every absent hour is one absence.
export const ATTENDANCE_STATES = ["present", "absent", "justified"] as const;
export type AttendanceState = (typeof ATTENDANCE_STATES)[number];
export const ATTENDANCE_ACTIONS = ["late", "excuse", "present"] as const;
export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number];
export type AttendanceCorrection =
  | { action: "late"; arrivalHour: number }
  | { action: "excuse"; motive: string }
  | { action: "present" };

export const MIN_SESSION_HOURS = 1;
export const MAX_SESSION_HOURS = 6;
export const DEFAULT_SESSION_HOURS = 2;

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isAttendanceState(value: unknown): value is AttendanceState {
  return typeof value === "string" && (ATTENDANCE_STATES as readonly string[]).includes(value);
}

export function isValidSessionHours(hours: unknown): hours is number {
  return Number.isInteger(hours) && (hours as number) >= MIN_SESSION_HOURS && (hours as number) <= MAX_SESSION_HOURS;
}

// "YYYY-MM-DD" as a local calendar date; null when it is not a real date.
export function parseSessionDate(date: string): Date | null {
  const match = DATE.exec(date);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return parsed.getFullYear() === Number(match[1]) && parsed.getMonth() === Number(match[2]) - 1 && parsed.getDate() === Number(match[3]) ? parsed : null;
}

export function isValidStartTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return !!match && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

// S2: the longest Campus segment on the date's weekday gives the start and the hours (rounded, 1-6);
// with no matching segment the default is 2 hours and the caller picks the start.
export function defaultSessionTiming(schedules: string[], date: string): { startTime: string | null; hours: number } {
  const day = parseSessionDate(date)?.getDay();
  const segments = schedules.flatMap(parseSchedule).filter((segment) => segment.day === day);
  if (!segments.length) return { startTime: null, hours: DEFAULT_SESSION_HOURS };
  const longest = segments.reduce((best, segment) => segment.end - segment.start > best.end - best.start ? segment : best);
  const hours = Math.min(MAX_SESSION_HOURS, Math.max(MIN_SESSION_HOURS, Math.round((longest.end - longest.start) / 60)));
  return { startTime: formatTime(longest.start), hours };
}

// Initial roll-call fields: today's date and its Campus timing, else the current whole hour.
export function rollCallDefaults(schedules: string[], now: Date): { date: string; startTime: string; hours: number } {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timing = defaultSessionTiming(schedules, date);
  return { date, startTime: timing.startTime ?? formatTime(now.getHours() * 60), hours: timing.hours };
}

// S3: arriving at hour N leaves the hours before N absent and N onwards present.
export function lateArrivalStates(hours: number, arrivalHour: number): AttendanceState[] {
  if (!Number.isInteger(arrivalHour) || arrivalHour < 1 || arrivalHour > hours) throw new Error(`Arrival hour out of range: ${arrivalHour}`);
  return Array.from({ length: hours }, (_, index) => index + 1 < arrivalHour ? "absent" : "present");
}

// S3, S4: the states after a correction. Rejects an empty motive, an unknown action and a correction that changes nothing.
export function applyCorrection(states: AttendanceState[], correction: AttendanceCorrection): AttendanceState[] {
  let next: AttendanceState[];
  switch (correction.action) {
    case "late":
      next = lateArrivalStates(states.length, correction.arrivalHour);
      break;
    case "excuse":
      if (typeof correction.motive !== "string" || !correction.motive.trim()) throw new Error("An excuse needs a motive");
      next = states.map((state) => state === "absent" ? "justified" : state);
      break;
    case "present":
      next = states.map(() => "present");
      break;
    default:
      throw new Error(`Unknown attendance correction: ${(correction as { action: unknown }).action}`);
  }
  if (next.every((state, index) => state === states[index])) throw new Error("The correction does not change any hour");
  return next;
}

// S1: tapping a name marks every hour absent, or all present again when the student was already fully absent.
export function toggleStudent(states: AttendanceState[]): AttendanceState[] {
  const next = states.includes("present") ? "absent" : "present";
  return states.map(() => next);
}

export function toggleHour(states: AttendanceState[], index: number): AttendanceState[] {
  return states.map((state, position) => position === index ? (state === "absent" ? "present" : "absent") : state);
}

export function resizeStates(states: AttendanceState[], hours: number): AttendanceState[] {
  return Array.from({ length: hours }, (_, index) => states[index] ?? "present");
}

export function stateCounts(states: AttendanceState[]): Record<AttendanceState, number> {
  const counts = { present: 0, absent: 0, justified: 0 };
  for (const state of states) counts[state] += 1;
  return counts;
}

const plural = (count: number, singular: string, many: string) => `${count} ${count === 1 ? singular : many}`;

export function rollCallSummary(rows: AttendanceState[][]): string {
  const withAbsences = rows.filter((states) => states.includes("absent")).length;
  const absences = rows.reduce((total, states) => total + stateCounts(states).absent, 0);
  return `${rows.length - withAbsences} presentes · ${withAbsences} con faltas · ${plural(absences, "falta", "faltas")} en total`;
}

export function sessionLabel(absentStudents: number): string {
  return absentStudents ? plural(absentStudents, "ausente", "ausentes") : "Completo";
}

export function absenceLabel(absences: number): string {
  return absences ? plural(absences, "falta", "faltas") : "Presente";
}

export function courseTotalLabel(absentHours: number, recordedHours: number): string {
  return `${absentHours} / ${recordedHours} h`;
}

export function formatSessionDate(date: string): string {
  const parsed = parseSessionDate(date);
  return parsed ? `${dayLabel(parsed.getDay())} ${parsed.getDate()} ${MONTH_LABELS[parsed.getMonth()]}` : date;
}

export function describeHistoryEntry(entry: { action: AttendanceAction; motive: string | null; beforeStates: AttendanceState[]; afterStates: AttendanceState[] }): string {
  const before = `(antes ${plural(stateCounts(entry.beforeStates).absent, "falta", "faltas")})`;
  if (entry.action === "late") return `Llegó tarde: presente desde la hora ${entry.afterStates.indexOf("present") + 1} ${before}`;
  if (entry.action === "excuse") return `Justificada: ${entry.motive ?? ""} ${before}`;
  return `Sí vino: presente en todas las horas ${before}`;
}
