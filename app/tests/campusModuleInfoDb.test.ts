// S3: corte dates and module components stored per synced Campus group, through the public db.ts API
// against temporary SQLite files. Same harness as attendanceDb.test.ts: the real db.ts is loaded and only
// the Tauri boundary is replaced (node:sqlite for the SQL plugin, temp paths for invoke()).
// No real NOTAZOD database is opened.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "notazod-module-info-"));
const connections = [];
let backups = 0;

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
        if (/^\s*BEGIN\b/.test(sql)) { connection.exec(sql); return { rowsAffected: 0, lastInsertId: 0 }; }
        const result = connection.prepare(sql).run(bind(sql, values));
        return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
      },
      select: async (sql, values = []) => connection.prepare(sql).all(bind(sql, values)).map((row) => ({ ...row })),
    };
  },
};
globalThis.__notazodInvoke = async (command) => {
  if (command === "apply_pending_restore") return false;
  if (command === "resolve_backup_path") return join(tempDir, `backup-${++backups}.db`);
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

after(() => {
  for (const connection of connections) { try { connection.close(); } catch { /* already closed */ } }
  rmSync(tempDir, { recursive: true, force: true });
});

let loads = 0;
async function openDb(dbName) {
  globalThis.__notazodTestEnv = { MODE: "test", VITE_NOTAZOD_DB_NAME: dbName };
  const db = await import(`../src/lib/db.ts?db=${dbName}&load=${++loads}`);
  await db.initDatabase();
  return db;
}

function withConnection(dbName, fn) {
  const connection = new DatabaseSync(join(tempDir, dbName));
  try { return fn(connection); } finally { connection.close(); }
}

// The schema before this change, with one course, its Campus group and one student.
function createPreviousDatabase(dbName) {
  withConnection(dbName, (connection) => connection.exec(`
    CREATE TABLE courses (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, semester TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, color TEXT, UNIQUE(name, semester));
    CREATE TABLE campus_course_groups (course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, campus_key TEXT NOT NULL, program TEXT NOT NULL, group_name TEXT NOT NULL, schedule TEXT NOT NULL, room TEXT NOT NULL, PRIMARY KEY (course_id, campus_key));
    CREATE TABLE students (id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, full_name TEXT NOT NULL, code TEXT NOT NULL, document_id TEXT NOT NULL, institutional_email TEXT NOT NULL, personal_email TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(course_id, code), UNIQUE(course_id, document_id), UNIQUE(course_id, institutional_email), UNIQUE(course_id, personal_email));
    INSERT INTO courses VALUES ('c1', 'Laboratorio de programación', '2026-2', '2026-08-01 10:00:00', 'teal');
    INSERT INTO campus_course_groups VALUES ('c1', 'k1', 'Ingeniería', 'Grupo B', 'JUE 15:00-18:00', 'Sala 4');
    INSERT INTO students VALUES ('s1', 'c1', 'Álvarez Juan', '1', 'd1', 's1@u.co', 's1@g.co', 1);
  `));
}

const DATES = [
  { period: 1, opens: "2026-09-12", closes: "2026-09-27" },
  { period: 2, opens: "2026-10-24", closes: "2026-11-08" },
  { period: 3, opens: "2026-11-16", closes: "2026-12-01" },
];
const COMPONENT = { module: "LABORATORIO DE PROGRAMACIÓN", habilitable: false, credits: 2, absenceLimit: 7, percents: [{ period: 1, percent: 30 }, { period: 2, percent: 35 }, { period: 3, percent: 35 }], plan: "INGENIERIA_2023" };
const INFO = { periods: DATES, components: [COMPONENT] };
const groupMeta = (extra = {}) => ({ key: "k1", program: "Ingeniería", group: "Grupo B", schedule: "JUE 15:00-18:00", room: "Sala 4", ...extra });
const addAction = (campusGroups) => ({ kind: "add", campusGroups, groupKeys: campusGroups.map((g) => g.key), courseId: "c1", courseName: "Laboratorio de programación", toAdd: [], skipped: [], notInCampus: [], periodImports: [], periodSkips: [] });

test("S3: the new module info table leaves existing courses and groups as they are, with no module info yet", async () => {
  createPreviousDatabase("migrate.db");
  const db = await openDb("migrate.db");
  assert.deepEqual(await db.listCampusModuleInfo(), []);
  const [course] = await db.listCourses();
  assert.equal(course.students, 1);
  assert.deepEqual(course.campusGroups.map(({ courseId, ...g }) => g), [groupMeta()]);
  // A second start runs CREATE TABLE IF NOT EXISTS again without failing or touching the rows.
  const again = await openDb("migrate.db");
  assert.equal((await again.listCourses()).length, 1);
});

test("S3: an add action with no students stores, keeps and refreshes the group's module info", async () => {
  createPreviousDatabase("refresh.db");
  const db = await openDb("refresh.db");
  const [result] = await db.applyCourseSync([addAction([groupMeta({ moduleInfo: INFO })])]);
  assert.equal(result.added, 0);
  assert.deepEqual(await db.listCampusModuleInfo(), [{ courseId: "c1", key: "k1", group: "Grupo B", periods: DATES, components: [COMPONENT] }]);

  // A group that could not be read this time keeps what was stored; its other metadata still refreshes.
  await db.applyCourseSync([addAction([groupMeta({ room: "Sala 9" })])]);
  assert.deepEqual(await db.listCampusModuleInfo(), [{ courseId: "c1", key: "k1", group: "Grupo B", periods: DATES, components: [COMPONENT] }]);
  assert.equal((await db.listCourses())[0].campusGroups[0].room, "Sala 9");

  // A new reading replaces the stored values, also with empty ones when the Campus shows no boxes.
  const changed = { periods: [{ period: 1, opens: "2026-09-13", closes: null }], components: [] };
  await db.applyCourseSync([addAction([groupMeta({ moduleInfo: changed })])]);
  assert.deepEqual(await db.listCampusModuleInfo(), [{ courseId: "c1", key: "k1", group: "Grupo B", ...changed }]);
  await db.applyCourseSync([addAction([groupMeta({ moduleInfo: { periods: [], components: [] } })])]);
  assert.deepEqual(await db.listCampusModuleInfo(), [{ courseId: "c1", key: "k1", group: "Grupo B", periods: [], components: [] }]);
  assert.equal((await db.listStudents("c1")).length, 1);
});

test("S3: a created course stores its group's module info", async () => {
  const db = await openDb("create.db");
  await db.applyCourseSync([{ kind: "create", campusGroups: [groupMeta({ key: "k9", group: "Grupo A", moduleInfo: INFO })], groupKeys: ["k9"], courseName: "Nuevo", semester: "2026-2", toAdd: [], skipped: [], periodImports: [], periodSkips: [] }]);
  const [course] = await db.listCourses();
  assert.deepEqual(await db.listCampusModuleInfo(), [{ courseId: course.id, key: "k9", group: "Grupo A", periods: DATES, components: [COMPONENT] }]);
  // Deleting the course removes its module info with it.
  await db.deleteCourse(course.id);
  assert.deepEqual(await db.listCampusModuleInfo(), []);
  assert.equal(withConnection("create.db", (c) => c.prepare("SELECT COUNT(*) AS n FROM campus_group_module_info").get().n), 0);
});

test("S3: a backup carries the module info and deleting another course keeps it", async () => {
  createPreviousDatabase("backup.db");
  const db = await openDb("backup.db");
  await db.applyCourseSync([addAction([groupMeta({ moduleInfo: INFO })])]);
  const other = await db.createCourse("Otro curso", "2026-2");
  await db.applyCourseSync([{ kind: "add", campusGroups: [groupMeta({ key: "k2", group: "Grupo C", moduleInfo: { periods: [], components: [] } })], groupKeys: ["k2"], courseId: other.id, courseName: "Otro curso", toAdd: [], skipped: [], notInCampus: [], periodImports: [], periodSkips: [] }]);
  const stored = [{ courseId: "c1", key: "k1", group: "Grupo B", periods: DATES, components: [COMPONENT] }];

  await db.exportBackup(join(tempDir, "backup-export.db"));
  const restored = await openDb("backup-export.db");
  assert.deepEqual(await restored.listCampusModuleInfo(), [...stored, { courseId: other.id, key: "k2", group: "Grupo C", periods: [], components: [] }]);

  await db.deleteCourse(other.id);
  assert.deepEqual(await db.listCampusModuleInfo(), stored);
});
