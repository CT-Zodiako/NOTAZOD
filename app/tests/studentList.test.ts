import { test } from "node:test";
import assert from "node:assert/strict";
import type { CheckGroup } from "../src/lib/campus.ts";
import { campusStateFor, COURSE_COLOR_SWATCHES, countByFilter, courseColorStyle, hasPendingGrade, heatTint, isAtRisk, isMissingInCampus, matchesFilter } from "../src/lib/studentList.ts";

test("heat: a passing grade uses the passing token, 10% at 3,0 up to 55% at 5,0", () => {
  assert.deepEqual(heatTint({ value: 3, pending: 0 }), { kind: "graded", token: "--color-grade-passing", percent: 10 });
  assert.deepEqual(heatTint({ value: 5, pending: 0 }), { kind: "graded", token: "--color-grade-passing", percent: 55 });
  assert.deepEqual(heatTint({ value: 4, pending: 0 }), { kind: "graded", token: "--color-grade-passing", percent: 33 });
});

test("heat: a failing grade uses the failing token and grows towards 55% at 0,0", () => {
  assert.deepEqual(heatTint({ value: 0, pending: 0 }), { kind: "graded", token: "--color-grade-failing", percent: 55 });
  assert.deepEqual(heatTint({ value: 2.9, pending: 0 }), { kind: "graded", token: "--color-grade-failing", percent: 12 });
  assert.deepEqual(heatTint({ value: 1.5, pending: 0 }), { kind: "graded", token: "--color-grade-failing", percent: 33 });
});

test("heat: a pending grade is pending whatever its stored value, a missing grade is empty", () => {
  assert.deepEqual(heatTint({ value: 0, pending: 1 }), { kind: "pending" });
  assert.deepEqual(heatTint({ value: 4.5, pending: 1 }), { kind: "pending" });
  assert.deepEqual(heatTint(undefined), { kind: "empty" });
});

test("risk: Nota del corte below 3,0 is at risk, 3,0 is not", () => {
  assert.equal(isAtRisk(2.99), true);
  assert.equal(isAtRisk(0), true);
  assert.equal(isAtRisk(3), false);
  assert.equal(isAtRisk(4.2), false);
});

test("pending: only pending grades of the active corte items count", () => {
  const grades = [
    { studentId: "s1", itemId: "a", value: 0, pending: 1 },
    { studentId: "s1", itemId: "b", value: 4, pending: 0 },
    { studentId: "s2", itemId: "old", value: 0, pending: 1 },
  ];
  assert.equal(hasPendingGrade(grades, "s1", ["a", "b"]), true);
  assert.equal(hasPendingGrade(grades, "s1", ["b"]), false);
  assert.equal(hasPendingGrade(grades, "s2", ["a", "b"]), false);
  assert.equal(hasPendingGrade(grades, "s3", ["a", "b"]), false);
});

const groups = [
  { key: "G1", status: "verified", courseId: "c1", periods: [1, 2], rows: [
    { code: "100", name: "Ana", period: 1, campus: "4,0", notazod: "4,0", state: "uploaded" },
    { code: "100", name: "Ana", period: 2, campus: "", notazod: "3,5", state: "missing" },
    { code: "200", name: "Beto", period: 2, campus: "3,0", notazod: "3,2", state: "different" },
  ] },
  { key: "G2", status: "verified", courseId: "c2", periods: [2], rows: [
    { code: "300", name: "Caro", period: 2, campus: "", notazod: "2,0", state: "missing" },
    { code: "100", name: "Ana", period: 2, campus: "5,0", notazod: "5,0", state: "uploaded" },
  ] },
  { key: "G3", status: "failed", courseId: "c1", periods: [], rows: [
    { code: "400", name: "Dani", period: 2, campus: "", notazod: "1,0", state: "missing" },
  ] },
] as CheckGroup[];

test("campus: looks up the state for course, corte and student code", () => {
  assert.equal(campusStateFor(groups, "c1", 1, "100"), "uploaded");
  assert.equal(campusStateFor(groups, "c1", 2, "100"), "missing");
  assert.equal(campusStateFor(groups, "c1", 2, "200"), "different");
  assert.equal(campusStateFor(groups, "c2", 2, "100"), "uploaded");
});

test("campus: no result is null (other course, other corte, unverified group, no run)", () => {
  assert.equal(campusStateFor(groups, "c1", 3, "100"), null);
  assert.equal(campusStateFor(groups, "c1", 2, "300"), null);
  assert.equal(campusStateFor(groups, "c1", 2, "400"), null);
  assert.equal(campusStateFor(null, "c1", 2, "100"), null);
  assert.equal(campusStateFor(groups, "c1", 2, " 200 "), "different");
});

test("campus: missing and different are not uploaded, uploaded and no result are not", () => {
  assert.equal(isMissingInCampus("missing"), true);
  assert.equal(isMissingInCampus("different"), true);
  assert.equal(isMissingInCampus("uploaded"), false);
  assert.equal(isMissingInCampus(null), false);
});

const statuses = [
  { periodGrade: 4.1, hasPending: false, campus: "uploaded" as const },
  { periodGrade: 2.4, hasPending: true, campus: "different" as const },
  { periodGrade: 1.8, hasPending: false, campus: "missing" as const },
  { periodGrade: 3.6, hasPending: true, campus: null },
];

test("filters: each filter keeps the matching students", () => {
  assert.deepEqual(statuses.map((status) => matchesFilter("all", status)), [true, true, true, true]);
  assert.deepEqual(statuses.map((status) => matchesFilter("risk", status)), [false, true, true, false]);
  assert.deepEqual(statuses.map((status) => matchesFilter("pending", status)), [false, true, false, true]);
  assert.deepEqual(statuses.map((status) => matchesFilter("campus", status)), [false, true, true, false]);
});

test("filters: counts per filter", () => {
  assert.deepEqual(countByFilter(statuses), { all: 4, risk: 2, pending: 2, campus: 2 });
  assert.deepEqual(countByFilter([]), { all: 0, risk: 0, pending: 0, campus: 0 });
});

test("course colors: the six palette keys map to their design tokens and names in palette order", () => {
  assert.deepEqual(Object.entries(COURSE_COLOR_SWATCHES).map(([key, swatch]) => [key, swatch.token, swatch.label]), [
    ["primary", "--color-action-primary", "Vino"],
    ["locked", "--color-grade-locked", "Azul acero"],
    ["focus", "--color-border-focus", "Dorado"],
    ["pending", "--color-grade-pending", "Violeta"],
    ["passing", "--color-grade-passing", "Verde"],
    ["warning", "--color-feedback-warning", "Naranja"],
  ]);
});

test("course colors: the style exposes the course color as a CSS variable", () => {
  assert.deepEqual(courseColorStyle("passing"), { "--course-color": "var(--color-grade-passing)" });
  assert.deepEqual(courseColorStyle("primary"), { "--course-color": "var(--color-action-primary)" });
});
