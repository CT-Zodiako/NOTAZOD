// Exports (period image PNG, grades file CSV/XLS) are saved to the user's Downloads folder by the
// save_to_downloads command, which never overwrites and returns the full saved path.
import { invoke } from "@tauri-apps/api/core";

export type ExportKind = "image" | "grades";
export type GradeTemplateFormat = "csv" | "xls";

export function periodImageFileName(periodNumber: number) {
  return `notazod-corte-${periodNumber}.png`;
}

// Same content the Blob download produced: CSV quoted and ';' separated, XLS as an HTML table, UTF-8.
export function gradeTemplateFile(lines: string[][], format: GradeTemplateFormat, periodNumber: number) {
  const csv = lines.map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(";")).join("\n");
  const html = `<html><head><meta charset="utf-8"></head><body><table>${lines.map((line) => `<tr>${line.map((value) => `<td>${value.replace(/"/g, "")}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
  return {
    fileName: `plantilla-notas-corte-${periodNumber}.${format}`,
    bytes: new TextEncoder().encode(format === "csv" ? csv : html),
  };
}

// The command takes Vec<u8>, which arrives as a JSON number array.
export function ipcBytes(bytes: Uint8Array) {
  return Array.from(bytes);
}

export function savedFileName(savedPath: string) {
  return savedPath.split(/[\\/]/).pop() || savedPath;
}

export function exportSavedMessage(kind: ExportKind, savedPath: string) {
  const name = savedFileName(savedPath);
  return kind === "image" ? `Imagen guardada en Descargas: ${name}` : `Archivo de notas guardado en Descargas: ${name}`;
}

export function exportFailedMessage(error: unknown) {
  return `No se pudo guardar el archivo: ${error instanceof Error ? error.message : String(error)}`;
}

export type ExportNotice = { type: "success" | "error"; text: string };

// Saves an export and confirms it. onSaved (closing the export modal) runs only after the file was
// saved; a failed save shows the error notification and leaves the modal open. True when saved.
export async function saveExportAndConfirm(
  kind: ExportKind,
  fileName: string,
  bytes: Uint8Array,
  deps: {
    save: (fileName: string, bytes: Uint8Array) => Promise<string>;
    notify: (notice: ExportNotice) => void;
    onSaved: () => void;
    logError?: (error: unknown) => void;
  },
) {
  let savedPath: string;
  try {
    savedPath = await deps.save(fileName, bytes);
  } catch (error) {
    deps.logError?.(error);
    deps.notify({ type: "error", text: exportFailedMessage(error) });
    return false;
  }
  deps.notify({ type: "success", text: exportSavedMessage(kind, savedPath) });
  deps.onSaved();
  return true;
}

// Runs one export at a time: a call while another is generating or saving is ignored (returns
// undefined). onBusyChange(true) fires before the task starts and onBusyChange(false) on every exit.
export function singleFlight(onBusyChange: (busy: boolean) => void) {
  let busy = false;
  return async function run<T>(task: () => T | Promise<T>): Promise<T | undefined> {
    if (busy) return undefined;
    busy = true;
    onBusyChange(true);
    try {
      return await task();
    } finally {
      busy = false;
      onBusyChange(false);
    }
  };
}

export function saveToDownloads(fileName: string, bytes: Uint8Array) {
  return invoke<string>("save_to_downloads", { fileName, bytes: ipcBytes(bytes) });
}
