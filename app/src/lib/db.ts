import Database from "@tauri-apps/plugin-sql";

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

let connection: Database | null = null;

async function getDatabase() {
  connection ??= await Database.load("sqlite:notazod.db");
  return connection;
}

export async function initDatabase() {
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

export async function deleteCourse(courseId: string) {
  const db = await getDatabase();
  await db.execute("DELETE FROM grades WHERE item_id IN (SELECT id FROM grade_items WHERE course_id = $1)", [courseId]);
  await db.execute("DELETE FROM grade_items WHERE course_id = $1", [courseId]);
  await db.execute("DELETE FROM students WHERE course_id = $1", [courseId]);
  await db.execute("DELETE FROM periods WHERE course_id = $1", [courseId]);
  await db.execute("DELETE FROM courses WHERE id = $1", [courseId]);
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

export async function saveGrade(grade: Grade) {
  const db = await getDatabase();
  const period = await db.select<{ closed: number }[]>("SELECT p.closed FROM periods p JOIN grade_items i ON i.period_id = p.id WHERE i.id = $1", [grade.itemId]);
  if (period[0]?.closed) throw new Error("Period is closed");
  await db.execute(`INSERT INTO grades (student_id, item_id, value, pending) VALUES ($1, $2, $3, $4)
    ON CONFLICT(student_id, item_id) DO UPDATE SET value = excluded.value, pending = excluded.pending`, [grade.studentId, grade.itemId, grade.value, grade.pending]);
}
