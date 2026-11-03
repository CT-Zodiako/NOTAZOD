// Reproduces the public deleteGradeItem() flow (delete an activity) against a temporary SQLite file.
//
// Same harness as courseDelete.test.ts: db.ts is loaded for real and only the Tauri boundary is replaced.
// - "@tauri-apps/plugin-sql" -> a model of the sqlx pool: up to 10 connections, idle connections reused in
//   FIFO order, a new connection opened only when none is idle, foreign_keys = ON, busy_timeout = 5 s.
//   Every execute()/select() acquires one connection and returns it afterwards, like DbPool::execute.
// - "@tauri-apps/api/core" invoke() -> answers apply_pending_restore and resolve_backup_path with temp paths.
// - import.meta.env (a Vite feature) -> a test object pointing at a temp database name.
// No real NOTAZOD database is opened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_CONNECTIONS = 10;
const BUSY_TIMEOUT_MS = 5000;

class SqlxPoolModel {
  constructor(path) {
    this.path = path;
    this.idle = [];
    this.size = 0;
    this.trace = [];
    // Pool::connect opens and releases one connection before returning.
    this.idle.push(this.open());
  }

  open() {
    if (this.size >= MAX_CONNECTIONS) throw new Error("pool exhausted");
    this.size++;
    const connection = new DatabaseSync(this.path, { timeout: BUSY_TIMEOUT_MS });
    connection.exec("PRAGMA foreign_keys = ON");
    connection.number = this.size;
    return connection;
  }

  async run(sql, values, fn) {
    const connection = this.idle.shift() ?? this.open();
    try {
      // Each plugin call is an async IPC request, so concurrent calls hold their connections at the same time.
      await new Promise((resolve) => setImmediate(resolve));
      const params = {};
      for (const match of sql.matchAll(/\$(\d+)/g)) params[`$${match[1]}`] = values[Number(match[1]) - 1];
      try {
        const result = fn(connection.prepare(sql), params);
        this.trace.push(`connection ${connection.number}: ${sql.trim().slice(0, 30)} -> ok`);
        return result;
      } catch (error) {
        this.trace.push(`connection ${connection.number}: ${sql.trim().slice(0, 30)} -> ${error.message}`);
        throw error;
      }
    } finally {
      this.idle.push(connection);
    }
  }

  close() {
    for (const connection of this.idle) connection.close();
  }
}

const tempDir = mkdtempSync(join(tmpdir(), "notazod-activity-delete-"));
const backupsDir = join(tempDir, "backups");
mkdirSync(backupsDir);
const pools = [];
let backupCount = 0;
let backupPaths = [];
// Set to a directory that does not exist to make VACUUM INTO fail like a broken backup location.
let backupDirOverride = null;

globalThis.__notazodTestEnv = { MODE: "test", VITE_NOTAZOD_DB_NAME: "unused.db" };
globalThis.__notazodSqlDatabase = {
  async load(url) {
    const pool = new SqlxPoolModel(join(tempDir, url.replace(/^sqlite:/, "")));
    pools.push(pool);
    return {
      pool,
      execute: (sql, values = []) => pool.run(sql, values, (statement, params) => {
        const result = statement.run(params);
        return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
      }),
      select: (sql, values = []) => pool.run(sql, values, (statement, params) => statement.all(params)),
    };
  },
};
globalThis.__notazodInvoke = async (command) => {
  if (command === "apply_pending_restore") return false;
  if (command === "resolve_backup_path") {
    const path = join(backupDirOverride ?? backupsDir, `backup-${++backupCount}.db`);
    backupPaths.push(path);
    return path;
  }
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

// Each call gets a fresh db.ts module (its connection is a module singleton) and a fresh database file.
async function loadDb(dbName) {
  globalThis.__notazodTestEnv = { MODE: "test", VITE_NOTAZOD_DB_NAME: dbName };
  const db = await import(`../src/lib/db.ts?db=${dbName}`);
  await db.initDatabase();
  return db;
}

// A "Test" course with two students and two activities in period 1; every activity has grades and
// history (a save followed by an edit) for both students.
async function seedCourse(db) {
  const course = await db.createCourse("Test", "2026-2");
  const [period] = await db.listPeriods(course.id);
  const students = [];
  for (const number of [1, 2]) {
    students.push(await db.createStudent({
      courseId: course.id,
      fullName: `Student ${number}`,
      code: String(number),
      documentId: `doc-${number}`,
      institutionalEmail: `s${number}@unimayor.edu.co`,
      personalEmail: `s${number}@gmail.com`,
    }));
  }
  const activity = await db.createGradeItem(course.id, period.id, "Activity 1");
  const other = await db.createGradeItem(course.id, period.id, "Activity 2");
  for (const item of [activity, other]) {
    for (const student of students) {
      await db.saveGrade({ studentId: student.id, itemId: item.id, value: 3, pending: 0 });
      await db.saveGrade({ studentId: student.id, itemId: item.id, value: 4.5, pending: 0 });
    }
  }
  return { course, period, students, activity, other };
}

function withConnection(path, fn) {
  const connection = new DatabaseSync(path.startsWith("/") ? path : join(tempDir, path));
  try {
    return fn(connection);
  } finally {
    connection.close();
  }
}

// Committed rows an activity owns, read through a separate connection.
function itemRows(path, itemId) {
  return withConnection(path, (connection) => ({
    grade_items: Number(connection.prepare("SELECT COUNT(*) AS count FROM grade_items WHERE id = ?").get(itemId).count),
    grades: Number(connection.prepare("SELECT COUNT(*) AS count FROM grades WHERE item_id = ?").get(itemId).count),
    grade_history: Number(connection.prepare("SELECT COUNT(*) AS count FROM grade_history WHERE item_id = ?").get(itemId).count),
  }));
}

const TABLES = ["courses", "students", "periods", "grade_items", "grades", "grade_history"];

function totalRows(path) {
  return withConnection(path, (connection) => Object.fromEntries(TABLES.map((table) => [table, Number(connection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)])));
}

const EMPTY_ITEM = { grade_items: 0, grades: 0, grade_history: 0 };

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

// Same calls App.openCourse() makes before the activity rename/delete modal is reachable.
async function openCourseLikeApp(db, course) {
  const periods = await db.listPeriods(course.id);
  await Promise.all([db.listStudents(course.id), Promise.all(periods.map((period) => db.listGradeItems(course.id, period.id))), db.listGrades(course.id)]);
  await Promise.all([db.listGroups(periods[0].id), db.listGroupMemberships(periods[0].id)]);
}

test.after(() => {
  for (const pool of pools) pool.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("deleteGradeItem removes an activity after the course was opened and keeps the other activity", async (t) => {
  const dbName = "opened-activity.db";
  const db = await loadDb(dbName);
  const { course, students, activity, other } = await seedCourse(db);
  await openCourseLikeApp(db, course);
  const before = itemRows(dbName, activity.id);
  const otherBefore = itemRows(dbName, other.id);
  const pool = pools.at(-1);
  t.diagnostic(`pool connections before delete: ${pool.size}`);
  pool.trace = [];
  backupPaths = [];

  const deleteError = await rejectionOf(db.deleteGradeItem(activity.id));
  for (const line of pool.trace) t.diagnostic(line);
  t.diagnostic(`activity rows after delete: ${JSON.stringify(itemRows(dbName, activity.id))}`);

  assert.equal(deleteError, null);
  assert.deepEqual(before, { grade_items: 1, grades: 2, grade_history: 4 });
  assert.deepEqual(itemRows(dbName, activity.id), EMPTY_ITEM);
  assert.deepEqual(itemRows(dbName, other.id), otherBefore);
  assert.deepEqual((await db.listGradeItems(course.id)).map((item) => item.name), ["Activity 2"]);
  assert.deepEqual((await db.listGrades(course.id)).map((grade) => grade.itemId), [other.id, other.id]);
  assert.equal((await db.listGradeHistory(students[0].id, other.id)).length, 2);
  // The pre-delete backup exists and still holds the deleted activity with its grades and history.
  assert.equal(backupPaths.length, 1);
  assert.ok(existsSync(backupPaths[0]));
  assert.deepEqual(itemRows(backupPaths[0], activity.id), before);
  // A delete must not leave a transaction open on a pooled connection: later writes still commit.
  await db.saveGrade({ studentId: students[0].id, itemId: other.id, value: 2, pending: 0 });
  assert.equal(withConnection(dbName, (connection) => Number(connection.prepare("SELECT value FROM grades WHERE student_id = ? AND item_id = ?").get(students[0].id, other.id).value)), 2);
});

test("deleteGradeItem leaves the database unchanged when the delete fails midway", async (t) => {
  const dbName = "activity-delete-fails.db";
  const db = await loadDb(dbName);
  const { course, students, activity, other } = await seedCourse(db);
  await openCourseLikeApp(db, course);
  // Aborts after the activity history has already been deleted.
  withConnection(dbName, (connection) => connection.exec("CREATE TRIGGER fail_grade_delete BEFORE DELETE ON grades BEGIN SELECT RAISE(ABORT, 'forced grade delete failure'); END"));
  const before = totalRows(dbName);
  const activityBefore = itemRows(dbName, activity.id);
  const pool = pools.at(-1);
  pool.trace = [];

  const deleteError = await rejectionOf(db.deleteGradeItem(activity.id));
  for (const line of pool.trace) t.diagnostic(line);
  t.diagnostic(`activity rows before: ${JSON.stringify(activityBefore)} after: ${JSON.stringify(itemRows(dbName, activity.id))}`);

  assert.match(deleteError?.message ?? "", /forced grade delete failure/);
  assert.deepEqual(totalRows(dbName), before);
  assert.deepEqual(itemRows(dbName, activity.id), activityBefore);
  // A failed delete must not leave a transaction open on a pooled connection.
  await db.saveGrade({ studentId: students[0].id, itemId: other.id, value: 2, pending: 0 });
  assert.equal(withConnection(dbName, (connection) => Number(connection.prepare("SELECT value FROM grades WHERE student_id = ? AND item_id = ?").get(students[0].id, other.id).value)), 2);
});

test("deleteGradeItem deletes nothing when the backup fails", async () => {
  const dbName = "activity-backup-fails.db";
  const db = await loadDb(dbName);
  const { course, activity } = await seedCourse(db);
  await openCourseLikeApp(db, course);
  const before = totalRows(dbName);
  backupPaths = [];
  backupDirOverride = join(tempDir, "missing-backup-dir");

  let deleteError;
  try {
    deleteError = await rejectionOf(db.deleteGradeItem(activity.id));
  } finally {
    backupDirOverride = null;
  }

  assert.ok(deleteError instanceof Error);
  assert.equal(backupPaths.length, 1);
  assert.equal(existsSync(backupPaths[0]), false);
  assert.deepEqual(totalRows(dbName), before);
});

// Runs fn through a separate connection right after the pre-delete backup, before the DELETE runs.
function afterBackup(pool, fn) {
  const run = pool.run.bind(pool);
  pool.run = async (sql, values, apply) => {
    const result = await run(sql, values, apply);
    if (sql.startsWith("VACUUM INTO")) fn();
    return result;
  };
}

test("deleteGradeItem refuses an activity in a closed period, before backup or delete", async () => {
  const dbName = "activity-closed-period.db";
  const db = await loadDb(dbName);
  const { course, period, activity } = await seedCourse(db);
  await openCourseLikeApp(db, course);
  await db.setPeriodClosed(period.id, true);
  const before = totalRows(dbName);
  backupPaths = [];

  const deleteError = await rejectionOf(db.deleteGradeItem(activity.id));

  assert.equal(deleteError?.message, "Period is closed");
  assert.equal(backupPaths.length, 0);
  assert.deepEqual(totalRows(dbName), before);
});

test("deleteGradeItem deletes nothing when the period is closed after the checks", async () => {
  const dbName = "activity-closed-during-delete.db";
  const db = await loadDb(dbName);
  const { course, period, activity } = await seedCourse(db);
  await openCourseLikeApp(db, course);
  const before = totalRows(dbName);
  const activityBefore = itemRows(dbName, activity.id);
  backupPaths = [];
  afterBackup(pools.at(-1), () => withConnection(dbName, (connection) => connection.prepare("UPDATE periods SET closed = 1 WHERE id = ?").run(period.id)));

  const deleteError = await rejectionOf(db.deleteGradeItem(activity.id));

  assert.equal(deleteError?.message, "Period is closed");
  assert.equal(backupPaths.length, 1);
  assert.deepEqual(totalRows(dbName), before);
  assert.deepEqual(itemRows(dbName, activity.id), activityBefore);
});

test("deleteGradeItem refuses an exam item, before backup or delete", async () => {
  const dbName = "activity-exam.db";
  const db = await loadDb(dbName);
  const { course, period, students } = await seedCourse(db);
  const exam = await db.createGradeItem(course.id, period.id, "Parcial", 1);
  await db.saveGrade({ studentId: students[0].id, itemId: exam.id, value: 4, pending: 0 });
  await openCourseLikeApp(db, course);
  const before = totalRows(dbName);
  backupPaths = [];

  const deleteError = await rejectionOf(db.deleteGradeItem(exam.id));

  assert.equal(deleteError?.message, "Exam items cannot be deleted");
  assert.equal(backupPaths.length, 0);
  assert.deepEqual(totalRows(dbName), before);
  assert.deepEqual(itemRows(dbName, exam.id), { grade_items: 1, grades: 1, grade_history: 1 });
});

test("deleteGradeItem rejects an unknown activity id without backup or delete", async () => {
  const dbName = "activity-unknown.db";
  const db = await loadDb(dbName);
  await seedCourse(db);
  const before = totalRows(dbName);
  backupPaths = [];

  const deleteError = await rejectionOf(db.deleteGradeItem("missing-activity"));

  assert.equal(deleteError?.message, "Grade item not found");
  assert.equal(backupPaths.length, 0);
  assert.deepEqual(totalRows(dbName), before);
});

test("deleteGradeItem reports an activity removed after the checks", async () => {
  const dbName = "activity-removed-during-delete.db";
  const db = await loadDb(dbName);
  const { course, activity, other } = await seedCourse(db);
  await openCourseLikeApp(db, course);
  const otherBefore = itemRows(dbName, other.id);
  afterBackup(pools.at(-1), () => withConnection(dbName, (connection) => {
    connection.exec("PRAGMA foreign_keys = ON");
    connection.prepare("DELETE FROM grade_items WHERE id = ?").run(activity.id);
  }));

  const deleteError = await rejectionOf(db.deleteGradeItem(activity.id));

  assert.equal(deleteError?.message, "Grade item not found");
  assert.deepEqual(itemRows(dbName, other.id), otherBefore);
});

test("deleteGradeItem refuses a legacy schema whose history does not cascade, before backup or delete", async () => {
  const dbName = "activity-legacy-no-cascade.db";
  // An older file where grade_history was created without ON DELETE CASCADE; CREATE TABLE IF NOT EXISTS keeps it.
  withConnection(dbName, (connection) => connection.exec(`
    CREATE TABLE grade_history (
      id TEXT PRIMARY KEY NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES grade_items(id),
      previous_value REAL,
      previous_pending INTEGER,
      new_value REAL,
      new_pending INTEGER,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      undone INTEGER NOT NULL DEFAULT 0
    )`));
  const db = await loadDb(dbName);
  const { course, activity } = await seedCourse(db);
  await openCourseLikeApp(db, course);
  const before = totalRows(dbName);
  backupPaths = [];

  const deleteError = await rejectionOf(db.deleteGradeItem(activity.id));

  assert.equal(deleteError?.message, "Database schema does not cascade activity deletion: grade_history.item_id -> grade_items");
  assert.equal(backupPaths.length, 0);
  assert.deepEqual(totalRows(dbName), before);
});
