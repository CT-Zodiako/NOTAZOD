import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AppShell,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  FileButton,
  Group,
  Menu,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { Course, createCourse, createGradeItem, createStudent, deleteCourse, Grade, GradeItem, initDatabase, listCourses, listGradeItems, listGrades, listPeriods, listStudents, Period, renameGradeItem, saveGrade, setPeriodClosed, Student, updatePeriod } from "./lib/db";
import { classifyStudentRows, hasErrors, StudentDraft, StudentValidation, validateStudent } from "./lib/validation";

const emptyStudent: StudentDraft = {
  fullName: "",
  code: "",
  documentId: "",
  institutionalEmail: "",
  personalEmail: "",
};

function parseGrade(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return { empty: true } as const;
  if (!/^\d*(\.\d)?$/.test(normalized)) return { error: "Usá un número de 0,0 a 5,0." } as const;
  const number = Number(normalized);
  if (number < 0 || number > 5) return { error: "La nota debe estar entre 0,0 y 5,0." } as const;
  return { value: Math.round(number * 10) / 10 } as const;
}

const normalizeHeader = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function mapStudentColumns(columns: string[], values: string[]): StudentDraft {
  const normalized = columns.map(normalizeHeader);
  const indexOf = (names: string[]) => normalized.findIndex((column) => names.includes(column));
  const indexes = {
    fullName: indexOf(["nombre completo", "nombre", "full name"]),
    code: indexOf(["codigo", "student code"]),
    documentId: indexOf(["documento", "document id", "cedula"]),
    institutionalEmail: indexOf(["correo institucional", "correo 1", "institutional email"]),
    personalEmail: indexOf(["correo personal", "correo 2", "personal email"]),
  };
  return Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, index >= 0 ? values[index]?.trim() ?? "" : ""])) as StudentDraft;
}

function parseDelimited(text: string): StudentDraft[] {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  if (!header) return [];
  const delimiter = header.includes(";") ? ";" : ",";
  const columns = header.split(delimiter);
  return rows.filter(Boolean).map((row) => mapStudentColumns(columns, row.split(delimiter)));
}

function parseHtmlSpreadsheet(text: string): StudentDraft[] {
  const document = new DOMParser().parseFromString(text, "text/html");
  const table = document.querySelector("table");
  if (!table) return [];
  const rows = [...table.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? ""));
  const [columns, ...data] = rows;
  if (!columns) return [];
  return data.filter((row) => row.length).map((row) => mapStudentColumns(columns, row));
}

function parseStudentFile(text: string): StudentDraft[] {
  return /<table[\s>]/i.test(text) ? parseHtmlSpreadsheet(text) : parseDelimited(text);
}

type GradeImportRow = { code: string; values: Array<number | null>; invalid: string[] };
type GradeImportData = { headers: string[]; rows: GradeImportRow[]; gradeHeaders: string[] };

function parseGradeFile(text: string): GradeImportData | null {
  const rows = /<table[\s>]/i.test(text)
    ? (() => { const document = new DOMParser().parseFromString(text, "text/html"); return [...document.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "")); })()
    : text.trim().split(/\r?\n/).filter(Boolean).map((row) => row.split(row.includes(";") ? ";" : ",").map((value) => value.trim().replace(/^"|"$/g, "")));
  const [headers, ...data] = rows;
  if (!headers) return null;
  const normalized = headers.map(normalizeHeader);
  const codeIndex = normalized.findIndex((header) => ["codigo", "código", "student code"].includes(header));
  if (codeIndex < 0) return null;
  const gradeIndexes = headers.map((header, index) => ({ header, index })).filter(({ index }) => index !== codeIndex && index > codeIndex && data.some((row) => row[index]?.trim() && /^\d+(?:[,.]\d)?$/.test(row[index].trim())));
  if (!gradeIndexes.length) return null;
  const parsedRows = data.map((row) => {
    const invalid: string[] = [];
    const values = gradeIndexes.map(({ header, index }) => {
      const value = row[index]?.trim() ?? "";
      if (!value) return null;
      const normalizedValue = value.replace(",", ".");
      if (!/^\d+(?:\.\d)?$/.test(normalizedValue) || Number(normalizedValue) > 5) { invalid.push(`${header}: ${value}`); return null; }
      return Math.round(Number(normalizedValue) * 10) / 10;
    });
    return { code: row[codeIndex]?.trim() ?? "", values, invalid };
  }).filter((row) => row.code);
  return { headers, rows: parsedRows, gradeHeaders: gradeIndexes.map(({ header }) => header) };
}

function App() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodIndex, setPeriodIndex] = useState(0);
  const [gradeItems, setGradeItems] = useState<GradeItem[]>([]);
  const [itemsByPeriod, setItemsByPeriod] = useState<Record<string, GradeItem[]>>({});
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [courseModal, setCourseModal] = useState(false);
  const [deleteCourseModal, setDeleteCourseModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [studentModal, setStudentModal] = useState(false);
  const [studentDetailModal, setStudentDetailModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activityModal, setActivityModal] = useState(false);
  const [renameModal, setRenameModal] = useState(false);
  const [renameItem, setRenameItem] = useState<GradeItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [activityName, setActivityName] = useState("");
  const [importModal, setImportModal] = useState(false);
  const [guidedModal, setGuidedModal] = useState(false);
  const [guidedStage, setGuidedStage] = useState<"students" | "activity" | "exam" | "preview">("students");
  const [guidedFieldIndex, setGuidedFieldIndex] = useState(0);
  const [guidedColumns, setGuidedColumns] = useState<string[][]>([]);
  const [guidedPaste, setGuidedPaste] = useState("");
  const [guidedActivityName, setGuidedActivityName] = useState("");
  const [guidedGrades, setGuidedGrades] = useState<{ name: string; values: Array<number | null>; exam: boolean }[]>([]);
  const [guidedError, setGuidedError] = useState("");
  const [exportModal, setExportModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [templateColumns, setTemplateColumns] = useState<string[]>(["code", "name", "email"]);
  const [exportColumns, setExportColumns] = useState<string[]>(["code", "periodGrade"]);
  const [gradeImportModal, setGradeImportModal] = useState(false);
  const [gradeImportData, setGradeImportData] = useState<GradeImportData | null>(null);
  const [gradeImportLastIsExam, setGradeImportLastIsExam] = useState(true);
  const [name, setName] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [semester, setSemester] = useState("2026-2");
  const [student, setStudent] = useState<StudentDraft>(emptyStudent);
  const [studentErrors, setStudentErrors] = useState<StudentValidation>({});
  const [importPreview, setImportPreview] = useState<ReturnType<typeof classifyStudentRows> | null>(null);
  const [gradeModal, setGradeModal] = useState(false);
  const [gradeItem, setGradeItem] = useState<GradeItem | null>(null);
  const [gradeIndex, setGradeIndex] = useState(0);
  const [gradeValue, setGradeValue] = useState("");
  const [gradeError, setGradeError] = useState("");
  const [splitModal, setSplitModal] = useState(false);
  const [activityPercent, setActivityPercent] = useState(40);
  const [examPercent, setExamPercent] = useState(60);
  const [error, setError] = useState("");
  const guidedFields = ["Nombre completo", "Código", "Documento", "Correo institucional", "Correo personal"];

  useEffect(() => {
    initDatabase().then(() => listCourses()).then(setCourses).catch(() => setCourses([])).finally(() => setLoading(false));
  }, []);

  async function handleDeleteCourse() {
    if (!selectedCourse || deleteConfirmation.trim() !== selectedCourse.name) return;
    try {
      await deleteCourse(selectedCourse.id);
      setCourses((current) => current.filter((course) => course.id !== selectedCourse.id));
      setSelectedCourse(null);
      setDeleteConfirmation("");
      setDeleteCourseModal(false);
    } catch {
      setError("No se pudo eliminar el curso.");
    }
  }

  async function handleCreateCourse() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const course = await createCourse(trimmed, semester.trim());
      await listPeriods(course.id);
      setCourses((current) => [...current, course]);
      setName("");
      setCourseModal(false);
      await openCourse(course);
    } catch {
      setError("No se pudo crear el curso. Verificá que nombre y semestre no estén repetidos.");
    }
  }

  async function openCourse(course: Course) {
    setSelectedCourse(course);
    const coursePeriods = await listPeriods(course.id);
    const initialIndex = Math.max(0, coursePeriods.findIndex((period) => !period.closed));
    const [courseStudents, allItems, courseGrades] = await Promise.all([listStudents(course.id), Promise.all(coursePeriods.map((period) => listGradeItems(course.id, period.id))), listGrades(course.id)]);
    const items = allItems[initialIndex];
    setPeriods(coursePeriods);
    setItemsByPeriod(Object.fromEntries(coursePeriods.map((period, index) => [period.id, allItems[index]])));
    setPeriodIndex(initialIndex);
    setActivityPercent(coursePeriods[initialIndex].activityPercent);
    setExamPercent(coursePeriods[initialIndex].examPercent);
    setStudents(courseStudents);
    setGradeItems(items);
    setGrades(courseGrades);
  }

  async function selectPeriod(index: number) {
    if (!selectedCourse || !periods[index]) return;
    setPeriodIndex(index);
    setActivityPercent(periods[index].activityPercent);
    setExamPercent(periods[index].examPercent);
    setGradeItems(await listGradeItems(selectedCourse.id, periods[index].id));
  }

  function openSplitEditor() {
    if (!activePeriod) return;
    setActivityPercent(activePeriod.activityPercent);
    setExamPercent(activePeriod.examPercent);
    setSplitModal(true);
  }

  async function saveSplit() {
    if (!activePeriod || activeState === "locked" || activityPercent + examPercent !== 100) return;
    try {
      await updatePeriod({ ...activePeriod, activityPercent, examPercent });
      setPeriods((current) => current.map((period) => period.id === activePeriod.id ? { ...period, activityPercent, examPercent } : period));
      setSplitModal(false);
    } catch {
      setError("No se puede modificar un corte cerrado.");
    }
  }

  function periodState(period: Period) {
    return period.closed ? "locked" : "active";
  }

  async function togglePeriodClosed() {
    if (!activePeriod) return;
    const nextClosed = !activePeriod.closed;
    await setPeriodClosed(activePeriod.id, nextClosed);
    setPeriods((current) => current.map((period) => period.id === activePeriod.id ? { ...period, closed: nextClosed ? 1 : 0 } : period));
  }

  const activePeriod = periods[periodIndex];
  const activeState = activePeriod ? periodState(activePeriod) : "active";
  const filteredStudents = students.filter((studentItem) => {
    const query = studentSearch.trim().toLowerCase();
    const matchesSearch = !query || [studentItem.fullName, studentItem.code, studentItem.institutionalEmail].some((value) => value.toLowerCase().includes(query));
    const calculation = periodCalculation(studentItem.id);
    const hasPending = gradeItems.some((gradeItem) => gradeFor(studentItem.id, gradeItem.id)?.pending);
    const matchesFilter = gradeFilter === "all" || (gradeFilter === "pending" && hasPending) || (gradeFilter === "below" && calculation.periodGrade < 3);
    return matchesSearch && matchesFilter;
  });

  function gradeFor(studentId: string, itemId: string) {
    return grades.find((grade) => grade.studentId === studentId && grade.itemId === itemId);
  }

  function periodCalculationFor(studentId: string, period: Period, items: GradeItem[]) {
    const activities = items.filter((item) => !item.isExam);
    const exam = items.find((item) => item.isExam);
    const activityAverage = activities.length ? activities.reduce((sum, item) => sum + (gradeFor(studentId, item.id)?.value ?? 0), 0) / activities.length : 0;
    const examValue = exam ? (gradeFor(studentId, exam.id)?.value ?? 0) : 0;
    return { activityAverage, examValue, periodGrade: activityAverage * period.activityPercent / 100 + examValue * period.examPercent / 100 };
  }

  function periodCalculation(studentId: string) {
    return activePeriod ? periodCalculationFor(studentId, activePeriod, itemsByPeriod[activePeriod.id] ?? gradeItems) : { activityAverage: 0, periodGrade: 0 };
  }

  function courseCalculation(studentId: string) {
    const periodWeights = [0.30, 0.35, 0.35];
    const gradesByPeriod = periods.map((period) => periodCalculationFor(studentId, period, itemsByPeriod[period.id] ?? []));
    const evaluated = periods.map((period, index) => period.closed ? gradesByPeriod[index].periodGrade * (periodWeights[index] ?? 0) : 0);
    const accumulated = periods.some((period) => period.closed) ? evaluated.reduce((sum, value) => sum + value, 0) : null;
    const final = periods.length === 3 && periods.every((period) => period.closed) ? evaluated.reduce((sum, value) => sum + value, 0) : null;
    return { accumulated, final };
  }

  function exportPeriodImage() {
    if (!activePeriod || !students.length || !exportColumns.length) return;
    const columns = exportColumns.map((key) => ({ key, label: key === "code" ? "Código" : key === "name" ? "Nombre" : key === "periodGrade" ? "Nota del corte" : key === "accumulated" ? "Acumulada" : key === "final" ? "Nota final" : gradeItems.find((item) => item.id === key)?.name ?? key }));
    const canvas = document.createElement("canvas"); const rowHeight = 42; const columnWidth = 190;
    canvas.width = Math.max(760, 48 + columns.length * columnWidth); canvas.height = 72 + students.length * rowHeight;
    const context = canvas.getContext("2d"); if (!context) return;
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#18212f"; context.font = "700 16px sans-serif";
    columns.forEach((column, index) => context.fillText(column.label, 24 + index * columnWidth, 42));
    context.strokeStyle = "#d9e0ea"; context.beginPath(); context.moveTo(16, 58); context.lineTo(canvas.width - 16, 58); context.stroke(); context.font = "15px sans-serif";
    students.forEach((studentItem, rowIndex) => {
      const y = 88 + rowIndex * rowHeight; const calculation = periodCalculation(studentItem.id); const summary = courseCalculation(studentItem.id);
      columns.forEach((column, columnIndex) => {
        let value = "—";
        if (column.key === "code") value = studentItem.code; else if (column.key === "name") value = studentItem.fullName; else if (column.key === "activityAverage") value = calculation.activityAverage.toFixed(1).replace(".", ","); else if (column.key === "periodGrade") value = calculation.periodGrade.toFixed(1).replace(".", ","); else if (column.key === "accumulated") value = summary.accumulated === null ? "En curso" : summary.accumulated.toFixed(1).replace(".", ","); else if (column.key === "final") value = summary.final === null ? "En curso" : summary.final.toFixed(1).replace(".", ","); else { const grade = gradeFor(studentItem.id, column.key); value = grade ? grade.value.toFixed(1).replace(".", ",") : "—"; }
        context.fillStyle = "#18212f"; context.fillText(value, 24 + columnIndex * columnWidth, y);
      });
      if (rowIndex < students.length - 1) { context.strokeStyle = "#eef1f5"; context.beginPath(); context.moveTo(16, y + 14); context.lineTo(canvas.width - 16, y + 14); context.stroke(); }
    });
    const link = document.createElement("a"); link.download = `notazod-corte-${activePeriod.number}.png`; link.href = canvas.toDataURL("image/png"); link.click();
  }

  function openGuidedImport() {
    setGuidedStage("students"); setGuidedFieldIndex(0); setGuidedColumns([]); setGuidedPaste(""); setGuidedGrades([]); setGuidedError(""); setGuidedModal(true);
  }

  function pastedLines(value: string) {
    return value.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter((line, index, all) => line || index < all.length - 1);
  }

  function acceptGuidedStudentColumn() {
    const lines = pastedLines(guidedPaste);
    if (!lines.length) { setGuidedError("Pegá una columna antes de continuar."); return; }
    if (guidedColumns.length && lines.length !== guidedColumns[0].length) { setGuidedError(`Se esperaban ${guidedColumns[0].length} filas y recibimos ${lines.length}.`); return; }
    const nextColumns = [...guidedColumns, lines];
    setGuidedColumns(nextColumns); setGuidedPaste(""); setGuidedError("");
    if (nextColumns.length === guidedFields.length) setGuidedStage("activity"); else setGuidedFieldIndex(guidedFieldIndex + 1);
  }

  function parseGuidedGrades() {
    const lines = pastedLines(guidedPaste);
    const expected = guidedColumns[0]?.length ?? 0;
    if (lines.length !== expected) { setGuidedError(`Se esperaban ${expected} notas y recibimos ${lines.length}.`); return null; }
    const values: Array<number | null> = [];
    for (const value of lines) {
      if (!value) { values.push(null); continue; }
      const normalized = value.replace(",", ".");
      if (!/^\d+(?:\.\d)?$/.test(normalized) || Number(normalized) > 5) { setGuidedError(`Nota inválida: ${value}`); return null; }
      values.push(Math.round(Number(normalized) * 10) / 10);
    }
    return values;
  }

  function acceptGuidedActivity(hasExamNext: boolean) {
    if (!guidedActivityName.trim()) { setGuidedError("Escribí el nombre de la actividad."); return; }
    const values = parseGuidedGrades(); if (!values) return;
    setGuidedGrades((current) => [...current, { name: guidedActivityName.trim(), values, exam: false }]);
    setGuidedActivityName(""); setGuidedPaste(""); setGuidedError("");
    if (hasExamNext) setGuidedStage("exam");
  }

  function skipGuidedExam() { setGuidedStage("preview"); setGuidedError(""); }

  function saveGuidedWithoutExam() {
    if (guidedActivityName.trim() || guidedPaste.trim()) { setGuidedError("Terminá o limpiá la actividad en curso antes de guardar."); return; }
    setGuidedStage("preview"); setGuidedError("");
  }

  function goToGuidedExam() {
    if (guidedActivityName.trim() || guidedPaste.trim()) { acceptGuidedActivity(true); return; }
    setGuidedStage("exam"); setGuidedError("");
  }

  function removeGuidedActivity(index: number) {
    setGuidedGrades((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function acceptGuidedExam() {
    const values = parseGuidedGrades(); if (!values) return;
    setGuidedGrades((current) => [...current.filter((item) => !item.exam), { name: "Parcial", values, exam: true }]); setGuidedPaste(""); setGuidedError(""); setGuidedStage("preview");
  }

  async function persistGuidedImport() {
    if (!selectedCourse || !activePeriod || activeState === "locked") return;
    const column = (index: number) => guidedColumns[index] ?? [];
    const importedStudents: Student[] = [];
    for (let index = 0; index < column(0).length; index += 1) {
      const existing = students.find((student) => student.code === column(1)[index]);
      if (existing) { importedStudents.push(existing); continue; }
      importedStudents.push(await createStudent({ courseId: selectedCourse.id, fullName: column(0)[index], code: column(1)[index], documentId: column(2)[index], institutionalEmail: column(3)[index], personalEmail: column(4)[index] }));
    }
    const currentPeriodItems = itemsByPeriod[activePeriod.id] ?? gradeItems;
    const currentActivities = currentPeriodItems.filter((item) => !item.isExam);
    const createdItems: GradeItem[] = [];
    for (let index = 0; index < guidedGrades.filter((grade) => !grade.exam).length; index += 1) {
      const grade = guidedGrades.filter((item) => !item.exam)[index];
      const existing = currentActivities[index];
      if (existing) {
        if (index === 0 && existing.name === "Actividad 1" && existing.name !== grade.name) { await renameGradeItem(existing.id, grade.name); createdItems.push({ ...existing, name: grade.name }); }
        else createdItems.push(existing);
      } else createdItems.push(await createGradeItem(selectedCourse.id, activePeriod.id, grade.name));
    }
    const examGrade = guidedGrades.find((grade) => grade.exam);
    const examItem = examGrade ? (currentPeriodItems.find((item) => item.isExam) ?? await createGradeItem(selectedCourse.id, activePeriod.id, "Parcial", 1)) : undefined;
    for (let index = 0; index < importedStudents.length; index += 1) {
      for (let itemIndex = 0; itemIndex < createdItems.length; itemIndex += 1) { const value = guidedGrades.filter((grade) => !grade.exam)[itemIndex].values[index]; if (value !== null) await saveGrade({ studentId: importedStudents[index].id, itemId: createdItems[itemIndex].id, value, pending: 0 }); }
      if (examItem && examGrade?.values[index] !== null) await saveGrade({ studentId: importedStudents[index].id, itemId: examItem.id, value: examGrade!.values[index]!, pending: 0 });
    }
    const refreshedStudents = await listStudents(selectedCourse.id); const refreshedItems = await listGradeItems(selectedCourse.id, activePeriod.id);
    setStudents(refreshedStudents); setGradeItems(refreshedItems); setItemsByPeriod((current) => ({ ...current, [activePeriod.id]: refreshedItems })); setGrades(await listGrades(selectedCourse.id)); setGuidedModal(false); setGuidedStage("students");
  }

  function openRenameActivity(item: GradeItem) {
    if (activeState === "locked") return;
    setRenameItem(item); setRenameName(item.name); setRenameModal(true);
  }

  async function handleRenameActivity() {
    if (!renameItem || !renameName.trim() || activeState === "locked") return;
    try {
      await renameGradeItem(renameItem.id, renameName.trim());
      const update = (items: GradeItem[]) => items.map((item) => item.id === renameItem.id ? { ...item, name: renameName.trim() } : item);
      setGradeItems(update); setItemsByPeriod((current) => ({ ...current, [activePeriod!.id]: update(current[activePeriod!.id] ?? []) }));
      setRenameModal(false); setRenameItem(null);
    } catch { setError("No se puede renombrar una actividad en un corte cerrado."); }
  }

  async function handleCreateActivity() {
    if (!selectedCourse || !activePeriod || !activityName.trim() || activeState === "locked") return;
    try {
      const item = await createGradeItem(selectedCourse.id, activePeriod.id, activityName.trim());
      const nextItems = [...(itemsByPeriod[activePeriod.id] ?? gradeItems), item];
      setItemsByPeriod((current) => ({ ...current, [activePeriod.id]: nextItems }));
      setGradeItems(nextItems);
      setActivityName("");
      setActivityModal(false);
    } catch {
      setError("No se pudo agregar la actividad en este corte.");
    }
  }

  function openStudentDetail(studentItem: Student) {
    setSelectedStudent(studentItem); setStudentDetailModal(true);
  }

  function openGradeWalkthrough(item: GradeItem, studentIndex = 0) {
    const itemPeriod = periods.find((period) => period.id === item.periodId);
    if (!students.length || itemPeriod?.closed) return;
    setGradeItem(item);
    setGradeIndex(studentIndex);
    const existing = gradeFor(students[studentIndex].id, item.id);
    setGradeValue(existing && !existing.pending ? String(existing.value).replace(".", ",") : "");
    setGradeError("");
    setGradeModal(true);
  }

  async function commitGrade(direction: 1 | -1) {
    if (!gradeItem || !students.length) return;
    const gradePeriod = periods.find((period) => period.id === gradeItem.periodId);
    if (gradePeriod?.closed) { setGradeError("No se puede editar un corte cerrado."); return; }
    const parsed = parseGrade(gradeValue);
    if ("error" in parsed && parsed.error) { setGradeError(parsed.error); return; }
    const current = students[gradeIndex];
    const nextGrade: Grade = { studentId: current.id, itemId: gradeItem.id, value: "empty" in parsed ? 0 : parsed.value, pending: "empty" in parsed ? 1 : 0 };
    try {
      await saveGrade(nextGrade);
    } catch {
      setGradeError("No se puede editar un corte cerrado.");
      return;
    }
    setGrades((currentGrades) => [...currentGrades.filter((grade) => !(grade.studentId === nextGrade.studentId && grade.itemId === nextGrade.itemId)), nextGrade]);
    const nextIndex = gradeIndex + direction;
    if (nextIndex < 0 || nextIndex >= students.length) { setGradeModal(false); return; }
    setGradeIndex(nextIndex);
    const existing = gradeFor(students[nextIndex].id, gradeItem.id);
    setGradeValue(existing && !existing.pending ? String(existing.value).replace(".", ",") : "");
    setGradeError("");
  }

  function updateStudent(key: keyof StudentDraft, value: string) {
    setStudent((current) => ({ ...current, [key]: value }));
  }

  async function handleCreateStudent() {
    if (!selectedCourse) return;
    const validation = validateStudent(student, students);
    setStudentErrors(validation);
    if (hasErrors(validation)) return;
    try {
      const created = await createStudent({ ...student, courseId: selectedCourse.id });
      setStudents((current) => [...current, created]);
      setCourses((current) => current.map((course) => course.id === selectedCourse.id ? { ...course, students: course.students + 1 } : course));
      setStudent(emptyStudent);
      setStudentErrors({});
      setStudentModal(false);
    } catch {
      setError("No se pudo agregar. Código, documento y correos deben ser únicos en el curso.");
    }
  }

  async function handleImport() {
    if (!selectedCourse || !importPreview) return;
    let imported = 0;
    for (const row of importPreview.valid) {
      try { await createStudent({ ...row, courseId: selectedCourse.id }); imported += 1; } catch { /* database constraints protect against races */ }
    }
    setStudents(await listStudents(selectedCourse.id));
    setCourses((current) => current.map((course) => course.id === selectedCourse.id ? { ...course, students: course.students + imported } : course));
    setImportPreview(null);
    setImportModal(false);
  }

  const field = (key: keyof StudentDraft, label: string, type = "text") => (
    <TextInput label={label} value={student[key]} type={type} required error={studentErrors[key]} onChange={(event) => updateStudent(key, event.currentTarget.value)} />
  );

  function handleStudentFile(file: File | null) {
    if (!file || !selectedCourse) return;
    file.text().then((text) => {
      const rows = parseStudentFile(text);
      setImportPreview(classifyStudentRows(rows, students));
    });
  }

  function handleGradeFile(file: File | null) {
    if (!file) return;
    file.text().then((text) => setGradeImportData(parseGradeFile(text)));
  }

  function downloadGradeTemplate(format: "csv" | "xls") {
    if (!activePeriod || !students.length) return;
    const labels: Record<string, string> = { code: "Código", name: "Nombre", email: "Correo institucional", document: "Documento", personalEmail: "Correo personal" };
    const headers = templateColumns.map((key) => labels[key] ?? gradeItems.find((item) => item.id === key)?.name ?? key);
    const lines = [headers, ...students.map((studentItem) => templateColumns.map((key) => key === "code" ? studentItem.code : key === "name" ? studentItem.fullName : key === "email" ? studentItem.institutionalEmail : key === "document" ? studentItem.documentId : key === "personalEmail" ? studentItem.personalEmail : ""))];
    const csv = lines.map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(";")).join("\n");
    const html = `<html><head><meta charset="utf-8"></head><body><table>${lines.map((line) => `<tr>${line.map((value) => `<td>${value.replace(/"/g, "")}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    const link = document.createElement("a");
    link.download = `plantilla-notas-corte-${activePeriod.number}.${format}`;
    link.href = URL.createObjectURL(new Blob([format === "csv" ? csv : html], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.ms-excel" }));
    link.click();
    URL.revokeObjectURL(link.href);
    setTemplateModal(false);
  }

  async function importGrades() {
    if (!gradeImportData || !activePeriod || activeState === "locked") return;
    const activityCount = gradeImportLastIsExam ? Math.max(0, gradeImportData.gradeHeaders.length - 1) : gradeImportData.gradeHeaders.length;
    const importedItems: GradeItem[] = [];
    for (let index = 0; index < activityCount; index += 1) {
      const existing = gradeItems.filter((item) => !item.isExam)[index];
      importedItems.push(existing ?? await createGradeItem(selectedCourse!.id, activePeriod.id, gradeImportData.gradeHeaders[index] || `Actividad ${index + 1}`));
    }
    const exam = gradeImportLastIsExam ? (gradeItems.find((item) => item.isExam) ?? await createGradeItem(selectedCourse!.id, activePeriod.id, gradeImportData.gradeHeaders[gradeImportData.gradeHeaders.length - 1] || "Parcial")) : undefined;
    for (const row of gradeImportData.rows) {
      const studentItem = students.find((student) => student.code === row.code);
      if (!studentItem || row.invalid.length) continue;
      for (let index = 0; index < importedItems.length; index += 1) {
        const value = row.values[index];
        if (value !== null) await saveGrade({ studentId: studentItem.id, itemId: importedItems[index].id, value, pending: 0 });
      }
      if (exam && row.values[row.values.length - 1] !== null) await saveGrade({ studentId: studentItem.id, itemId: exam.id, value: row.values[row.values.length - 1]!, pending: 0 });
    }
    const nextItems = [...importedItems, ...(exam ? [exam] : [])];
    setGradeItems(nextItems);
    setItemsByPeriod((current) => ({ ...current, [activePeriod.id]: nextItems }));
    setGrades(await listGrades(selectedCourse!.id));
    setGradeImportData(null);
    setGradeImportModal(false);
  }

  return (
    <AppShell header={{ height: 48 }} padding="md">
      <AppShell.Header className="app-header">
        <Container size="xl" fluid className="header-inner">
          <Group gap="xs">
            <img className="brand-logo" src="/branding/notazod-logo.png" alt="" aria-hidden="true" onError={(event) => { event.currentTarget.style.display = "none"; }} />
            <Text fw={700} c="brand.5">NOTAZOD</Text>
          </Group>
          <Group gap="xs">
            <Button variant="subtle" size="xs" onClick={() => void openUrl("https://github.com/CT-Zodiako/NOTAZOD")} aria-label="Abrir repositorio de NOTAZOD en GitHub">GitHub</Button>
            <Button variant="subtle" size="xs" onClick={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")} aria-label="Cambiar tema">{colorScheme === "dark" ? "Tema claro" : "Tema oscuro"}</Button>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl" fluid>
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <div><Title order={1}>{selectedCourse ? selectedCourse.name : "Tus cursos"}</Title></div>
              <Group>
                {selectedCourse ? <><Button variant="default" onClick={() => setSelectedCourse(null)}>Volver a cursos</Button><Button variant="subtle" color="red" onClick={() => setDeleteCourseModal(true)}>Eliminar curso</Button></> : null}
                {!selectedCourse ? <Button onClick={() => setCourseModal(true)}>Crear curso</Button> : null}
              </Group>
            </Group>
            {error ? <Text c="red" role="alert">{error}</Text> : null}
            {loading ? <Text c="dimmed">Cargando tus cursos…</Text> : null}
            {!selectedCourse ? (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {courses.map((course) => <Card key={course.id} withBorder radius="md" padding="lg" className="course-card"><Stack gap="sm"><Group justify="space-between" align="flex-start"><Title order={2} size="h3">{course.name}</Title><Badge variant="light">{course.semester}</Badge></Group><Text c="dimmed" size="sm">{course.students} {course.students === 1 ? "estudiante" : "estudiantes"}</Text><Button variant="light" fullWidth onClick={() => openCourse(course)}>Ver estudiantes</Button></Stack></Card>)}
              </SimpleGrid>
            ) : (
              <Stack gap="md">
                <Group align="flex-end" grow><TextInput label="Buscar estudiante" placeholder="Nombre, código o correo" value={studentSearch} onChange={(event) => setStudentSearch(event.currentTarget.value)} /><Select label="Filtrar" value={gradeFilter} data={[{ value: "all", label: "Todos" }, { value: "pending", label: "Pendientes" }, { value: "below", label: "Debajo de 3,0" }]} onChange={(value) => setGradeFilter(value ?? "all")} /></Group><Group justify="space-between" align="flex-end"><div /><Group><Button variant="default" disabled={activeState !== "active"} onClick={() => setActivityModal(true)}>Agregar actividad</Button><Button color="teal" variant="light" onClick={openGuidedImport} disabled={activeState === "locked"}>Importar notas</Button><Button onClick={() => setStudentModal(true)}>Agregar estudiante</Button><Button variant="default" onClick={() => setImportModal(true)}>Importar estudiantes</Button></Group></Group>
                <Group align="flex-end" wrap="wrap"><Select label="Corte" value={activePeriod?.id ?? null} data={periods.map((period) => ({ value: period.id, label: `Corte ${period.number} · ${periodState(period) === "locked" ? "Cerrado" : "Abierto"}` }))} onChange={(value) => { const index = periods.findIndex((period) => period.id === value); if (index >= 0) void selectPeriod(index); }} /><Button color="blue" variant="light" onClick={openSplitEditor} disabled={activeState === "locked"}>Actividades {activePeriod?.activityPercent ?? 40}% · Parcial {activePeriod?.examPercent ?? 60}%</Button><Button color="violet" variant="light" onClick={() => setExportModal(true)} disabled={!students.length}>Exportar imagen</Button><Button color="blue" variant="light" onClick={() => { setTemplateColumns(["code", "name", "email", ...gradeItems.map((item) => item.id)]); setTemplateModal(true); }} disabled={!students.length}>Descargar plantilla</Button><Button variant={activeState === "locked" ? "light" : "default"} color={activeState === "locked" ? "green" : "orange"} onClick={() => void togglePeriodClosed()}>{activeState === "locked" ? "Reabrir corte" : "Cerrar corte"}</Button><Menu shadow="md" width={220}><Menu.Target><Button color="pink" variant="filled" disabled={activeState !== "active"}>Calificar</Button></Menu.Target><Menu.Dropdown>{gradeItems.map((item) => <Menu.Item key={item.id} onClick={() => openGradeWalkthrough(item)}>Calificar {item.name}</Menu.Item>)}</Menu.Dropdown></Menu></Group>
                {filteredStudents.length ? <Table.ScrollContainer minWidth={760}><Table className="grade-table" striped highlightOnHover withTableBorder><Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>Nombre completo</Table.Th><Table.Th>Código</Table.Th><Table.Th>Correo institucional</Table.Th>{gradeItems.map((item) => <Table.Th key={item.id} className="editable-header" onClick={() => openRenameActivity(item)} title="Editar nombre">{item.name}</Table.Th>)}<Table.Th>Nota del corte</Table.Th><Table.Th>Acumulada</Table.Th>{activePeriod?.number === 3 ? <Table.Th>Nota final</Table.Th> : null}<Table.Th>Estado</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{filteredStudents.map((item, studentIndex) => <Table.Tr key={item.id}><Table.Td>{studentIndex + 1}</Table.Td><Table.Td className="student-name-cell" onClick={() => openStudentDetail(item)} title="Ver información y notas">{item.fullName}</Table.Td><Table.Td>{item.code}</Table.Td><Table.Td>{item.institutionalEmail}</Table.Td>{gradeItems.map((gradeItem) => { const grade = gradeFor(item.id, gradeItem.id); return <Table.Td key={gradeItem.id} className="grade-cell" onClick={() => openGradeWalkthrough(gradeItem, students.indexOf(item))} title={activeState === "active" ? "Editar nota" : "Corte cerrado"}>{grade ? <Badge color={grade.pending ? "yellow" : grade.value < 3 ? "red" : "green"} variant="light">{grade.pending ? "Pendiente 0,0" : grade.value.toFixed(1).replace(".", ",")}</Badge> : <Text c="dimmed">—</Text>}</Table.Td>; })}{(() => { const calculation = periodCalculation(item.id); return <><Table.Td><Badge color={activeState === "locked" ? (calculation.periodGrade < 3 ? "red" : "green") : "gray"} variant="light">{`${calculation.periodGrade.toFixed(1).replace(".", ",")}${activeState === "active" ? " · editable" : ""}`}</Badge></Table.Td></>; })()}{(() => { const summary = courseCalculation(item.id); return <><Table.Td>{summary.accumulated === null ? <Text c="dimmed">—</Text> : summary.accumulated.toFixed(1).replace(".", ",")}</Table.Td>{activePeriod?.number === 3 ? <Table.Td>{summary.final === null ? <Text c="dimmed">En curso</Text> : <Badge color={summary.final < 3 ? "red" : "green"}>{summary.final.toFixed(1).replace(".", ",")}</Badge>}</Table.Td> : null}</>; })()}<Table.Td>{gradeItems.some((gradeItem) => gradeFor(item.id, gradeItem.id)?.pending) ? <Badge color="yellow">Pendiente</Badge> : <Text c="dimmed">Sin pendientes</Text>}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer> : <Card withBorder><Text c="dimmed">Este curso todavía no tiene estudiantes.</Text></Card>}
              </Stack>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
      <footer className="app-footer">
        <Text size="xs" c="dimmed">NOTAZOD V1 · Gestión académica offline</Text>
        <Button variant="subtle" size="compact-xs" onClick={() => void openUrl("https://github.com/CT-Zodiako/NOTAZOD")} aria-label="Abrir NOTAZOD en GitHub">Ver proyecto en GitHub</Button>
      </footer>

      <Modal opened={studentDetailModal} onClose={() => setStudentDetailModal(false)} title={selectedStudent?.fullName ?? "Estudiante"} centered size="lg"><Stack>{selectedStudent ? <><Text size="sm">Código: <b>{selectedStudent.code}</b></Text><Text size="sm">Documento: <b>{selectedStudent.documentId}</b></Text><Text size="sm">Correo institucional: <b>{selectedStudent.institutionalEmail}</b></Text><Text size="sm">Correo personal: <b>{selectedStudent.personalEmail}</b></Text>{periods.map((period) => <Card key={period.id} withBorder><Stack gap="xs"><Group justify="space-between"><Text fw={700}>Corte {period.number}</Text><Badge color={period.closed ? "gray" : "green"}>{period.closed ? "Cerrado" : "Abierto"}</Badge></Group>{(itemsByPeriod[period.id] ?? []).map((item) => { const grade = gradeFor(selectedStudent.id, item.id); return <Group key={item.id} justify="space-between"><Text size="sm">{item.name}</Text><Button size="xs" variant="light" disabled={Boolean(period.closed)} onClick={() => { setStudentDetailModal(false); openGradeWalkthrough(item, students.findIndex((studentItem) => studentItem.id === selectedStudent.id)); }}>{grade ? (grade.pending ? "Pendiente 0,0" : grade.value.toFixed(1).replace(".", ",")) : "Sin nota"}</Button></Group>; })}</Stack></Card>)}</> : null}</Stack></Modal>
      <Modal opened={deleteCourseModal} onClose={() => { setDeleteCourseModal(false); setDeleteConfirmation(""); }} title="Eliminar curso" centered><Stack><Text c="red">Esta acción elimina permanentemente estudiantes, actividades y notas.</Text><Text size="sm">Escribí exactamente <b>{selectedCourse?.name}</b> para confirmar.</Text><TextInput label="Confirmación" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.currentTarget.value)} autoFocus /><Group justify="flex-end"><Button variant="default" onClick={() => setDeleteCourseModal(false)}>Cancelar</Button><Button color="red" onClick={() => void handleDeleteCourse()} disabled={deleteConfirmation.trim() !== selectedCourse?.name}>Eliminar definitivamente</Button></Group></Stack></Modal>
      <Modal opened={courseModal} onClose={() => setCourseModal(false)} title="Crear curso" centered><Stack><TextInput label="Nombre del curso" placeholder="Ej. Cálculo I" value={name} onChange={(event) => setName(event.currentTarget.value)} required /><TextInput label="Semestre" value={semester} onChange={(event) => setSemester(event.currentTarget.value)} required /><Text size="sm" c="dimmed">Se crearán tres cortes abiertos. Podés cerrar o reabrir cada corte manualmente cuando quieras.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setCourseModal(false)}>Cancelar</Button><Button onClick={handleCreateCourse} disabled={!name.trim()}>Crear curso</Button></Group></Stack></Modal>
      <Modal opened={studentModal} onClose={() => setStudentModal(false)} title="Agregar estudiante" centered><Stack>{field("fullName", "Nombre completo")}{field("code", "Código")}{field("documentId", "Documento")}{field("institutionalEmail", "Correo institucional", "email")}{field("personalEmail", "Correo personal", "email")}<Group justify="flex-end"><Button variant="default" onClick={() => setStudentModal(false)}>Cancelar</Button><Button onClick={handleCreateStudent} disabled={Object.values(student).some((value) => !value.trim())}>Agregar</Button></Group></Stack></Modal>
      <Modal opened={importModal} onClose={() => setImportModal(false)} title="Importar estudiantes" centered><Stack><Text size="sm" c="dimmed">Acepta CSV y archivos .xls exportados como tabla HTML. Se importan Nombre, Documento, Código, Correo 1 y Correo 2; se ignoran Plan de estudios y Estado financiero.</Text><FileButton onChange={handleStudentFile} accept=".csv,.xls,text/csv,application/vnd.ms-excel">{(props) => <Button variant="default" {...props}>Elegir archivo</Button>}</FileButton>{importPreview ? <Stack gap="xs"><Text size="sm"><b>{importPreview.valid.length}</b> listas para importar · <b>{importPreview.duplicate.length}</b> duplicadas · <b>{importPreview.incomplete.length}</b> incompletas · <b>{importPreview.invalid.length}</b> inválidas</Text>{importPreview.incomplete.slice(0, 3).map((item, index) => <Text key={`incomplete-${index}`} size="xs" c="orange">Fila incompleta: {item.reason}</Text>)}{importPreview.invalid.slice(0, 3).map((item, index) => <Text key={`invalid-${index}`} size="xs" c="red">Fila inválida: {item.reason}</Text>)}{importPreview.duplicate.slice(0, 3).map((item, index) => <Text key={`duplicate-${index}`} size="xs" c="dimmed">Fila duplicada: {item.reason}</Text>)}</Stack> : null}<Group justify="flex-end"><Button variant="default" onClick={() => setImportModal(false)}>Cancelar</Button><Button onClick={handleImport} disabled={!importPreview?.valid.length}>Importar</Button></Group></Stack></Modal>
      <Modal opened={templateModal} onClose={() => setTemplateModal(false)} title="Qué querés exportar" centered><Stack><Text size="sm" c="dimmed">Elegí las columnas de la plantilla y después el formato.</Text>{[{ key: "code", label: "Código" }, { key: "name", label: "Nombre" }, { key: "email", label: "Correo institucional" }, { key: "document", label: "Documento" }, { key: "personalEmail", label: "Correo personal" }, ...gradeItems.map((item) => ({ key: item.id, label: item.name }))].map((column) => <Checkbox key={column.key} label={column.label} checked={templateColumns.includes(column.key)} onChange={(event) => setTemplateColumns((current) => event.currentTarget.checked ? [...current, column.key] : current.filter((key) => key !== column.key))} />)}<Text size="sm" c="dimmed">Formato</Text><Group><Button disabled={!templateColumns.length} onClick={() => downloadGradeTemplate("csv")}>CSV</Button><Button variant="light" disabled={!templateColumns.length} onClick={() => downloadGradeTemplate("xls")}>Excel (.xls)</Button></Group></Stack></Modal>
      <Modal opened={exportModal} onClose={() => setExportModal(false)} title={`Elegir columnas · Corte ${activePeriod?.number ?? ""}`} centered><Stack><Text size="sm" c="dimmed">Elegí qué información querés incluir en la imagen.</Text>{[{ key: "code", label: "Código" }, { key: "name", label: "Nombre" }, ...gradeItems.map((item) => ({ key: item.id, label: item.name })), { key: "periodGrade", label: "Nota del corte" }, { key: "accumulated", label: "Acumulada" }, { key: "final", label: "Nota final" }].map((column) => <Checkbox key={column.key} label={column.label} checked={exportColumns.includes(column.key)} onChange={(event) => setExportColumns((current) => event.currentTarget.checked ? [...current, column.key] : current.filter((key) => key !== column.key))} />)}<Group justify="flex-end"><Button variant="default" onClick={() => setExportModal(false)}>Cancelar</Button><Button disabled={!exportColumns.length} onClick={() => { setExportModal(false); exportPeriodImage(); }}>Descargar imagen</Button></Group></Stack></Modal>
      <Modal opened={guidedModal} onClose={() => setGuidedModal(false)} title="Carga guiada desde Excel" centered size="lg"><Stack><Text size="sm" c="dimmed">Copiá una columna completa en Excel y pegala acá. La cantidad de filas se detecta automáticamente.</Text>{guidedStage === "students" ? <><Title order={4}>{guidedFields[guidedFieldIndex]}</Title><Textarea minRows={8} value={guidedPaste} onChange={(event) => setGuidedPaste(event.currentTarget.value)} placeholder="Ctrl+V acá" autoFocus /><Button onClick={acceptGuidedStudentColumn}>{guidedFieldIndex === guidedFields.length - 1 ? "Continuar con actividades" : "Siguiente columna"}</Button></> : null}{guidedStage === "activity" ? <><Title order={4}>Actividad {guidedGrades.filter((item) => !item.exam).length + 1}</Title>{guidedGrades.filter((item) => !item.exam).map((item, index) => <Group key={`${item.name}-${index}`} justify="space-between"><Text size="sm">{item.name} · {item.values.length} notas cargadas</Text><Button size="xs" color="red" variant="subtle" onClick={() => removeGuidedActivity(index)}>Quitar</Button></Group>)}<TextInput label="Nombre de la actividad" value={guidedActivityName} onChange={(event) => setGuidedActivityName(event.currentTarget.value)} /><Textarea minRows={8} label="Notas, una por línea" value={guidedPaste} onChange={(event) => setGuidedPaste(event.currentTarget.value)} placeholder="Ctrl+V acá" /><Group><Button onClick={() => acceptGuidedActivity(false)}>Agregar otra actividad</Button><Button onClick={goToGuidedExam}>Agregar parcial</Button><Button variant="filled" onClick={saveGuidedWithoutExam}>Guardar carga</Button></Group></> : null}{guidedStage === "exam" ? <><Title order={4}>Agregar parcial</Title><Text size="sm" c="dimmed">El parcial se carga como una única nota. El cálculo interno lo hacés por fuera.</Text><Textarea minRows={8} label="Notas del parcial, una por línea" value={guidedPaste} onChange={(event) => setGuidedPaste(event.currentTarget.value)} placeholder="Ctrl+V acá" /><Group><Button variant="default" onClick={() => { setGuidedStage("activity"); setGuidedPaste(""); }}>Volver a actividades</Button><Button variant="default" onClick={skipGuidedExam}>Omitir parcial</Button><Button onClick={acceptGuidedExam}>Agregar parcial</Button></Group></> : null}{guidedStage === "preview" ? <><Title order={4}>Revisar carga</Title><Text>{guidedColumns[0]?.length ?? 0} estudiantes · {guidedGrades.length} columnas de notas</Text><Text size="sm">{guidedGrades.map((item) => item.name).join(" · ")}</Text><Group><Button variant="default" onClick={() => setGuidedStage(guidedGrades.some((item) => item.exam) ? "exam" : "activity")}>Volver</Button><Button onClick={() => void persistGuidedImport()}>Guardar carga</Button></Group></> : null}{guidedError ? <Text c="red">{guidedError}</Text> : null}</Stack></Modal>
      <Modal opened={gradeImportModal} onClose={() => { setGradeImportModal(false); setGradeImportData(null); }} title={`Importar notas · Corte ${activePeriod?.number ?? ""}`} centered><Stack><Text size="sm" c="dimmed">Subí la plantilla o un Excel con una columna Código y luego las columnas de notas. Primero se analiza; nada se guarda hasta confirmar.</Text><FileButton onChange={handleGradeFile} accept=".csv,.xls,text/csv,application/vnd.ms-excel">{(props) => <Button variant="default" {...props}>Elegir archivo</Button>}</FileButton>{gradeImportData ? <Stack gap="xs"><Text size="sm">{gradeImportData.rows.length} filas · {gradeImportData.gradeHeaders.length} columnas de notas</Text><Text size="sm">Última columna: <b>{gradeImportData.gradeHeaders[gradeImportData.gradeHeaders.length - 1]}</b></Text><Group><Button size="xs" variant={gradeImportLastIsExam ? "filled" : "light"} onClick={() => setGradeImportLastIsExam(true)}>Es Parcial</Button><Button size="xs" variant={!gradeImportLastIsExam ? "filled" : "light"} onClick={() => setGradeImportLastIsExam(false)}>Es actividad</Button></Group><Text size="xs" c="dimmed">{gradeImportData.rows.filter((row) => !students.some((student) => student.code === row.code)).length} códigos no encontrados · {gradeImportData.rows.filter((row) => row.invalid.length).length} filas inválidas</Text><Group justify="flex-end"><Button variant="default" onClick={() => setGradeImportData(null)}>Cambiar archivo</Button><Button onClick={() => void importGrades()} disabled={gradeImportData.rows.length === 0}>Importar y guardar</Button></Group></Stack> : null}</Stack></Modal>
      <Modal opened={renameModal} onClose={() => setRenameModal(false)} title="Editar nombre de actividad" centered><Stack><TextInput label="Nombre" value={renameName} onChange={(event) => setRenameName(event.currentTarget.value)} autoFocus /><Group justify="flex-end"><Button variant="default" onClick={() => setRenameModal(false)}>Cancelar</Button><Button onClick={() => void handleRenameActivity()} disabled={!renameName.trim()}>Guardar</Button></Group></Stack></Modal>
      <Modal opened={activityModal} onClose={() => setActivityModal(false)} title={`Agregar actividad · Corte ${activePeriod?.number ?? ""}`} centered><Stack><TextInput label="Nombre de la actividad" placeholder="Ej. Taller 2" value={activityName} onChange={(event) => setActivityName(event.currentTarget.value)} autoFocus required /><Group justify="flex-end"><Button variant="default" onClick={() => setActivityModal(false)}>Cancelar</Button><Button onClick={() => void handleCreateActivity()} disabled={!activityName.trim()}>Agregar</Button></Group></Stack></Modal>
      <Modal opened={splitModal} onClose={() => setSplitModal(false)} title={`Porcentajes · Corte ${activePeriod?.number ?? ""}`} centered><Stack><Text size="sm" c="dimmed">La suma debe ser exactamente 100%.</Text><NumberInput label="Actividades" suffix=" %" min={0} max={100} value={activityPercent} onChange={(value) => { const next = typeof value === "number" ? value : 0; setActivityPercent(next); setExamPercent(100 - next); }} /><NumberInput label="Parcial" suffix=" %" min={0} max={100} value={examPercent} onChange={(value) => { const next = typeof value === "number" ? value : 0; setExamPercent(next); setActivityPercent(100 - next); }} /><Text c={activityPercent + examPercent === 100 ? "green" : "red"}>Total: {activityPercent + examPercent}%</Text><Group justify="flex-end"><Button variant="default" onClick={() => setSplitModal(false)}>Cancelar</Button><Button onClick={() => void saveSplit()} disabled={activityPercent + examPercent !== 100}>Guardar</Button></Group></Stack></Modal>
      <Modal opened={gradeModal} onClose={() => setGradeModal(false)} title={gradeItem ? `Calificar · ${gradeItem.name}` : "Calificar"} centered size="560px"><Stack><Text c="dimmed">Estudiante {gradeIndex + 1} de {students.length}</Text><Title order={3}>{students[gradeIndex]?.fullName}</Title><Text size="sm" c="dimmed">Código {students[gradeIndex]?.code}</Text><TextInput label="Nota (0,0 a 5,0)" value={gradeValue} error={gradeError} autoFocus inputMode="decimal" onChange={(event) => { setGradeValue(event.currentTarget.value); setGradeError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitGrade(event.shiftKey ? -1 : 1); } }} /><Group justify="space-between"><Button variant="default" onClick={() => void commitGrade(-1)} disabled={gradeIndex === 0}>Anterior <span className="shortcut">Shift+Enter</span></Button><Button onClick={() => void commitGrade(1)}>Siguiente <span className="shortcut">Enter</span></Button></Group><Text size="xs" c="dimmed">Enter guarda y avanza · Shift+Enter guarda y vuelve · Escape cierra</Text></Stack></Modal>
    </AppShell>
  );
}

export default App;
