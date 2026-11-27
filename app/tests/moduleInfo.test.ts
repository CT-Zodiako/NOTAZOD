// S4: home strip with the corte dates; S5: module info line on each home course card.
// Pure helpers only (no I/O): they take what listCampusModuleInfo() returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { courseModuleSummary, formatDayDate, generalPeriodDates, homePeriodStrip, localIsoDate, periodState } from "../src/lib/moduleInfo.ts";

const DATES = [
  { period: 1, opens: "2026-09-12", closes: "2026-09-27" },
  { period: 2, opens: "2026-10-24", closes: "2026-11-08" },
  { period: 3, opens: "2026-11-16", closes: "2026-12-01" },
];
const OTHER_DATES = [
  { period: 1, opens: "2026-09-13", closes: "2026-09-28" },
  { period: 2, opens: "2026-10-25", closes: "2026-11-09" },
  { period: 3, opens: "2026-11-17", closes: "2026-12-02" },
];
const component = (overrides: Partial<{ module: string; habilitable: boolean | null; credits: number | null; absenceLimit: number | null }> = {}) => ({
  module: "LABORATORIO DE PROGRAMACIÓN",
  habilitable: false,
  credits: 2,
  absenceLimit: 7,
  percents: [{ period: 1, percent: 30 }, { period: 2, percent: 35 }, { period: 3, percent: 35 }],
  plan: "INGENIERIA_2023",
  ...overrides,
});
const group = (courseId: string, periods: typeof DATES, components: ReturnType<typeof component>[] = [], key = `${courseId}-key`) => ({ courseId, key, group: key, periods, components });

test("S4: dates are shown as dd/mm/yyyy; missing or unreadable dates give an empty label", () => {
  assert.equal(formatDayDate("2026-09-12"), "12/09/2026");
  assert.equal(formatDayDate("2026-12-01"), "01/12/2026");
  assert.equal(formatDayDate(null), "");
  assert.equal(formatDayDate(undefined), "");
  assert.equal(formatDayDate("12/09/2026"), "");
});

test("S4: today is taken from the local calendar day", () => {
  assert.equal(localIsoDate(new Date(2026, 10, 26, 23, 59)), "2026-11-26");
  assert.equal(localIsoDate(new Date(2026, 0, 5, 0, 0)), "2026-01-05");
});

test("S4: a corte is open from its opening day to its closing day, both inclusive", () => {
  const corte = DATES[1];
  assert.equal(periodState(corte, "2026-10-23"), "upcoming");
  assert.equal(periodState(corte, "2026-10-24"), "open");
  assert.equal(periodState(corte, "2026-11-01"), "open");
  assert.equal(periodState(corte, "2026-11-08"), "open");
  assert.equal(periodState(corte, "2026-11-09"), "closed");
});

test("S4: without an opening date a corte is never open; without a closing date it never closes", () => {
  assert.equal(periodState({ opens: null, closes: "2026-11-08" }, "2026-11-01"), "upcoming");
  assert.equal(periodState({ opens: null, closes: "2026-11-08" }, "2026-11-09"), "closed");
  assert.equal(periodState({ opens: "2026-10-24", closes: null }, "2027-01-01"), "open");
  assert.equal(periodState({ opens: null, closes: null }, "2026-11-01"), "upcoming");
});

test("S4: the strip shows each corte with its dd/mm/yyyy dates and the state for today", () => {
  assert.deepEqual(homePeriodStrip([group("a", DATES)], ["a"], "2026-11-26"), [
    { period: 1, opens: "2026-09-12", closes: "2026-09-27", opensLabel: "12/09/2026", closesLabel: "27/09/2026", state: "closed" },
    { period: 2, opens: "2026-10-24", closes: "2026-11-08", opensLabel: "24/10/2026", closesLabel: "08/11/2026", state: "closed" },
    { period: 3, opens: "2026-11-16", closes: "2026-12-01", opensLabel: "16/11/2026", closesLabel: "01/12/2026", state: "open" },
  ]);
  assert.deepEqual(homePeriodStrip([group("a", DATES)], ["a"], "2026-09-01").map((p) => p.state), ["upcoming", "upcoming", "upcoming"]);
});

test("S4: the strip is empty when no current-semester synced group has dates", () => {
  assert.deepEqual(homePeriodStrip([], ["a"], "2026-11-26"), []);
  assert.deepEqual(homePeriodStrip([group("a", [], [component()])], ["a"], "2026-11-26"), []);
  assert.deepEqual(homePeriodStrip([group("old", DATES)], ["a"], "2026-11-26"), []);
});

test("S4: when groups disagree the most common set of dates wins; groups of other courses are ignored", () => {
  const groups = [group("a", OTHER_DATES), group("b", DATES), group("c", DATES), group("old", OTHER_DATES, [], "old-1"), group("old", OTHER_DATES, [], "old-2")];
  assert.deepEqual(generalPeriodDates(groups, ["a", "b", "c"]), DATES);
});

test("S4: on a tie the first group's dates win; groups without dates do not count", () => {
  assert.deepEqual(generalPeriodDates([group("a", OTHER_DATES), group("b", DATES)], ["a", "b"]), OTHER_DATES);
  assert.deepEqual(generalPeriodDates([group("a", []), group("b", DATES)], new Set(["a", "b"])), DATES);
  assert.deepEqual(generalPeriodDates([group("a", [])], ["a"]), []);
});

test("S5: the card line shows Faltas pierde, Habilitable and Créditos", () => {
  assert.equal(courseModuleSummary([group("a", DATES, [component()])], "a"), "Pierde con 7 h de falta · Habilitable: No · 2 créditos");
  assert.equal(courseModuleSummary([group("a", DATES, [component({ habilitable: true, credits: 1, absenceLimit: 4.5 })])], "a"), "Pierde con 4,5 h de falta · Habilitable: Sí · 1 crédito");
});

test("S5: missing values are left out and a course without synced module info shows nothing", () => {
  assert.equal(courseModuleSummary([group("a", DATES, [component({ absenceLimit: null })])], "a"), "Habilitable: No · 2 créditos");
  assert.equal(courseModuleSummary([group("a", DATES, [component({ habilitable: null, credits: null })])], "a"), "Pierde con 7 h de falta");
  assert.equal(courseModuleSummary([group("a", DATES, [component({ habilitable: null, credits: null, absenceLimit: null })])], "a"), "");
  assert.equal(courseModuleSummary([group("a", DATES, [])], "a"), "");
  assert.equal(courseModuleSummary([group("b", DATES, [component()])], "a"), "");
});

test("S5: with several components or groups the line describes only the first component that has any value", () => {
  const groups = [
    group("a", DATES, [component({ absenceLimit: null, credits: 3 }), component({ absenceLimit: 9, credits: 4, habilitable: true })], "a-1"),
    group("a", DATES, [component({ absenceLimit: 5 })], "a-2"),
  ];
  // First component of a-1: no Faltas pierde, Habilitable NO, 3 créditos.
  assert.equal(courseModuleSummary(groups, "a"), "Habilitable: No · 3 créditos");
});

test("S5: values of a later component are never mixed into the first one's line", () => {
  const empty = component({ habilitable: null, credits: null, absenceLimit: null });
  const partial = component({ habilitable: null, credits: null, absenceLimit: 6 });
  const other = component({ habilitable: true, credits: 4, absenceLimit: 9 });
  assert.equal(courseModuleSummary([group("a", DATES, [partial, other])], "a"), "Pierde con 6 h de falta");
  // A component with none of the three values is skipped; the next one with any value is described alone.
  assert.equal(courseModuleSummary([group("a", DATES, [empty], "a-1"), group("a", DATES, [partial, other], "a-2")], "a"), "Pierde con 6 h de falta");
});
