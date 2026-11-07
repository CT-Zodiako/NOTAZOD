import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeek, dayLabel, formatTime, nextClass, nextClassLabel, parseSchedule, weekdayName, type ScheduleCourse } from "../src/lib/schedule.ts";

const group = (schedule: string, room = "Sala 1", name = "Grupo A") => ({ key: `${name}-${schedule}`, program: "Ingeniería", group: name, schedule, room });
const course = (id: string, name: string, schedules: { schedule: string; room?: string; group?: string }[], color: ScheduleCourse["color"] = "primary"): ScheduleCourse =>
  ({ id, name, color, students: 17, campusGroups: schedules.map((item) => group(item.schedule, item.room, item.group)) });

// Monday 2026-11-02 is a lunes; month is 0-based.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

test("parse: the four real Campus schedule strings", () => {
  assert.deepEqual(parseSchedule("LUN 16:00-18:00"), [{ day: 1, start: 960, end: 1080 }]);
  assert.deepEqual(parseSchedule("MAR 13:00-17:30"), [{ day: 2, start: 780, end: 1050 }]);
  assert.deepEqual(parseSchedule("LUN 13:00-15:00; MIE 15:30-18:00"), [{ day: 1, start: 780, end: 900 }, { day: 3, start: 930, end: 1080 }]);
  assert.deepEqual(parseSchedule("JUE 15:00-18:00; VIE 14:00-17:00"), [{ day: 4, start: 900, end: 1080 }, { day: 5, start: 840, end: 1020 }]);
});

test("parse: accents and lowercase day tokens, Saturday and Sunday", () => {
  assert.deepEqual(parseSchedule("mié 8:00-10:00"), [{ day: 3, start: 480, end: 600 }]);
  assert.deepEqual(parseSchedule("Sáb 07:00-09:00; dom 10:00-12:00"), [{ day: 6, start: 420, end: 540 }, { day: 0, start: 600, end: 720 }]);
  assert.deepEqual(parseSchedule("  vie   14:00 - 17:00 "), [{ day: 5, start: 840, end: 1020 }]);
});

test("parse: garbage and unparsable segments are ignored, never throw", () => {
  assert.deepEqual(parseSchedule(""), []);
  assert.deepEqual(parseSchedule("Por definir"), []);
  assert.deepEqual(parseSchedule("XYZ 10:00-12:00; LUN 25:00-26:00; MAR 10:00; MIE 12:00-10:00; JUE 10:00-12:00"), [{ day: 4, start: 600, end: 720 }]);
  assert.deepEqual(parseSchedule(";;"), []);
});

test("week: Mon–Fri columns, slots sorted by start, course data on each slot", () => {
  const week = buildWeek([
    course("web", "Aplicaciones Web II", [{ schedule: "LUN 13:00-15:00; MIE 15:30-18:00" }]),
    course("lab", "Laboratorio de programación", [{ schedule: "LUN 08:00-10:00", room: "Lab. 105" }], "focus"),
  ]);
  assert.deepEqual(week.map((column) => column.day), [1, 2, 3, 4, 5]);
  assert.deepEqual(week[0].slots.map((slot) => [slot.courseId, slot.start, slot.room]), [["lab", 480, "Lab. 105"], ["web", 780, "Sala 1"]]);
  assert.deepEqual(week[0].slots[0], { courseId: "lab", courseName: "Laboratorio de programación", color: "focus", group: "Grupo A", room: "Lab. 105", day: 1, start: 480, end: 600 });
  assert.equal(week[2].slots.length, 1);
  assert.equal(week[1].slots.length, 0);
});

test("week: two groups of the same course with the same day/time/room appear once", () => {
  const week = buildWeek([course("web", "Web", [{ schedule: "LUN 13:00-15:00", group: "A" }, { schedule: "LUN 13:00-15:00", group: "B" }, { schedule: "LUN 13:00-15:00", room: "Sala 2", group: "C" }])]);
  assert.deepEqual(week[0].slots.map((slot) => [slot.group, slot.room]), [["A", "Sala 1"], ["C", "Sala 2"]]);
});

test("week: Saturday column only when some class falls on Saturday", () => {
  assert.deepEqual(buildWeek([course("a", "A", [{ schedule: "LUN 10:00-12:00" }])]).map((column) => column.day), [1, 2, 3, 4, 5]);
  assert.deepEqual(buildWeek([course("a", "A", [{ schedule: "SAB 10:00-12:00" }])]).map((column) => column.day), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(buildWeek([]).map((column) => column.day), [1, 2, 3, 4, 5]);
  assert.deepEqual(buildWeek([course("a", "A", [{ schedule: "DOM 10:00-12:00" }])]).map((column) => column.day), [1, 2, 3, 4, 5, 0]);
});

test("next class: later today, else the next day with a class, wrapping the week", () => {
  const courses = [course("web", "Web", [{ schedule: "LUN 13:00-15:00; MIE 15:30-18:00" }]), course("fun", "Fundamentos", [{ schedule: "JUE 15:00-18:00" }])];
  const monday = nextClass(courses, at(2, 9));
  assert.equal(monday?.slot.courseId, "web");
  assert.equal(monday?.slot.start, 780);
  assert.equal(monday?.daysAhead, 0);
  const afterMonday = nextClass(courses, at(2, 13, 0));
  assert.deepEqual([afterMonday?.slot.day, afterMonday?.daysAhead], [3, 2]);
  const thursdayLate = nextClass(courses, at(5, 19));
  assert.deepEqual([thursdayLate?.slot.courseId, thursdayLate?.slot.day, thursdayLate?.daysAhead], ["web", 1, 4]);
  const onlyMonday = [course("web", "Web", [{ schedule: "LUN 13:00-15:00" }])];
  assert.deepEqual([nextClass(onlyMonday, at(2, 16))?.slot.day, nextClass(onlyMonday, at(2, 16))?.daysAhead], [1, 7]);
});

test("next class: null when nothing parses", () => {
  assert.equal(nextClass([course("x", "X", [{ schedule: "Por definir" }])], at(2, 9)), null);
  assert.equal(nextClass([{ id: "y", name: "Y", color: "primary", students: 0 }], at(2, 9)), null);
});

test("next class label: time only today, weekday and time otherwise", () => {
  const courses = [course("web", "Web", [{ schedule: "LUN 13:00-15:00; JUE 15:00-18:00" }])];
  assert.equal(nextClassLabel(nextClass(courses, at(2, 9))!), "Próxima clase · 13:00");
  assert.equal(nextClassLabel(nextClass(courses, at(2, 16))!), "Próxima clase · jueves 15:00");
});

test("Spanish weekday names, short labels and HH:MM", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(weekdayName), ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]);
  assert.deepEqual([1, 3, 6].map(dayLabel), ["Lun", "Mié", "Sáb"]);
  assert.equal(weekdayName(at(2, 9).getDay()), "lunes");
  assert.equal(formatTime(480), "08:00");
  assert.equal(formatTime(1050), "17:30");
});
