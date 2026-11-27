// Pure parsing of the module info shown in each Campus grading form ("Calificar"): the opening and
// closing date of every corte and the "Componentes de módulo asociados a este grupo" table (S2).
// The page script only hands over the body text and table cells; nothing here throws on a missing
// or garbled value, it just stays empty. No I/O, so it runs under `node --test`.

// Dates are stored as ISO "yyyy-mm-dd" (the Campus shows dd/mm/yyyy); null when the box is missing or unreadable.
export type CampusPeriodDates = { period: number; opens: string | null; closes: string | null };
export type CampusModuleComponent = {
  module: string;
  habilitable: boolean | null;
  credits: number | null;
  // "Faltas Pierde": hours of absence that make the student lose the module.
  absenceLimit: number | null;
  percents: { period: number; percent: number | null }[];
  plan: string;
};
export type CampusModuleInfo = { periods: CampusPeriodDates[]; components: CampusModuleComponent[] };
// What the page script returns: the body text and the cells of every table that may hold the components.
export type CampusFormInfoRaw = { text: string; tables: string[][][] };

// Same normalization as NORMALIZE in campus.ts: no accents, single spaces, lower case.
const norm = (text: unknown) => String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const clean = (text: unknown) => String(text ?? "").replace(/\s+/g, " ").trim();

function isoDate(day: string, month: string, year: string) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date.toISOString().slice(0, 10);
}

// "Apertura Corte N: dd/mm/yyyy" and "Cierre Corte N: dd/mm/yyyy"; the first box of each kind wins.
// Cortes without any readable date are left out.
export function parsePeriodDates(text: unknown): CampusPeriodDates[] {
  const byPeriod = new Map<number, CampusPeriodDates>();
  for (const match of norm(text).matchAll(/(apertura|cierre)\s*corte\s*(\d+)\s*:?\s*(?:(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d))?/g)) {
    const period = Number(match[2]);
    const entry = byPeriod.get(period) ?? { period, opens: null, closes: null };
    byPeriod.set(period, entry);
    const field = match[1] === "apertura" ? "opens" : "closes";
    if (entry[field] === null && match[3]) entry[field] = isoDate(match[3], match[4], match[5]);
  }
  return [...byPeriod.values()].filter((entry) => entry.opens || entry.closes).sort((a, b) => a.period - b.period);
}

const number = (text: string) => (/^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(",", ".")) : null);
const yesNo = (text: string) => (norm(text) === "si" ? true : norm(text) === "no" ? false : null);

// The header row is the one with a "Comp..." and a "Habilitable" cell; every column is found by its header text.
export function parseModuleComponents(tables: unknown): CampusModuleComponent[] {
  if (!Array.isArray(tables)) return [];
  for (const table of tables) {
    if (!Array.isArray(table)) continue;
    const rows = table.map((row) => (Array.isArray(row) ? row.map(clean) : []));
    const headerIndex = rows.findIndex((row) => row.some((cell) => norm(cell).startsWith("comp")) && row.some((cell) => norm(cell).startsWith("habilitable")));
    if (headerIndex < 0) continue;
    const header = rows[headerIndex].map(norm);
    const at = (name: string) => header.findIndex((h) => h.startsWith(name));
    const columns = { module: at("comp"), habilitable: at("habilitable"), credits: at("cred"), absenceLimit: at("faltas"), plan: at("plan") };
    const percentColumns = header
      .map((h, index) => ({ index, period: Number(/^%\s*corte\s*(\d+)/.exec(h)?.[1]) }))
      .filter((column) => column.period > 0)
      .sort((a, b) => a.period - b.period);
    return rows.slice(headerIndex + 1).flatMap((row) => {
      const cell = (index: number) => (index >= 0 ? row[index] ?? "" : "");
      const module = cell(columns.module);
      if (!module) return [];
      return [{
        module,
        habilitable: yesNo(cell(columns.habilitable)),
        credits: number(cell(columns.credits)),
        absenceLimit: number(cell(columns.absenceLimit)),
        percents: percentColumns.map((column) => ({ period: column.period, percent: number(cell(column.index)) })),
        plan: cell(columns.plan),
      }];
    });
  }
  return [];
}

export function parseModuleInfo(raw: { text?: unknown; tables?: unknown } | null | undefined): CampusModuleInfo {
  return { periods: parsePeriodDates(raw?.text ?? ""), components: parseModuleComponents(raw?.tables) };
}

// ---- Storage: JSON columns of campus_course_groups (period_dates, module_components) ----

export function encodeModuleInfo(info: CampusModuleInfo) {
  return { periodDates: JSON.stringify(info.periods), moduleComponents: JSON.stringify(info.components) };
}

const isDate = (value: unknown) => value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
const isNumberOrNull = (value: unknown) => value === null || typeof value === "number";
const isPeriod = (value: any) => value && Number.isInteger(value.period) && isDate(value.opens) && isDate(value.closes);
const isComponent = (value: any) => value && typeof value.module === "string" && (value.habilitable === null || typeof value.habilitable === "boolean")
  && isNumberOrNull(value.credits) && isNumberOrNull(value.absenceLimit) && typeof value.plan === "string"
  && Array.isArray(value.percents) && value.percents.every((p: any) => p && Number.isInteger(p.period) && isNumberOrNull(p.percent));

function decodeList<T>(json: string | null | undefined, valid: (value: any) => boolean): T[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) && value.every(valid) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

// Stored values that are missing or not in the expected shape read back as empty.
export function decodeModuleInfo(periodDates: string | null | undefined, moduleComponents: string | null | undefined): CampusModuleInfo {
  return { periods: decodeList<CampusPeriodDates>(periodDates, isPeriod), components: decodeList<CampusModuleComponent>(moduleComponents, isComponent) };
}
