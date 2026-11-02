// ego-browser script: run through run.sh, which prepends `const CONFIG = {...};`.
// CONFIG: { dbPath, libUrl, save, reportPath }
const { loadNotazod, formatGrade, verifyGroup, planUpload } = await import(CONFIG.libUrl);
const { writeFile } = await import("node:fs/promises");

const BASE = "https://campus2.unimayor.edu.co/CampusRegistroNotas/";
const LIST_URL = `${BASE}Formularios/wfListarGruposCalif.aspx`;
const LOGIN_URL = `${BASE}Sesion/wfInicio.aspx?ReturnUrl=%2fCampusRegistroNotas`;
const SAVE_BUTTON = "#ContentPlaceHolder1_btnGuardarNotas";
const LOGIN_TIMEOUT = 15 * 60 * 1000;

const data = loadNotazod(CONFIG.dbPath);
const task = await taskSpace("unimayor registro notas");
const page = (await task.pages())[0] ?? await task.newPage();
console.log(`Browser task space ${task.spaceId}, page ${page.label}. Mode: ${CONFIG.save ? "SAVE" : "dry run"}.`);

// S1: the human logs in; this script never sees credentials.
await page.goto(LIST_URL);
await page.waitForLoadState();
if (!(await page.url()).startsWith(LIST_URL)) {
  await page.goto(LOGIN_URL);
  await page.waitForLoadState();
  console.log("Log in to the Campus in the browser window (ID, password and access code), then give control back to the agent.");
  await task.handOff();
  await task.waitForControl({ timeout: LOGIN_TIMEOUT });
  await page.goto(LIST_URL);
  await page.waitForLoadState();
  if (!(await page.url()).startsWith(LIST_URL)) throw new Error("Still not logged in to the Campus; nothing was read or saved.");
}

const listGroups = () => page.evaluate(() => {
  const table = [...document.querySelectorAll("table")].find((t) => t.querySelector("a[href*='__doPostBack']"));
  if (!table) return [];
  return [...table.rows].slice(1).map((row, index) => {
    const cells = [...row.cells].map((cell) => cell.textContent.trim().replace(/\s+/g, " "));
    return { index, program: cells[2], group: cells[3], module: cells[4], total: Number(cells[5]) };
  });
});

const groupKey = (group) => `${group.program} | ${group.group} | ${group.module}`;

async function openGroup(group) {
  await page.goto(LIST_URL);
  await page.waitForLoadState();
  const current = await listGroups();
  const target = current.find((candidate) => groupKey(candidate) === groupKey(group));
  if (!target) throw new Error(`Campus group disappeared from the list: ${groupKey(group)}`);
  await page.click(`xpath=(//table//a[normalize-space()='Calificar'])[${target.index + 1}]`, { label: "open group grading form" });
  await page.waitForSelector("#ContentPlaceHolder1_gvEstudiantes", { state: "visible" });
  // The table becomes visible while the page is still streaming; read it only once the document is complete.
  await page.waitForFunction(() => document.readyState === "complete" && !!document.querySelector("#ContentPlaceHolder1_btnGuardarNotas"), undefined, { timeout: 30_000 });
}

// Reads the grading form: one row per student with its three period inputs.
const readForm = () => page.evaluate(() => {
  const table = document.getElementById("ContentPlaceHolder1_gvEstudiantes");
  const header = [...table.rows[0].cells].map((cell) => cell.textContent.trim());
  const codeIndex = header.indexOf("Código");
  const nameIndex = header.indexOf("Alumno");
  const rows = [...table.rows].slice(1).filter((row) => row.cells.length > codeIndex).map((row) => {
    const inputs = [1, 2, 3].map((n) => row.querySelector(`input[name$='nota_examen_${n}']`));
    return {
      code: row.cells[codeIndex].textContent.trim(),
      name: row.cells[nameIndex].textContent.trim().replace(/\s+/g, " "),
      inputs: inputs.map((input) => input && { name: input.name, value: input.value, editable: !input.readOnly && !input.disabled }),
    };
  });
  const editable = [0, 1, 2].filter((i) => rows.length && rows.every((row) => row.inputs[i]?.editable));
  const anyEditable = [0, 1, 2].filter((i) => rows.some((row) => row.inputs[i]?.editable));
  const openColumn = editable.length === 1 && anyEditable.length === 1 ? editable[0] + 1 : null;
  return { rows, openColumn };
});

// S2 + S3: read every Campus group, verify it by course and student code, and compute what would be sent.
const report = { mode: CONFIG.save ? "save" : "dry-run", database: CONFIG.dbPath, startedAt: new Date().toISOString(), groups: [] };
for (const group of await listGroups()) {
  await openGroup(group);
  const form = await readForm();
  const verification = verifyGroup({ name: groupKey(group), codes: form.rows.map((row) => row.code), openColumn: form.openColumn }, data.courses);
  const entry = { key: groupKey(group), group, openColumn: form.openColumn, ...verification, rows: [] };
  if (verification.status !== "unmatched" && form.rows.length !== group.total) {
    entry.status = "failed";
    entry.reason = `read ${form.rows.length} students but the Campus list says ${group.total}`;
  }
  if (verification.status === "verified") {
    const course = data.courses.find((c) => c.id === verification.courseId);
    const period = data.periodInfo(course.id, form.openColumn);
    entry.course = course.name;
    entry.notazodPeriodClosed = period ? Boolean(period.closed) : null;
    for (const row of form.rows) {
      const grade = data.gradeFor(course.id, form.openColumn, row.code);
      if (grade === null) { entry.status = "failed"; entry.reason = `NOTAZOD has no period ${form.openColumn} grade for ${row.code}`; break; }
      const input = row.inputs[form.openColumn - 1];
      entry.rows.push({ code: row.code, name: row.name, inputName: input.name, campus: input.value, notazod: formatGrade(grade) });
    }
  }
  report.groups.push(entry);
}

const plan = planUpload(report.groups);
report.canSave = plan.canSave;

function printReport() {
  for (const g of report.groups) {
    const head = `\n[${g.status.toUpperCase()}] ${g.key}`;
    if (g.status === "unmatched") { console.log(`${head}\n  No student code from this group exists in NOTAZOD; skipped.`); continue; }
    console.log(`${head}\n  NOTAZOD course: ${g.course ?? g.courseId ?? "-"} | Campus open column: ${g.openColumn ? `Nota ${g.openColumn}` : "none"}${g.notazodPeriodClosed === false ? " | WARNING: NOTAZOD period still open" : ""}`);
    if (g.reason) console.log(`  Reason: ${g.reason}`);
    if (g.missingCodes?.length) console.log(`  Codes missing in NOTAZOD: ${g.missingCodes.join(", ")}`);
    if (g.notInCampus?.length) console.log(`  NOTAZOD codes not in this Campus group: ${g.notInCampus.join(", ")}`);
    const changes = g.rows.filter((r) => r.campus !== r.notazod);
    if (g.rows.length) console.log(`  ${g.rows.length} students, ${changes.length} changes`);
    for (const r of g.rows) console.log(`    ${r.code}  ${r.campus.padStart(3)} -> ${r.notazod.padStart(3)}${r.campus !== r.notazod ? "  *" : ""}  ${r.name}${r.confirmed === false ? "  NOT CONFIRMED" : ""}`);
  }
}

if (!CONFIG.save || !plan.canSave) {
  printReport();
  console.log(CONFIG.save ? "\nNOTHING SAVED: not every matched group passed verification." : "\nDry run: nothing was saved.");
  await writeFile(CONFIG.reportPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${CONFIG.reportPath}`);
} else {
  // S4: everything verified. Fill each verified group, save, then read it back.
  for (const g of report.groups.filter((entry) => entry.status === "verified")) {
    await openGroup(g.group);
    const form = await readForm();
    const sameStudents = form.openColumn === g.openColumn && form.rows.length === g.rows.length && form.rows.every((row, i) => row.code === g.rows[i].code);
    if (!sameStudents) throw new Error(`Campus form changed since verification for ${g.key}; stopped before saving it.`);
    for (const r of g.rows) await page.fill(`input[name="${r.inputName}"]`, r.notazod);
    const typed = await readForm();
    const typedOk = g.rows.every((r, i) => typed.rows[i].inputs[g.openColumn - 1].value === r.notazod);
    if (!typedOk) throw new Error(`Typed values did not stick for ${g.key}; stopped before saving it.`);
    await page.click(SAVE_BUTTON, { label: "save grades" });
    await page.waitForLoadState();
    g.saveMessage = await page.evaluate(() => (document.querySelector(".swal2-popup, .alert-success, .alert-danger, [id*='lblMensaje']")?.textContent ?? "").trim().replace(/\s+/g, " "));
    await openGroup(g.group);
    const stored = await readForm();
    for (const [i, r] of g.rows.entries()) r.confirmed = stored.rows[i]?.code === r.code && stored.rows[i].inputs[g.openColumn - 1].value === r.notazod;
    g.saved = g.rows.every((r) => r.confirmed);
  }
  printReport();
  for (const g of report.groups.filter((entry) => entry.status === "verified")) console.log(`\n${g.saved ? "SAVED AND CONFIRMED" : "SAVE NOT CONFIRMED"}: ${g.key}${g.saveMessage ? ` (${g.saveMessage})` : ""}`);
  await writeFile(CONFIG.reportPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${CONFIG.reportPath}`);
}
