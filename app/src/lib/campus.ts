import { invoke } from "@tauri-apps/api/core";
import { buildCampusData, formatGrade, planUpload, scopeToCourse, verifyGroup, type Verification } from "./campusGrades";
import { loadCampusRows } from "./db";

// Drives the Campus inside NOTAZOD's own "campus" window (see campus_open / campus_eval in lib.rs).
// Scripts sent to the window are synchronous DOM reads and writes; the Campus page cannot call the app.

const BASE = "https://campus2.unimayor.edu.co/CampusRegistroNotas/";
const LIST_URL = `${BASE}Formularios/wfListarGruposCalif.aspx`;
const LOGIN_TIMEOUT = 15 * 60 * 1000;
const PAGE_TIMEOUT = 60 * 1000;
const AUTO_KEY = "notazodCampusAuto";
const LOG_KEY = "notazodCampusDialogs";

export type CampusRow = { code: string; name: string; inputName: string; campus: string; notazod: string; confirmed?: boolean };
export type CampusGroup = Verification & {
  key: string;
  index: number;
  inScope: boolean;
  course?: string;
  openColumn: number | null;
  notazodPeriodClosed?: boolean | null;
  rows: CampusRow[];
  saved?: boolean;
  dialogs?: CampusDialog[];
};
export type CampusReport = { mode: "dry-run" | "save"; canSave: boolean; groups: CampusGroup[]; stoppedWith?: string };
type CampusDialog = { type: string; message: string; answer: boolean };
type ListedGroup = { index: number; program: string; group: string; module: string; total: number };
type FormRow = { code: string; name: string; inputs: ({ name: string; value: string; editable: boolean } | null)[] };
type Form = { rows: FormRow[]; openColumn: number | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function evalInCampus<T>(body: string): Promise<T> {
  const script = `(function(){try{return JSON.stringify({ok:true,value:(function(){${body}})()})}catch(e){return JSON.stringify({ok:false,error:String(e&&e.message||e)})}})()`;
  const raw = await invoke<string>("campus_eval", { script });
  let parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "string") parsed = JSON.parse(parsed);
  const result = parsed as { ok: boolean; value?: T; error?: string };
  if (!result.ok) throw new Error(`Campus page error: ${result.error}`);
  return result.value as T;
}

// Polls until the script returns a truthy value; errors while a page is loading count as "not yet".
async function waitFor<T>(body: string, timeout: number, what: string): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const value = await evalInCampus<T>(body);
      if (value) return value;
    } catch { /* page still loading */ }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

// Runs a script that starts a navigation, then waits for the new document to finish loading.
async function navigate(trigger: string, ready: string, what: string) {
  await evalInCampus(`window.__notazodOldPage = 1; ${trigger}; return true;`);
  await waitFor(`return document.readyState === "complete" && !window.__notazodOldPage && (function(){ ${ready} })();`, PAGE_TIMEOUT, what);
}

// Opens (or focuses) the NOTAZOD Campus window so the teacher can browse the Campus directly.
export async function openCampusWindow() {
  await invoke("campus_open");
}

async function ensureLoggedIn(onStatus: (message: string) => void) {
  await invoke("campus_open");
  const end = Date.now() + LOGIN_TIMEOUT;
  while (Date.now() < end) {
    let state: { href: string; ready: boolean } | null = null;
    try { state = await evalInCampus<{ href: string; ready: boolean }>(`return { href: location.href, ready: document.readyState === "complete" };`); } catch { /* window still opening */ }
    if (state?.ready) {
      if (state.href.startsWith(LIST_URL)) return;
      if (/\/Sesion\//i.test(state.href)) onStatus("Iniciá sesión en la ventana del Campus (usuario, contraseña y código).");
      else { await navigate(`location.href = ${JSON.stringify(LIST_URL)}`, "return true", "the Campus group list"); continue; }
    }
    await sleep(1000);
  }
  throw new Error("Timed out waiting for the Campus login.");
}

const LIST_GROUPS = `
  const table = [...document.querySelectorAll("table")].find((t) => t.querySelector("a[href*='__doPostBack']"));
  if (!table) return [];
  return [...table.rows].slice(1).map((row, index) => {
    const cells = [...row.cells].map((cell) => cell.textContent.trim().replace(/\\s+/g, " "));
    return { index, program: cells[2], group: cells[3], module: cells[4], total: Number(cells[5]) };
  });`;

const READ_FORM = `
  const table = document.getElementById("ContentPlaceHolder1_gvEstudiantes");
  const header = [...table.rows[0].cells].map((cell) => cell.textContent.trim());
  const codeIndex = header.indexOf("Código");
  const nameIndex = header.indexOf("Alumno");
  const rows = [...table.rows].slice(1).filter((row) => row.cells.length > codeIndex).map((row) => ({
    code: row.cells[codeIndex].textContent.trim(),
    name: row.cells[nameIndex].textContent.trim().replace(/\\s+/g, " "),
    inputs: [1, 2, 3].map((n) => { const input = row.querySelector("input[name$='nota_examen_" + n + "']"); return input && { name: input.name, value: input.value, editable: !input.readOnly && !input.disabled }; }),
  }));
  const editable = [0, 1, 2].filter((i) => rows.length && rows.every((row) => row.inputs[i] && row.inputs[i].editable));
  const anyEditable = [0, 1, 2].filter((i) => rows.some((row) => row.inputs[i] && row.inputs[i].editable));
  return { rows, openColumn: editable.length === 1 && anyEditable.length === 1 ? editable[0] + 1 : null };`;

const groupKey = (group: ListedGroup) => `${group.program} | ${group.group} | ${group.module}`;

async function openList() {
  await navigate(`location.href = ${JSON.stringify(LIST_URL)}`, `return location.href.startsWith(${JSON.stringify(LIST_URL)});`, "the Campus group list");
}

async function openGroup(key: string) {
  await openList();
  const groups = await evalInCampus<ListedGroup[]>(LIST_GROUPS);
  const target = groups.find((group) => groupKey(group) === key);
  if (!target) throw new Error(`Campus group disappeared from the list: ${key}`);
  await navigate(
    `const table = [...document.querySelectorAll("table")].find((t) => t.querySelector("a[href*='__doPostBack']"));
     [...table.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Calificar")[${target.index}].click()`,
    `return !!document.getElementById("ContentPlaceHolder1_gvEstudiantes") && !!document.getElementById("ContentPlaceHolder1_btnGuardarNotas");`,
    `the grading form of ${key}`,
  );
}

// S2-S5: verifies every Campus group by student code and, with save, stores the open period column
// of the selected course's groups only when all of them verified, then reads each one back.
export async function runCampusUpload(courseId: string, save: boolean, onStatus: (message: string) => void): Promise<CampusReport> {
  const data = buildCampusData(await loadCampusRows());
  onStatus("Abriendo el Campus...");
  await ensureLoggedIn(onStatus);

  const report: CampusReport = { mode: save ? "save" : "dry-run", canSave: false, groups: [] };
  await openList();
  const listed = await evalInCampus<ListedGroup[]>(LIST_GROUPS);
  for (const [position, group] of listed.entries()) {
    onStatus(`Revisando grupo ${position + 1} de ${listed.length} en el Campus...`);
    const key = groupKey(group);
    await openGroup(key);
    const form = await evalInCampus<Form>(READ_FORM);
    const verification = verifyGroup({ name: key, codes: form.rows.map((row) => row.code), openColumn: form.openColumn }, data.courses);
    const entry: CampusGroup = { key, index: group.index, inScope: false, openColumn: form.openColumn, ...verification, rows: [] };
    if (verification.status !== "unmatched" && form.rows.length !== group.total) {
      entry.status = "failed";
      entry.reason = `read ${form.rows.length} students but the Campus list says ${group.total}`;
    }
    if (entry.status === "verified" && form.openColumn) {
      const course = data.courses.find((c) => c.id === verification.courseId)!;
      const period = data.periodInfo(course.id, form.openColumn);
      entry.course = course.name;
      entry.notazodPeriodClosed = period ? Boolean(period.closed) : null;
      for (const row of form.rows) {
        const grade = data.gradeFor(course.id, form.openColumn, row.code);
        const input = row.inputs[form.openColumn - 1];
        if (grade === null || !input) { entry.status = "failed"; entry.reason = `NOTAZOD has no period ${form.openColumn} grade for ${row.code}`; entry.rows = []; break; }
        entry.rows.push({ code: row.code, name: row.name, inputName: input.name, campus: input.value, notazod: formatGrade(grade) });
      }
    }
    report.groups.push(entry);
  }

  const inScope = scopeToCourse(report.groups, courseId);
  for (const group of report.groups) group.inScope = inScope.includes(group);
  report.canSave = planUpload(inScope).canSave;
  if (!save || !report.canSave) return report;

  try {
    for (const group of inScope.filter((entry) => entry.status === "verified")) {
      onStatus(`Guardando ${group.key}...`);
      await openGroup(group.key);
      const form = await evalInCampus<Form>(READ_FORM);
      const column = group.openColumn! - 1;
      const sameStudents = form.openColumn === group.openColumn && form.rows.length === group.rows.length && form.rows.every((row, i) => row.code === group.rows[i].code && row.inputs[column]?.name === group.rows[i].inputName);
      if (!sameStudents) throw new Error(`Campus form changed since verification for ${group.key}; stopped before saving it.`);
      const values = Object.fromEntries(group.rows.map((row) => [row.inputName, row.notazod]));
      await evalInCampus(`
        const values = ${JSON.stringify(values)};
        for (const [name, value] of Object.entries(values)) {
          const input = document.getElementsByName(name)[0];
          if (!input) throw new Error("missing input " + name);
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;`);
      const typed = await evalInCampus<Form>(READ_FORM);
      if (!group.rows.every((row, i) => typed.rows[i].inputs[column]?.value === row.notazod)) throw new Error(`Typed values did not stick for ${group.key}; stopped before saving it.`);

      // The Campus confirms with "¿Esta seguro?"; the injected script accepts only that and logs it.
      const dialogs = await evalInCampus<CampusDialog[]>(`
        sessionStorage.setItem(${JSON.stringify(AUTO_KEY)}, "1");
        sessionStorage.removeItem(${JSON.stringify(LOG_KEY)});
        window.__notazodOldPage = 1;
        document.getElementById("ContentPlaceHolder1_btnGuardarNotas").click();
        return JSON.parse(sessionStorage.getItem(${JSON.stringify(LOG_KEY)}) || "[]");`);
      const refused = dialogs.find((dialog) => dialog.type === "confirm" && !dialog.answer);
      if (refused) throw new Error(`Unexpected Campus dialog "${refused.message}" for ${group.key}; it was dismissed and nothing more was saved.`);
      await waitFor(`return document.readyState === "complete" && !window.__notazodOldPage;`, PAGE_TIMEOUT, `the Campus to save ${group.key}`);
      group.dialogs = [...dialogs, ...await evalInCampus<CampusDialog[]>(`return JSON.parse(sessionStorage.getItem(${JSON.stringify(LOG_KEY)}) || "[]");`)];

      await openGroup(group.key);
      const stored = await evalInCampus<Form>(READ_FORM);
      for (const [i, row] of group.rows.entries()) row.confirmed = stored.rows[i]?.code === row.code && stored.rows[i].inputs[column]?.value === row.notazod;
      group.saved = group.rows.every((row) => row.confirmed);
      if (!group.saved) throw new Error(`The Campus did not keep the grades of ${group.key}; stopped before the next group.`);
    }
  } catch (error) {
    report.stoppedWith = error instanceof Error ? error.message : String(error);
  } finally {
    try { await evalInCampus(`sessionStorage.removeItem(${JSON.stringify(AUTO_KEY)}); return true;`); } catch { /* window closed */ }
  }
  return report;
}
