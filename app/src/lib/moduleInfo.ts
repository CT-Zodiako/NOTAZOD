// Home screen view of the Campus module info (S4, S5): the general corte dates strip and the line
// on each course card. Pure helpers over what listCampusModuleInfo() returns; no I/O, so they run
// under `node --test`. Dates are ISO "yyyy-mm-dd" strings, compared as text.
import type { CampusModuleComponent, CampusPeriodDates } from "./campusModuleInfo.ts";

export type ModuleInfoGroup = { courseId: string; periods: CampusPeriodDates[]; components: CampusModuleComponent[] };
export type PeriodState = "open" | "closed" | "upcoming";
export type HomePeriod = CampusPeriodDates & { opensLabel: string; closesLabel: string; state: PeriodState };

const pad = (value: number) => String(value).padStart(2, "0");

// The local calendar day of a date (not UTC), as "yyyy-mm-dd".
export function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "yyyy-mm-dd" → "dd/mm/yyyy" (as the Campus shows it); "" for a missing or unreadable date.
export function formatDayDate(iso: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

// Both boundaries are inclusive: closed after the closing day, open from the opening day on,
// upcoming otherwise (also when the opening date is unknown, so a corte is never shown open without it).
export function periodState(period: Pick<CampusPeriodDates, "opens" | "closes">, today: string): PeriodState {
  if (period.closes && today > period.closes) return "closed";
  if (period.opens && today >= period.opens) return "open";
  return "upcoming";
}

const datedPeriods = (periods: CampusPeriodDates[]) =>
  periods
    .filter((period) => period.opens || period.closes)
    .map(({ period, opens, closes }) => ({ period, opens, closes }))
    .sort((a, b) => a.period - b.period);

// The dates of the given courses' groups; when they disagree, the set shared by most groups wins
// and a tie goes to the set seen first. Groups without any date do not count.
export function generalPeriodDates(groups: ModuleInfoGroup[], courseIds: Iterable<string>): CampusPeriodDates[] {
  const wanted = new Set(courseIds);
  const counts = new Map<string, { periods: CampusPeriodDates[]; count: number }>();
  for (const group of groups) {
    if (!wanted.has(group.courseId)) continue;
    const periods = datedPeriods(group.periods);
    if (!periods.length) continue;
    const key = JSON.stringify(periods);
    const entry = counts.get(key) ?? { periods, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  let best: { periods: CampusPeriodDates[]; count: number } | undefined;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
  return best?.periods ?? [];
}

// The cortes of the home strip; empty (strip hidden) when no group of the given courses has dates.
export function homePeriodStrip(groups: ModuleInfoGroup[], courseIds: Iterable<string>, today: string): HomePeriod[] {
  return generalPeriodDates(groups, courseIds).map((period) => ({
    ...period,
    opensLabel: formatDayDate(period.opens),
    closesLabel: formatDayDate(period.closes),
    state: periodState(period, today),
  }));
}

const decimal = (value: number) => String(value).replace(".", ",");

// "Pierde con 7 h de falta · Habilitable: No · 2 créditos". Each value comes from the first component
// that has it, going through the course's groups in the given order and each group's table in order.
// Missing values are left out; "" when the course has none.
export function courseModuleSummary(groups: ModuleInfoGroup[], courseId: string) {
  const components = groups.filter((group) => group.courseId === courseId).flatMap((group) => group.components);
  const first = <K extends "absenceLimit" | "habilitable" | "credits">(field: K) =>
    components.map((component) => component[field]).find((value) => value !== null && value !== undefined) ?? null;
  const absenceLimit = first("absenceLimit");
  const habilitable = first("habilitable");
  const credits = first("credits");
  return [
    absenceLimit === null ? "" : `Pierde con ${decimal(absenceLimit)} h de falta`,
    habilitable === null ? "" : `Habilitable: ${habilitable ? "Sí" : "No"}`,
    credits === null ? "" : `${decimal(credits)} ${credits === 1 ? "crédito" : "créditos"}`,
  ].filter(Boolean).join(" · ");
}
