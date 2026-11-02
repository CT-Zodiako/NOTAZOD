import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { ExistingCourse, SyncAction } from "./campusSync";

export type Course = {
  id: string;
  name: string;
  semester: string;
  students: number;
};

export type Student = {
  id: string;
  courseId: string;
  fullName: string;
  code: string;
  documentId: string;
  institutionalEmail: string;
  personalEmail: string;
};

export type Period = { id: string; courseId: string; number: number; start: string; end: string; activityPercent: number; examPercent: number; closed: number };
export type GradeItem = { id: string; courseId: string; periodId: string; name: string; isExam: number; sortOrder: number };
export type Grade = { studentId: string; itemId: string; value: number; pending: number };
export type GradeHistoryEntry = {
  id: string;
  studentId: string;
  itemId: string;
  previousValue: number | null;
  previousPending: number | null;
  newValue: number | null;
  newPending: number | null;
  action: "save" | "delete";
  createdAt: string;
  undone: number;
};
export type Group = { id: string; periodId: string; name: string; sortOrder: number };
export type GroupMembership = { groupId: string; studentId: string };

let connection: Database | null = null;

function resolveDatabaseName() {
  if (import.meta.env.MODE === "staging") {
    return "notazod-test.db";
  }
  return import.meta.env.VITE_NOTAZOD_DB_NAME || "notazod-dev.db";
}

async function getDatabase() {
  connection ??= await Database.load(`sqlite:${resolveDatabaseName()}`);
  return connection;
}

export type RestoreError = { fatal: boolean; message: string; backupPath?: string };

function isRestoreError(error: unknown): error is RestoreError {
  return typeof error === "object" && error !== null && "fatal" in error && "message" in error;
}

export async function stageRestore(sourcePath: string): Promise<void> {
  await invoke("stage_restore", { dbName: resolveDatabaseName(), sourcePath });
}

export async function applyPendingRestore(): Promise<boolean> {
  return invoke<boolean>("apply_pending_restore", { dbName: resolveDatabaseName() });
}

// A fatal restore failure means the active database file could not be confirmed
// present after a rollback attempt. Opening the database layer in that state would
// let SQLite silently create a new empty file in place of the lost data, so callers
// must stop before `getDatabase()` and surface the error instead of swallowing it.
export async function initDatabase() {
  try {
    await applyPendingRestore();
  } catch (error) {
    if (isRestoreError(error) && error.fatal) {
      throw error;
    }
    console.error("Pending restore failed; current database kept active, pending restore retained for retry", error);
  }
  const db = await getDatabase();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      semester TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, semester)
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      code TEXT NOT NULL,
      document_id TEXT NOT NULL,
      institutional_email TEXT NOT NULL,
      personal_email TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(course_id, code),
      UNIQUE(course_id, document_id),
      UNIQUE(course_id, institutional_email),
      UNIQUE(course_id, personal_email)
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS periods (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      start TEXT NOT NULL,
      end TEXT NOT NULL,
      activity_percent INTEGER NOT NULL DEFAULT 40,
      exam_percent INTEGER NOT NULL DEFAULT 60,
      closed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(course_id, number)
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grade_items (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      period_id TEXT REFERENCES periods(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_exam INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
  try { await db.execute("ALTER TABLE students ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"); } catch { /* existing schema already migrated */ }
  await db.execute("UPDATE students SET sort_order = rowid WHERE sort_order = 0");
  try { await db.execute("ALTER TABLE periods ADD COLUMN closed INTEGER NOT NULL DEFAULT 0"); } catch { /* existing schema already migrated */ }
  try { await db.execute("ALTER TABLE grade_items ADD COLUMN period_id TEXT REFERENCES periods(id) ON DELETE CASCADE"); } catch { /* existing schema already migrated */ }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grades (
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE,
      value REAL NOT NULL,
      pending INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (student_id, item_id)
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY NOT NULL,
      period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(period_id, name)
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS group_members (
      period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (period_id, student_id)
    );
  `);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members (group_id)");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grade_history (
      id TEXT PRIMARY KEY NOT NULL,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES grade_items(id) ON DELETE CASCADE,
      previous_value REAL,
      previous_pending INTEGER,
      new_value REAL,
      new_pending INTEGER,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      undone INTEGER NOT NULL DEFAULT 0
    );
  `);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_grade_history_pair ON grade_history (student_id, item_id)");
}

export async function listCourses(): Promise<Course[]> {
  const db = await getDatabase();
  return db.select<Course[]>(`
    SELECT c.id, c.name, c.semester, COUNT(s.id) AS students
    FROM courses c
    LEFT JOIN students s ON s.course_id = c.id
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE
  `);
}

export async function createCourse(name: string, semester: string): Promise<Course> {
  const db = await getDatabase();
  const id = crypto.randomUUID();
  await db.execute("INSERT INTO courses (id, name, semester) VALUES ($1, $2, $3)", [id, name, semester]);
  return { id, name, semester, students: 0 };
}

async function resolveBackupPath(): Promise<string> {
  return invoke<string>("resolve_backup_path");
}

async function createInternalBackup(db: Database) {
  const backupPath = await resolveBackupPath();
  await db.execute("VACUUM INTO $1", [backupPath]);
}

export async function exportBackup(destinationPath: string) {
  const db = await getDatabase();
  await db.execute("VACUUM INTO $1", [destinationPath]);
}

export async function deleteCourse(courseId: string) {
  const db = await getDatabase();
  await createInternalBackup(db);
  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM grades WHERE item_id IN (SELECT id FROM grade_items WHERE course_id = $1)", [courseId]);
    await db.execute("DELETE FROM grade_items WHERE course_id = $1", [courseId]);
    await db.execute("DELETE FROM students WHERE course_id = $1", [courseId]);
    await db.execute("DELETE FROM periods WHERE course_id = $1", [courseId]);
    await db.execute("DELETE FROM courses WHERE id = $1", [courseId]);
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

export async function listStudents(courseId: string): Promise<Student[]> {
  const db = await getDatabase();
  return db.select<Student[]>(`
    SELECT id, course_id AS courseId, full_name AS fullName, code,
      document_id AS documentId, institutional_email AS institutionalEmail,
      personal_email AS personalEmail, sort_order AS sortOrder
    FROM students WHERE course_id = $1 ORDER BY sort_order, rowid
  `, [courseId]);
}

export async function createStudent(student: Omit<Student, "id">): Promise<Student> {
  const db = await getDatabase();
  const id = crypto.randomUUID();
  const order = await db.select<{ sortOrder: number }[]>("SELECT COALESCE(MAX(sort_order), 0) + 1 AS sortOrder FROM students WHERE course_id = $1", [student.courseId]);
  const sortOrder = order[0]?.sortOrder ?? 1;
  await db.execute(`
    INSERT INTO students (id, course_id, full_name, code, document_id, institutional_email, personal_email, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [id, student.courseId, student.fullName, student.code, student.documentId, student.institutionalEmail, student.personalEmail, sortOrder]);
  return { ...student, id };
}

function addDays(date: Date, days: number) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy.toISOString().slice(0, 10); }

export async function listPeriods(courseId: string): Promise<Period[]> {
  const db = await getDatabase();
  let periods = await db.select<Period[]>("SELECT id, course_id AS courseId, number, start, end, activity_percent AS activityPercent, exam_percent AS examPercent, closed FROM periods WHERE course_id = $1 ORDER BY number", [courseId]);
  if (periods.length === 3) return periods;
  const today = new Date();
  const defaults = [
    { number: 1, start: addDays(today, 0), end: addDays(today, 30) },
    { number: 2, start: addDays(today, 31), end: addDays(today, 60) },
    { number: 3, start: addDays(today, 61), end: addDays(today, 90) },
  ];
  for (const period of defaults) {
    const id = crypto.randomUUID();
    await db.execute("INSERT OR IGNORE INTO periods (id, course_id, number, start, end, activity_percent, exam_percent) VALUES ($1, $2, $3, $4, $5, 40, 60)", [id, courseId, period.number, period.start, period.end]);
  }
  periods = await db.select<Period[]>("SELECT id, course_id AS courseId, number, start, end, activity_percent AS activityPercent, exam_percent AS examPercent, closed FROM periods WHERE course_id = $1 ORDER BY number", [courseId]);
  return periods;
}

export async function updatePeriod(period: Period) {
  const db = await getDatabase();
  const current = await db.select<{ closed: number }[]>("SELECT closed FROM periods WHERE id = $1", [period.id]);
  if (current[0]?.closed) throw new Error("Period is closed");
  await db.execute("UPDATE periods SET activity_percent = $1, exam_percent = $2 WHERE id = $3 AND closed = 0", [period.activityPercent, period.examPercent, period.id]);
}

export async function setPeriodClosed(periodId: string, closed: boolean) {
  const db = await getDatabase();
  await db.execute("UPDATE periods SET closed = $1 WHERE id = $2", [closed ? 1 : 0, periodId]);
}

export async function renameGradeItem(itemId: string, name: string) {
  const db = await getDatabase();
  const period = await db.select<{ closed: number }[]>("SELECT p.closed FROM periods p JOIN grade_items i ON i.period_id = p.id WHERE i.id = $1", [itemId]);
  if (period[0]?.closed) throw new Error("Period is closed");
  await db.execute("UPDATE grade_items SET name = $1 WHERE id = $2", [name, itemId]);
}

export async function deleteGradeItem(itemId: string) {
  const db = await getDatabase();
  const item = await db.select<{ periodId: string | null; isExam: number }[]>("SELECT period_id AS periodId, is_exam AS isExam FROM grade_items WHERE id = $1", [itemId]);
  if (!item[0]) throw new Error("Grade item not found");
  if (item[0].isExam) throw new Error("Exam items cannot be deleted");
  if (item[0].periodId) await assertPeriodOpen(db, item[0].periodId);
  await createInternalBackup(db);
  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM grade_history WHERE item_id = $1", [itemId]);
    await db.execute("DELETE FROM grades WHERE item_id = $1", [itemId]);
    await db.execute("DELETE FROM grade_items WHERE id = $1", [itemId]);
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

export async function createGradeItem(courseId: string, periodId: string, name: string, isExam = 0): Promise<GradeItem> {
  const db = await getDatabase();
  const period = await db.select<{ closed: number }[]>("SELECT closed FROM periods WHERE id = $1", [periodId]);
  if (period[0]?.closed) throw new Error("Period is closed");
  const id = crypto.randomUUID();
  const current = await db.select<{ sortOrder: number }[]>("SELECT COALESCE(MAX(sort_order), 0) AS sortOrder FROM grade_items WHERE period_id = $1", [periodId]);
  const item = { id, courseId, periodId, name, isExam, sortOrder: (current[0]?.sortOrder ?? 0) + 1 };
  await db.execute("INSERT INTO grade_items (id, course_id, period_id, name, is_exam, sort_order) VALUES ($1, $2, $3, $4, $5, $6)", [id, courseId, periodId, name, isExam, item.sortOrder]);
  return item;
}

export async function listGradeItems(courseId: string, periodId?: string): Promise<GradeItem[]> {
  const db = await getDatabase();
  const periods = await listPeriods(courseId);
  const selectedPeriod = periodId ?? periods[0].id;
  await db.execute("UPDATE grade_items SET period_id = $1 WHERE course_id = $2 AND period_id IS NULL", [periods[0].id, courseId]);
  const items = await db.select<GradeItem[]>("SELECT id, course_id AS courseId, period_id AS periodId, name, is_exam AS isExam, sort_order AS sortOrder FROM grade_items WHERE course_id = $1 AND period_id = $2 ORDER BY is_exam, sort_order, name", [courseId, selectedPeriod]);
  if (items.length) return items;
  const activity = { id: crypto.randomUUID(), courseId, periodId: selectedPeriod, name: "Actividad 1", isExam: 0, sortOrder: 1 };
  const exam = { id: crypto.randomUUID(), courseId, periodId: selectedPeriod, name: "Parcial", isExam: 1, sortOrder: 2 };
  await db.execute("INSERT INTO grade_items (id, course_id, period_id, name, is_exam, sort_order) VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)", [activity.id, courseId, selectedPeriod, activity.name, activity.isExam, activity.sortOrder, exam.id, courseId, selectedPeriod, exam.name, exam.isExam, exam.sortOrder]);
  return [activity, exam];
}

export async function listGrades(courseId: string): Promise<Grade[]> {
  const db = await getDatabase();
  return db.select<Grade[]>("SELECT g.student_id AS studentId, g.item_id AS itemId, g.value, g.pending FROM grades g JOIN grade_items i ON i.id = g.item_id WHERE i.course_id = $1", [courseId]);
}

async function fetchGradeState(db: Database, studentId: string, itemId: string): Promise<{ value: number; pending: number } | null> {
  const rows = await db.select<{ value: number; pending: number }[]>("SELECT value, pending FROM grades WHERE student_id = $1 AND item_id = $2", [studentId, itemId]);
  return rows[0] ?? null;
}

async function recordGradeHistory(
  db: Database,
  studentId: string,
  itemId: string,
  previous: { value: number; pending: number } | null,
  next: { value: number; pending: number } | null,
  action: "save" | "delete"
) {
  await db.execute(
    `INSERT INTO grade_history (id, student_id, item_id, previous_value, previous_pending, new_value, new_pending, action)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      crypto.randomUUID(),
      studentId,
      itemId,
      previous?.value ?? null,
      previous?.pending ?? null,
      next?.value ?? null,
      next?.pending ?? null,
      action,
    ]
  );
}

export async function saveGrade(grade: Grade) {
  const db = await getDatabase();
  const period = await db.select<{ closed: number }[]>("SELECT p.closed FROM periods p JOIN grade_items i ON i.period_id = p.id WHERE i.id = $1", [grade.itemId]);
  if (period[0]?.closed) throw new Error("Period is closed");
  const previous = await fetchGradeState(db, grade.studentId, grade.itemId);
  await db.execute(`INSERT INTO grades (student_id, item_id, value, pending) VALUES ($1, $2, $3, $4)
    ON CONFLICT(student_id, item_id) DO UPDATE SET value = excluded.value, pending = excluded.pending`, [grade.studentId, grade.itemId, grade.value, grade.pending]);
  await recordGradeHistory(db, grade.studentId, grade.itemId, previous, { value: grade.value, pending: grade.pending }, "save");
}

export async function deleteGrade(studentId: string, itemId: string) {
  const db = await getDatabase();
  const period = await db.select<{ closed: number }[]>("SELECT p.closed FROM periods p JOIN grade_items i ON i.period_id = p.id WHERE i.id = $1", [itemId]);
  if (period[0]?.closed) throw new Error("Period is closed");
  const previous = await fetchGradeState(db, studentId, itemId);
  await db.execute("DELETE FROM grades WHERE student_id = $1 AND item_id = $2", [studentId, itemId]);
  await recordGradeHistory(db, studentId, itemId, previous, null, "delete");
}

export async function listGradeHistory(studentId: string, itemId: string): Promise<GradeHistoryEntry[]> {
  const db = await getDatabase();
  return db.select<GradeHistoryEntry[]>(
    `SELECT id, student_id AS studentId, item_id AS itemId,
       previous_value AS previousValue, previous_pending AS previousPending,
       new_value AS newValue, new_pending AS newPending,
       action, created_at AS createdAt, undone
     FROM grade_history
     WHERE student_id = $1 AND item_id = $2
     ORDER BY rowid DESC`,
    [studentId, itemId]
  );
}

export async function undoLastGrade(studentId: string, itemId: string): Promise<Grade | null> {
  const db = await getDatabase();
  const period = await db.select<{ closed: number }[]>("SELECT p.closed FROM periods p JOIN grade_items i ON i.period_id = p.id WHERE i.id = $1", [itemId]);
  if (period[0]?.closed) throw new Error("Period is closed");
  const rows = await db.select<GradeHistoryEntry[]>(
    `SELECT id, student_id AS studentId, item_id AS itemId,
       previous_value AS previousValue, previous_pending AS previousPending,
       new_value AS newValue, new_pending AS newPending,
       action, created_at AS createdAt, undone
     FROM grade_history
     WHERE student_id = $1 AND item_id = $2 AND undone = 0
     ORDER BY rowid DESC LIMIT 1`,
    [studentId, itemId]
  );
  const entry = rows[0];
  if (!entry) return null;
  if (entry.previousValue === null || entry.previousPending === null) {
    await db.execute("DELETE FROM grades WHERE student_id = $1 AND item_id = $2", [studentId, itemId]);
  } else {
    await db.execute(
      `INSERT INTO grades (student_id, item_id, value, pending) VALUES ($1, $2, $3, $4)
       ON CONFLICT(student_id, item_id) DO UPDATE SET value = excluded.value, pending = excluded.pending`,
      [studentId, itemId, entry.previousValue, entry.previousPending]
    );
  }
  await db.execute("UPDATE grade_history SET undone = 1 WHERE id = $1", [entry.id]);
  if (entry.previousValue === null || entry.previousPending === null) return null;
  return { studentId, itemId, value: entry.previousValue, pending: entry.previousPending };
}

async function assertPeriodOpen(db: Database, periodId: string) {
  const period = await db.select<{ closed: number }[]>("SELECT closed FROM periods WHERE id = $1", [periodId]);
  if (period[0]?.closed) throw new Error("Period is closed");
}

export async function listGroups(periodId: string): Promise<Group[]> {
  const db = await getDatabase();
  return db.select<Group[]>(
    "SELECT id, period_id AS periodId, name, sort_order AS sortOrder FROM groups WHERE period_id = $1 ORDER BY sort_order, name COLLATE NOCASE",
    [periodId]
  );
}

export async function listGroupMemberships(periodId: string): Promise<GroupMembership[]> {
  const db = await getDatabase();
  return db.select<GroupMembership[]>(
    "SELECT group_id AS groupId, student_id AS studentId FROM group_members WHERE period_id = $1",
    [periodId]
  );
}

export async function createGroup(periodId: string, name: string): Promise<Group> {
  const db = await getDatabase();
  await assertPeriodOpen(db, periodId);
  const id = crypto.randomUUID();
  const current = await db.select<{ sortOrder: number }[]>("SELECT COALESCE(MAX(sort_order), 0) AS sortOrder FROM groups WHERE period_id = $1", [periodId]);
  const sortOrder = (current[0]?.sortOrder ?? 0) + 1;
  await db.execute("INSERT INTO groups (id, period_id, name, sort_order) VALUES ($1, $2, $3, $4)", [id, periodId, name, sortOrder]);
  return { id, periodId, name, sortOrder };
}

export async function renameGroup(groupId: string, name: string) {
  const db = await getDatabase();
  const group = await db.select<{ periodId: string }[]>("SELECT period_id AS periodId FROM groups WHERE id = $1", [groupId]);
  if (!group[0]) throw new Error("Group not found");
  await assertPeriodOpen(db, group[0].periodId);
  await db.execute("UPDATE groups SET name = $1 WHERE id = $2", [name, groupId]);
}

export async function deleteGroup(groupId: string) {
  const db = await getDatabase();
  const group = await db.select<{ periodId: string }[]>("SELECT period_id AS periodId FROM groups WHERE id = $1", [groupId]);
  if (!group[0]) throw new Error("Group not found");
  await assertPeriodOpen(db, group[0].periodId);
  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM group_members WHERE group_id = $1", [groupId]);
    await db.execute("DELETE FROM groups WHERE id = $1", [groupId]);
    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

export async function assignStudentToGroup(periodId: string, studentId: string, groupId: string | null) {
  const db = await getDatabase();
  await assertPeriodOpen(db, periodId);
  const period = await db.select<{ courseId: string }[]>("SELECT course_id AS courseId FROM periods WHERE id = $1", [periodId]);
  const student = await db.select<{ id: string }[]>("SELECT id FROM students WHERE id = $1 AND course_id = $2", [studentId, period[0]?.courseId]);
  if (!period[0] || !student[0]) throw new Error("Student does not belong to this period");
  if (groupId !== null) {
    const group = await db.select<{ id: string }[]>("SELECT id FROM groups WHERE id = $1 AND period_id = $2", [groupId, periodId]);
    if (!group[0]) throw new Error("Group does not belong to this period");
  }
  await db.execute("DELETE FROM group_members WHERE period_id = $1 AND student_id = $2", [periodId, studentId]);
  if (groupId !== null) {
    await db.execute("INSERT INTO group_members (period_id, group_id, student_id) VALUES ($1, $2, $3)", [periodId, groupId, studentId]);
  }
}

export async function copyGroupsFromPeriod(sourcePeriodId: string, destinationPeriodId: string): Promise<{ groups: Group[]; memberships: GroupMembership[] }> {
  if (sourcePeriodId === destinationPeriodId) throw new Error("Source and destination cutoffs must be different");
  const db = await getDatabase();
  const periods = await db.select<{ id: string; courseId: string }[]>(
    "SELECT id, course_id AS courseId FROM periods WHERE id IN ($1, $2)",
    [sourcePeriodId, destinationPeriodId]
  );
  const source = periods.find((p) => p.id === sourcePeriodId);
  const destination = periods.find((p) => p.id === destinationPeriodId);
  if (!source || !destination) throw new Error("Cutoff not found");
  if (source.courseId !== destination.courseId) throw new Error("Cutoffs belong to different courses");
  await assertPeriodOpen(db, destinationPeriodId);

  const sourceGroups = await db.select<Group[]>(
    "SELECT id, period_id AS periodId, name, sort_order AS sortOrder FROM groups WHERE period_id = $1 ORDER BY sort_order, name COLLATE NOCASE",
    [sourcePeriodId]
  );
  const sourceMemberships = await db.select<GroupMembership[]>(
    "SELECT group_id AS groupId, student_id AS studentId FROM group_members WHERE period_id = $1",
    [sourcePeriodId]
  );

  await db.execute("DELETE FROM group_members WHERE period_id = $1", [destinationPeriodId]);
  await db.execute("DELETE FROM groups WHERE period_id = $1", [destinationPeriodId]);

  const idMap = new Map<string, string>();
  const newGroups: Group[] = sourceGroups.map((group) => {
    const newId = crypto.randomUUID();
    idMap.set(group.id, newId);
    return { id: newId, periodId: destinationPeriodId, name: group.name, sortOrder: group.sortOrder };
  });

  if (newGroups.length) {
    const placeholders = newGroups.map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`).join(", ");
    const params = newGroups.flatMap((group) => [group.id, group.periodId, group.name, group.sortOrder]);
    await db.execute(`INSERT INTO groups (id, period_id, name, sort_order) VALUES ${placeholders}`, params);
  }

  const candidateMemberships = sourceMemberships
    .map((membership) => ({ groupId: idMap.get(membership.groupId), studentId: membership.studentId }))
    .filter((membership): membership is { groupId: string; studentId: string } => !!membership.groupId);

  let newMemberships: GroupMembership[] = [];
  if (candidateMemberships.length) {
    const candidateStudentIds = [...new Set(candidateMemberships.map((m) => m.studentId))];
    const studentPlaceholders = candidateStudentIds.map((_, index) => `$${index + 2}`).join(", ");
    const validStudents = await db.select<{ id: string }[]>(
      `SELECT id FROM students WHERE course_id = $1 AND id IN (${studentPlaceholders})`,
      [destination.courseId, ...candidateStudentIds]
    );
    const validStudentIds = new Set(validStudents.map((s) => s.id));
    newMemberships = candidateMemberships.filter((m) => validStudentIds.has(m.studentId));

    if (newMemberships.length) {
      const memberPlaceholders = newMemberships.map((_, index) => `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`).join(", ");
      const memberParams = newMemberships.flatMap((m) => [destinationPeriodId, m.groupId, m.studentId]);
      await db.execute(`INSERT INTO group_members (period_id, group_id, student_id) VALUES ${memberPlaceholders}`, memberParams);
    }
  }

  return { groups: newGroups, memberships: newMemberships };
}

export async function saveGroupGrade(groupId: string, itemId: string, value: number, pending: number): Promise<Grade[]> {
  const db = await getDatabase();
  const group = await db.select<{ periodId: string; closed: number }[]>(
    "SELECT g.period_id AS periodId, p.closed AS closed FROM groups g JOIN periods p ON p.id = g.period_id WHERE g.id = $1",
    [groupId]
  );
  const item = await db.select<{ periodId: string; closed: number }[]>(
    "SELECT i.period_id AS periodId, p.closed AS closed FROM grade_items i JOIN periods p ON p.id = i.period_id WHERE i.id = $1",
    [itemId]
  );
  if (!group[0] || !item[0]) throw new Error("Group or grade item not found");
  if (group[0].periodId !== item[0].periodId) throw new Error("Group and grade item belong to different periods");
  if (group[0].closed) throw new Error("Period is closed");

  const members = await db.select<{ studentId: string }[]>(
    "SELECT student_id AS studentId FROM group_members WHERE group_id = $1 AND period_id = $2",
    [groupId, group[0].periodId]
  );
  if (!members.length) throw new Error("Group has no members");

  const placeholders = members.map((_, index) => `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3}, $${members.length * 3 + 1})`).join(", ");
  const params = members.flatMap((member) => [member.studentId, itemId, value]);
  params.push(pending);
  await db.execute(
    `INSERT INTO grades (student_id, item_id, value, pending) VALUES ${placeholders}
     ON CONFLICT(student_id, item_id) DO UPDATE SET value = excluded.value, pending = excluded.pending`,
    params
  );

  return members.map((member) => ({ studentId: member.studentId, itemId, value, pending }));
}

// Read-only snapshot of the rows the Campus upload needs (SELECTs only; never creates defaults).
export async function loadCampusRows() {
  const db = await getDatabase();
  const [courses, students, periods, items, grades] = await Promise.all([
    db.select<{ id: string; name: string }[]>("SELECT id, name FROM courses ORDER BY name"),
    db.select<{ id: string; courseId: string; fullName: string; code: string }[]>("SELECT id, course_id AS courseId, full_name AS fullName, code FROM students"),
    db.select<{ id: string; courseId: string; number: number; activityPercent: number; examPercent: number; closed: number }[]>("SELECT id, course_id AS courseId, number, activity_percent AS activityPercent, exam_percent AS examPercent, closed FROM periods"),
    db.select<{ id: string; periodId: string | null; isExam: number }[]>("SELECT id, period_id AS periodId, is_exam AS isExam FROM grade_items"),
    db.select<{ studentId: string; itemId: string; value: number; pending: number }[]>("SELECT student_id AS studentId, item_id AS itemId, value, pending FROM grades"),
  ]);
  return { courses, students, periods, items, grades };
}

// Courses with their students for "Sincronizar cursos" (SELECTs only).
export async function loadSyncCourses(): Promise<ExistingCourse[]> {
  const courses = await listCourses();
  return Promise.all(courses.map(async (course) => ({ id: course.id, name: course.name, semester: course.semester, students: await listStudents(course.id) })));
}

export type SyncResult = { courseName: string; created: boolean; added: number; failed: { code: string; reason: string }[] };

// Applies a confirmed sync plan: creates courses and adds students; never deletes or edits.
// An internal backup is taken first. A failing student is reported and the rest continue.
export async function applyCourseSync(plan: SyncAction[]): Promise<SyncResult[]> {
  const db = await getDatabase();
  await createInternalBackup(db);
  const results: SyncResult[] = [];
  for (const action of plan) {
    if (action.kind === "conflict") continue;
    if (!action.toAdd.length && action.kind === "add") continue;
    const courseId = action.kind === "create" ? (await createCourse(action.courseName, action.semester)).id : action.courseId;
    const result: SyncResult = { courseName: action.courseName, created: action.kind === "create", added: 0, failed: [] };
    for (const student of action.toAdd) {
      try { await createStudent({ ...student, courseId }); result.added++; }
      catch (error) { result.failed.push({ code: student.code, reason: error instanceof Error ? error.message : String(error) }); }
    }
    results.push(result);
  }
  return results;
}
