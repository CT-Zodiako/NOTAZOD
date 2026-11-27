// S2: corte dates and "Componentes de módulo" read from the Campus grading form ("Calificar").
// Pure parsing only; the page script just hands over the body text and the table cells.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeModuleInfo, encodeModuleInfo, parseModuleComponents, parseModuleInfo, parsePeriodDates } from "../src/lib/campusModuleInfo.ts";
import { planCourseSync } from "../src/lib/campusSync.ts";

// The three boxes exactly as the Campus shows them (S2), one per line and also glued together by textContent.
const BOXES = ["Apertura Corte 1: 12/09/2026", "Cierre Corte 1: 27/09/2026", "Apertura Corte 2: 24/10/2026", "Cierre Corte 2: 08/11/2026", "Apertura Corte 3: 16/11/2026", "Cierre Corte 3: 01/12/2026"];
const DATES = [
  { period: 1, opens: "2026-09-12", closes: "2026-09-27" },
  { period: 2, opens: "2026-10-24", closes: "2026-11-08" },
  { period: 3, opens: "2026-11-16", closes: "2026-12-01" },
];
const HEADER = ["Comp. Módulo", "Habilitable", "Cred.", "Faltas Pierde", "% Corte 1", "% Corte 2", "% Corte 3", "Plan Est."];
const ROW = ["LABORATORIO DE PROGRAMACIÓN", "NO", "2", "7", "30", "35", "35", "INGENIERIA_2023"];
const COMPONENT = {
  module: "LABORATORIO DE PROGRAMACIÓN",
  habilitable: false,
  credits: 2,
  absenceLimit: 7,
  percents: [{ period: 1, percent: 30 }, { period: 2, percent: 35 }, { period: 3, percent: 35 }],
  plan: "INGENIERIA_2023",
};

test("S2: the three corte boxes give opening and closing dates per corte", () => {
  assert.deepEqual(parsePeriodDates(`Calificar\n${BOXES.join("\n")}\nComponentes de módulo asociados a este grupo.`), DATES);
  assert.deepEqual(parsePeriodDates(BOXES.join("")), DATES);
});

test("S2: date labels are matched without regard to case, accents or spacing", () => {
  assert.deepEqual(parsePeriodDates("APERTURA  CORTE 2 :24/10/2026   cierre corte 2:  08/11/2026"), [{ period: 2, opens: "2026-10-24", closes: "2026-11-08" }]);
});

test("S2: a missing or garbled box leaves that value empty and never throws", () => {
  assert.deepEqual(parsePeriodDates(""), []);
  assert.deepEqual(parsePeriodDates("Sin fechas de corte"), []);
  assert.deepEqual(parsePeriodDates("Apertura Corte 1: 12/09/2026"), [{ period: 1, opens: "2026-09-12", closes: null }]);
  assert.deepEqual(parsePeriodDates("Apertura Corte 1: --/--/---- Cierre Corte 1: 31/02/2026 Cierre Corte 2: 08/11/2026"), [{ period: 2, opens: null, closes: "2026-11-08" }]);
});

test("S2: the components table is read by header text, whatever the column order", () => {
  assert.deepEqual(parseModuleComponents([[HEADER, ROW]]), [COMPONENT]);
  const order = [7, 3, 0, 6, 1, 5, 2, 4];
  assert.deepEqual(parseModuleComponents([[order.map((i) => HEADER[i].toUpperCase()), order.map((i) => ROW[i])]]), [COMPONENT]);
});

test("S2: headers match without accents, extra rows above the header and several components", () => {
  const header = ["Comp. Modulo", "HABILITABLE", "Créd.", "faltas  pierde", "%Corte 1", "% corte 2", "% Corte 3", "Plan Est"];
  const second = ["TALLER DE BASES DE DATOS", "SÍ", "3", "9,5", "30", "30", "40", "INGENIERIA_2023"];
  assert.deepEqual(parseModuleComponents([[["Componentes de módulo asociados a este grupo."], header, ROW, second]]), [
    COMPONENT,
    { module: "TALLER DE BASES DE DATOS", habilitable: true, credits: 3, absenceLimit: 9.5, percents: [{ period: 1, percent: 30 }, { period: 2, percent: 30 }, { period: 3, percent: 40 }], plan: "INGENIERIA_2023" },
  ]);
});

test("S2: a missing table or garbled cells leave the values empty", () => {
  assert.deepEqual(parseModuleComponents([]), []);
  assert.deepEqual(parseModuleComponents([[["Código", "Alumno", "Nota 1"], ["1", "Ana", "4,0"]]]), []);
  assert.deepEqual(parseModuleComponents([[HEADER]]), []);
  assert.deepEqual(parseModuleComponents([[HEADER, ["", "", "", "", "", "", "", ""], ["MODULO X", "quizás", "dos", "", "n/a", "35", "", ""], ["MODULO Y"]]]), [
    { module: "MODULO X", habilitable: null, credits: null, absenceLimit: null, percents: [{ period: 1, percent: null }, { period: 2, percent: 35 }, { period: 3, percent: null }], plan: "" },
    { module: "MODULO Y", habilitable: null, credits: null, absenceLimit: null, percents: [{ period: 1, percent: null }, { period: 2, percent: null }, { period: 3, percent: null }], plan: "" },
  ]);
  assert.deepEqual(parseModuleComponents([[["Comp. Módulo", "Habilitable"], ["MODULO Z", "NO"]]]), [{ module: "MODULO Z", habilitable: false, credits: null, absenceLimit: null, percents: [], plan: "" }]);
});

test("S2: parseModuleInfo combines both and tolerates a missing reading", () => {
  assert.deepEqual(parseModuleInfo({ text: BOXES.join("\n"), tables: [[HEADER, ROW]] }), { periods: DATES, components: [COMPONENT] });
  assert.deepEqual(parseModuleInfo(null), { periods: [], components: [] });
  assert.deepEqual(parseModuleInfo({ text: undefined, tables: "garbled" }), { periods: [], components: [] });
});

test("S3: stored values round-trip and garbled stored values decode as empty", () => {
  const info = { periods: DATES, components: [COMPONENT] };
  const stored = encodeModuleInfo(info);
  assert.deepEqual(decodeModuleInfo(stored.periodDates, stored.moduleComponents), info);
  assert.deepEqual(decodeModuleInfo(null, null), { periods: [], components: [] });
  assert.deepEqual(decodeModuleInfo("{not json", "[1, {\"module\": 3}]"), { periods: [], components: [] });
});

const student = (code) => ({ fullName: `Student ${code}`, code, documentId: `doc-${code}`, institutionalEmail: `s${code}@unimayor.edu.co`, personalEmail: `s${code}@gmail.com` });
const existing = (code) => ({ id: `id-${code}`, courseId: "c", ...student(code) });
const INFO = { periods: DATES, components: [COMPONENT] };
const group = (key, codes, extra = {}) => ({ key, program: "INGENIERIA", group: key, module: "LABORATORIO DE PROGRAMACIÓN", schedule: "LUN", room: "105", students: codes.map(student), expectedCount: codes.length, ...extra });

test("S3: an add action with no students to add still carries each group's module info", () => {
  const courses = [{ id: "c", name: "Laboratorio", semester: "2026-2", students: [existing("1"), existing("2")] }];
  const [action] = planCourseSync([group("A", ["1"], { moduleInfo: INFO }), group("B", ["2"], { moduleInfo: { periods: [], components: [] } })], courses, "2026-2");
  assert.equal(action.kind, "add");
  assert.equal(action.toAdd.length, 0);
  assert.deepEqual(action.campusGroups.map((g) => [g.key, g.moduleInfo]), [["A", INFO], ["B", { periods: [], components: [] }]]);
});

test("S3: a new course carries its group's module info; a group never read carries none", () => {
  const [created, other] = planCourseSync([group("A", ["1"], { moduleInfo: INFO }), group("B", ["2"], { module: "OTRO" })], [], "2026-2");
  assert.equal(created.kind, "create");
  assert.deepEqual(created.campusGroups[0].moduleInfo, INFO);
  assert.equal(other.kind, "create");
  assert.equal("moduleInfo" in other.campusGroups[0], false);
});
