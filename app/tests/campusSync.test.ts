import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSemester, planCourseSync } from "../src/lib/campusSync.ts";

const student = (code, overrides = {}) => ({
  fullName: `Student ${code}`,
  code,
  documentId: `doc-${code}`,
  institutionalEmail: `s${code}@unimayor.edu.co`,
  personalEmail: `s${code}@gmail.com`,
  ...overrides,
});
const existingStudent = (code, overrides = {}) => ({ id: `id-${code}`, courseId: "c", ...student(code), ...overrides });
const group = (key, codes, extra = {}) => ({
  key,
  program: "TECNOLOGIA",
  group: key,
  module: `MODULE ${key}`,
  students: codes.map((code) => student(code)),
  expectedCount: codes.length,
  ...extra,
});

test("currentSemester follows the year-half convention used by existing courses", () => {
  assert.equal(currentSemester(new Date(2026, 10, 1)), "2026-2");
  assert.equal(currentSemester(new Date(2026, 2, 1)), "2026-1");
});

test("S2: a group with no matching course becomes a new course in the current semester", () => {
  const plan = planCourseSync([group("G1", ["1", "2"], { module: "LABORATORIO DE PROGRAMACIÓN" })], [], "2026-2");
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, "create");
  assert.equal(plan[0].courseName, "LABORATORIO DE PROGRAMACIÓN");
  assert.equal(plan[0].semester, "2026-2");
  assert.deepEqual(plan[0].toAdd.map((s) => s.code), ["1", "2"]);
});

test("S1: the course name uses the first module when the Campus lists several", () => {
  const plan = planCourseSync([group("G1", ["1"], { module: "FUNDAMENTOS DE PROGRAMACION; FUNDAMENTOS DE PROGRAMACIÓN" })], [], "2026-2");
  assert.equal(plan[0].courseName, "FUNDAMENTOS DE PROGRAMACION");
});

test("S2: a matched course only receives the students it is missing", () => {
  const courses = [{ id: "poo", name: "POO", semester: "2026-2", students: [existingStudent("1"), existingStudent("2")] }];
  const plan = planCourseSync([group("G1", ["1", "2", "3"])], courses, "2026-2");
  assert.equal(plan[0].kind, "add");
  assert.equal(plan[0].courseId, "poo");
  assert.deepEqual(plan[0].toAdd.map((s) => s.code), ["3"]);
});

test("S2: groups split from one NOTAZOD course merge into one action and report students not in the Campus", () => {
  const courses = [{ id: "fund", name: "Fundamentos", semester: "2026-2", students: ["1", "2", "3", "4", "9"].map((c) => existingStudent(c)) }];
  const plan = planCourseSync([group("A", ["1", "2"]), group("B", ["3", "4", "5"])], courses, "2026-2");
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].groupKeys, ["A", "B"]);
  assert.deepEqual(plan[0].toAdd.map((s) => s.code), ["5"]);
  assert.deepEqual(plan[0].notInCampus, ["9"]);
});

test("S2: a matched course with nothing missing is reported as up to date", () => {
  const courses = [{ id: "poo", name: "POO", semester: "2026-2", students: [existingStudent("1")] }];
  const plan = planCourseSync([group("G1", ["1"])], courses, "2026-2");
  assert.equal(plan[0].kind, "add");
  assert.equal(plan[0].toAdd.length, 0);
});

test("S2: one student shared with another course does not change the match", () => {
  const courses = [
    { id: "lab", name: "Lab", semester: "2026-2", students: ["1", "2", "3"].map((c) => existingStudent(c)) },
    { id: "poo", name: "POO", semester: "2026-2", students: [existingStudent("3")] },
  ];
  const plan = planCourseSync([group("G1", ["1", "2", "3", "4"])], courses, "2026-2");
  assert.equal(plan[0].kind, "add");
  assert.equal(plan[0].courseId, "lab");
});

test("S2: a course holding less than half of the group is not treated as the same course", () => {
  const courses = [{ id: "poo", name: "POO", semester: "2026-2", students: [existingStudent("3")] }];
  const plan = planCourseSync([group("LAB", ["1", "2", "3", "4"])], courses, "2026-2");
  assert.equal(plan[0].kind, "conflict");
});

test("S2: a group split evenly across two courses is a conflict and adds nothing", () => {
  const courses = [
    { id: "a", name: "A", semester: "2026-2", students: [existingStudent("1")] },
    { id: "b", name: "B", semester: "2026-2", students: [existingStudent("2")] },
  ];
  const plan = planCourseSync([group("G1", ["1", "2"])], courses, "2026-2");
  assert.equal(plan[0].kind, "conflict");
});

test("S2: courses from another semester are not matched", () => {
  const courses = [{ id: "old", name: "POO", semester: "2026-1", students: [existingStudent("1")] }];
  const plan = planCourseSync([group("G1", ["1"], { module: "POO" })], courses, "2026-2");
  assert.equal(plan[0].kind, "create");
});

test("S1: a group whose read count differs from the Campus total is a conflict", () => {
  const plan = planCourseSync([group("G1", ["1", "2"], { expectedCount: 3 })], [], "2026-2");
  assert.equal(plan[0].kind, "conflict");
  assert.match(plan[0].reason, /2.*3/);
});

test("S1: students with missing or invalid emails, or clashing with an existing student, are skipped with a reason", () => {
  const courses = [{ id: "poo", name: "POO", semester: "2026-2", students: ["1", "6", "7", "8"].map((c) => existingStudent(c)) }];
  const campus = group("G1", ["1", "6", "7", "8"]);
  campus.students.push(student("2", { personalEmail: "" }), student("3", { institutionalEmail: "bad" }), student("4", { documentId: "doc-1" }), student("5"));
  campus.expectedCount = 8;
  const plan = planCourseSync([campus], courses, "2026-2");
  assert.deepEqual(plan[0].toAdd.map((s) => s.code), ["5"]);
  assert.deepEqual(plan[0].skipped.map((s) => s.row.code), ["2", "3", "4"]);
});

test("S2: new course names never clash with an existing or another new course", () => {
  const courses = [{ id: "x", name: "POO", semester: "2026-2", students: [existingStudent("99")] }];
  const plan = planCourseSync([group("A", ["1"], { module: "POO", group: "GRUPO A" }), group("B", ["2"], { module: "FUND", group: "GRUPO B" }), group("C", ["3"], { module: "FUND", group: "GRUPO C" })], courses, "2026-2");
  assert.deepEqual(plan.map((p) => p.courseName), ["POO - GRUPO A", "FUND - GRUPO B", "FUND - GRUPO C"]);
});

const withPast = (key, codes, values, extra = {}) => ({ ...group(key, codes), openColumn: 2, pastGrades: [{ period: 1, values }], ...extra });

test("S4: a new course imports the grades of the periods before the open one", () => {
  const plan = planCourseSync([withPast("G1", ["1", "2"], { "1": "4,9", "2": "0,0" })], [], "2026-2");
  assert.deepEqual(plan[0].periodImports, [{ period: 1, grades: [{ code: "1", value: 4.9 }, { code: "2", value: 0 }] }]);
  assert.deepEqual(plan[0].periodSkips, []);
});

test("S4: a period that already has grades in NOTAZOD is never imported", () => {
  const courses = [{ id: "poo", name: "POO", semester: "2026-2", gradedPeriods: [1], students: [existingStudent("1"), existingStudent("2")] }];
  const plan = planCourseSync([withPast("G1", ["1", "2"], { "1": "4,9", "2": "5,0" })], courses, "2026-2");
  assert.deepEqual(plan[0].periodImports, []);
  assert.equal(plan[0].periodSkips[0].period, 1);
  assert.match(plan[0].periodSkips[0].reason, /ya tiene notas/);
});

test("S4: an existing course without grades in the period imports for its students and the new ones, merging split groups", () => {
  const courses = [{ id: "fund", name: "Fundamentos", semester: "2026-2", gradedPeriods: [], students: ["1", "2", "3", "4", "9"].map((c) => existingStudent(c)) }];
  const plan = planCourseSync([withPast("A", ["1", "2"], { "1": "3,5", "2": "4,0" }), withPast("B", ["3", "4", "5"], { "3": "2,8", "4": "3,0", "5": "4,1" })], courses, "2026-2");
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].periodImports, [{ period: 1, grades: [{ code: "1", value: 3.5 }, { code: "2", value: 4 }, { code: "3", value: 2.8 }, { code: "4", value: 3 }, { code: "5", value: 4.1 }] }]);
});

test("S4: skipped students and unreadable values are not imported", () => {
  const campus = withPast("G1", ["1", "2", "3"], { "1": "4,0", "2": "abc", "3": "3,0" });
  campus.students[2].personalEmail = "";
  const plan = planCourseSync([campus], [], "2026-2");
  assert.deepEqual(plan[0].periodImports[0].grades, [{ code: "1", value: 4 }]);
});

test("S4: without an identified open period nothing is imported and it is reported", () => {
  const plan = planCourseSync([withPast("G1", ["1"], { "1": "4,0" }, { openColumn: null })], [], "2026-2");
  assert.deepEqual(plan[0].periodImports, []);
  assert.match(plan[0].periodSkips[0].reason, /corte abierto/);
});
