import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { formatGrade, loadNotazod, periodGrade, planUpload, verifyGroup } from "./grades.mjs";

const period = { activityPercent: 40, examPercent: 60 };
const items = [
  { id: "a1", isExam: 0 },
  { id: "a2", isExam: 0 },
  { id: "ex", isExam: 1 },
];

test("S3: period grade weights the activity average and the exam", () => {
  const grades = new Map([["a1", { value: 5, pending: 0 }], ["a2", { value: 4, pending: 0 }], ["ex", { value: 3, pending: 0 }]]);
  // (5 + 4) / 2 * 0.4 + 3 * 0.6 = 1.8 + 1.8
  assert.equal(periodGrade(period, items, grades), 3.6);
});

test("S3: missing and pending grades count as 0,0", () => {
  const grades = new Map([["a1", { value: 5, pending: 0 }], ["a2", { value: 4, pending: 1 }]]);
  // (5 + 0) / 2 * 0.4 + 0 * 0.6
  assert.equal(periodGrade(period, items, grades), 1);
});

test("S3: a period without activities or exam is 0,0", () => {
  assert.equal(periodGrade(period, [], new Map()), 0);
});

test("S3: grades are written with one decimal and a comma", () => {
  assert.equal(formatGrade(4.7), "4,7");
  assert.equal(formatGrade(5), "5,0");
  assert.equal(formatGrade(0), "0,0");
  assert.equal(formatGrade(3.44), "3,4");
});

const courses = [
  { id: "poo", name: "POO", codes: new Set(["1", "2", "3"]) },
  { id: "fund", name: "Fundamentos", codes: new Set(["10", "11", "12", "13"]) },
];

test("S2: a group is verified when every code belongs to one NOTAZOD course", () => {
  const result = verifyGroup({ name: "G1", codes: ["1", "2", "3"], openColumn: 2 }, courses);
  assert.deepEqual(result, { status: "verified", courseId: "poo", missingCodes: [], notInCampus: [] });
});

test("S2: a Campus group may be a subset of a NOTAZOD course (split groups)", () => {
  const result = verifyGroup({ name: "G2", codes: ["10", "11"], openColumn: 2 }, courses);
  assert.equal(result.status, "verified");
  assert.equal(result.courseId, "fund");
  assert.deepEqual(result.notInCampus, ["12", "13"]);
});

test("S2: a group with codes missing from the matched course fails", () => {
  const result = verifyGroup({ name: "G3", codes: ["1", "2", "99"], openColumn: 2 }, courses);
  assert.equal(result.status, "failed");
  assert.equal(result.courseId, "poo");
  assert.deepEqual(result.missingCodes, ["99"]);
});

test("S2: a group whose codes are spread across courses fails", () => {
  const result = verifyGroup({ name: "G4", codes: ["1", "10"], openColumn: 2 }, courses);
  assert.equal(result.status, "failed");
});

test("S2: a group whose codes all belong to more than one NOTAZOD course fails as ambiguous", () => {
  const overlapping = [
    { id: "poo1", name: "A POO I", codes: new Set(["1", "2", "3", "4"]) },
    { id: "poo2", name: "B POO II", codes: new Set(["1", "2", "3"]) },
  ];
  const result = verifyGroup({ name: "G7", codes: ["1", "2", "3"], openColumn: 2 }, overlapping);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /more than one NOTAZOD course/);
});

test("S2: a group with no code in NOTAZOD is unmatched, not failed", () => {
  const result = verifyGroup({ name: "G5", codes: ["500", "501"], openColumn: 2 }, courses);
  assert.equal(result.status, "unmatched");
});

test("S2: a matched group without exactly one open column fails", () => {
  const result = verifyGroup({ name: "G6", codes: ["1", "2", "3"], openColumn: null }, courses);
  assert.equal(result.status, "failed");
  assert.match(result.reason, /open period/);
});

test("S4: the plan is savable only when every matched group is verified", () => {
  const ok = planUpload([{ status: "verified" }, { status: "unmatched" }]);
  assert.equal(ok.canSave, true);
  const blocked = planUpload([{ status: "verified" }, { status: "failed" }]);
  assert.equal(blocked.canSave, false);
  const empty = planUpload([{ status: "unmatched" }]);
  assert.equal(empty.canSave, false);
});

test("S3: loadNotazod reads courses and period grades through the public schema", () => {
  const dir = mkdtempSync(join(tmpdir(), "notazod-campus-"));
  const path = join(dir, "fixture.db");
  try {
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE courses (id TEXT PRIMARY KEY, name TEXT, semester TEXT);
      CREATE TABLE students (id TEXT PRIMARY KEY, course_id TEXT, full_name TEXT, code TEXT);
      CREATE TABLE periods (id TEXT PRIMARY KEY, course_id TEXT, number INTEGER, activity_percent INTEGER, exam_percent INTEGER, closed INTEGER);
      CREATE TABLE grade_items (id TEXT PRIMARY KEY, course_id TEXT, period_id TEXT, name TEXT, is_exam INTEGER, sort_order INTEGER);
      CREATE TABLE grades (student_id TEXT, item_id TEXT, value REAL, pending INTEGER);
      INSERT INTO courses VALUES ('c1', 'POO', '2026-2');
      INSERT INTO students VALUES ('s1', 'c1', 'Ana', '220126027');
      INSERT INTO periods VALUES ('p2', 'c1', 2, 40, 60, 0);
      INSERT INTO grade_items VALUES ('i1', 'c1', 'p2', 'Taller', 0, 1), ('i2', 'c1', 'p2', 'Parcial', 1, 2);
      INSERT INTO grades VALUES ('s1', 'i1', 4.5, 0), ('s1', 'i2', 5, 0);
    `);
    db.close();
    const before = new DatabaseSync(path).prepare("SELECT count(*) AS n FROM grades").get().n;
    const data = loadNotazod(path);
    assert.equal(data.courses.length, 1);
    assert.deepEqual([...data.courses[0].codes], ["220126027"]);
    // 4.5 * 0.4 + 5 * 0.6 = 4.8
    assert.equal(formatGrade(data.gradeFor("c1", 2, "220126027")), "4,8");
    assert.equal(data.gradeFor("c1", 3, "220126027"), null);
    assert.equal(new DatabaseSync(path).prepare("SELECT count(*) AS n FROM grades").get().n, before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
