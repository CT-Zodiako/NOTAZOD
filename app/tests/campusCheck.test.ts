import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCampusData, checkUploaded, matchGroup, verifyGroup } from "../src/lib/campusGrades.ts";

test("check: the same grade in the Campus is uploaded", () => {
  assert.equal(checkUploaded("4,7", 4.7), "uploaded");
  assert.equal(checkUploaded(" 4,7 ", 4.66), "uploaded");
  assert.equal(checkUploaded("5", 5), "uploaded");
  assert.equal(checkUploaded("4.7", 4.7), "uploaded");
});

test("check: a 0,0 grade counts as uploaded when NOTAZOD is also 0,0", () => {
  assert.equal(checkUploaded("0,0", 0), "uploaded");
  assert.equal(checkUploaded("0", 0.04), "uploaded");
});

test("check: an empty Campus cell is missing, whatever NOTAZOD has", () => {
  assert.equal(checkUploaded("", 4.7), "missing");
  assert.equal(checkUploaded("  ", 0), "missing");
});

test("check: 0,0 in the Campus while NOTAZOD has a grade is missing", () => {
  assert.equal(checkUploaded("0,0", 3.2), "missing");
  assert.equal(checkUploaded("0", 3.2), "missing");
});

test("check: another value in the Campus is different", () => {
  assert.equal(checkUploaded("4,5", 4.7), "different");
  assert.equal(checkUploaded("3,0", 0), "different");
  assert.equal(checkUploaded("abc", 4.7), "different");
});

const courses = [
  { id: "c1", name: "Fundamentos", codes: new Set(["1", "2", "3"]) },
  { id: "c2", name: "POO", codes: new Set(["10", "11"]) },
];

test("check: a group matches its course without needing an open column", () => {
  const result = matchGroup({ name: "G1", codes: ["1", "2"] }, courses);
  assert.equal(result.status, "verified");
  assert.equal(result.courseId, "c1");
  assert.deepEqual(result.notInCampus, ["3"]);
});

test("check: a group with a code outside the course fails, an unknown group is unmatched", () => {
  const failed = matchGroup({ name: "G1", codes: ["1", "99"] }, courses);
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.missingCodes, ["99"]);
  assert.equal(matchGroup({ name: "G9", codes: ["98", "99"] }, courses).status, "unmatched");
});

test("check: verifyGroup still fails a matched group without an open column", () => {
  const result = verifyGroup({ name: "G1", codes: ["1", "2"], openColumn: null }, courses);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "no single open period column in the Campus form");
});

test("check: a period has grades only when one of its items has a grade", () => {
  const data = buildCampusData({
    courses: [{ id: "c1", name: "Fundamentos" }],
    students: [{ id: "s1", courseId: "c1", fullName: "Ana", code: "1" }],
    periods: [
      { id: "p1", courseId: "c1", number: 1, activityPercent: 40, examPercent: 60, closed: 1 },
      { id: "p2", courseId: "c1", number: 2, activityPercent: 40, examPercent: 60, closed: 0 },
    ],
    items: [{ id: "i1", periodId: "p1", isExam: 0 }, { id: "i2", periodId: "p2", isExam: 0 }],
    grades: [{ studentId: "s1", itemId: "i1", value: 4, pending: 0 }],
  });
  assert.equal(data.periodHasGrades("c1", 1), true);
  assert.equal(data.periodHasGrades("c1", 2), false);
  assert.equal(data.periodHasGrades("c1", 3), false);
});
