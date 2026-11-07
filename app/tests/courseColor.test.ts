// Course color (S10, S11) through the public db.ts API against temporary SQLite files.
//
// Same harness idea as courseDelete.test.ts: the real db.ts is loaded and only the Tauri boundary is replaced:
// - "@tauri-apps/plugin-sql" -> a node:sqlite connection on a temp file (foreign_keys = ON, like sqlx).
// - "@tauri-apps/api/core" invoke() -> answers apply_pending_restore.
// - import.meta.env (a Vite feature) -> a test object pointing at a temp database name.
// No real NOTAZOD database is opened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "notazod-course-color-"));
const connections = [];

globalThis.__notazodTestEnv = { MODE: "test", VITE_NOTAZOD_DB_NAME: "unused.db" };
globalThis.__notazodSqlDatabase = {
  async load(url) {
    const connection = new DatabaseSync(join(tempDir, url.replace(/^sqlite:/, "")), { timeout: 5000 });
    connection.exec("PRAGMA foreign_keys = ON");
    connections.push(connection);
    const bind = (sql, values) => {
      const params = {};
      for (const match of sql.matchAll(/\$(\d+)/g)) params[`$${match[1]}`] = values[Number(match[1]) - 1];
      return params;
    };
    return {
      execute: async (sql, values = []) => {
        const result = connection.prepare(sql).run(bind(sql, values));
        return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
      },
      select: async (sql, values = []) => connection.prepare(sql).all(bind(sql, values)),
    };
  },
};
globalThis.__notazodInvoke = async (command) => {
  if (command === "apply_pending_restore") return false;
  throw new Error(`Unexpected command in test: ${command}`);
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tauri-apps/plugin-sql") return { url: "notazod-mock:plugin-sql", shortCircuit: true };
    if (specifier === "@tauri-apps/api/core") return { url: "notazod-mock:api-core", shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "notazod-mock:plugin-sql") return { format: "module", source: "export default globalThis.__notazodSqlDatabase;", shortCircuit: true };
    if (url === "notazod-mock:api-core") return { format: "module", source: "export const invoke = (...args) => globalThis.__notazodInvoke(...args);", shortCircuit: true };
    const result = nextLoad(url, context);
    if (!url.includes("/src/lib/db.ts")) return result;
    return { ...result, source: String(result.source).replaceAll("import.meta.env", "globalThis.__notazodTestEnv") };
  },
});

let loads = 0;

// A fresh db.ts module (its connection is a module singleton) on the given file, like an app restart.
async function openDb(dbName) {
  globalThis.__notazodTestEnv = { MODE: "test", VITE_NOTAZOD_DB_NAME: dbName };
  const db = await import(`../src/lib/db.ts?db=${dbName}&load=${++loads}`);
  await db.initDatabase();
  return db;
}

function withConnection(dbName, fn) {
  const connection = new DatabaseSync(join(tempDir, dbName));
  try {
    return fn(connection);
  } finally {
    connection.close();
  }
}

// The schema before the color column, with two courses, students, periods, items and grades.
function createLegacyDatabase(dbName) {
  withConnection(dbName, (connection) => connection.exec(`
    CREATE TABLE courses (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, semester TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(name, semester));
    CREATE TABLE students (id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, full_name TEXT NOT NULL, code TEXT NOT NULL, document_id TEXT NOT NULL, institutional_email TEXT NOT NULL, personal_email TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(course_id, code), UNIQUE(course_id, document_id), UNIQUE(course_id, institutional_email), UNIQUE(course_id, personal_email));
    CREATE TABLE periods (id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, number INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, activity_percent INTEGER NOT NULL DEFAULT 40, exam_percent INTEGER NOT NULL DEFAULT 60, closed INTEGER NOT NULL DEFAULT 0, UNIQUE(course_id, number));
    CREATE TABLE grade_items (id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, period_id TEXT REFERENCES periods(id) ON DELETE CASCADE, name TEXT NOT NULL, is_exam INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE grades (student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE, value REAL NOT NULL, pending INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (student_id, item_id));
    INSERT INTO courses (id, name, semester, created_at) VALUES ('c1', 'Aplicación Web 2', '2026-2', '2026-08-01 10:00:00'), ('c2', 'Test', '2026-2', '2026-08-02 10:00:00');
    INSERT INTO students VALUES ('s1', 'c1', 'Student One', '1', 'doc-1', 's1@unimayor.edu.co', 's1@gmail.com', 1), ('s2', 'c2', 'Student Two', '2', 'doc-2', 's2@unimayor.edu.co', 's2@gmail.com', 1);
    INSERT INTO periods VALUES ('p1', 'c1', 1, '2026-08-01', '2026-09-15', 40, 60, 0), ('p2', 'c1', 2, '2026-09-16', '2026-10-31', 40, 60, 0), ('p3', 'c1', 3, '2026-11-01', '2026-12-15', 40, 60, 0);
    INSERT INTO periods VALUES ('p4', 'c2', 1, '2026-08-01', '2026-09-15', 30, 70, 1), ('p5', 'c2', 2, '2026-09-16', '2026-10-31', 40, 60, 0), ('p6', 'c2', 3, '2026-11-01', '2026-12-15', 40, 60, 0);
    INSERT INTO grade_items VALUES ('i1', 'c1', 'p1', 'Taller 1', 0, 1), ('i2', 'c2', 'p4', 'Examen final', 1, 1);
    INSERT INTO grades VALUES ('s1', 'i1', 4.5, 0), ('s2', 'i2', 2.8, 1);
  `));
}

const DATA_TABLES = ["students", "periods", "grade_items", "grades"];

// Every committed row of the data tables, plus the original columns of courses.
function snapshot(dbName) {
  return withConnection(dbName, (connection) => ({
    courses: connection.prepare("SELECT id, name, semester, created_at FROM courses ORDER BY id").all(),
    ...Object.fromEntries(DATA_TABLES.map((table) => [table, connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])),
  }));
}

function storedColors(dbName) {
  return withConnection(dbName, (connection) => connection.prepare("SELECT id, color FROM courses ORDER BY id").all().map((row) => ({ ...row })));
}

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

test.after(() => {
  for (const connection of connections) connection.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("COURSE_COLORS lists the twelve palette keys in palette order (S13)", async () => {
  const db = await openDb("palette.db");
  assert.deepEqual([...db.COURSE_COLORS], ["primary", "pink", "warning", "focus", "brown", "olive", "passing", "teal", "blue", "indigo", "pending", "locked"]);
});

test("setCourseColor stores each of the six new palette keys and listCourses returns it after reopening", async () => {
  const dbName = "new-colors.db";
  createLegacyDatabase(dbName);
  let db = await openDb(dbName);
  const before = snapshot(dbName);

  for (const color of ["pink", "brown", "olive", "teal", "blue", "indigo"]) {
    await db.setCourseColor("c1", color);

    assert.deepEqual(storedColors(dbName), [{ id: "c1", color }, { id: "c2", color: null }]);
    assert.deepEqual(snapshot(dbName), before);
    db = await openDb(dbName);
    assert.deepEqual((await db.listCourses()).map(({ id, color: stored }) => ({ id, color: stored })), [
      { id: "c1", color },
      { id: "c2", color: "primary" },
    ]);
  }
});

test("initDatabase migrates a database without course colors, keeps every row and reports the default color", async () => {
  const dbName = "legacy.db";
  createLegacyDatabase(dbName);
  const before = snapshot(dbName);

  const db = await openDb(dbName);

  assert.deepEqual(snapshot(dbName), before);
  assert.deepEqual(storedColors(dbName), [{ id: "c1", color: null }, { id: "c2", color: null }]);
  const courses = await db.listCourses();
  assert.deepEqual(courses.map(({ id, name, students, color }) => ({ id, name, students, color })), [
    { id: "c1", name: "Aplicación Web 2", students: 1, color: "primary" },
    { id: "c2", name: "Test", students: 1, color: "primary" },
  ]);
});

test("setCourseColor stores a palette key that listCourses returns after reopening", async () => {
  const dbName = "set-color.db";
  createLegacyDatabase(dbName);
  const db = await openDb(dbName);
  const before = snapshot(dbName);

  await db.setCourseColor("c2", "passing");

  assert.deepEqual(storedColors(dbName), [{ id: "c1", color: null }, { id: "c2", color: "passing" }]);
  assert.deepEqual(snapshot(dbName), before);
  const reopened = await openDb(dbName);
  assert.deepEqual((await reopened.listCourses()).map(({ id, color }) => ({ id, color })), [
    { id: "c1", color: "primary" },
    { id: "c2", color: "passing" },
  ]);
});

for (const invalid of ["red", "#fff", "", "PRIMARY", " primary", "Blue", "course-blue", "--course-teal", "rosa", "brown "]) {
  test(`setCourseColor rejects ${JSON.stringify(invalid)} and leaves the stored data unchanged`, async () => {
    const dbName = `invalid-${loads}.db`;
    createLegacyDatabase(dbName);
    const db = await openDb(dbName);
    await db.setCourseColor("c1", "focus");
    const before = snapshot(dbName);
    const colorsBefore = storedColors(dbName);

    const error = await rejectionOf(db.setCourseColor("c1", invalid));

    assert.equal(error?.message, `Invalid course color: ${invalid}`);
    assert.deepEqual(storedColors(dbName), colorsBefore);
    assert.deepEqual(snapshot(dbName), before);
    assert.equal((await db.listCourses()).find((course) => course.id === "c1")?.color, "focus");
  });
}

test("setCourseColor rejects an unknown course id without writing", async () => {
  const dbName = "unknown-course.db";
  createLegacyDatabase(dbName);
  const db = await openDb(dbName);
  const colorsBefore = storedColors(dbName);

  const error = await rejectionOf(db.setCourseColor("missing", "focus"));

  assert.equal(error?.message, "Course not found");
  assert.deepEqual(storedColors(dbName), colorsBefore);
});

test("running initDatabase twice keeps the schema, rows and colors", async () => {
  const dbName = "twice.db";
  createLegacyDatabase(dbName);
  const db = await openDb(dbName);
  await db.setCourseColor("c1", "warning");
  const before = snapshot(dbName);
  const columns = () => withConnection(dbName, (connection) => connection.prepare("SELECT name FROM pragma_table_info('courses')").all().map((row) => row.name));
  const columnsBefore = columns();

  await db.initDatabase();
  await (await openDb(dbName)).initDatabase();

  assert.deepEqual(columns(), columnsBefore);
  assert.equal(columnsBefore.filter((name) => name === "color").length, 1);
  assert.deepEqual(snapshot(dbName), before);
  assert.deepEqual(storedColors(dbName), [{ id: "c1", color: "warning" }, { id: "c2", color: null }]);
});
