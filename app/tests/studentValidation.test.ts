import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyStudentRows } from "../src/lib/validation.ts";
import { planCourseSync } from "../src/lib/campusSync.ts";

const student = (code, overrides = {}) => ({
  fullName: `Student ${code}`,
  code,
  documentId: `doc-${code}`,
  institutionalEmail: `s${code}@unimayor.edu.co`,
  personalEmail: `s${code}@gmail.com`,
  ...overrides,
});
const existing = (code, overrides = {}) => ({ id: `id-${code}`, courseId: "c", ...student(code), ...overrides });

test("sync: a student with the same email in CORREO 1 and CORREO 2 is added", () => {
  const row = student("90221023", { personalEmail: "s90221023@unimayor.edu.co" });
  const result = classifyStudentRows([row], [existing("1")]);
  assert.deepEqual(result.valid, [row]);
  assert.deepEqual(result.duplicate, []);
});

test("sync: the same student with the same data can be in two courses", () => {
  const shared = student("90221023");
  const courses = [
    { id: "fis", name: "FISICA", semester: "2026-2", students: [existing("90221023"), existing("10"), existing("11")] },
    { id: "ele", name: "ELECTIVA", semester: "2026-2", students: [existing("20"), existing("21")] },
  ];
  const campus = { key: "G-ELE", program: "ING", group: "GRUPO A", module: "ELECTIVA IV", students: [student("20"), student("21"), shared], expectedCount: 3 };
  const plan = planCourseSync([campus], courses, "2026-2");
  assert.equal(plan[0].kind, "add");
  assert.equal(plan[0].courseId, "ele");
  assert.deepEqual(plan[0].toAdd, [shared]);
  assert.deepEqual(plan[0].skipped, []);
});

test("sync: a value already used by another student of the course names the field and that student", () => {
  const result = classifyStudentRows([student("4", { documentId: "doc-1" })], [existing("1")]);
  assert.deepEqual(result.valid, []);
  assert.equal(result.duplicate[0].reason, "Documento doc-1 ya lo tiene Student 1 (1) en este curso.");
});

test("sync: a personal email equal to another student's institutional email is still rejected", () => {
  const result = classifyStudentRows([student("4", { personalEmail: "s1@unimayor.edu.co" })], [existing("1")]);
  assert.deepEqual(result.valid, []);
  assert.equal(result.duplicate[0].reason, "Correo personal s1@unimayor.edu.co ya lo tiene Student 1 (1) en este curso.");
});

test("sync: a value repeated by an earlier row of the same list names that row", () => {
  const first = student("5");
  const result = classifyStudentRows([first, student("6", { documentId: "doc-5" })], []);
  assert.deepEqual(result.valid, [first]);
  assert.equal(result.duplicate[0].reason, "Documento doc-5 ya lo tiene Student 5 (5) en esta misma lista.");
});

test("sync: code and document equal inside one student is still rejected with a clear reason", () => {
  const result = classifyStudentRows([student("7", { documentId: "7" })], []);
  assert.deepEqual(result.valid, []);
  assert.equal(result.duplicate[0].reason, "Código y documento son iguales (7).");
});

test("sync: a rejected row leaves the existing students untouched and adds nothing to later checks", () => {
  const before = [existing("1")];
  const snapshot = JSON.stringify(before);
  const result = classifyStudentRows([student("4", { documentId: "doc-1" }), student("8", { personalEmail: "s4@gmail.com" })], before);
  assert.equal(JSON.stringify(before), snapshot);
  assert.deepEqual(result.valid.map((row) => row.code), ["8"]);
});
