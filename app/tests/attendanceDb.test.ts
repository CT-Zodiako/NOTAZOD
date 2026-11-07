// Attendance storage (S2, S5, S7) through the public db.ts API against temporary SQLite files.
//
// Same harness as courseColor.test.ts: the real db.ts is loaded and only the Tauri boundary is replaced:
// - "@tauri-apps/plugin-sql" -> a node:sqlite connection on a temp file (foreign_keys = ON, like sqlx).
// - "@tauri-apps/api/core" invoke() -> answers apply_pending_restore and resolve_backup_path with temp paths.
// - import.meta.env (a Vite feature) -> a test object pointing at a temp database name.
// No real NOTAZOD database is opened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "notazod-attendance-"));
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
        globalThis.__notazodBeforeExecute?.(sql);
        const result = connection.prepare(sql).run(bind(sql, values));
        return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
      },
      // Rows cross the Tauri IPC as JSON, so the app sees plain objects.
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

// The schema written by the code before attendance, with rows in every table:
// c1 has students s1, s2, s3; c2 has s4.
function createPreviousDatabase(dbName) {
  withConnection(dbName, (connection) => connection.exec(`
    CREATE TABLE courses (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, semester TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, color TEXT, UNIQUE(name, semester));
    CREATE TABLE campus_course_groups (course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, campus_key TEXT NOT NULL, program TEXT NOT NULL, group_name TEXT NOT NULL, schedule TEXT NOT NULL, room TEXT NOT NULL, PRIMARY KEY (course_id, campus_key));
    CREATE TABLE students (id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, full_name TEXT NOT NULL, code TEXT NOT NULL, document_id TEXT NOT NULL, institutional_email TEXT NOT NULL, personal_email TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(course_id, code), UNIQUE(course_id, document_id), UNIQUE(course_id, institutional_email), UNIQUE(course_id, personal_email));
    CREATE TABLE periods (id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, number INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, activity_percent INTEGER NOT NULL DEFAULT 40, exam_percent INTEGER NOT NULL DEFAULT 60, closed INTEGER NOT NULL DEFAULT 0, UNIQUE(course_id, number));
    CREATE TABLE grade_items (id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE, period_id TEXT REFERENCES periods(id) ON DELETE CASCADE, name TEXT NOT NULL, is_exam INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE grades (student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE, value REAL NOT NULL, pending INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (student_id, item_id));
    CREATE TABLE groups (id TEXT PRIMARY KEY NOT NULL, period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(period_id, name));
    CREATE TABLE group_members (period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, PRIMARY KEY (period_id, student_id));
    CREATE INDEX idx_group_members_group ON group_members (group_id);
    CREATE TABLE grade_history (id TEXT PRIMARY KEY NOT NULL, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE, previous_value REAL, previous_pending INTEGER, new_value REAL, new_pending INTEGER, action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, undone INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX idx_grade_history_pair ON grade_history (student_id, item_id);
    INSERT INTO courses VALUES ('c1', 'Fundamentos de programación', '2026-2', '2026-08-01 10:00:00', 'teal'), ('c2', 'POO', '2026-2', '2026-08-02 10:00:00', NULL);
    INSERT INTO campus_course_groups VALUES ('c1', 'k1', 'Ingeniería', 'Grupo B', 'JUE 15:00-18:00; VIE 14:00-17:00', 'Sala 4');
    INSERT INTO students VALUES ('s1', 'c1', 'Álvarez Juan', '1', 'd1', 's1@u.co', 's1@g.co', 1), ('s2', 'c1', 'Bolaños Laura', '2', 'd2', 's2@u.co', 's2@g.co', 2), ('s3', 'c1', 'Castillo Mateo', '3', 'd3', 's3@u.co', 's3@g.co', 3), ('s4', 'c2', 'Daza Valentina', '4', 'd4', 's4@u.co', 's4@g.co', 1);
    INSERT INTO periods VALUES ('p1', 'c1', 1, '2026-08-01', '2026-09-15', 40, 60, 0), ('p2', 'c1', 2, '2026-09-16', '2026-10-31', 40, 60, 0), ('p3', 'c1', 3, '2026-11-01', '2026-12-15', 40, 60, 1), ('p4', 'c2', 1, '2026-08-01', '2026-09-15', 30, 70, 0);
    INSERT INTO grade_items VALUES ('i1', 'c1', 'p1', 'Taller 1', 0, 1), ('i2', 'c2', 'p4', 'Parcial', 1, 1);
    INSERT INTO grades VALUES ('s1', 'i1', 4.5, 0), ('s4', 'i2', 2.8, 1);
    INSERT INTO groups VALUES ('g1', 'p1', 'Grupo 1', 1);
    INSERT INTO group_members VALUES ('p1', 'g1', 's1');
    INSERT INTO grade_history VALUES ('h1', 's1', 'i1', NULL, NULL, 4.5, 0, 'save', '2026-09-01 12:00:00', 0);
  `));
}

const PREVIOUS_TABLES = ["courses", "campus_course_groups", "students", "periods", "grade_items", "grades", "groups", "group_members", "grade_history"];
const ATTENDANCE_TABLES = ["attendance_sessions", "attendance_marks", "attendance_history"];

const rows = (connection, table) => connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map((row) => ({ ...row }));

function snapshot(dbName, tables) {
  return withConnection(dbName, (connection) => Object.fromEntries(tables.map((table) => [table, rows(connection, table)])));
}

function schema(dbName) {
  return withConnection(dbName, (connection) => connection.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all().map((row) => ({ ...row })));
}

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

let databases = 0;

// A previous-schema database opened with the new code, with one 3-hour session on c1:
// s1 absent all hours, s2 absent hour 1, s3 present.
async function seeded() {
  const dbName = `seeded-${++databases}.db`;
  createPreviousDatabase(dbName);
  const db = await openDb(dbName);
  const session = await db.createAttendanceSession("c1", { date: "2026-11-05", startTime: "15:00", hours: 3 }, { s1: [1, 2, 3], s2: [1] });
  return { dbName, db, session };
}

const marksOf = async (db, sessionId, studentId) => (await db.listAttendanceMarks(sessionId)).filter((mark) => mark.studentId === studentId).map((mark) => mark.state);

test.after(() => {
  for (const connection of connections) connection.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("initDatabase adds the attendance tables to a previous database and keeps every existing row and table unchanged (S7)", async () => {
  const dbName = "migrate.db";
  createPreviousDatabase(dbName);
  const before = snapshot(dbName, PREVIOUS_TABLES);
  const schemaBefore = schema(dbName);

  await openDb(dbName);

  assert.deepEqual(snapshot(dbName, PREVIOUS_TABLES), before);
  const schemaAfter = schema(dbName);
  for (const entry of schemaBefore) assert.deepEqual(schemaAfter.find((item) => item.type === entry.type && item.name === entry.name), entry);
  assert.deepEqual(snapshot(dbName, ATTENDANCE_TABLES), { attendance_sessions: [], attendance_marks: [], attendance_history: [] });
  const added = schemaAfter.filter((entry) => !schemaBefore.some((item) => item.name === entry.name)).map((entry) => `${entry.type} ${entry.name}`);
  for (const table of ATTENDANCE_TABLES) assert.ok(added.includes(`table ${table}`), `missing ${table}`);
});

test("running initDatabase again keeps the schema and every row, attendance included (S7)", async () => {
  const { dbName, db } = await seeded();
  const all = [...PREVIOUS_TABLES, ...ATTENDANCE_TABLES];
  const before = snapshot(dbName, all);
  const schemaBefore = schema(dbName);

  await db.initDatabase();
  await openDb(dbName);

  assert.deepEqual(schema(dbName), schemaBefore);
  assert.deepEqual(snapshot(dbName, all), before);
});

test("createAttendanceSession stores the session and one mark per student per hour (S1, S2, S5)", async () => {
  const { dbName, db, session } = await seeded();

  assert.equal(typeof session.id, "string");
  assert.deepEqual({ ...session, id: "", createdAt: "" }, { id: "", courseId: "c1", date: "2026-11-05", startTime: "15:00", hours: 3, createdAt: "", absentStudents: 2, absentHours: 4 });
  assert.match(session.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(await db.listAttendanceMarks(session.id), [
    { studentId: "s1", hour: 1, state: "absent" }, { studentId: "s1", hour: 2, state: "absent" }, { studentId: "s1", hour: 3, state: "absent" },
    { studentId: "s2", hour: 1, state: "absent" }, { studentId: "s2", hour: 2, state: "present" }, { studentId: "s2", hour: 3, state: "present" },
    { studentId: "s3", hour: 1, state: "present" }, { studentId: "s3", hour: 2, state: "present" }, { studentId: "s3", hour: 3, state: "present" },
  ]);
  const stored = snapshot(dbName, ["attendance_sessions"]).attendance_sessions;
  assert.deepEqual(stored.map(({ id, course_id, date, start_time, hours }) => ({ id, course_id, date, start_time, hours })), [{ id: session.id, course_id: "c1", date: "2026-11-05", start_time: "15:00", hours: 3 }]);
  assert.equal(snapshot(dbName, ["attendance_marks"]).attendance_marks.length, 9);
});

test("listAttendanceSessions lists a course's sessions newest first with their absences (S5, S6)", async () => {
  const { db, session } = await seeded();
  const later = await db.createAttendanceSession("c1", { date: "2026-11-06", startTime: "14:00", hours: 2 }, {});
  const earlier = await db.createAttendanceSession("c1", { date: "2026-10-29", startTime: "15:00", hours: 1 }, { s3: [1] });
  await db.createAttendanceSession("c2", { date: "2026-11-07", startTime: "08:00", hours: 2 }, { s4: [2] });

  const sessions = await db.listAttendanceSessions("c1");

  assert.deepEqual(sessions.map(({ id, date, hours, absentStudents, absentHours }) => ({ id, date, hours, absentStudents, absentHours })), [
    { id: later.id, date: "2026-11-06", hours: 2, absentStudents: 0, absentHours: 0 },
    { id: session.id, date: "2026-11-05", hours: 3, absentStudents: 2, absentHours: 4 },
    { id: earlier.id, date: "2026-10-29", hours: 1, absentStudents: 1, absentHours: 1 },
  ]);
  assert.deepEqual(await db.listAttendanceSessions("missing"), []);
});

test("courseAttendanceTotals counts absent hours over recorded hours per student (S2, S6)", async () => {
  const { db } = await seeded();
  await db.createAttendanceSession("c1", { date: "2026-11-06", startTime: "14:00", hours: 2 }, { s1: [2], s3: [1, 2] });
  await db.createAttendanceSession("c2", { date: "2026-11-06", startTime: "08:00", hours: 2 }, { s4: [1, 2] });

  assert.deepEqual(await db.courseAttendanceTotals("c1"), [
    { studentId: "s1", absentHours: 4, justifiedHours: 0, recordedHours: 5 },
    { studentId: "s2", absentHours: 1, justifiedHours: 0, recordedHours: 5 },
    { studentId: "s3", absentHours: 2, justifiedHours: 0, recordedHours: 5 },
  ]);
  assert.deepEqual(await db.courseAttendanceTotals("c2"), [{ studentId: "s4", absentHours: 2, justifiedHours: 0, recordedHours: 2 }]);
});

test("Llegó tarde marks the hours before the arrival hour absent and appends one history entry (S3, S5)", async () => {
  const { db, session } = await seeded();

  await db.correctAttendance(session.id, "s1", { action: "late", arrivalHour: 2 });

  assert.deepEqual(await marksOf(db, session.id, "s1"), ["absent", "present", "present"]);
  const history = await db.listAttendanceHistory(session.id, "s1");
  assert.equal(history.length, 1);
  assert.deepEqual({ ...history[0], id: "", changedAt: "" }, { id: "", sessionId: session.id, studentId: "s1", changedAt: "", action: "late", motive: null, beforeStates: ["absent", "absent", "absent"], afterStates: ["absent", "present", "present"] });
  assert.match(history[0].changedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.deepEqual(await marksOf(db, session.id, "s2"), ["absent", "present", "present"]);
  assert.deepEqual((await db.courseAttendanceTotals("c1")).find((total) => total.studentId === "s1"), { studentId: "s1", absentHours: 1, justifiedHours: 0, recordedHours: 3 });
});

test("Justificar turns absent hours justified with its motive; justified hours do not count (S4, S5)", async () => {
  const { db, session } = await seeded();

  await db.correctAttendance(session.id, "s2", { action: "excuse", motive: "  Incapacidad médica " });

  assert.deepEqual(await marksOf(db, session.id, "s2"), ["justified", "present", "present"]);
  const [entry] = await db.listAttendanceHistory(session.id, "s2");
  assert.deepEqual({ action: entry.action, motive: entry.motive, beforeStates: entry.beforeStates, afterStates: entry.afterStates }, { action: "excuse", motive: "Incapacidad médica", beforeStates: ["absent", "present", "present"], afterStates: ["justified", "present", "present"] });
  assert.deepEqual((await db.courseAttendanceTotals("c1")).find((total) => total.studentId === "s2"), { studentId: "s2", absentHours: 0, justifiedHours: 1, recordedHours: 3 });
  const [listed] = await db.listAttendanceSessions("c1");
  assert.deepEqual({ absentStudents: listed.absentStudents, absentHours: listed.absentHours }, { absentStudents: 1, absentHours: 3 });
});

test("Sí vino makes every hour present; each correction adds a history entry, newest first (S4, S5)", async () => {
  const { dbName, db, session } = await seeded();
  await db.correctAttendance(session.id, "s1", { action: "late", arrivalHour: 3 });
  await db.correctAttendance(session.id, "s1", { action: "excuse", motive: "Permiso" });

  await db.correctAttendance(session.id, "s1", { action: "present" });

  assert.deepEqual(await marksOf(db, session.id, "s1"), ["present", "present", "present"]);
  const history = await db.listAttendanceHistory(session.id, "s1");
  assert.deepEqual(history.map(({ action, motive, beforeStates, afterStates }) => ({ action, motive, beforeStates, afterStates })), [
    { action: "present", motive: null, beforeStates: ["justified", "justified", "present"], afterStates: ["present", "present", "present"] },
    { action: "excuse", motive: "Permiso", beforeStates: ["absent", "absent", "present"], afterStates: ["justified", "justified", "present"] },
    { action: "late", motive: null, beforeStates: ["absent", "absent", "absent"], afterStates: ["absent", "absent", "present"] },
  ]);
  assert.deepEqual(await db.listAttendanceHistory(session.id, "s2"), []);
  assert.equal(snapshot(dbName, ["attendance_history"]).attendance_history.length, 3);
});

test("a student added after a session has no marks for it and is not counted (S7)", async () => {
  const { dbName, db, session } = await seeded();
  const added = await db.createStudent({ courseId: "c1", fullName: "Erazo Samuel", code: "5", documentId: "d5", institutionalEmail: "s5@u.co", personalEmail: "s5@g.co" });

  assert.deepEqual(await marksOf(db, session.id, added.id), []);
  assert.equal((await db.courseAttendanceTotals("c1")).some((total) => total.studentId === added.id), false);
  const before = snapshot(dbName, ATTENDANCE_TABLES);
  const error = await rejectionOf(db.correctAttendance(session.id, added.id, { action: "present" }));
  assert.equal(error?.message, "Student has no attendance in this session");
  assert.deepEqual(snapshot(dbName, ATTENDANCE_TABLES), before);

  const next = await db.createAttendanceSession("c1", { date: "2026-11-06", startTime: "14:00", hours: 1 }, { [added.id]: [1] });
  assert.deepEqual(await marksOf(db, next.id, added.id), ["absent"]);
});

const invalidSessions = [
  ["an unknown course", "missing", { date: "2026-11-05", startTime: "15:00", hours: 2 }, {}, "Course not found"],
  ["0 hours", "c1", { date: "2026-11-05", startTime: "15:00", hours: 0 }, {}, "Class hours must be a whole number from 1 to 6"],
  ["7 hours", "c1", { date: "2026-11-05", startTime: "15:00", hours: 7 }, {}, "Class hours must be a whole number from 1 to 6"],
  ["2.5 hours", "c1", { date: "2026-11-05", startTime: "15:00", hours: 2.5 }, {}, "Class hours must be a whole number from 1 to 6"],
  ["hours as text", "c1", { date: "2026-11-05", startTime: "15:00", hours: "3" }, {}, "Class hours must be a whole number from 1 to 6"],
  ["an impossible date", "c1", { date: "2026-02-30", startTime: "15:00", hours: 2 }, {}, "Invalid attendance date: 2026-02-30"],
  ["a free-text date", "c1", { date: "5 nov", startTime: "15:00", hours: 2 }, {}, "Invalid attendance date: 5 nov"],
  ["a bad start time", "c1", { date: "2026-11-05", startTime: "25:00", hours: 2 }, {}, "Invalid attendance start time: 25:00"],
  ["an absent hour 0", "c1", { date: "2026-11-05", startTime: "15:00", hours: 2 }, { s1: [0] }, "Absent hour out of range: 0"],
  ["an absent hour past the class", "c1", { date: "2026-11-05", startTime: "15:00", hours: 2 }, { s1: [1, 3] }, "Absent hour out of range: 3"],
  ["a fractional absent hour", "c1", { date: "2026-11-05", startTime: "15:00", hours: 2 }, { s1: [1.5] }, "Absent hour out of range: 1.5"],
  ["a student of another course", "c1", { date: "2026-11-05", startTime: "15:00", hours: 2 }, { s4: [1] }, "Student does not belong to this course"],
  ["an unknown student", "c1", { date: "2026-11-05", startTime: "15:00", hours: 2 }, { nobody: [1] }, "Student does not belong to this course"],
];

for (const [label, courseId, timing, absences, message] of invalidSessions) {
  test(`createAttendanceSession rejects ${label} without writing (S7)`, async () => {
    const { dbName, db } = await seeded();
    const all = [...PREVIOUS_TABLES, ...ATTENDANCE_TABLES];
    const before = snapshot(dbName, all);

    const error = await rejectionOf(db.createAttendanceSession(courseId, timing, absences));

    assert.equal(error?.message, message);
    assert.deepEqual(snapshot(dbName, all), before);
  });
}

const invalidCorrections = [
  ["an unknown session", "missing", "s1", { action: "present" }, "Attendance session not found"],
  ["a student of another course", null, "s4", { action: "present" }, "Student has no attendance in this session"],
  ["arrival hour 0", null, "s1", { action: "late", arrivalHour: 0 }, "Arrival hour out of range: 0"],
  ["an arrival hour past the class", null, "s1", { action: "late", arrivalHour: 4 }, "Arrival hour out of range: 4"],
  ["an excuse without motive", null, "s1", { action: "excuse", motive: "   " }, "An excuse needs a motive"],
  ["an excuse with no motive field", null, "s1", { action: "excuse" }, "An excuse needs a motive"],
  ["an unknown action", null, "s1", { action: "delete" }, "Unknown attendance correction: delete"],
  ["Sí vino for a student already present", null, "s3", { action: "present" }, "The correction does not change any hour"],
  ["an excuse with no absences", null, "s3", { action: "excuse", motive: "Permiso" }, "The correction does not change any hour"],
];

for (const [label, sessionId, studentId, correction, message] of invalidCorrections) {
  test(`correctAttendance rejects ${label} without writing (S7)`, async () => {
    const { dbName, db, session } = await seeded();
    const before = snapshot(dbName, ATTENDANCE_TABLES);

    const error = await rejectionOf(db.correctAttendance(sessionId ?? session.id, studentId, correction));

    assert.equal(error?.message, message);
    assert.deepEqual(snapshot(dbName, ATTENDANCE_TABLES), before);
  });
}

test("the roll call is written in one statement: a failing mark leaves no session behind (S7)", async () => {
  const dbName = "atomic.db";
  createPreviousDatabase(dbName);
  const db = await openDb(dbName);
  const before = snapshot(dbName, [...PREVIOUS_TABLES, ...ATTENDANCE_TABLES]);
  // s3 disappears between the validation and the write, so the mark for s3 fails its foreign key.
  globalThis.__notazodBeforeExecute = (sql) => {
    if (!sql.includes("attendance_roll_calls")) return;
    globalThis.__notazodBeforeExecute = null;
    withConnection(dbName, (connection) => connection.exec("PRAGMA foreign_keys = OFF; DELETE FROM students WHERE id = 's3';"));
  };

  const error = await rejectionOf(db.createAttendanceSession("c1", { date: "2026-11-06", startTime: "14:00", hours: 2 }, { s1: [1] }));

  assert.match(error?.message ?? "", /FOREIGN KEY|does not match/);
  const after = snapshot(dbName, [...PREVIOUS_TABLES, ...ATTENDANCE_TABLES]);
  assert.deepEqual(after.attendance_sessions, []);
  assert.deepEqual(after.attendance_marks, []);
  assert.deepEqual(after.students, before.students.filter((row) => row.id !== "s3"));
});

test("deleteCourse removes the course's sessions, marks and history and keeps other courses' attendance (S7)", async () => {
  const { dbName, db, session } = await seeded();
  await db.correctAttendance(session.id, "s1", { action: "excuse", motive: "Permiso" });
  const other = await db.createAttendanceSession("c2", { date: "2026-11-06", startTime: "08:00", hours: 2 }, { s4: [1] });
  await db.correctAttendance(other.id, "s4", { action: "present" });

  await db.deleteCourse("c1");

  const after = snapshot(dbName, ATTENDANCE_TABLES);
  assert.deepEqual(after.attendance_sessions.map((row) => row.id), [other.id]);
  assert.deepEqual(after.attendance_marks.map((row) => row.student_id), ["s4", "s4"]);
  assert.deepEqual(after.attendance_history.map((row) => row.student_id), ["s4"]);
  assert.deepEqual(await db.listAttendanceSessions("c1"), []);
});

test("deleteCourse refuses when an attendance key does not cascade, deleting nothing (S7)", async () => {
  const dbName = "no-cascade.db";
  createPreviousDatabase(dbName);
  // An attendance table created without ON DELETE CASCADE, as a broken earlier build could have left it.
  withConnection(dbName, (connection) => connection.exec("CREATE TABLE attendance_sessions (id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL REFERENCES courses(id), date TEXT NOT NULL, start_time TEXT NOT NULL, hours INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"));
  const db = await openDb(dbName);
  const all = [...PREVIOUS_TABLES, ...ATTENDANCE_TABLES];
  const before = snapshot(dbName, all);

  const error = await rejectionOf(db.deleteCourse("c1"));

  assert.equal(error?.message, "Database schema does not cascade course deletion: attendance_sessions.course_id -> courses");
  assert.deepEqual(snapshot(dbName, all), before);
});

test("COURSE_CASCADE_KEYS covers every foreign key reachable from courses (S7)", async () => {
  const dbName = "fk-reach.db"; createPreviousDatabase(dbName); await openDb(dbName);
  const src = (await import("node:fs")).readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
  const listed = [...src.match(/const COURSE_CASCADE_KEYS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  const fks = withConnection(dbName, (c) => c.prepare(`SELECT m.name AS child, f."table" AS parent, m.name || '.' || f."from" || ' -> ' || f."table" AS key FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f WHERE m.type='table'`).all());
  const reach = new Set(["courses"]); for (let grew = true; grew;) { grew = false; for (const f of fks) if (reach.has(f.parent) && !reach.has(f.child)) { reach.add(f.child); grew = true; } }
  assert.deepEqual(listed, fks.filter((f) => reach.has(f.parent)).map((f) => f.key).sort());
});

for (const [label, hours, marks] of [["malformed JSON", 2, "{bad"], ["a wrong hour count", 2, '{"s1":["present"]}'], ["another course's student", 2, '{"s4":["absent","absent"]}'], ["a duplicate student", 2, '{"s1":["present","present"],"s1":["absent","absent"]}'], ["an invalid state", 2, '{"s1":["present","late"]}'], ["7 hours", 7, "{}"]]) {
  test(`the roll-call trigger rejects ${label} and writes nothing (S7)`, async () => {
    const dbName = `trig-${++databases}.db`; createPreviousDatabase(dbName); await openDb(dbName);
    const before = snapshot(dbName, ATTENDANCE_TABLES);
    assert.throws(() => withConnection(dbName, (c) => c.prepare("INSERT INTO attendance_roll_calls (session_id, course_id, date, start_time, hours, marks) VALUES ('x','c1','2026-11-05','15:00',?,?)").run(hours, marks)));
    assert.deepEqual(snapshot(dbName, ATTENDANCE_TABLES), before);
  });
}

test("the history trigger rejects stale before_states and short after_states, and history cannot be updated (S5, S7)", async () => {
  const { dbName, session } = await seeded();
  const ins = (before, after) => withConnection(dbName, (c) => c.prepare("INSERT INTO attendance_history (id, session_id, student_id, action, before_states, after_states) VALUES (?, ?, 's1', 'late', ?, ?)").run(crypto.randomUUID(), session.id, before, after));
  const before = snapshot(dbName, ATTENDANCE_TABLES);
  assert.throws(() => ins('["present","absent","absent"]', '["absent","present","present"]'), /changed since it was read/);
  assert.throws(() => ins('["absent","absent","absent"]', '["present"]'), /NOT NULL/);
  assert.deepEqual(snapshot(dbName, ATTENDANCE_TABLES), before);
  ins('["absent","absent","absent"]', '["absent","present","present"]');
  assert.throws(() => withConnection(dbName, (c) => c.exec("UPDATE attendance_history SET motive = 'x'")), /cannot be changed/);
});
