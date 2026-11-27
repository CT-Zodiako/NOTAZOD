// Exports (PNG image and grades CSV/XLS) are saved to Downloads by the save_to_downloads command,
// and the app confirms with a notification. Pure helpers only (no I/O).
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportFailedMessage, exportSavedMessage, gradeTemplateFile, ipcBytes, periodImageFileName, savedFileName, singleFlight } from "../src/lib/exportFile.ts";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const LINES = [
  ["Código", "Nombre", "Actividad 1"],
  ["2024001", "Ana \"La\" Pérez", "4.5"],
  ["2024002", "Luis Gómez", ""],
];

test("the period image keeps its file name notazod-corte-<n>.png", () => {
  assert.equal(periodImageFileName(2), "notazod-corte-2.png");
  assert.equal(periodImageFileName(3), "notazod-corte-3.png");
});

test("the CSV grades file keeps its name and exact content (quoted, ';' separated, UTF-8)", () => {
  const file = gradeTemplateFile(LINES, "csv", 3);
  assert.equal(file.fileName, "plantilla-notas-corte-3.csv");
  assert.equal(decode(file.bytes), "\"Código\";\"Nombre\";\"Actividad 1\"\n\"2024001\";\"Ana \"\"La\"\" Pérez\";\"4.5\"\n\"2024002\";\"Luis Gómez\";\"\"");
  // UTF-8 bytes, as the Blob download produced: "ó" is two bytes.
  assert.deepEqual([...file.bytes.slice(0, 4)], [0x22, 0x43, 0xc3, 0xb3]);
});

test("the Excel grades file keeps its name and exact HTML table content", () => {
  const file = gradeTemplateFile(LINES, "xls", 1);
  assert.equal(file.fileName, "plantilla-notas-corte-1.xls");
  assert.equal(
    decode(file.bytes),
    "<html><head><meta charset=\"utf-8\"></head><body><table><tr><td>Código</td><td>Nombre</td><td>Actividad 1</td></tr><tr><td>2024001</td><td>Ana La Pérez</td><td>4.5</td></tr><tr><td>2024002</td><td>Luis Gómez</td><td></td></tr></table></body></html>",
  );
});

test("bytes go to the command as a plain number array (Vec<u8>)", () => {
  assert.deepEqual(ipcBytes(new Uint8Array([0, 137, 255])), [0, 137, 255]);
});

test("the notification shows the real saved file name, from a macOS or Windows path", () => {
  assert.equal(savedFileName("/Users/ana/Downloads/notazod-corte-2 (1).png"), "notazod-corte-2 (1).png");
  assert.equal(savedFileName("C:\\Users\\ana\\Downloads\\plantilla-notas-corte-3.csv"), "plantilla-notas-corte-3.csv");
  assert.equal(exportSavedMessage("image", "/Users/ana/Downloads/notazod-corte-2 (1).png"), "Imagen guardada en Descargas: notazod-corte-2 (1).png");
  assert.equal(exportSavedMessage("grades", "C:\\Users\\ana\\Downloads\\plantilla-notas-corte-3.csv"), "Archivo de notas guardado en Descargas: plantilla-notas-corte-3.csv");
});

test("a second export click while one is generating or saving does nothing; busy is on for the whole run", async () => {
  const busy: boolean[] = [];
  const run = singleFlight((value) => busy.push(value));
  let release!: () => void;
  let runs = 0;
  const first = run(async () => { runs += 1; await new Promise<void>((resolve) => { release = resolve; }); return "saved"; });
  assert.deepEqual(busy, [true]);
  const second = await run(async () => { runs += 1; return "again"; });
  assert.equal(second, undefined);
  assert.equal(runs, 1);
  release();
  assert.equal(await first, "saved");
  assert.deepEqual(busy, [true, false]);
  assert.equal(await run(async () => { runs += 1; return "next"; }), "next");
  assert.equal(runs, 2);
});

test("busy is cleared on every exit: early return, thrown generation error, rejected save", async () => {
  const busy: boolean[] = [];
  const run = singleFlight((value) => busy.push(value));
  assert.equal(await run(async () => undefined), undefined);
  await assert.rejects(run(() => { throw new Error("canvas"); }), /canvas/);
  await assert.rejects(run(async () => { throw new Error("disk"); }), /disk/);
  assert.deepEqual(busy, [true, false, true, false, true, false]);
  assert.equal(await run(async () => "ok"), "ok");
});

test("a failed save shows the reason, whether the command rejected with a string or an Error", () => {
  assert.equal(exportFailedMessage("Nombre de archivo no válido"), "No se pudo guardar el archivo: Nombre de archivo no válido");
  assert.equal(exportFailedMessage(new Error("Permission denied (os error 13)")), "No se pudo guardar el archivo: Permission denied (os error 13)");
});
