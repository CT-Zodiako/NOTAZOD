"use strict";
/* NOTAZOD functional prototype.
   Source of truth: design/ (phases 1-5). Storage: browser localStorage (see tech-notes.md).
   Review helpers: ?today=YYYY-MM-DD fixes the date, ?reset=1 restores the sample data. */

// ---------- Constants ----------
const STORE_KEY = "notazod-data";
const THEME_KEY = "notazod-theme";
const WEIGHTS = [0.30, 0.35, 0.35];
const PASS = 3;
const DAY_MS = 86400000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

const FIELDS = [
  { key: "fullName", label: "Nombre completo", names: ["nombrecompleto", "nombre", "nombres", "estudiante", "apellidosynombres"] },
  { key: "code", label: "Código", names: ["codigo", "codigoestudiante", "codigodeestudiante"], unique: true },
  { key: "docId", label: "Documento", names: ["documento", "numerodedocumento", "numerodocumento", "cedula", "identificacion"], unique: true },
  { key: "instEmail", label: "Correo institucional", names: ["correoinstitucional", "emailinstitucional"], unique: true, email: true },
  { key: "personalEmail", label: "Correo personal", names: ["correopersonal", "emailpersonal"], unique: true, email: true },
];

const params = new URLSearchParams(location.search);
const root = document.documentElement;
const view = document.getElementById("view");
const crumbs = document.getElementById("crumbs");
const tip = document.getElementById("tooltip");
const toasts = document.getElementById("toasts");

// ---------- Tokens read at runtime ----------
const token = name => getComputedStyle(root).getPropertyValue(name).trim();
const tokenNum = name => parseFloat(token(name)) || 0;

// ---------- Dates ----------
const pad = n => String(n).padStart(2, "0");
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);
const fmtDate = s => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const TODAY = (() => {
  const p = params.get("today");
  const d = p ? fromISO(p) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
})();

function parseDMY(str) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str.trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1) return null;
  return toISO(d);
}

// ---------- Numbers ----------
const round1 = x => Math.round(x * 10 + 1e-9) / 10;          // half-up, one decimal
const fmt1 = x => round1(x).toFixed(1).replace(".", ",");
const fmtExact = x => String(Math.round(x * 10000) / 10000).replace(".", ",");

function parseGrade(raw) {
  const s = raw.trim();
  if (!s) return { empty: true };
  const n = s.replace(",", ".");
  if (!/^\d*\.?\d*$/.test(n) || n === ".") return { error: "Escribe solo números, por ejemplo 3,5." };
  if (/\.\d{2,}$/.test(n)) return { error: "Usa un solo decimal, por ejemplo 3,5." };
  const v = Number(n);
  if (v < 0 || v > 5) return { error: "La nota va de 0,0 a 5,0. Revisa el número." };
  return { value: round1(v) };
}

// ---------- Text ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------- Icons (outline, rounded) ----------
const ICONS = {
  sun: ["c:12,12,4", "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  alert: ["c:12,12,10", "M12 8v4M12 16h.01"],
  clock: ["c:12,12,10", "M12 6v6l4 2"],
  check: ["M20 6 9 17l-5-5"],
  lock: ["r:3,11,18,11,2", "M7 11V7a5 5 0 0 1 10 0v4"],
  search: ["c:11,11,8", "m21 21-4.3-4.3"],
  x: ["M18 6 6 18M6 6l12 12"],
  plus: ["M12 5v14M5 12h14"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"],
  pencil: ["M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"],
  trash: ["M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  info: ["c:12,12,10", "M12 16v-4M12 8h.01"],
  keyboard: ["r:2,6,20,12,2", "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"],
  legend: ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
  calendar: ["r:3,4,18,18,2", "M16 2v4M8 2v4M3 10h18"],
  userPlus: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "c:9,7,4", "M19 8v6M22 11h-6"],
  grade: ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  hourglass: ["M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"],
  chevronLeft: ["m15 18-6-6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6"],
};
function icon(name, cls = "") {
  const parts = ICONS[name].map(p => {
    if (p.startsWith("c:")) { const [cx, cy, r] = p.slice(2).split(","); return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`; }
    if (p.startsWith("r:")) { const [x, y, w, h, rx] = p.slice(2).split(","); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`; }
    return `<path d="${p}"/>`;
  }).join("");
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${parts}</svg>`;
}

// ---------- Storage ----------
let db;
const uid = p => p + Math.random().toString(36).slice(2, 10);

function load() {
  if (params.get("reset") === "1") localStorage.removeItem(STORE_KEY);
  try { db = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { db = null; }
  if (!db) { db = seed(); save(); }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }

function makeCourse(name, semester, periods) {
  return {
    id: uid("c"), name, semester,
    periods: periods.map(p => ({
      start: p.start, end: p.end, split: { act: p.act, exam: 100 - p.act },
      activities: [{ id: uid("a"), name: "Actividad 1" }], examId: uid("e"),
    })),
    students: [], grades: {},
  };
}

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function seed() {
  const SURNAMES = ["Gómez", "Pérez", "Rodríguez", "Martínez", "López", "García", "Hernández", "Díaz", "Moreno", "Álvarez", "Romero", "Torres", "Ramírez", "Vargas", "Castro", "Rojas", "Ortiz", "Muñoz", "Suárez", "Jiménez", "Cárdenas", "Mejía", "Ospina", "Restrepo", "Quintero", "Zapata", "Arango", "Montoya", "Salazar", "Castaño"];
  const GIVEN = ["Laura", "María", "Juan", "Andrés", "Camila", "Sofía", "Santiago", "Valentina", "Daniel", "Sebastián", "Isabella", "Mateo", "Mariana", "Alejandro", "Natalia", "Felipe", "Daniela", "Nicolás", "Paula", "Tomás", "Gabriela", "Samuel", "Juliana", "David", "Manuela"];
  const rnd = mulberry32(20262);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const slug = s => norm(s).replace(/[^a-z]/g, "");
  const semester = `${TODAY.getFullYear()}-${TODAY.getMonth() < 6 ? 1 : 2}`;
  const d = n => toISO(addDays(TODAY, n));

  const calc = makeCourse("Cálculo I", semester, [
    { start: d(-58), end: d(-27), act: 40 }, { start: d(-26), end: d(3), act: 40 }, { start: d(4), end: d(60), act: 30 }]);
  const used = new Set();
  for (let i = 0; i < 35; i++) {
    let full;
    do { full = `${pick(SURNAMES)} ${pick(SURNAMES)} ${pick(GIVEN)}${rnd() < 0.5 ? " " + pick(GIVEN) : ""}`; } while (used.has(full));
    used.add(full);
    const [s1, s2, g1] = full.split(" ");
    calc.students.push({
      id: uid("s"), fullName: full, code: String(20261001 + i * 13),
      docId: String(1000000000 + Math.floor(rnd() * 899999999)),
      instEmail: `${slug(g1)}.${slug(s1)}${i + 1}@uni.edu.co`,
      personalEmail: `${slug(g1)}${slug(s2)}${i + 7}@correo.com`,
    });
  }
  sortStudents(calc);

  const grade = () => Math.max(0, Math.min(5, round1(3.7 + (rnd() + rnd() + rnd() - 1.5) * 1.6)));
  const [p1, p2] = calc.periods;
  p1.activities = [{ id: uid("a"), name: "Taller 1" }, { id: uid("a"), name: "Quiz 1" }, { id: uid("a"), name: "Taller 2" }];
  p2.activities = [{ id: uid("a"), name: "Taller 3" }, { id: uid("a"), name: "Quiz 2" }];
  calc.students.forEach((s, i) => {
    const g = calc.grades[s.id] = {};
    [...p1.activities.map(a => a.id), p1.examId].forEach(id => { if (!(i === 7 && id === p1.activities[1].id)) g[id] = { v: grade(), pending: false }; });
    g[p2.activities[0].id] = [4, 15, 28].includes(i) ? { v: 0, pending: true } : { v: grade(), pending: false };
    if (i < 12) g[p2.activities[1].id] = { v: grade(), pending: false };
  });

  const fis = makeCourse("Física II", semester, [
    { start: d(-1), end: d(40), act: 40 }, { start: d(41), end: d(80), act: 40 }, { start: d(81), end: d(120), act: 40 }]);
  return { courses: [calc, fis] };
}

// ---------- Domain ----------
const findCourse = id => db.courses.find(c => c.id === id);
const sortStudents = c => c.students.sort((a, b) => a.fullName.localeCompare(b.fullName, "es", { sensitivity: "base" }));
const entry = (c, sid, item) => c.grades[sid]?.[item];
const value = (c, sid, item) => entry(c, sid, item)?.v ?? 0;
const itemsOf = p => [...p.activities.map(a => ({ id: a.id, name: a.name })), { id: p.examId, name: "Parcial" }];

function setEntry(c, sid, item, e) {
  c.grades[sid] ??= {};
  if (e) c.grades[sid][item] = e; else delete c.grades[sid][item];
}

// Periods activate in sequence; a period locks once its end date has passed.
function periodStates(c) {
  let activeFound = false;
  return c.periods.map(p => {
    if (fromISO(p.end) < TODAY) return "locked";
    if (!activeFound) { activeFound = true; return "active"; }
    return "upcoming";
  });
}

function calcStudent(c, sid, states) {
  const periods = c.periods.map(p => {
    const actAvg = p.activities.reduce((t, a) => t + value(c, sid, a.id), 0) / p.activities.length;
    const grade = actAvg * p.split.act / 100 + value(c, sid, p.examId) * p.split.exam / 100;
    return { actAvg, grade };
  });
  let acc = 0, weight = 0;
  states.forEach((st, i) => { if (st === "locked") { acc += periods[i].grade * WEIGHTS[i]; weight += WEIGHTS[i]; } });
  return { periods, acc, weight, pct: Math.round(weight * 100), final: states.every(s => s === "locked") ? round1(acc) : null };
}

function periodStatus(c, i, states) {
  const p = c.periods[i];
  if (states[i] === "locked") return { cls: "locked", icon: "lock", short: "Cerrado", long: `cerró el ${fmtDate(p.end)}` };
  if (states[i] === "active") {
    const left = daysBetween(TODAY, fromISO(p.end));
    return { cls: "active", icon: "clock", short: "Activo", long: left === 0 ? `cierra hoy (${fmtDate(p.end)})` : `cierra en ${plural(left, "día", "días")} (${fmtDate(p.end)})` };
  }
  return { cls: "upcoming", icon: "calendar", short: "Próximo", long: `abre el ${fmtDate(p.start)}` };
}

function courseReminders(c) {
  const i = periodStates(c).indexOf("active");
  if (i < 0) return [];
  const p = c.periods[i];
  const left = daysBetween(TODAY, fromISO(p.end));
  const since = daysBetween(fromISO(p.start), TODAY);
  const label = `${c.name} · Corte ${i + 1}`;
  const out = [];
  if (left >= 0 && left <= 5) out.push({ order: left, icon: "clock", text: left === 0 ? `${label} cierra hoy (${fmtDate(p.end)}).` : `${label} cierra en ${plural(left, "día", "días")} (${fmtDate(p.end)}).` });
  if (since >= 0 && since <= 2) out.push({ order: left, icon: "info", text: `${label} ya está abierto. Sube notas hasta el ${fmtDate(p.end)}.` });
  return out;
}

// ---------- Theme ----------
const themeBtn = document.getElementById("theme-toggle");
const effectiveTheme = () => root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
function renderTheme() {
  const dark = effectiveTheme() === "dark";
  themeBtn.innerHTML = icon(dark ? "sun" : "moon", "icon-md");
  themeBtn.setAttribute("aria-label", dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  themeBtn.dataset.tip = dark ? "Modo claro" : "Modo oscuro";
}
themeBtn.onclick = () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage full or blocked */ }
  renderTheme();
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderTheme);

// ---------- Tooltip ----------
let tipTimer = null, tipTarget = null;
function showTip(el) {
  clearTimeout(tipTimer);
  tipTarget = el;
  tipTimer = setTimeout(() => {
    if (!el.isConnected) return;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const gap = tokenNum("--space-2");
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const left = Math.max(gap, Math.min(r.left + r.width / 2 - t.width / 2, innerWidth - t.width - gap));
    let top = r.top - t.height - gap / 2;
    if (top < gap) top = r.bottom + gap / 2;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    el.setAttribute("aria-describedby", [el.getAttribute("aria-describedby"), "tooltip"].filter(Boolean).join(" "));
  }, tokenNum("--component-tooltip-delay"));
}
function hideTip() {
  clearTimeout(tipTimer);
  if (tipTarget) {
    const ids = (tipTarget.getAttribute("aria-describedby") || "").split(" ").filter(x => x && x !== "tooltip");
    ids.length ? tipTarget.setAttribute("aria-describedby", ids.join(" ")) : tipTarget.removeAttribute("aria-describedby");
  }
  tip.hidden = true;
  tipTarget = null;
}
document.addEventListener("mouseover", e => {
  const el = e.target.closest?.("[data-tip]");
  if (el && el !== tipTarget) showTip(el);
  else if (!el && tipTarget) hideTip();
});
document.addEventListener("focusin", e => { const el = e.target.closest?.("[data-tip]"); if (el) showTip(el); });
document.addEventListener("focusout", hideTip);

// ---------- Toast ----------
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${icon("check")}<span>${esc(msg)}</span>`;
  toasts.append(t);
  setTimeout(() => t.remove(), tokenNum("--component-toast-duration"));
}

// ---------- Modals ----------
const modalStack = [];
let modalSeq = 0;

function setBackgroundInert(on) {
  document.querySelector(".app-header").inert = on;
  view.inert = on;
}

function openModal({ title, sub = "", body = "", foot = "", after = "", wide = false, role = "dialog", focus = null, isDirty = null, returnFocus = null }) {
  const id = `m${++modalSeq}`;
  const trigger = document.activeElement;
  closePopovers();
  hideTip();
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.innerHTML = `<div class="modal${wide ? " wide" : ""}" role="${role}" aria-modal="true" aria-labelledby="${id}-t">
      <div class="modal-head"><div><h2 id="${id}-t">${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ""}</div>
        <button type="button" class="icon-button" data-x aria-label="Cerrar">${icon("x")}</button></div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ""}${after}
    </div>`;
  modalStack.at(-1)?.backdrop.setAttribute("inert", "");
  document.body.append(backdrop);
  setBackgroundInert(true);
  const m = { el: backdrop.firstElementChild, backdrop, isDirty, returnFocus: returnFocus || (() => trigger) };
  m.close = force => closeModal(m, force);
  modalStack.push(m);
  m.el.querySelector("[data-x]").onclick = () => m.close();
  const first = (focus && m.el.querySelector(focus))
    || m.el.querySelector(`.modal-body :is(${FOCUSABLE})`)
    || m.el.querySelector(`.modal-foot :is(${FOCUSABLE})`)
    || m.el.querySelector("[data-x]");
  requestAnimationFrame(() => { first?.focus(); first?.select?.(); });
  return m;
}

function closeModal(m, force = false) {
  if (!modalStack.includes(m)) return;
  if (!force && m.isDirty?.()) { confirmDiscard(() => closeModal(m, true)); return; }
  modalStack.splice(modalStack.indexOf(m), 1);
  m.backdrop.remove();
  hideTip();
  const top = modalStack.at(-1);
  if (top) top.backdrop.removeAttribute("inert"); else setBackgroundInert(false);
  const target = m.returnFocus();
  if (target?.isConnected) target.focus();
}

function confirmDialog({ title, body, confirm, cancel = "Cancelar", onConfirm }) {
  const m = openModal({
    title, role: "alertdialog", body: `<p>${body}</p>`, focus: "[data-cancel]",
    foot: `<button type="button" class="button secondary" data-cancel>${cancel}</button><button type="button" class="button danger" data-ok>${confirm}</button>`,
  });
  m.el.querySelector("[data-cancel]").onclick = () => m.close();
  m.el.querySelector("[data-ok]").onclick = () => { m.close(true); onConfirm(); };
}

const confirmDiscard = onDiscard => confirmDialog({
  title: "Tienes cambios sin guardar", body: "¿Descartarlos? Lo que escribiste se va a perder.",
  confirm: "Descartar", cancel: "Seguir editando", onConfirm: onDiscard,
});

// Unsaved-changes detection by comparing field values with the values at open time.
function snapshot(el) { return [...el.querySelectorAll("input:not([type=file]):not([type=date]), select")].map(i => i.type === "radio" ? i.checked : i.value).join("\u0001"); }
function trackDirty(m) { const initial = snapshot(m.el); m.isDirty = () => snapshot(m.el) !== initial; }

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (document.querySelector("[aria-controls][aria-expanded='true']")) { closePopovers(true); return; }
    const top = modalStack.at(-1);
    if (top) { e.preventDefault(); top.close(); }
    return;
  }
  if (e.key === "Tab") {
    const top = modalStack.at(-1);
    if (!top) return;
    const f = [...top.el.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
});

// ---------- Popovers ----------
function closePopovers(returnFocus = false) {
  document.querySelectorAll("[aria-controls][aria-expanded='true']").forEach(b => {
    b.setAttribute("aria-expanded", "false");
    document.getElementById(b.getAttribute("aria-controls")).hidden = true;
    if (returnFocus) b.focus();
  });
}
function togglePopover(btn) {
  const open = btn.getAttribute("aria-expanded") === "true";
  closePopovers();
  if (!open) { btn.setAttribute("aria-expanded", "true"); document.getElementById(btn.getAttribute("aria-controls")).hidden = false; }
}
document.addEventListener("click", e => { if (!e.target.closest(".popover-anchor")) closePopovers(); });

// ---------- Shared HTML ----------
const disabledAttrs = reason => reason ? `aria-disabled="true" data-tip="${esc(reason)}"` : "";
const isDisabled = el => el.getAttribute("aria-disabled") === "true";
const msgHTML = (id, live = true) => `<div class="inline-message" id="${id}" ${live ? 'role="alert"' : ""}></div>`;

// Forms with more than 3 errors show one announced summary above the fields (06-patterns).
function setSummary(el, count) {
  el.innerHTML = count > 3 ? `${icon("alert")}<span>Te faltan o están mal ${count} datos. Revisa los campos marcados.</span>` : "";
}

function setError(input, msg) {
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  const el = document.getElementById(`${input.id}-msg`);
  if (el) el.innerHTML = msg ? `${icon("alert")}<span>${esc(msg)}</span>` : "";
}

function passFail(x, shown = fmt1(x)) {
  // Intermediate values are judged by the displayed one-decimal value.
  const displayed = round1(x);
  return displayed >= PASS - 1e-9
    ? `<span class="cell v-passing">${icon("check")}${shown}<span class="sr-only"> aprobada</span></span>`
    : `<span class="cell v-failing">${icon("alert")}${shown}<span class="sr-only"> menor a 3,0</span></span>`;
}

// Entered grade cell. A locked period turns empty and pending grades into a definitive 0,0 (D11).
function gradeCell(c, sid, item, state) {
  const e = entry(c, sid, item);
  const v = state === "locked" ? e?.v ?? 0 : e?.v;
  if (state === "locked") return v < PASS ? passFail(v) : `<span class="cell">${fmt1(v)}</span>`;
  if (!e) return `<span class="cell v-empty">—<span class="sr-only">sin nota</span></span>`;
  if (e.pending) return `<span class="cell v-pending">${icon("clock")}0,0<span class="sr-only"> pendiente</span></span>`;
  return e.v < PASS ? passFail(e.v) : `<span class="cell">${fmt1(e.v)}</span>`;
}

const computedTD = (x, inner, cls = "") => `<td class="col-grade computed ${cls}" data-tip="Exacto: ${fmtExact(x)}">${inner}</td>`;
const emptyComputedTD = (reason, cls = "") => `<td class="col-grade computed ${cls}" ${reason ? `data-tip="${esc(reason)}"` : ""}><span class="cell v-empty">—</span></td>`;

function periodGradeTD(x, state) {
  if (state === "upcoming") return emptyComputedTD("");
  if (state === "active") return computedTD(x, `<span class="cell v-progress">${icon("hourglass")}${fmt1(x)}<span class="sr-only"> en curso</span></span>`);
  return computedTD(x, passFail(x));
}

// Accumulated is judged by pace: its average over the evaluated weight vs 3,0.
function accumulatedHTML(r) {
  const inner = passFail(r.acc / r.weight, `${fmt1(r.acc)}<span class="pct">&nbsp;· ${r.pct}%</span>`);
  return inner;
}

const LEGEND_HTML = `<h3>Qué significa cada color</h3><ul>
  <li><span class="swatch v-failing">${icon("alert")}2,5</span><span>Menor a 3,0.</span></li>
  <li><span class="swatch v-pending">${icon("clock")}0,0</span><span>Pendiente: la saltaste en el recorrido. Cuenta 0,0 hasta que pongas la nota.</span></li>
  <li><span class="swatch v-passing computed-bg">${icon("check")}3,8</span><span>Aprobada: nota de corte cerrado, acumulada o final.</span></li>
  <li><span class="swatch computed-bg">4,1</span><span>Calculada sola. Pasa el mouse para ver el valor exacto.</span></li>
  <li><span class="swatch v-progress computed-bg">${icon("hourglass")}3,2</span><span>En curso: el corte sigue abierto.</span></li>
  <li><span class="swatch v-locked">${icon("lock")}</span><span>Corte cerrado: solo lectura.</span></li>
  <li><span class="swatch v-empty">—</span><span>Sin nota. Cuenta como 0,0.</span></li>
</ul><p class="helper">La acumulada se pinta según tu ritmo: verde si en los cortes cerrados va en 3,0 o más. Los valores calculados se comparan después de mostrarse redondeados a un decimal.</p>`;

const KEYS_HTML = `<h3>Atajos de teclado</h3><ul>
  <li><kbd>Enter</kbd><span>Al calificar: guarda y pasa al siguiente.</span></li>
  <li><kbd>Shift+Enter</kbd><span>Al calificar: guarda y vuelve al anterior.</span></li>
  <li><kbd>Esc</kbd><span>Cierra la ventana abierta.</span></li>
  <li><kbd>Tab</kbd><span>Pasa por los botones.</span></li>
  <li><kbd>Enter</kbd><span>En una fila: abre las notas del estudiante.</span></li>
  <li><kbd>← →</kbd><span>En las pestañas: cambia de corte.</span></li>
</ul>`;

// ---------- Breadcrumb ----------
function setCrumbs(label) {
  crumbs.innerHTML = label
    ? `<span class="crumb-sep" aria-hidden="true">›</span><a href="#/">Inicio</a><span class="crumb-sep" aria-hidden="true">›</span><span class="crumb-current" aria-current="page">${esc(label)}</span>`
    : `<span class="crumb-sep" aria-hidden="true">›</span><span class="crumb-current" aria-current="page">Inicio</span>`;
  document.title = label ? `${label} · NOTAZOD` : "NOTAZOD";
}

// ---------- Router ----------
let leaveGuard = null;
let lastHash = location.hash || "#/";

function route() {
  const h = location.hash || "#/";
  if (h.startsWith("#/course/")) renderCourse(h.slice(9));
  else if (h === "#/new") renderWizard();
  else renderHome();
}

window.addEventListener("hashchange", () => {
  const target = location.hash || "#/";
  if (leaveGuard?.()) {
    history.replaceState(null, "", lastHash);
    confirmDiscard(() => { leaveGuard = null; wz = null; location.hash = target; });
    return;
  }
  if (target !== "#/new") { leaveGuard = null; wz = null; }
  lastHash = target;
  route();
});

// ---------- Home ----------
function renderHome() {
  setCrumbs("");
  const reminders = db.courses.flatMap(courseReminders).sort((a, b) => a.order - b.order);
  const cards = db.courses.map(c => {
    const states = periodStates(c);
    const i = states.indexOf("active");
    const st = i >= 0 ? periodStatus(c, i, states) : null;
    return `<li><a class="course-card" href="#/course/${c.id}">
      <div><h2>${esc(c.name)}</h2><p class="meta">${esc(c.semester)} · ${plural(c.students.length, "estudiante", "estudiantes")}</p></div>
      <span class="badge ${st ? "active" : "locked"}">${st ? `${icon("clock")}Corte ${i + 1} · Activo · ${st.long}` : `${icon("lock")}Todos los cortes cerrados`}</span>
    </a></li>`;
  }).join("");
  view.innerHTML = `<section class="home">
    <div class="page-title-row"><h1>Tus cursos</h1>${db.courses.length ? `<a class="button primary" href="#/new">${icon("plus")}Crear curso</a>` : ""}</div>
    ${reminders.length ? `<ul class="reminders" aria-label="Recordatorios">${reminders.map(r => `<li>${icon(r.icon)}<span>${esc(r.text)}</span></li>`).join("")}</ul>` : ""}
    ${db.courses.length ? `<ul class="course-list">${cards}</ul>`
      : `<div class="empty-state"><p>Aún no tienes cursos. Crea el primero para empezar a calificar.</p><a class="button primary" href="#/new">${icon("plus")}Crear curso</a></div>`}
  </section>`;
}

// ---------- Course student list ----------
const ui = { courseId: null, tab: {}, search: "", pending: false, failing: false };

function renderCourse(id, focusSel = null) {
  const c = findCourse(id);
  if (!c) { location.hash = "#/"; return; }
  if (ui.courseId !== id) Object.assign(ui, { courseId: id, search: "", pending: false, failing: false });
  const states = periodStates(c);
  const activeIdx = states.indexOf("active");
  const tab = ui.tab[id] ?? (activeIdx >= 0 ? activeIdx : 2);
  ui.tab[id] = tab;
  const st = states[tab];
  if (st !== "locked") ui.failing = false;
  setCrumbs(`${c.name} · ${c.semester}`);

  const noStudents = !c.students.length;
  const gradeReason = st !== "active" ? (activeIdx >= 0 ? `Solo puedes calificar el corte activo (Corte ${activeIdx + 1}).` : "Todos los cortes están cerrados.")
    : noStudents ? "Agrega estudiantes primero." : "";
  const activityReason = st !== "active" ? "Solo puedes crear actividades en el corte activo." : "";
  const importReason = states[0] === "locked" ? "La importación se cierra después del Corte 1. Agrega estudiantes uno por uno." : "";
  const failingReason = st === "locked" ? "" : "Disponible cuando cierre el corte.";

  const tabs = c.periods.map((p, i) => {
    const s = periodStatus(c, i, states);
    return `<button type="button" class="tab" role="tab" id="tab-${i}" aria-selected="${i === tab}" aria-controls="panel" tabindex="${i === tab ? 0 : -1}" data-tab="${i}"
      data-tip="${fmtDate(p.start)} – ${fmtDate(p.end)} · ${s.long}"><span>Corte ${i + 1}<small class="tab-dates">${fmtDate(p.start)}–${fmtDate(p.end)}</small></span><span class="badge ${s.cls}">${icon(s.icon)}${s.short}</span></button>`;
  }).join("");

  view.innerHTML = `<section class="course">
    <div class="toolbar">
      <div class="tabs" role="tablist" aria-label="Cortes">${tabs}</div>
      <span class="divider"></span>
      <div class="search" role="search">
        ${icon("search")}
        <label class="search-label" for="search">Buscar estudiante</label>
        <input id="search" class="input" type="search" placeholder="Nombre, código o documento" value="${esc(ui.search)}" autocomplete="off">
        <button type="button" class="icon-button clear" data-action="clear-search" aria-label="Limpiar búsqueda" ${ui.search ? "" : "hidden"}>${icon("x")}</button>
      </div>
      <button type="button" class="button ghost" data-action="f-pending" aria-pressed="${ui.pending}">${icon("clock")}Pendientes</button>
      <button type="button" class="button ghost" data-action="f-failing" aria-pressed="${ui.failing}" ${disabledAttrs(failingReason)}>${icon("alert")}Menor a 3,0</button>
      <span class="popover-anchor"><button type="button" class="button ghost" data-action="popover" aria-expanded="false" aria-controls="pop-legend">${icon("legend")}Leyenda</button>
        <div class="popover" id="pop-legend" hidden>${LEGEND_HTML}</div></span>
      <span class="popover-anchor"><button type="button" class="button ghost" data-action="popover" aria-expanded="false" aria-controls="pop-keys">${icon("keyboard")}Atajos</button>
        <div class="popover keys" id="pop-keys" hidden>${KEYS_HTML}</div></span>
      <span class="spacer"></span>
      <button type="button" class="button primary" data-action="grade" ${disabledAttrs(gradeReason)}>${icon("grade")}Calificar</button>
      <button type="button" class="button secondary" data-action="new-activity" ${disabledAttrs(activityReason)}>${icon("plus")}Crear actividad</button>
      <button type="button" class="button secondary" data-action="add-student">${icon("userPlus")}Agregar estudiante</button>
      <button type="button" class="button secondary" data-action="import" ${disabledAttrs(importReason)}>${icon("upload")}Importar</button>
      <button type="button" class="button secondary" data-action="export">${icon("download")}Exportar</button>
    </div>
    ${st === "upcoming" ? `<p class="upcoming-note">${icon("calendar")}Este corte abre el ${fmtDate(c.periods[tab].start)}. Primero debe cerrar el Corte ${tab}.</p>` : ""}
    <div id="panel" role="tabpanel" aria-labelledby="tab-${tab}" class="panel">
      ${noStudents
        ? `<div class="empty-state"><p>Este curso no tiene estudiantes todavía.</p><div class="with-button">
            <button type="button" class="button primary" data-action="add-student">${icon("userPlus")}Agregar estudiante</button>
            <button type="button" class="button secondary" data-action="import" ${disabledAttrs(importReason)}>${icon("upload")}Importar</button></div></div>`
        : `<div class="table-wrap"><table class="grades"><thead>${headHTML(c, tab, st)}</thead><tbody id="rows"></tbody></table></div>`}
    </div>
  </section>`;

  if (!noStudents) updateRows(c);
  bindCourse(c);
  if (focusSel) view.querySelector(focusSel)?.focus();
}

function headHTML(c, tab, st) {
  const p = c.periods[tab];
  const splitAttrs = st === "locked"
    ? `aria-disabled="true" data-tip="El Corte ${tab + 1} está cerrado: los porcentajes ya no se pueden cambiar."`
    : `data-action="split" data-tip="Cambiar porcentajes"`;
  const lock = st === "locked" ? icon("lock") : "";
  const acts = p.activities.map(a => st === "active"
    ? `<th class="col-grade"><button type="button" class="th-button" data-action="edit-activity" data-aid="${a.id}" data-tip="${esc(a.name)} · renombrar o eliminar">${esc(a.name)}</button></th>`
    : `<th class="col-grade" data-tip="${esc(a.name)}">${lock}${esc(a.name)}</th>`).join("");
  return `<tr>
    <th class="col-name" scope="col">Estudiante</th><th class="col-code" scope="col">Código</th>
    ${acts}
    <th class="col-grade computed"><button type="button" class="th-button" ${splitAttrs}>${lock}Actividades ${p.split.act}%</button></th>
    <th class="col-grade"><button type="button" class="th-button" ${splitAttrs}>${lock}Parcial ${p.split.exam}%</button></th>
    <th class="col-grade computed">Nota corte</th>
    <th class="col-grade computed group-start" data-tip="Suma de los cortes cerrados, con el % ya evaluado.">Acumulada</th>
    <th class="col-grade computed">Final</th>
  </tr>`;
}

function visibleStudents(c, states, tab) {
  const q = norm(ui.search.trim());
  const p = c.periods[tab];
  return c.students.filter(s => {
    if (q && !norm(`${s.fullName} ${s.code} ${s.docId}`).includes(q)) return false;
    if (ui.pending && (states[tab] === "locked" || !itemsOf(p).some(it => entry(c, s.id, it.id)?.pending))) return false;
    if (ui.failing && round1(calcStudent(c, s.id, states).periods[tab].grade) >= PASS - 1e-9) return false;
    return true;
  });
}

function rowHTML(c, s, states, tab) {
  const p = c.periods[tab], st = states[tab];
  const r = calcStudent(c, s.id, states), pr = r.periods[tab];
  return `<tr tabindex="0" data-sid="${s.id}">
    <td class="col-name" title="${esc(s.fullName)}">${esc(s.fullName)}</td><td class="col-code">${esc(s.code)}</td>
    ${p.activities.map(a => `<td class="col-grade">${gradeCell(c, s.id, a.id, st)}</td>`).join("")}
    ${st === "upcoming" ? emptyComputedTD("") : computedTD(pr.actAvg, `<span class="cell">${fmt1(pr.actAvg)}</span>`)}
    <td class="col-grade">${gradeCell(c, s.id, p.examId, st)}</td>
    ${periodGradeTD(pr.grade, st)}
    ${r.weight ? computedTD(r.acc, accumulatedHTML(r), "group-start") : emptyComputedTD("Aún no hay cortes cerrados.", "group-start")}
    ${r.final !== null ? computedTD(r.acc, passFail(r.final)) : emptyComputedTD("Disponible cuando cierre el Corte 3.")}
  </tr>`;
}

function updateRows(c) {
  const tbody = document.getElementById("rows");
  if (!tbody) return;
  const states = periodStates(c), tab = ui.tab[c.id];
  const list = visibleStudents(c, states, tab);
  const cols = c.periods[tab].activities.length + 7;
  if (list.length) { tbody.innerHTML = list.map(s => rowHTML(c, s, states, tab)).join(""); return; }
  const allDone = ui.pending && !ui.search.trim() && !ui.failing;
  tbody.innerHTML = `<tr class="no-results"><td colspan="${cols}"><div class="empty-state">${allDone
    ? "<p>¡Todo al día! No hay notas pendientes en este corte.</p>"
    : `<p>No hay estudiantes que coincidan.</p><button type="button" class="button secondary" data-action="clear-all">Limpiar búsqueda</button>`}</div></td></tr>`;
}

function bindCourse(c) {
  const search = document.getElementById("search");
  search.oninput = () => {
    ui.search = search.value;
    view.querySelector("[data-action='clear-search']").hidden = !ui.search;
    updateRows(c);
  };

  view.onclick = e => {
    const t = e.target.closest("[data-action], [data-tab], tr[data-sid]");
    if (!t || isDisabled(t)) return;
    if (t.dataset.tab !== undefined) { selectTab(c, +t.dataset.tab); return; }
    if (t.dataset.sid) { openStudent(c, t.dataset.sid); return; }
    const tab = ui.tab[c.id];
    switch (t.dataset.action) {
      case "clear-search": ui.search = ""; search.value = ""; t.hidden = true; updateRows(c); search.focus(); break;
      case "clear-all": Object.assign(ui, { search: "", pending: false, failing: false }); renderCourse(c.id, "#search"); break;
      case "f-pending": ui.pending = !ui.pending; t.setAttribute("aria-pressed", ui.pending); updateRows(c); break;
      case "f-failing": ui.failing = !ui.failing; t.setAttribute("aria-pressed", ui.failing); updateRows(c); break;
      case "popover": togglePopover(t); break;
      case "grade": openGradeChooser(c, tab); break;
      case "new-activity": openActivityForm(c, tab); break;
      case "edit-activity": openActivityForm(c, tab, c.periods[tab].activities.find(a => a.id === t.dataset.aid)); break;
      case "split": openSplit(c, tab); break;
      case "add-student": openStudentForm(c); break;
      case "import": openImport(c); break;
      case "export": openExport(c); break;
    }
  };

  view.onkeydown = e => {
    const row = e.target.closest?.("tr[data-sid]");
    if (row && e.key === "Enter") { e.preventDefault(); openStudent(c, row.dataset.sid); return; }
    const tabEl = e.target.closest?.("[data-tab]");
    if (tabEl && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      selectTab(c, (+tabEl.dataset.tab + (e.key === "ArrowRight" ? 1 : 2)) % 3);
    }
  };
}

function selectTab(c, i) {
  ui.tab[c.id] = i;
  renderCourse(c.id, `[data-tab="${i}"]`);
}

const refresh = c => { save(); if (location.hash === `#/course/${c.id}`) renderCourse(c.id); };
const rowFocus = sid => () => document.querySelector(`tr[data-sid="${sid}"]`) || document.getElementById("search");

// ---------- Grading: chooser + walk-through ----------
function openGradeChooser(c, pi) {
  const p = c.periods[pi], n = c.students.length;
  const graded = id => c.students.filter(s => { const e = entry(c, s.id, id); return e && !e.pending; }).length;
  const m = openModal({
    title: "¿Qué vas a calificar?", sub: `Corte ${pi + 1} · ${esc(c.name)}`,
    body: `<div class="choice-list">${itemsOf(p).map(it => `<button type="button" class="button secondary" data-item="${it.id}">
      <span>${esc(it.name)}</span><span class="helper">${graded(it.id)} de ${n} con nota</span></button>`).join("")}</div>`,
  });
  m.el.querySelectorAll("[data-item]").forEach(b => b.onclick = () => { m.close(true); openWalkthrough(c, pi, b.dataset.item); });
}

function openWalkthrough(c, pi, itemId) {
  const students = [...c.students];
  const item = itemsOf(c.periods[pi]).find(it => it.id === itemId);
  let idx = 0;
  const m = openModal({
    title: `Calificar · ${esc(item.name)}`, sub: `Corte ${pi + 1} · ${esc(c.name)}`, wide: true, focus: "#wt-input",
    returnFocus: () => view.querySelector("[data-action='grade']"),
    body: `<div class="wt-meta"><span id="wt-pos"></span><span id="wt-status"></span></div>
      <div id="wt-student"></div>
      <div class="field"><label for="wt-input">Nota (0,0 a 5,0)</label>
        <input id="wt-input" class="input grade-input-lg" inputmode="decimal" autocomplete="off" aria-describedby="wt-input-msg">
        ${msgHTML("wt-input-msg")}</div>`,
    foot: `<div class="left"><button type="button" class="button secondary" data-prev>${icon("chevronLeft")}Anterior <span class="kbd">Shift+Enter</span></button></div>
      <button type="button" class="button primary" data-next>Siguiente <span class="kbd">Enter</span>${icon("chevronRight")}</button>`,
    after: `<div class="keymap-hint" aria-hidden="true"><span><b>Enter</b> siguiente</span><span><b>Shift+Enter</b> anterior</span><span><b>Esc</b> cerrar</span></div>`,
  });
  const input = m.el.querySelector("#wt-input");

  const show = () => {
    const s = students[idx], e = entry(c, s.id, itemId);
    m.el.querySelector("#wt-pos").textContent = `Estudiante ${idx + 1} de ${students.length}`;
    m.el.querySelector("#wt-status").innerHTML = e?.pending ? `<span class="badge pending">${icon("clock")}Pendiente</span>` : "";
    // Replace only the name block so its entry animation never touches the input (typing is never delayed).
    m.el.querySelector("#wt-student").innerHTML = `<div class="wt-student" aria-live="polite"><span class="name">${esc(s.fullName)}</span><span class="code">Código ${esc(s.code)}</span></div>`;
    input.value = e && !e.pending ? fmt1(e.v) : "";
    setError(input, "");
    input.focus();
    input.select();
  };

  const commit = dir => {
    const r = parseGrade(input.value);
    if (r.error) { setError(input, r.error); input.focus(); return; }
    const s = students[idx];
    // Any navigation away from an empty field records a pending 0,0 (03-flows).
    setEntry(c, s.id, itemId, r.empty ? { v: 0, pending: true } : { v: r.value, pending: false });
    refresh(c);
    if (dir > 0 && idx === students.length - 1) {
      m.close(true);
      const pending = students.filter(x => entry(c, x.id, itemId)?.pending).length;
      toast(`Terminaste de calificar ${item.name}${pending ? `. Te faltan ${plural(pending, "nota pendiente", "notas pendientes")}` : ""}.`);
      return;
    }
    idx = Math.max(0, Math.min(students.length - 1, idx + dir));
    show();
  };

  input.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    commit(e.shiftKey ? -1 : 1);
  });
  input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true" && !parseGrade(input.value).error) setError(input, ""); });
  m.el.querySelector("[data-next]").onclick = () => commit(1);
  m.el.querySelector("[data-prev]").onclick = () => commit(-1);
  show();
}

// ---------- Student modal ----------
function studentSummaryHTML(c, sid, pi) {
  const states = periodStates(c), r = calcStudent(c, sid, states), pr = r.periods[pi], st = states[pi];
  const box = (k, x, inner) => `<div ${x !== null ? `data-tip="Exacto: ${fmtExact(x)}"` : ""}><span class="k">${k}</span><span class="v">${inner}</span></div>`;
  return box(`Actividades ${c.periods[pi].split.act}%`, pr.actAvg, `<span class="cell">${fmt1(pr.actAvg)}</span>`)
    + box(`Nota Corte ${pi + 1}`, pr.grade, st === "active" ? `<span class="cell v-progress">${icon("hourglass")}${fmt1(pr.grade)}<span class="sr-only"> en curso</span></span>` : passFail(pr.grade))
    + box("Acumulada", r.weight ? r.acc : null, r.weight ? accumulatedHTML(r) : `<span class="cell v-empty">—</span>`)
    + box("Final", r.final !== null ? r.acc : null, r.final !== null ? passFail(r.final) : `<span class="cell v-empty">—</span>`);
}

function gradeRowHTML(prefix, it, val, { readOnly = false, badge = "", live = true } = {}) {
  const id = `${prefix}-${it.id}`;
  return `<div class="grade-row"><label for="${id}">${esc(it.name)} ${badge}</label>
    <input id="${id}" data-item="${it.id}" class="input" inputmode="decimal" autocomplete="off" value="${val}" ${readOnly ? "readonly" : ""} aria-describedby="${id}-msg">
    ${msgHTML(`${id}-msg`, live)}</div>`;
}

function openStudent(c, sid) {
  const s = c.students.find(x => x.id === sid);
  const states = periodStates(c);
  let pi = states.indexOf("active");
  const readOnly = pi < 0;
  if (readOnly) pi = 2;
  const items = itemsOf(c.periods[pi]);
  const rowsHTML = items.map(it => {
    const e = entry(c, sid, it.id);
    const val = readOnly ? fmt1(e?.v ?? 0) : e && !e.pending ? fmt1(e.v) : "";
    return gradeRowHTML("g", it, val, { readOnly, badge: e?.pending && !readOnly ? `<span class="badge pending">${icon("clock")}Pendiente</span>` : "" });
  }).join("");

  const m = openModal({
    title: esc(s.fullName), sub: `Código ${esc(s.code)} · Documento ${esc(s.docId)}`, returnFocus: rowFocus(sid),
    body: `<div class="summary-grid" id="st-sum">${studentSummaryHTML(c, sid, pi)}</div>
      <h3 class="section-title">Notas del Corte ${pi + 1}${readOnly ? " (cerrado)" : ""}</h3>
      <div class="grade-rows">${rowsHTML}</div>`,
    foot: `<div class="left"><button type="button" class="button secondary" data-edit>${icon("pencil")}Editar datos</button>
      <button type="button" class="button danger" data-remove>${icon("trash")}Sacar del curso</button></div>
      <button type="button" class="button primary" data-done>Cerrar</button>`,
  });

  const saveInput = input => {
    const r = parseGrade(input.value);
    if (r.error) { setError(input, r.error); return false; }
    setError(input, "");
    const item = input.dataset.item, e = entry(c, sid, item);
    let next;
    if (r.empty) next = e?.pending ? e : null;           // clearing a real grade leaves the cell empty
    else next = { v: r.value, pending: false };
    const changed = JSON.stringify(next ?? null) !== JSON.stringify(e ?? null);
    if (!changed) return true;
    setEntry(c, sid, item, next);
    refresh(c);
    if (next && !next.pending) input.closest(".grade-row").querySelector(".badge")?.remove();
    m.el.querySelector("#st-sum").innerHTML = studentSummaryHTML(c, sid, pi);
    toast(`Guardaste la nota de ${items.find(it => it.id === item).name}.`);
    return true;
  };

  if (!readOnly) {
    const inputs = [...m.el.querySelectorAll(".grade-rows input")];
    inputs.forEach((input, i) => {
      input.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (saveInput(input)) (inputs[i + 1] || m.el.querySelector("[data-done]")).focus();
      });
      input.addEventListener("change", () => saveInput(input));
      input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true" && !parseGrade(input.value).error) setError(input, ""); });
    });
  }
  m.el.querySelector("[data-done]").onclick = () => m.close();
  m.el.querySelector("[data-edit]").onclick = () => openStudentForm(c, s, () => {
    m.el.querySelector("h2").textContent = s.fullName;
    m.el.querySelector(".sub").textContent = `Código ${s.code} · Documento ${s.docId}`;
  });
  m.el.querySelector("[data-remove]").onclick = () => confirmDialog({
    title: `¿Sacar a ${esc(s.fullName)} del curso?`,
    body: "Se borrarán todas sus notas, incluidas las de cortes cerrados. No se puede deshacer.",
    confirm: "Sacar del curso",
    onConfirm: () => {
      c.students = c.students.filter(x => x.id !== sid);
      delete c.grades[sid];
      m.close(true);
      refresh(c);
      document.getElementById("search")?.focus();
      toast(`Sacaste a ${s.fullName} del curso.`);
    },
  });
}

// ---------- Student form (add / edit) ----------
function studentFieldError(c, self, key, val) {
  const f = FIELDS.find(x => x.key === key);
  const v = val.trim();
  if (!v) return `Escribe el ${f.label.toLowerCase()}.`;
  if (f.email && !EMAIL_RE.test(v)) return "El correo no es válido. Revisa que tenga @ y un dominio, por ejemplo ana@uni.edu.co.";
  if (f.unique && c.students.some(o => o.id !== self?.id && norm(o[key]) === norm(v))) return `Ya hay un estudiante con ese ${f.label.toLowerCase()} en este curso.`;
  return "";
}

function openStudentForm(c, s = null, onSaved = null) {
  const states = periodStates(c);
  const late = s ? [] : c.periods.map((p, i) => ({ p, i })).filter(x => states[x.i] === "locked");
  const fields = FIELDS.map(f => `<div class="field"><label for="sf-${f.key}">${f.label}</label>
      <input id="sf-${f.key}" data-key="${f.key}" class="input" ${f.email ? 'inputmode="email"' : ""} autocomplete="off" value="${esc(s?.[f.key] ?? "")}"
        aria-describedby="sf-${f.key}-msg${f.key === "fullName" ? " sf-help" : ""}">
      ${f.key === "fullName" ? `<p class="helper" id="sf-help">Apellidos primero, por ejemplo: Gómez Pérez Laura María.</p>` : ""}
      ${msgHTML(`sf-${f.key}-msg`, false)}</div>`).join("");
  const lateHTML = late.map(({ p, i }) => `<h3 class="section-title">Notas del Corte ${i + 1} (cerrado)</h3>
      <p class="helper">Este corte ya cerró: escribe todas sus notas para poder guardar.</p>
      <div class="grade-rows">${itemsOf(p).map(it => gradeRowHTML("lg", it, "", { live: false })).join("")}</div>`).join("");

  const m = openModal({
    title: s ? "Editar datos" : "Agregar estudiante", sub: esc(s ? s.fullName : `${c.name} · ${c.semester}`),
    body: `<div class="inline-message" id="sf-summary" role="alert"></div>` + fields + lateHTML,
    foot: `<button type="button" class="button secondary" data-cancel>Cancelar</button><button type="button" class="button primary" data-save>${s ? "Guardar" : "Agregar estudiante"}</button>`,
  });
  trackDirty(m);
  const inputs = [...m.el.querySelectorAll("[data-key]")];
  const gradeInputs = [...m.el.querySelectorAll(".grade-rows input")];

  inputs.forEach(input => {
    input.addEventListener("blur", () => { if (input.value.trim()) setError(input, studentFieldError(c, s, input.dataset.key, input.value)); });
    input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true") setError(input, studentFieldError(c, s, input.dataset.key, input.value)); });
  });
  gradeInputs.forEach(input => {
    input.addEventListener("blur", () => { const r = parseGrade(input.value); if (r.error) setError(input, r.error); });
    input.addEventListener("input", () => { if (input.getAttribute("aria-invalid") === "true") { const r = parseGrade(input.value); setError(input, r.error || ""); } });
  });

  m.el.querySelector("[data-cancel]").onclick = () => m.close();
  m.el.querySelector("[data-save]").onclick = () => {
    const bad = [];
    inputs.forEach(input => { const err = studentFieldError(c, s, input.dataset.key, input.value); setError(input, err); if (err) bad.push(input); });
    gradeInputs.forEach(input => {
      const r = parseGrade(input.value);
      const err = r.empty ? "Escribe la nota." : r.error || "";
      setError(input, err);
      if (err) bad.push(input);
    });
    setSummary(m.el.querySelector("#sf-summary"), bad.length);
    if (bad.length) { bad[0].focus(); return; }
    const data = Object.fromEntries(inputs.map(i => [i.dataset.key, i.value.trim()]));
    if (s) {
      Object.assign(s, data);
      sortStudents(c);
      m.close(true);
      refresh(c);
      onSaved?.();
      toast("Guardaste los cambios.");
      return;
    }
    const student = { id: uid("s"), ...data };
    c.students.push(student);
    sortStudents(c);
    gradeInputs.forEach(input => setEntry(c, student.id, input.dataset.item, { v: parseGrade(input.value).value, pending: false }));
    m.close(true);
    refresh(c);
    toast(`Agregaste a ${student.fullName}.`);
  };
}

// ---------- Activities ----------
function openActivityForm(c, pi, act = null) {
  const p = c.periods[pi];
  const lastReason = p.activities.length === 1 ? "Cada corte necesita al menos una actividad." : "";
  const m = openModal({
    title: act ? "Actividad" : "Nueva actividad", sub: `Corte ${pi + 1} · ${esc(c.name)}`,
    body: `<div class="field"><label for="act-name">Nombre</label>
      <input id="act-name" class="input" autocomplete="off" placeholder="Ej. Taller 4" value="${esc(act?.name ?? "")}" aria-describedby="act-name-msg">
      ${msgHTML("act-name-msg")}</div>`,
    foot: `${act ? `<div class="left"><button type="button" class="button danger" data-delete ${disabledAttrs(lastReason)}>${icon("trash")}Eliminar actividad</button></div>` : ""}
      <button type="button" class="button secondary" data-cancel>Cancelar</button>
      <button type="button" class="button primary" data-save>${act ? "Guardar" : "Crear actividad"}</button>`,
  });
  trackDirty(m);
  const input = m.el.querySelector("#act-name");
  const submit = () => {
    const name = input.value.trim();
    if (!name) { setError(input, "Escribe el nombre de la actividad."); input.focus(); return; }
    if (act) act.name = name; else p.activities.push({ id: uid("a"), name });
    m.close(true);
    refresh(c);
    toast(act ? "Guardaste el nombre." : `Creaste la actividad ${name}.`);
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  input.addEventListener("input", () => { if (input.value.trim()) setError(input, ""); });
  m.el.querySelector("[data-cancel]").onclick = () => m.close();
  m.el.querySelector("[data-save]").onclick = submit;
  const del = m.el.querySelector("[data-delete]");
  if (del) del.onclick = () => {
    if (isDisabled(del)) return;
    confirmDialog({
      title: `¿Eliminar ${esc(act.name)}?`, body: "Se borrarán las notas de esta actividad de todos los estudiantes.",
      confirm: "Eliminar actividad",
      onConfirm: () => {
        p.activities = p.activities.filter(a => a.id !== act.id);
        Object.values(c.grades).forEach(g => delete g[act.id]);
        m.close(true);
        refresh(c);
        toast(`Eliminaste ${act.name}.`);
      },
    });
  };
}

// ---------- Split editor ----------
function parsePercent(v) { return /^\d{1,3}$/.test(v.trim()) && +v <= 100 ? +v : null; }

function openSplit(c, pi) {
  const p = c.periods[pi];
  const m = openModal({
    title: "Actividades y parcial", sub: `Corte ${pi + 1} · ${esc(c.name)}`,
    body: `<p class="helper">Cambia uno y el otro se completa hasta 100%.</p>
      <div class="split-fields">
        <div class="field"><label for="sp-act">Actividades (%)</label><input id="sp-act" class="input" inputmode="numeric" value="${p.split.act}" aria-describedby="sp-act-msg">${msgHTML("sp-act-msg")}</div>
        <div class="field"><label for="sp-exam">Parcial (%)</label><input id="sp-exam" class="input" inputmode="numeric" value="${p.split.exam}" aria-describedby="sp-exam-msg">${msgHTML("sp-exam-msg")}</div>
      </div>`,
    foot: `<button type="button" class="button secondary" data-cancel>Cancelar</button><button type="button" class="button primary" data-save>Guardar</button>`,
  });
  trackDirty(m);
  const a = m.el.querySelector("#sp-act"), x = m.el.querySelector("#sp-exam");
  const link = (src, dst) => src.addEventListener("input", () => {
    const v = parsePercent(src.value);
    setError(src, v === null && src.value.trim() ? "Usa un número entero entre 0 y 100." : "");
    if (v !== null) { dst.value = 100 - v; setError(dst, ""); }
  });
  link(a, x);
  link(x, a);
  const submit = () => {
    const v = parsePercent(a.value);
    if (v === null) { setError(a, "Usa un número entero entre 0 y 100."); a.focus(); return; }
    p.split = { act: v, exam: 100 - v };
    m.close(true);
    refresh(c);
    toast("Guardaste los porcentajes. Las notas se recalcularon.");
  };
  [a, x].forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }));
  m.el.querySelector("[data-cancel]").onclick = () => m.close();
  m.el.querySelector("[data-save]").onclick = submit;
}

// ---------- Import ----------
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const delim = first.split(";").length >= first.split(",").length ? ";" : ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function classifyImport(text, existing) {
  const rows = parseCSV(text).filter(r => r.some(x => x.trim()));
  if (rows.length < 2) return { error: "El archivo está vacío o solo tiene la fila de encabezados." };
  const head = rows[0].map(h => norm(h).replace(/[^a-z]/g, ""));
  const col = {};
  for (const f of FIELDS) {
    const i = head.findIndex(h => f.names.includes(h));
    if (i < 0) return { error: `Falta la columna "${f.label}". La primera fila debe tener: ${FIELDS.map(x => x.label).join(", ")}.` };
    col[f.key] = i;
  }
  const uniques = FIELDS.filter(f => f.unique);
  const seen = Object.fromEntries(uniques.map(f => [f.key, new Set(existing.map(s => norm(s[f.key])))]));
  const ok = [], dup = [], bad = [];
  rows.slice(1).forEach((r, n) => {
    const s = Object.fromEntries(FIELDS.map(f => [f.key, (r[col[f.key]] ?? "").trim()]));
    const line = n + 2, who = s.fullName || "sin nombre";
    const missing = FIELDS.find(f => !s[f.key]);
    if (missing) return bad.push({ line, who, reason: `falta ${missing.label.toLowerCase()}` });
    const badEmail = FIELDS.find(f => f.email && !EMAIL_RE.test(s[f.key]));
    if (badEmail) return bad.push({ line, who, reason: `${badEmail.label.toLowerCase()} no válido` });
    const clash = uniques.find(f => seen[f.key].has(norm(s[f.key])));
    if (clash) return dup.push({ line, who, reason: `${clash.label.toLowerCase()} repetido (${s[clash.key]})` });
    uniques.forEach(f => seen[f.key].add(norm(s[f.key])));
    ok.push(s);
  });
  return { ok, dup, bad };
}

function previewHTML(res) {
  const group = (title, iconName, items, fmt) => `<div class="preview-group"><h3>${icon(iconName)}${title}</h3>${items.length ? `<ul>${items.map(fmt).join("")}</ul>` : ""}</div>`;
  const skipped = x => `<li>Fila ${x.line} · ${esc(x.who)} <span class="reason">— ${esc(x.reason)}</span></li>`;
  return group(`${plural(res.ok.length, "estudiante", "estudiantes")} para importar`, "check", res.ok, s => `<li>${esc(s.fullName)}</li>`)
    + (res.dup.length ? group(`${plural(res.dup.length, "fila repetida", "filas repetidas")}: no se ${res.dup.length === 1 ? "importa" : "importan"}`, "info", res.dup, skipped) : "")
    + (res.bad.length ? group(`${plural(res.bad.length, "fila incompleta o inválida", "filas incompletas o inválidas")}: no se ${res.bad.length === 1 ? "importa" : "importan"}`, "alert", res.bad, skipped) : "")
    + (res.dup.length || res.bad.length ? `<p class="helper">Puedes agregar a mano las filas que no se importan.</p>` : "");
}

function fileUploadHTML(id) {
  return `<div class="dropzone" data-drop="${id}">${icon("upload", "icon-md")}
      <p>Arrastra aquí tu archivo CSV o Excel</p>
      <button type="button" class="button secondary" data-pick="${id}">${icon("file")}Elegir archivo</button>
      <input id="${id}" type="file" accept=".csv,.xlsx,.xls" class="sr-only" tabindex="-1" aria-hidden="true"></div>
    ${msgHTML(`${id}-msg`)}<div id="${id}-preview" class="grade-rows" aria-live="polite"></div>`;
}

function bindFileUpload(scope, id, existing, onParsed) {
  const input = scope.querySelector(`#${id}`), zone = scope.querySelector(`[data-drop="${id}"]`);
  const msg = scope.querySelector(`#${id}-msg`), preview = scope.querySelector(`#${id}-preview`);
  const fail = text => { msg.innerHTML = `${icon("alert")}<span>${esc(text)}</span>`; onParsed(null); };
  const handle = async file => {
    msg.innerHTML = ""; preview.innerHTML = "";
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) return fail("Este prototipo solo lee CSV. Guarda tu archivo de Excel como CSV y súbelo de nuevo.");
    if (!/\.csv$/i.test(file.name)) return fail("El archivo debe ser CSV o Excel.");
    const res = classifyImport(await file.text(), existing);
    if (res.error) return fail(res.error);
    preview.innerHTML = `<p><b>${esc(file.name)}</b></p>${previewHTML(res)}`;
    onParsed(res);
  };
  scope.querySelector(`[data-pick="${id}"]`).onclick = () => input.click();
  input.onchange = () => handle(input.files[0]);
  zone.ondragover = e => { e.preventDefault(); zone.classList.add("over"); };
  zone.ondragleave = () => zone.classList.remove("over");
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove("over"); handle(e.dataTransfer.files[0]); };
}

function addStudents(c, list) {
  list.forEach(s => c.students.push({ id: uid("s"), ...s }));
  sortStudents(c);
}

function openImport(c) {
  let res = null;
  const m = openModal({
    title: "Importar estudiantes", sub: `${esc(c.name)} · ${esc(c.semester)}`,
    body: `<p class="helper">La primera fila debe tener: ${FIELDS.map(f => f.label).join(", ")}.</p>${fileUploadHTML("imp-file")}`,
    foot: `<button type="button" class="button secondary" data-cancel>Cancelar</button><button type="button" class="button primary" data-save ${disabledAttrs("Primero elige un archivo.")}>Importar</button>`,
  });
  const btn = m.el.querySelector("[data-save]");
  m.isDirty = () => !!res;
  bindFileUpload(m.el, "imp-file", c.students, r => {
    res = r;
    const n = r?.ok.length ?? 0;
    btn.innerHTML = n ? `Importar ${plural(n, "estudiante", "estudiantes")}` : "Importar";
    if (n) { btn.removeAttribute("aria-disabled"); delete btn.dataset.tip; }
    else { btn.setAttribute("aria-disabled", "true"); btn.dataset.tip = r ? "No hay filas para importar." : "Primero elige un archivo."; }
  });
  m.el.querySelector("[data-cancel]").onclick = () => m.close();
  btn.onclick = () => {
    if (isDisabled(btn)) return;
    addStudents(c, res.ok);
    m.close(true);
    refresh(c);
    toast(`Importaste ${plural(res.ok.length, "estudiante", "estudiantes")}.`);
  };
}

// ---------- Export ----------
const csvCell = v => { const s = String(v); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function downloadCSV(name, rows) {
  const text = "\uFEFF" + rows.map(r => r.map(csvCell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function periodColumns(c, i, prefix = "") {
  const p = c.periods[i];
  return [...p.activities.map(a => prefix + a.name), `${prefix}Parcial`, `${prefix}Actividades (${p.split.act}%)`, `${prefix}Nota corte`];
}
function periodValues(c, sid, i, r) {
  const p = c.periods[i];
  return [...itemsOf(p).map(it => fmt1(value(c, sid, it.id))), fmt1(r.periods[i].actAvg), fmt1(r.periods[i].grade)];
}

function openExport(c) {
  const states = periodStates(c);
  const locked = c.periods.map((_, i) => i).filter(i => states[i] === "locked");
  const firstOpen = states.findIndex(s => s !== "locked") + 1;
  const allLocked = locked.length === 3;
  const opt = (value, title, desc, reason, extra = "") => `<label class="radio${reason ? " disabled" : ""}">
      <input type="radio" name="exp" value="${value}" ${reason ? "disabled" : ""}>
      <span><b>${title}</b><br><span class="helper">${desc}</span>${reason ? `<span class="inline-message info">${icon("info")}<span>${reason}</span></span>` : ""}${extra}</span></label>`;
  const m = openModal({
    title: "Exportar", sub: `${esc(c.name)} · ${esc(c.semester)}`,
    body: `<fieldset class="radio-list"><legend class="sr-only">Qué quieres exportar</legend>
      ${opt("period", "Un corte", "Notas de un corte cerrado, con todo el detalle.", locked.length ? "" : `Disponible cuando cierre el Corte ${firstOpen}.`,
        locked.length ? `<select class="select" id="exp-period" aria-label="Corte a exportar">${locked.map(i => `<option value="${i}">Corte ${i + 1}</option>`).join("")}</select>` : "")}
      ${opt("all", "Los 3 cortes y la final", "Todo el semestre en un archivo.", allLocked ? "" : "Disponible cuando cierre el Corte 3.")}
      ${opt("students", "Lista de estudiantes", "Solo los datos, sin notas.", "")}
    </fieldset>`,
    foot: `<button type="button" class="button secondary" data-cancel>Cancelar</button><button type="button" class="button primary" data-save>${icon("download")}Exportar</button>`,
  });
  m.el.querySelector("input[name=exp]:not([disabled])").checked = true;
  m.el.querySelector("[data-cancel]").onclick = () => m.close();
  m.el.querySelector("[data-save]").onclick = () => {
    const kind = m.el.querySelector("input[name=exp]:checked").value;
    const base = `${c.name} ${c.semester}`;
    const people = FIELDS.map(f => f.label);
    let name, rows;
    if (kind === "students") {
      name = `${base} - Estudiantes.csv`;
      rows = [people, ...c.students.map(s => FIELDS.map(f => s[f.key]))];
    } else if (kind === "period") {
      const i = +m.el.querySelector("#exp-period").value;
      name = `${base} - Corte ${i + 1}.csv`;
      rows = [[...people, ...periodColumns(c, i)], ...c.students.map(s => [...FIELDS.map(f => s[f.key]), ...periodValues(c, s.id, i, calcStudent(c, s.id, states))])];
    } else {
      name = `${base} - Final.csv`;
      rows = [[...people, ...[0, 1, 2].flatMap(i => periodColumns(c, i, `C${i + 1} `)), "Final"],
        ...c.students.map(s => { const r = calcStudent(c, s.id, states); return [...FIELDS.map(f => s[f.key]), ...[0, 1, 2].flatMap(i => periodValues(c, s.id, i, r)), fmt1(r.final)]; })];
    }
    downloadCSV(name, rows);
    m.close(true);
    toast(`Exportaste ${name}.`);
  };
}

// ---------- Create course wizard ----------
let wz = null;
const newWizard = () => ({
  step: 0, name: "", year: String(TODAY.getFullYear()), term: TODAY.getMonth() < 6 ? "1" : "2",
  periods: [0, 1, 2].map(() => ({ start: "", end: "", act: "40" })), imp: null, touched: new Set(),
});
const wizardDirty = () => !!wz && (wz.name.trim() || wz.periods.some(p => p.start || p.end || p.act !== "40") || wz.imp);
const semesterOf = () => `${wz.year}-${wz.term}`;

function dateFieldHTML(id, value, label) {
  return `<div class="field"><div class="with-button">
      <input id="${id}" class="input" placeholder="DD/MM/AAAA" value="${esc(value)}" aria-label="${label}" aria-describedby="${id}-msg" autocomplete="off">
      <button type="button" class="icon-button" data-date="${id}" aria-label="Elegir fecha: ${label}">${icon("calendar")}</button>
      <input type="date" class="sr-only" tabindex="-1" aria-hidden="true" data-native="${id}"></div>
    ${msgHTML(`${id}-msg`, live)}</div>`;
}

function wizardErrors() {
  const e = {};
  if (wz.step === 0) {
    const name = wz.name.trim();
    if (!name) e["wz-name"] = "Escribe el nombre del curso.";
    else if (db.courses.some(c => norm(c.name) === norm(name) && c.semester === semesterOf()))
      e["wz-name"] = `Ya tienes ${name} en ${semesterOf()}. Cambia el nombre, por ejemplo ${name} A.`;
  }
  if (wz.step === 1) {
    let prevEnd = null;
    wz.periods.forEach((p, i) => {
      const s = parseDMY(p.start), en = parseDMY(p.end), fmt = "Usa el formato DD/MM/AAAA, por ejemplo 03/08/2026.";
      if (!p.start.trim()) e[`wz-s${i}`] = "Escribe la fecha de inicio.";
      else if (!s) e[`wz-s${i}`] = fmt;
      else if (prevEnd && s <= prevEnd) e[`wz-s${i}`] = `Debe empezar después del fin del Corte ${i}.`;
      if (!p.end.trim()) e[`wz-e${i}`] = "Escribe la fecha de fin.";
      else if (!en) e[`wz-e${i}`] = fmt;
      else if (s && en <= s) e[`wz-e${i}`] = "El fin debe ser después del inicio.";
      if (parsePercent(p.act) === null) e[`wz-a${i}`] = "Usa un número entero entre 0 y 100.";
      prevEnd = en || prevEnd;
    });
  }
  return e;
}

function showWizardErrors(all) {
  const e = wizardErrors();
  if (all) Object.keys(e).forEach(k => wz.touched.add(k));
  view.querySelectorAll("#wz-body .input").forEach(input => {
    if (!input.id) return;
    if (wz.touched.has(input.id) || (input.getAttribute("aria-invalid") === "true")) setError(input, e[input.id] || "");
  });
  return e;
}

function renderWizard() {
  wz ??= newWizard();
  leaveGuard = wizardDirty;
  setCrumbs("Crear curso");
  const steps = ["Datos del curso", "Cortes", "Estudiantes"];
  const years = [-1, 0, 1].map(d => String(TODAY.getFullYear() + d));
  let body = "";
  if (wz.step === 0) {
    body = `<div class="form-col">
      <div class="field"><label for="wz-name">Nombre del curso</label>
        <input id="wz-name" class="input" placeholder="Ej. Cálculo I" value="${esc(wz.name)}" aria-describedby="wz-name-msg" autocomplete="off">${msgHTML("wz-name-msg")}</div>
      <fieldset class="field plain"><legend class="label">Semestre</legend><div class="split-fields">
        <div class="field"><label class="helper" for="wz-year">Año</label><select id="wz-year" class="select">${years.map(y => `<option ${y === wz.year ? "selected" : ""}>${y}</option>`).join("")}</select></div>
        <div class="field"><label class="helper" for="wz-term">Periodo</label><select id="wz-term" class="select">${["1", "2"].map(t => `<option ${t === wz.term ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      </div></fieldset></div>`;
  } else if (wz.step === 1) {
    body = `<div class="period-grid">
      <span></span><span class="label">Inicio</span><span class="label">Fin</span><span class="label">Actividades (%)</span><span class="label">Parcial (%)</span>
      ${wz.periods.map((p, i) => `<span class="ph">Corte ${i + 1}</span>
        ${dateFieldHTML(`wz-s${i}`, p.start, `Inicio del Corte ${i + 1}`)}
        ${dateFieldHTML(`wz-e${i}`, p.end, `Fin del Corte ${i + 1}`)}
        <div class="field"><input id="wz-a${i}" class="input" inputmode="numeric" value="${esc(p.act)}" aria-label="Actividades del Corte ${i + 1} (%)" aria-describedby="wz-a${i}-msg">${msgHTML(`wz-a${i}-msg`, false)}</div>
        <div class="field"><input id="wz-x${i}" class="input" inputmode="numeric" value="${parsePercent(p.act) === null ? "" : 100 - p.act}" aria-label="Parcial del Corte ${i + 1} (%)"></div>`).join("")}
    </div><p class="helper">Cambia un porcentaje y el otro se completa hasta 100%.</p>`;
  } else {
    body = `<div class="form-col"><p>Este paso es opcional: puedes crear el curso sin estudiantes y agregarlos después.</p>
      <p class="helper">La primera fila debe tener: ${FIELDS.map(f => f.label).join(", ")}.</p>${fileUploadHTML("wz-file")}</div>`;
  }
  const n = wz.imp?.ok.length ?? 0;
  const foot = wz.step < 2
    ? `<button type="button" class="button primary" data-next>Siguiente${icon("chevronRight")}</button>`
    : `<button type="button" class="button secondary" data-skip>Omitir y crear curso</button>
       <button type="button" class="button primary" data-create ${disabledAttrs(n ? "" : wz.imp ? "No hay filas para importar." : "Primero elige un archivo.")}>${n ? `Crear curso con ${plural(n, "estudiante", "estudiantes")}` : "Crear curso con estudiantes"}</button>`;

  view.innerHTML = `<section class="wizard">
    <div class="page-title-row"><h1>Crear curso</h1></div>
    <ol class="steps">${steps.map((s, i) => `<li class="${i < wz.step ? "done" : ""}" ${i === wz.step ? 'aria-current="step"' : ""}>${s}</li>`).join("")}</ol>
    <div class="inline-message" id="wz-summary" role="alert"></div>
    <div id="wz-body">${body}</div>
    <div class="wizard-foot">
      ${wz.step ? `<button type="button" class="button secondary" data-back>${icon("chevronLeft")}Atrás</button>` : ""}
      <a class="button ghost" href="#/">Cancelar</a>
      <div class="right">${foot}</div>
    </div>
  </section>`;
  bindWizard();
}

function bindWizard() {
  const q = s => view.querySelector(s);
  if (wz.step === 0) {
    const name = q("#wz-name");
    name.oninput = () => { wz.name = name.value; showWizardErrors(false); };
    name.onblur = () => { if (name.value.trim()) { wz.touched.add("wz-name"); showWizardErrors(false); } };
    q("#wz-year").onchange = e => { wz.year = e.target.value; showWizardErrors(false); };
    q("#wz-term").onchange = e => { wz.term = e.target.value; showWizardErrors(false); };
    requestAnimationFrame(() => name.focus());
  }
  if (wz.step === 1) {
    wz.periods.forEach((p, i) => {
      [["s", "start"], ["e", "end"]].forEach(([k, prop]) => {
        const input = q(`#wz-${k}${i}`), native = q(`[data-native="wz-${k}${i}"]`);
        input.oninput = () => { p[prop] = input.value; showWizardErrors(false); };
        input.onblur = () => { if (input.value.trim()) { wz.touched.add(input.id); showWizardErrors(false); } };
        q(`[data-date="wz-${k}${i}"]`).onclick = () => { native.value = parseDMY(input.value) || ""; native.showPicker?.(); };
        native.onchange = () => { if (!native.value) return; input.value = fmtDate(native.value); p[prop] = input.value; wz.touched.add(input.id); showWizardErrors(false); input.focus(); };
      });
      const act = q(`#wz-a${i}`), exam = q(`#wz-x${i}`);
      act.oninput = () => { p.act = act.value; const v = parsePercent(act.value); exam.value = v === null ? "" : 100 - v; wz.touched.add(act.id); showWizardErrors(false); };
      exam.oninput = () => { const v = parsePercent(exam.value); if (v !== null) { act.value = 100 - v; p.act = act.value; } showWizardErrors(false); };
    });
    requestAnimationFrame(() => q("#wz-s0").focus());
  }
  if (wz.step === 2) {
    const create = q("[data-create]");
    bindFileUpload(view, "wz-file", [], r => {
      wz.imp = r;
      const n = r?.ok.length ?? 0;
      create.innerHTML = n ? `Crear curso con ${plural(n, "estudiante", "estudiantes")}` : "Crear curso con estudiantes";
      if (n) { create.removeAttribute("aria-disabled"); delete create.dataset.tip; }
      else { create.setAttribute("aria-disabled", "true"); create.dataset.tip = r ? "No hay filas para importar." : "Primero elige un archivo."; }
    });
    if (wz.imp) q("#wz-file-preview").innerHTML = previewHTML(wz.imp);
    q("[data-skip]").onclick = () => createCourse([]);
    q("[data-create]").onclick = e => { if (!isDisabled(e.currentTarget)) createCourse(wz.imp.ok); };
  }
  q("[data-next]") && (q("[data-next]").onclick = () => {
    const e = showWizardErrors(true);
    setSummary(q("#wz-summary"), Object.keys(e).length);
    const first = Object.keys(e)[0];
    if (first) { q(`#${first}`).focus(); return; }
    wz.step++;
    renderWizard();
  });
  q("[data-back]") && (q("[data-back]").onclick = () => { wz.step--; renderWizard(); });
}

function createCourse(students) {
  const c = makeCourse(wz.name.trim(), semesterOf(), wz.periods.map(p => ({ start: parseDMY(p.start), end: parseDMY(p.end), act: +p.act })));
  addStudents(c, students);
  db.courses.push(c);
  save();
  wz = null;
  leaveGuard = null;
  location.hash = `#/course/${c.id}`;
  toast(`Creaste el curso ${c.name}${students.length ? ` con ${plural(students.length, "estudiante", "estudiantes")}` : ""}.`);
}

// ---------- Start ----------
load();
renderTheme();
route();
