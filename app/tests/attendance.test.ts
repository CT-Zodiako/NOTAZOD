import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absenceLabel,
  applyCorrection,
  courseTotalLabel,
  defaultSessionTiming,
  describeHistoryEntry,
  formatSessionDate,
  lateArrivalStates,
  resizeStates,
  rollCallDefaults,
  rollCallSummary,
  sessionLabel,
  stateCounts,
  toggleHour,
  toggleStudent,
} from "../src/lib/attendance.ts";

// 2026-11-05 is a jueves, 2026-11-06 a viernes, 2026-11-08 a domingo.
test("default timing (S2): the weekday's Campus segment gives the start and the hours", () => {
  assert.deepEqual(defaultSessionTiming(["JUE 15:00-18:00; VIE 14:00-17:00"], "2026-11-05"), { startTime: "15:00", hours: 3 });
  assert.deepEqual(defaultSessionTiming(["JUE 15:00-18:00; VIE 14:00-17:00"], "2026-11-06"), { startTime: "14:00", hours: 3 });
  assert.deepEqual(defaultSessionTiming(["LUN 16:00-18:00"], "2026-11-02"), { startTime: "16:00", hours: 2 });
});

test("default timing (S2): when several groups or segments match the weekday, the longest wins", () => {
  assert.deepEqual(defaultSessionTiming(["JUE 07:00-09:00", "JUE 13:00-17:00; JUE 18:00-19:00"], "2026-11-05"), { startTime: "13:00", hours: 4 });
  assert.deepEqual(defaultSessionTiming(["JUE 18:00-19:00; JUE 08:00-11:00"], "2026-11-05"), { startTime: "08:00", hours: 3 });
});

test("default timing (S2): no schedule, no class that weekday or an invalid date default to 2 hours and no start", () => {
  assert.deepEqual(defaultSessionTiming([], "2026-11-05"), { startTime: null, hours: 2 });
  assert.deepEqual(defaultSessionTiming(["LUN 16:00-18:00"], "2026-11-08"), { startTime: null, hours: 2 });
  assert.deepEqual(defaultSessionTiming(["sin horario"], "2026-11-05"), { startTime: null, hours: 2 });
  assert.deepEqual(defaultSessionTiming(["JUE 15:00-18:00"], "no es fecha"), { startTime: null, hours: 2 });
});

test("default timing (S2): partial hours round to whole class hours within 1-6", () => {
  assert.deepEqual(defaultSessionTiming(["MAR 13:00-17:30"], "2026-11-03"), { startTime: "13:00", hours: 5 });
  assert.deepEqual(defaultSessionTiming(["MAR 13:00-13:20"], "2026-11-03"), { startTime: "13:00", hours: 1 });
  assert.deepEqual(defaultSessionTiming(["MAR 06:00-20:00"], "2026-11-03"), { startTime: "06:00", hours: 6 });
});

test("roll call defaults (S2): today's date, the Campus timing, else the current hour and 2 hours", () => {
  assert.deepEqual(rollCallDefaults(["JUE 15:00-18:00"], new Date(2026, 10, 5, 15, 20)), { date: "2026-11-05", startTime: "15:00", hours: 3 });
  assert.deepEqual(rollCallDefaults(["JUE 15:00-18:00"], new Date(2026, 10, 6, 9, 41)), { date: "2026-11-06", startTime: "09:00", hours: 2 });
  assert.deepEqual(rollCallDefaults([], new Date(2026, 0, 2, 7, 5)), { date: "2026-01-02", startTime: "07:00", hours: 2 });
});

test("late arrival (S3): hours before the arrival hour are absent, the rest present", () => {
  assert.deepEqual(lateArrivalStates(3, 2), ["absent", "present", "present"]);
  assert.deepEqual(lateArrivalStates(3, 3), ["absent", "absent", "present"]);
  assert.deepEqual(lateArrivalStates(3, 1), ["present", "present", "present"]);
  assert.deepEqual(lateArrivalStates(1, 1), ["present"]);
});

for (const [hours, arrival] of [[3, 0], [3, 4], [3, 1.5], [3, Number.NaN]] as const) {
  test(`late arrival (S7): arrival hour ${arrival} of ${hours} is rejected`, () => {
    assert.throws(() => lateArrivalStates(hours, arrival), { message: `Arrival hour out of range: ${arrival}` });
  });
}

test("corrections (S3, S4): late, excuse and present produce the new per-hour states", () => {
  assert.deepEqual(applyCorrection(["absent", "absent", "absent"], { action: "late", arrivalHour: 2 }), ["absent", "present", "present"]);
  assert.deepEqual(applyCorrection(["absent", "present", "absent"], { action: "excuse", motive: "Incapacidad médica" }), ["justified", "present", "justified"]);
  assert.deepEqual(applyCorrection(["justified", "absent"], { action: "excuse", motive: "Permiso" }), ["justified", "justified"]);
  assert.deepEqual(applyCorrection(["absent", "justified", "present"], { action: "present" }), ["present", "present", "present"]);
  assert.deepEqual(applyCorrection(["justified", "justified"], { action: "late", arrivalHour: 2 }), ["absent", "present"]);
});

test("corrections (S7): an excuse needs a motive, unknown actions and no-op corrections are rejected", () => {
  assert.throws(() => applyCorrection(["absent"], { action: "excuse", motive: "   " }), { message: "An excuse needs a motive" });
  assert.throws(() => applyCorrection(["absent"], { action: "excuse", motive: "" }), { message: "An excuse needs a motive" });
  assert.throws(() => applyCorrection(["absent"], { action: "borrar" } as never), { message: "Unknown attendance correction: borrar" });
  assert.throws(() => applyCorrection(["present", "present"], { action: "present" }), { message: "The correction does not change any hour" });
  assert.throws(() => applyCorrection(["present", "justified"], { action: "excuse", motive: "Permiso" }), { message: "The correction does not change any hour" });
  assert.throws(() => applyCorrection(["absent", "present"], { action: "late", arrivalHour: 2 }), { message: "The correction does not change any hour" });
  assert.throws(() => applyCorrection(["absent", "absent"], { action: "late", arrivalHour: 3 }), { message: "Arrival hour out of range: 3" });
});

test("roll call (S1): tapping a name toggles every hour, tapping an hour toggles only that hour", () => {
  assert.deepEqual(toggleStudent(["present", "present", "present"]), ["absent", "absent", "absent"]);
  assert.deepEqual(toggleStudent(["absent", "present", "present"]), ["absent", "absent", "absent"]);
  assert.deepEqual(toggleStudent(["absent", "absent"]), ["present", "present"]);
  assert.deepEqual(toggleHour(["present", "present", "present"], 1), ["present", "absent", "present"]);
  assert.deepEqual(toggleHour(["absent", "present"], 0), ["present", "present"]);
});

test("roll call (S2): changing the hours keeps the marked hours and adds present ones", () => {
  assert.deepEqual(resizeStates(["absent", "present"], 4), ["absent", "present", "present", "present"]);
  assert.deepEqual(resizeStates(["absent", "present", "absent"], 2), ["absent", "present"]);
});

test("roll call summary (S1): presentes, con faltas and faltas en total", () => {
  assert.equal(rollCallSummary([["present", "present"], ["absent", "absent"], ["absent", "present"]]), "1 presentes · 2 con faltas · 3 faltas en total");
  assert.equal(rollCallSummary([["present"], ["absent"]]), "1 presentes · 1 con faltas · 1 falta en total");
  assert.equal(rollCallSummary([["present"], ["present"]]), "2 presentes · 0 con faltas · 0 faltas en total");
  assert.equal(rollCallSummary([]), "0 presentes · 0 con faltas · 0 faltas en total");
});

test("totals (S2, S4): absent hours count, justified hours do not", () => {
  assert.deepEqual(stateCounts(["absent", "justified", "present", "absent"]), { present: 1, absent: 2, justified: 1 });
  assert.deepEqual(stateCounts([]), { present: 0, absent: 0, justified: 0 });
});

test("labels (S6): session pill, absences of a class and course total", () => {
  assert.equal(sessionLabel(0), "Completo");
  assert.equal(sessionLabel(1), "1 ausente");
  assert.equal(sessionLabel(4), "4 ausentes");
  assert.equal(absenceLabel(0), "Presente");
  assert.equal(absenceLabel(1), "1 falta");
  assert.equal(absenceLabel(3), "3 faltas");
  assert.equal(courseTotalLabel(5, 12), "5 / 12 h");
  assert.equal(formatSessionDate("2026-10-29"), "Jue 29 oct");
  assert.equal(formatSessionDate("2026-11-06"), "Vie 6 nov");
});

test("history (S5): each correction is described with the absences it replaced", () => {
  assert.equal(describeHistoryEntry({ action: "late", motive: null, beforeStates: ["absent", "absent", "absent"], afterStates: ["absent", "present", "present"] }), "Llegó tarde: presente desde la hora 2 (antes 3 faltas)");
  assert.equal(describeHistoryEntry({ action: "excuse", motive: "Incapacidad médica", beforeStates: ["absent", "absent", "absent"], afterStates: ["justified", "justified", "justified"] }), "Justificada: Incapacidad médica (antes 3 faltas)");
  assert.equal(describeHistoryEntry({ action: "present", motive: null, beforeStates: ["absent", "present"], afterStates: ["present", "present"] }), "Sí vino: presente en todas las horas (antes 1 falta)");
});

// Design 04 / S8: the correction dialog edits the hours directly and saves them as one "edit" correction.
import { hourRangeLabel, toggleCorrectionHour } from "../src/lib/attendance.ts";

test("edit (S8): any present/absent combination of the session's hours is stored as given", () => {
  assert.deepEqual(applyCorrection(["present", "present", "present"], { action: "edit", states: ["present", "present", "absent"] }), ["present", "present", "absent"]);
  assert.deepEqual(applyCorrection(["present", "absent", "present"], { action: "edit", states: ["absent", "absent", "absent"] }), ["absent", "absent", "absent"]);
  assert.deepEqual(applyCorrection(["absent", "absent", "absent"], { action: "edit", states: ["absent", "present", "present"] }), ["absent", "present", "present"]);
  assert.deepEqual(applyCorrection(["justified", "absent"], { action: "edit", states: ["absent", "present"] }), ["absent", "present"]);
});

test("edit (S8): a justified hour left untouched stays justified while other hours change", () => {
  assert.deepEqual(applyCorrection(["justified", "absent", "absent"], { action: "edit", states: ["justified", "present", "absent"] }), ["justified", "present", "absent"]);
});

for (const [label, before, states, message] of [
  ["a no-op", ["absent", "present"], ["absent", "present"], "The correction does not change any hour"],
  ["too few hours", ["absent", "present"], ["present"], "An edit needs one state per hour"],
  ["too many hours", ["absent", "present"], ["present", "present", "present"], "An edit needs one state per hour"],
  ["no states", ["absent", "present"], undefined, "An edit needs one state per hour"],
  ["an unknown state", ["absent", "present"], ["present", "late"], "Invalid attendance state for hour 2: late"],
  ["a new justified hour", ["absent", "present"], ["justified", "present"], "Invalid attendance state for hour 1: justified"],
] as const) {
  test(`edit (S8): ${label} is rejected`, () => {
    assert.throws(() => applyCorrection([...before], { action: "edit", states: states as never }), { message });
  });
}

test("history (S8): an edit shows the new hours and the absences it replaced", () => {
  assert.equal(describeHistoryEntry({ action: "edit", motive: null, beforeStates: ["absent", "absent", "absent"], afterStates: ["absent", "present", "present"] }), "Corregida: F ✓ ✓ (antes 3 faltas)");
  assert.equal(describeHistoryEntry({ action: "edit", motive: null, beforeStates: ["present", "present", "present"], afterStates: ["present", "present", "absent"] }), "Corregida: ✓ ✓ F (antes 0 faltas)");
  assert.equal(describeHistoryEntry({ action: "edit", motive: null, beforeStates: ["justified", "present"], afterStates: ["justified", "absent"] }), "Corregida: J F (antes 0 faltas)");
});

test("correction: tapping an hour toggles absent and present; a justified hour becomes present", () => {
  assert.deepEqual(toggleCorrectionHour(["absent", "present", "justified"], 0), ["present", "present", "justified"]);
  assert.deepEqual(toggleCorrectionHour(["absent", "present", "justified"], 1), ["absent", "absent", "justified"]);
  assert.deepEqual(toggleCorrectionHour(["absent", "present", "justified"], 2), ["absent", "present", "present"]);
});

test("correction: each hour shows its real time range from the session start", () => {
  assert.equal(hourRangeLabel("15:00", 0), "15:00–16:00");
  assert.equal(hourRangeLabel("15:00", 2), "17:00–18:00");
  assert.equal(hourRangeLabel("7:30", 1), "08:30–09:30");
  assert.equal(hourRangeLabel("bad", 0), "");
});
