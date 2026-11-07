import type { Course } from "./db";

// Home agenda (S2-S4): Campus group schedules such as "LUN 13:00-15:00; MIE 15:30-18:00".
// Days use Date.getDay() numbering: 0 = domingo … 6 = sábado. Times are minutes since midnight.
export type ScheduleCourse = Pick<Course, "id" | "name" | "color" | "students" | "campusGroups">;
export type ScheduleTime = { day: number; start: number; end: number };
export type ClassSlot = ScheduleTime & { courseId: string; courseName: string; color: Course["color"]; group: string; room: string };
export type WeekColumn = { day: number; slots: ClassSlot[] };
export type NextClass = { slot: ClassSlot; daysAhead: number };

const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const DAY_TOKENS: Record<string, number> = { DOM: 0, LUN: 1, MAR: 2, MIE: 3, JUE: 4, VIE: 5, SAB: 6 };
const SEGMENT = /^([A-Z]+)\.?\s+(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/;

export function weekdayName(day: number): string {
  return WEEKDAY_NAMES[day] ?? "";
}

export function dayLabel(day: number): string {
  return DAY_LABELS[day] ?? "";
}

export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function toMinutes(hours: string, minutes: string): number | null {
  const h = Number(hours);
  const m = Number(minutes);
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}

// Unparsable segments are skipped so one bad Campus value never hides the rest.
export function parseSchedule(text: string): ScheduleTime[] {
  return text.split(";").flatMap((segment) => {
    const normalized = segment.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    const match = SEGMENT.exec(normalized);
    if (!match) return [];
    const day = DAY_TOKENS[match[1]];
    const start = toMinutes(match[2], match[3]);
    const end = toMinutes(match[4], match[5]);
    if (day === undefined || start === null || end === null || end <= start) return [];
    return [{ day, start, end }];
  });
}

const bySlotOrder = (a: ClassSlot, b: ClassSlot) => a.start - b.start || a.end - b.end || a.courseName.localeCompare(b.courseName);

// Every class of every course, once per course/day/time/room, in start order.
export function classSlots(courses: ScheduleCourse[]): ClassSlot[] {
  const seen = new Set<string>();
  const slots: ClassSlot[] = [];
  for (const course of courses) {
    for (const group of course.campusGroups ?? []) {
      for (const time of parseSchedule(group.schedule)) {
        const key = [course.id, time.day, time.start, time.end, group.room].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        slots.push({ ...time, courseId: course.id, courseName: course.name, color: course.color, group: group.group, room: group.room });
      }
    }
  }
  return slots.sort(bySlotOrder);
}

// Monday to Friday, plus Saturday (then Sunday) only when some class falls on it.
export function buildWeek(courses: ScheduleCourse[]): WeekColumn[] {
  const slots = classSlots(courses);
  const days = [1, 2, 3, 4, 5, ...[6, 0].filter((day) => slots.some((slot) => slot.day === day))];
  return days.map((day) => ({ day, slots: slots.filter((slot) => slot.day === day) }));
}

// The first class starting after `now` today, else on the following days (up to the same weekday next week).
export function nextClass(courses: ScheduleCourse[], now: Date): NextClass | null {
  const slots = classSlots(courses);
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (let daysAhead = 0; daysAhead <= 7; daysAhead += 1) {
    const day = (now.getDay() + daysAhead) % 7;
    const slot = slots.find((item) => item.day === day && (daysAhead > 0 || item.start > minutes));
    if (slot) return { slot, daysAhead };
  }
  return null;
}

export function nextClassLabel(next: NextClass): string {
  const time = formatTime(next.slot.start);
  if (next.daysAhead === 0) return `Próxima clase · ${time}`;
  // Seven days ahead is today's weekday again; say "el próximo" so it does not read like today.
  const day = next.daysAhead === 7 ? `el próximo ${weekdayName(next.slot.day)}` : weekdayName(next.slot.day);
  return `Próxima clase · ${day} ${time}`;
}
