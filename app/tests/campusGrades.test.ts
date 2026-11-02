import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCampusData, formatGrade, periodGrade, planUpload, scopeToCourse, verifyGroup } from "../src/lib/campusGrades.ts";

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

test("S5: a course-scoped upload keeps only the groups of that course", () => {
  const results = [
    { key: "fund-a", status: "verified", courseId: "fund" },
    { key: "poo", status: "verified", courseId: "poo" },
    { key: "fund-b", status: "verified", courseId: "fund" },
    { key: "other", status: "unmatched" },
  ];
  assert.deepEqual(scopeToCourse(results, "fund").map((r) => r.key), ["fund-a", "fund-b"]);
  assert.equal(planUpload(scopeToCourse(results, "fund")).canSave, true);
});

test("S5: a failed group of another course does not block the selected course", () => {
  const results = [
    { key: "fund-a", status: "verified", courseId: "fund" },
    { key: "poo", status: "failed", courseId: "poo" },
  ];
  assert.equal(planUpload(scopeToCourse(results, "fund")).canSave, true);
});

test("S5: a failed group of the selected course blocks the save", () => {
  const results = [
    { key: "fund-a", status: "verified", courseId: "fund" },
    { key: "fund-b", status: "failed", courseId: "fund" },
  ];
  assert.equal(planUpload(scopeToCourse(results, "fund")).canSave, false);
});

test("S5: an ambiguous group that could belong to the selected course blocks the save", () => {
  const overlapping = [
    { id: "fund", name: "Fundamentos", codes: new Set(["1", "2"]) },
    { id: "lab", name: "Laboratorio", codes: new Set(["1", "2"]) },
  ];
  const ambiguous = { key: "g", ...verifyGroup({ name: "g", codes: ["1", "2"], openColumn: 2 }, overlapping) };
  const results = [{ key: "fund-a", status: "verified", courseId: "fund" }, ambiguous];
  assert.equal(planUpload(scopeToCourse(results, "fund")).canSave, false);
  assert.equal(planUpload(scopeToCourse(results, "poo")).canSave, false);
});

test("S5: without a course the scope is every group", () => {
  const results = [{ key: "a", status: "verified", courseId: "fund" }, { key: "b", status: "failed", courseId: "poo" }];
  assert.equal(scopeToCourse(results, undefined).length, 2);
});

test("S3: buildCampusData exposes course codes and period grades from database rows", () => {
  const data = buildCampusData({
    courses: [{ id: "c1", name: "POO" }],
    students: [{ id: "s1", courseId: "c1", fullName: "Ana", code: " 220126027 " }],
    periods: [{ id: "p2", courseId: "c1", number: 2, activityPercent: 40, examPercent: 60, closed: 1 }],
    items: [{ id: "i1", periodId: "p2", isExam: 0 }, { id: "i2", periodId: "p2", isExam: 1 }],
    grades: [{ studentId: "s1", itemId: "i1", value: 4.5, pending: 0 }, { studentId: "s1", itemId: "i2", value: 5, pending: 0 }],
  });
  assert.deepEqual([...data.courses[0].codes], ["220126027"]);
  // 4.5 * 0.4 + 5 * 0.6 = 4.8
  assert.equal(formatGrade(data.gradeFor("c1", 2, "220126027") ?? -1), "4,8");
  assert.equal(data.gradeFor("c1", 3, "220126027"), null);
  assert.equal(data.gradeFor("c1", 2, "999"), null);
  assert.equal(data.periodInfo("c1", 2)?.closed, 1);
});
