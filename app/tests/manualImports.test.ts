// Guards the removal of the manual import flows ("Importar estudiantes" from CSV/.xls, the guided
// clipboard "Importar notas" wizard, and the grade file import). Students and grades now come from the
// Campus synchronization, so App.tsx must not offer those entry points again, while the remaining
// student/activity actions, exports, and Campus flows stay reachable.
// There is no DOM test runner in this project, so this reads the App.tsx source as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
// Static labels sit right before their closing tag; handlers contain "=>", so opening tags are not parsed.
const buttonLabels = [...app.matchAll(/>([^<>{}]+)<\/(?:Button|Menu\.Item)>/g)].map((match) => match[1].trim());
const modalTitles = [...app.matchAll(/\btitle=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((match) => match[1] ?? match[2]);

test("manual import entry points are gone", () => {
  assert.ok(!buttonLabels.includes("Importar estudiantes"), "Importar estudiantes button still present");
  assert.ok(!buttonLabels.includes("Importar notas"), "Importar notas button still present");
  assert.ok(!modalTitles.includes("Importar estudiantes"), "student import modal still present");
  assert.ok(!modalTitles.includes("Carga guiada desde Excel"), "guided import modal still present");
  assert.ok(!modalTitles.some((title) => title.startsWith("Importar notas")), "grade file import modal still present");
  assert.doesNotMatch(app, /<FileButton\b/, "a file picker for manual imports is still rendered");
});

test("manual student, activity, export, and Campus actions remain", () => {
  for (const label of ["Agregar estudiante", "Agregar actividad", "Exportar imagen", "Exportar planilla", "Subir al Campus", "Sincronizar cursos", "Eliminar actividad"]) {
    assert.ok(buttonLabels.includes(label), `${label} action missing`);
  }
  assert.ok(modalTitles.includes("Sincronizar cursos desde el Campus"), "Campus sync modal missing");
  // The Campus sync preview still labels groups whose closed periods bring grades from the Campus.
  assert.match(app, /"Importar notas" : "Actualizar datos"/, "Campus sync badge label missing");
});
