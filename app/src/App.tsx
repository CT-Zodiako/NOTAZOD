import { useEffect, useRef, useState, type CSSProperties } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, Update } from "@tauri-apps/plugin-updater";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ActionIcon,
  AppShell,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Loader,
  Group,
  Menu,
  Modal,
  NumberInput,
  Popover,
  Progress,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { assignStudentToGroup, copyGroupsFromPeriod, Course, COURSE_COLORS, CourseColor, setCourseColor, createCourse, createGradeItem, createGroup, createStudent, deleteCourse, deleteGrade, applyCourseSync, deleteGradeItem, deleteGroup, exportBackup, loadSyncCourses, SyncResult, Grade, GradeHistoryEntry, GradeItem, Group as StudentGroup, GroupMembership, initDatabase, listCourses, listGradeHistory, listGradeItems, listGrades, listGroupMemberships, listGroups, listPeriods, listStudents, Period, renameGradeItem, renameGroup, saveGrade, saveGroupGrade, setPeriodClosed, stageRestore, Student, undoLastGrade, updatePeriod } from "./lib/db";
import { CampusReport, CheckGroup, openCampusWindow, readCampusCourses, runCampusCheck, runCampusUpload } from "./lib/campus";
import { currentSemester, planCourseSync, SyncAction } from "./lib/campusSync";
import { hasErrors, StudentDraft, StudentValidation, validateStudent } from "./lib/validation";
import { campusStateFor, COURSE_COLOR_SWATCHES, courseColorStyle, countByFilter, hasPendingGrade, heatTint, isAtRisk, matchesFilter, STUDENT_FILTER, StudentFilter, StudentStatus } from "./lib/studentList";
import { buildWeek, dayLabel, formatTime, nextClass, nextClassLabel, weekdayName } from "./lib/schedule";

const studentFilterOptions: { key: StudentFilter; label: string; description: string }[] = [
  { key: STUDENT_FILTER.ALL, label: "Todos", description: "Todos los estudiantes del corte" },
  { key: STUDENT_FILTER.RISK, label: "En riesgo", description: "Nota del corte menor a 3,0" },
  { key: STUDENT_FILTER.PENDING, label: "Pendientes", description: "Con notas pendientes en este corte" },
  { key: STUDENT_FILTER.CAMPUS, label: "Sin subir", description: "Sin subir al Campus (último Verificar Campus)" },
];

// Outline icons (24x24, stroke = currentColor) for the global actions (course sidebar and home ⋯ menu).
const ICON_PATHS = {
  plus: "M12 5v14M5 12h14",
  sync: "M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5",
  check: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M12 6v6l4 2",
  code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  dots: "M4 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0M18 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
  chevronRight: "m9 18 6-6-6-6",
} as const;

function Icon({ name, size = 16 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return <svg className="action-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={ICON_PATHS[name]} /></svg>;
}

const campusStateLabels = { uploaded: "✓ Subida", missing: "Falta", different: "Distinta" } as const;

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
  const [deleteCourseError, setDeleteCourseError] = useState("");
  const [studentModal, setStudentModal] = useState(false);
  const [studentDetailModal, setStudentDetailModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activityModal, setActivityModal] = useState(false);
  const [renameModal, setRenameModal] = useState(false);
  const [renameItem, setRenameItem] = useState<GradeItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteActivityConfirm, setDeleteActivityConfirm] = useState(false);
  const [deleteActivityError, setDeleteActivityError] = useState("");
  const [campusModal, setCampusModal] = useState(false);
  const [campusState, setCampusState] = useState<"idle" | "checking" | "preview" | "saving" | "done" | "error">("idle");
  const [campusReport, setCampusReport] = useState<CampusReport | null>(null);
  const [campusError, setCampusError] = useState("");
  const [campusStatus, setCampusStatus] = useState("");
  const [syncModal, setSyncModal] = useState(false);
  const [checkModal, setCheckModal] = useState(false);
  const [checkState, setCheckState] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [checkGroups, setCheckGroups] = useState<CheckGroup[]>([]);
  const [checkError, setCheckError] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "reading" | "preview" | "applying" | "done" | "error">("idle");
  const [syncPlan, setSyncPlan] = useState<SyncAction[]>([]);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [syncError, setSyncError] = useState("");
  const [activityName, setActivityName] = useState("");
  const [exportModal, setExportModal] = useState(false);
  const [exportError, setExportError] = useState("");
  const [templateModal, setTemplateModal] = useState(false);
  const [templateColumns, setTemplateColumns] = useState<string[]>(["code", "name", "email"]);
  const [exportColumns, setExportColumns] = useState<string[]>(["code", "periodGrade"]);
  const [name, setName] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [semester, setSemester] = useState("2026-2");
  const [student, setStudent] = useState<StudentDraft>(emptyStudent);
  const [studentErrors, setStudentErrors] = useState<StudentValidation>({});
  const [gradeModal, setGradeModal] = useState(false);
  const [gradeItem, setGradeItem] = useState<GradeItem | null>(null);
  const [gradeIndex, setGradeIndex] = useState(0);
  const [gradeHistoryModal, setGradeHistoryModal] = useState(false);
  const [gradeHistory, setGradeHistory] = useState<GradeHistoryEntry[]>([]);
  const [gradeValue, setGradeValue] = useState("");
  const [gradeError, setGradeError] = useState("");
  const gradeInputRef = useRef<HTMLInputElement>(null);
  const [splitModal, setSplitModal] = useState(false);
  const [rouletteModal, setRouletteModal] = useState(false);
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const [rouletteWinner, setRouletteWinner] = useState<Student | null>(null);
  const [rouletteDisplayName, setRouletteDisplayName] = useState("");
  const [rouletteVoiceEnabled, setRouletteVoiceEnabled] = useState(true);
  const rouletteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rouletteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activityPercent, setActivityPercent] = useState(40);
  const [examPercent, setExamPercent] = useState(60);
  const [error, setError] = useState("");
  const [paletteCourseId, setPaletteCourseId] = useState<string | null>(null);
  const [updateModal, setUpdateModal] = useState(false);
  const [updateState, setUpdateState] = useState<"checking" | "none" | "available" | "installing" | "installed" | "error">("checking");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState("");
  const [backupMessage, setBackupMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fatalStartupError, setFatalStartupError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "groups">("list");
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [memberships, setMemberships] = useState<GroupMembership[]>([]);
  const [groupManageModal, setGroupManageModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renameGroupTarget, setRenameGroupTarget] = useState<StudentGroup | null>(null);
  const [renameGroupName, setRenameGroupName] = useState("");
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<StudentGroup | null>(null);
  const [copyGroupsSourceId, setCopyGroupsSourceId] = useState<string | null>(null);
  const [copyGroupsSourceModal, setCopyGroupsSourceModal] = useState(false);
  const [copyGroupsConfirm, setCopyGroupsConfirm] = useState(false);
  const [copyGroupsError, setCopyGroupsError] = useState("");
  const groupDropInFlightRef = useRef(false);
  const [groupGradeModal, setGroupGradeModal] = useState(false);
  const [groupGradeGroupId, setGroupGradeGroupId] = useState<string | null>(null);
  const [groupGradeItemId, setGroupGradeItemId] = useState<string | null>(null);
  const [groupGradeValue, setGroupGradeValue] = useState("");
  const [groupGradeError, setGroupGradeError] = useState("");
  const [studentFilter, setStudentFilter] = useState<StudentFilter>(STUDENT_FILTER.ALL);
  // Result of the last "Verificar Campus" run in this session; null until one finishes.
  const [campusCheckResult, setCampusCheckResult] = useState<CheckGroup[] | null>(null);
  // Clock for the home agenda ("Hoy, …", Próxima clase); ticks only while the home screen is shown.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (selectedCourse) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [selectedCourse]);

  useEffect(() => {
    initDatabase()
      .then(() => listCourses())
      .then(setCourses)
      .catch((error) => {
        const message = error && typeof error === "object" && "fatal" in error && (error as { fatal: boolean }).fatal
          ? (error as { message: string }).message
          : null;
        if (message) {
          setFatalStartupError(message);
        } else {
          setCourses([]);
        }
      })
      .finally(() => setLoading(false));
    void checkForUpdates(false);
  }, []);

  useEffect(() => () => stopRoulette(), []);

  async function handleExportBackup() {
    setBackupMessage(null);
    try {
      const destination = await save({
        defaultPath: `notazod-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.db`,
        filters: [{ name: "Base de datos SQLite", extensions: ["db"] }],
      });
      if (!destination) return;
      await exportBackup(destination);
      setBackupMessage({ type: "success", text: "Copia de seguridad exportada correctamente." });
    } catch {
      setBackupMessage({ type: "error", text: "No se pudo exportar la copia de seguridad." });
    }
  }

  async function handleRestoreBackup() {
    setRestoreMessage(null);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Base de datos SQLite", extensions: ["db"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      await stageRestore(selected);
      setRestoreMessage({ type: "success", text: "Restauración pendiente. Cerrá y volvé a abrir NOTAZOD para aplicarla." });
    } catch {
      setRestoreMessage({ type: "error", text: "No se pudo preparar la restauración. Verificá que el archivo sea una base de datos SQLite válida." });
    }
  }

  async function handleDeleteCourse() {
    if (!selectedCourse || deleteConfirmation.trim() !== selectedCourse.name) return;
    setDeleteCourseError("");
    try {
      await deleteCourse(selectedCourse.id);
      setCourses((current) => current.filter((course) => course.id !== selectedCourse.id));
      setSelectedCourse(null);
      setDeleteConfirmation("");
      setDeleteCourseModal(false);
    } catch (error) {
      setDeleteCourseError(`No se pudo eliminar el curso. No se borró ningún dato. Detalle: ${error instanceof Error ? error.message : String(error)}`);
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

  // The new color is shown only after it is saved, so a failed save keeps the old one.
  async function handleCourseColor(course: Course, color: CourseColor) {
    setPaletteCourseId(null);
    if (color === course.color) return;
    try {
      await setCourseColor(course.id, color);
      setCourses((current) => current.map((item) => item.id === course.id ? { ...item, color } : item));
      setSelectedCourse((current) => current?.id === course.id ? { ...current, color } : current);
    } catch {
      setError("No se pudo guardar el color del curso.");
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
    await refreshGroupData(coursePeriods[initialIndex].id);
  }

  async function refreshGroupData(periodId: string) {
    const [periodGroups, periodMemberships] = await Promise.all([listGroups(periodId), listGroupMemberships(periodId)]);
    setGroups(periodGroups);
    setMemberships(periodMemberships);
  }

  function groupForStudent(studentId: string): StudentGroup | null {
    const membership = memberships.find((item) => item.studentId === studentId);
    if (!membership) return null;
    return groups.find((group) => group.id === membership.groupId) ?? null;
  }

  async function selectPeriod(index: number) {
    if (!selectedCourse || !periods[index]) return;
    setPeriodIndex(index);
    setActivityPercent(periods[index].activityPercent);
    setExamPercent(periods[index].examPercent);
    setGradeItems(await listGradeItems(selectedCourse.id, periods[index].id));
    const periodGroups = await listGroups(periods[index].id);
    const periodMemberships = await listGroupMemberships(periods[index].id);
    setGroups(periodGroups);
    setMemberships(periodMemberships);
  }

  function stopRoulette() {
    if (rouletteIntervalRef.current !== null) {
      clearInterval(rouletteIntervalRef.current);
      rouletteIntervalRef.current = null;
    }
    if (rouletteTimeoutRef.current !== null) {
      clearTimeout(rouletteTimeoutRef.current);
      rouletteTimeoutRef.current = null;
    }
  }

  function openRoulette() {
    if (!students.length) return;
    setRouletteWinner(null);
    setRouletteDisplayName("");
    setRouletteModal(true);
  }

  function closeRoulette() {
    stopRoulette();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setRouletteSpinning(false);
    setRouletteModal(false);
  }

  function speakRouletteWinner(name: string) {
    if (!rouletteVoiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`Jugador ${name}, eliminado.`);
    utterance.lang = "es-CO";
    utterance.rate = 0.8;
    window.speechSynthesis.speak(utterance);
  }

  function spinRoulette() {
    if (!students.length || rouletteSpinning) return;
    stopRoulette();
    setRouletteWinner(null);
    setRouletteSpinning(true);
    rouletteIntervalRef.current = setInterval(() => {
      const randomStudent = students[Math.floor(Math.random() * students.length)];
      setRouletteDisplayName(randomStudent.fullName);
    }, 80);
    rouletteTimeoutRef.current = setTimeout(() => {
      stopRoulette();
      const winner = students[Math.floor(Math.random() * students.length)];
      setRouletteDisplayName(winner.fullName);
      setRouletteWinner(winner);
      setRouletteSpinning(false);
      speakRouletteWinner(winner.fullName);
    }, 1500);
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

  function nextDefaultGroupName() {
    const numbers = groups.map((group) => {
      const match = /^Grupo (\d+)$/.exec(group.name);
      return match ? Number(match[1]) : 0;
    });
    const highest = numbers.length ? Math.max(...numbers) : 0;
    return `Grupo ${highest + 1}`;
  }

  async function handleCreateGroup() {
    if (!activePeriod || activeState === "locked") return;
    const name = newGroupName.trim() || nextDefaultGroupName();
    try {
      await createGroup(activePeriod.id, name);
      setNewGroupName("");
      await refreshGroupData(activePeriod.id);
    } catch {
      setError("No se pudo crear el grupo. Verificá que el nombre no esté repetido en este corte.");
    }
  }

  function openRenameGroup(group: StudentGroup) {
    setRenameGroupTarget(group);
    setRenameGroupName(group.name);
  }

  async function handleRenameGroup() {
    if (!renameGroupTarget || !renameGroupName.trim() || activeState === "locked" || !activePeriod) return;
    try {
      await renameGroup(renameGroupTarget.id, renameGroupName.trim());
      setRenameGroupTarget(null);
      setRenameGroupName("");
      await refreshGroupData(activePeriod.id);
    } catch {
      setError("No se pudo renombrar el grupo.");
    }
  }

  function openDeleteGroupConfirm(group: StudentGroup) {
    if (activeState === "locked") return;
    setDeleteGroupTarget(group);
  }

  function openCopyGroupsModal() {
    setCopyGroupsSourceId(null);
    setCopyGroupsError("");
    setCopyGroupsSourceModal(true);
  }

  function closeCopyGroupsModal() {
    setCopyGroupsSourceModal(false);
    setCopyGroupsSourceId(null);
    setCopyGroupsError("");
  }

  function requestCopyGroups() {
    if (!activePeriod || !copyGroupsSourceId || activeState === "locked") return;
    setCopyGroupsError("");
    if (groups.length) {
      setCopyGroupsSourceModal(false);
      setCopyGroupsConfirm(true);
      return;
    }
    setCopyGroupsSourceModal(false);
    void handleCopyGroups();
  }

  async function handleCopyGroups() {
    if (!activePeriod || !copyGroupsSourceId) return;
    setCopyGroupsConfirm(false);
    try {
      await copyGroupsFromPeriod(copyGroupsSourceId, activePeriod.id);
      setCopyGroupsSourceId(null);
      setCopyGroupsError("");
      await refreshGroupData(activePeriod.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setCopyGroupsError(message ? `No se pudieron copiar los grupos: ${message}` : "No se pudieron copiar los grupos.");
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!activePeriod || activeState === "locked") return;
    try {
      await deleteGroup(groupId);
      setGroups((current) => current.filter((group) => group.id !== groupId));
      setMemberships((current) => current.filter((membership) => membership.groupId !== groupId));
      await refreshGroupData(activePeriod.id);
    } catch {
      setError("No se pudo eliminar el grupo.");
    }
  }

  function openGroupGradeModal(groupId?: string) {
    setGroupGradeGroupId(groupId ?? null);
    setGroupGradeItemId(null);
    setGroupGradeValue("");
    setGroupGradeError("");
    setGroupGradeModal(true);
  }

  async function handleSaveGroupGrade() {
    if (!activePeriod || activeState === "locked") { setGroupGradeError("No se puede calificar un corte cerrado."); return; }
    if (!groupGradeGroupId) { setGroupGradeError("Elegí un grupo."); return; }
    if (!groupGradeItemId) { setGroupGradeError("Elegí una actividad."); return; }
    const members = memberships.filter((membership) => membership.groupId === groupGradeGroupId);
    if (!members.length) { setGroupGradeError("El grupo no tiene estudiantes."); return; }
    const parsed = parseGrade(groupGradeValue);
    if ("error" in parsed && parsed.error) { setGroupGradeError(parsed.error); return; }
    const value = "empty" in parsed ? 0 : parsed.value;
    const pending = "empty" in parsed ? 1 : 0;
    try {
      const updatedGrades = await saveGroupGrade(groupGradeGroupId, groupGradeItemId, value, pending);
      setGrades((current) => {
        const filtered = current.filter((grade) => !updatedGrades.some((updated) => updated.studentId === grade.studentId && updated.itemId === grade.itemId));
        return [...filtered, ...updatedGrades];
      });
      setGroupGradeModal(false);
      setGroupGradeGroupId(null);
      setGroupGradeItemId(null);
      setGroupGradeValue("");
      setGroupGradeError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Period is closed") {
        setGroupGradeError("No se puede calificar: el corte está cerrado.");
      } else if (message) {
        setGroupGradeError(`No se pudo calificar al grupo: ${message}`);
      } else {
        setGroupGradeError("No se pudo calificar al grupo.");
      }
    }
  }

  async function handleDropOnGroup(groupId: string | null, studentId: string) {
    if (!activePeriod || activeState === "locked") return;
    if (groupDropInFlightRef.current) return;
    groupDropInFlightRef.current = true;
    const periodId = activePeriod.id;
    try {
      await assignStudentToGroup(periodId, studentId, groupId);
      setMemberships((current) => {
        const withoutStudent = current.filter((membership) => membership.studentId !== studentId);
        if (!groupId) return withoutStudent;
        return [...withoutStudent, { groupId, studentId }];
      });
      await refreshGroupData(periodId);
    } catch {
      setError("No se pudo asignar el estudiante al grupo.");
    } finally {
      groupDropInFlightRef.current = false;
    }
  }

  const activePeriod = periods[periodIndex];
  const activeState = activePeriod ? periodState(activePeriod) : "active";
  const examLabel = gradeItems.find((item) => item.isExam)?.name ?? "Parcial";
  const exportColumnOptions = [{ key: "code", label: "Código" }, { key: "name", label: "Nombre" }, ...gradeItems.map((item) => ({ key: String(item.id), label: String(item.name ?? item.id) })), { key: "periodGrade", label: "Nota del corte" }, { key: "accumulated", label: "Acumulada" }, { key: "final", label: "Nota final" }];
  const hasExportSelection = exportColumnOptions.some((column) => exportColumns.includes(column.key));
  const renameItemGradeCount = renameItem ? grades.filter((grade) => grade.itemId === renameItem.id).length : 0;
  const filteredStudents = students.filter((studentItem) => {
    const query = studentSearch.trim().toLowerCase();
    const matchesSearch = !query || [studentItem.fullName, studentItem.code, studentItem.institutionalEmail].some((value) => value.toLowerCase().includes(query));
    return matchesSearch;
  });
  const activeItemIds = gradeItems.map((item) => item.id);
  const statusFor = (studentItem: Student): StudentStatus => ({
    periodGrade: periodCalculation(studentItem.id).periodGrade,
    hasPending: hasPendingGrade(grades, studentItem.id, activeItemIds),
    campus: selectedCourse && activePeriod ? campusStateFor(campusCheckResult, selectedCourse.id, activePeriod.number, studentItem.code) : null,
  });
  const studentStatuses = new Map(filteredStudents.map((studentItem) => [studentItem.id, statusFor(studentItem)]));
  const filterCounts = countByFilter([...studentStatuses.values()]);
  const visibleStudents = filteredStudents.filter((studentItem) => matchesFilter(studentFilter, studentStatuses.get(studentItem.id)!));
  const sidebarSemester = currentSemester();
  const sidebarCourses = courses.filter((course) => course.semester === sidebarSemester || course.id === selectedCourse?.id);
  const courseSubtitle = selectedCourse ? [...(selectedCourse.campusGroups ?? []).map((group) => [group.group, group.room].filter(Boolean).join(" · ")), `Actividades ${activePeriod?.activityPercent ?? 40}% · ${examLabel} ${activePeriod?.examPercent ?? 60}%`].filter(Boolean).join(" · ") : "";

  function gradeFor(studentId: string, itemId: string) {
    return grades.find((grade) => grade.studentId === studentId && grade.itemId === itemId);
  }

  function gradeableStudentIndexes(itemId: string, gradesList: Grade[] = grades) {
    return students.map((_, index) => index).filter((index) => {
      const grade = gradesList.find((item) => item.studentId === students[index].id && item.itemId === itemId);
      return !grade || !!grade.pending;
    });
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
    setExportError("");
    // Only columns available in the active period, in the same order as the column picker.
    const columns = exportColumnOptions.filter((column) => exportColumns.includes(column.key));
    if (!columns.length) return;
    const valueFor = (studentItem: Student, key: string) => {
      const calculation = periodCalculation(studentItem.id); const summary = courseCalculation(studentItem.id);
      if (key === "code") return studentItem.code; if (key === "name") return studentItem.fullName; if (key === "activityAverage") return calculation.activityAverage.toFixed(1).replace(".", ","); if (key === "periodGrade") return calculation.periodGrade.toFixed(1).replace(".", ","); if (key === "accumulated") return summary.accumulated === null ? "En curso" : summary.accumulated.toFixed(1).replace(".", ","); if (key === "final") return summary.final === null ? "En curso" : summary.final.toFixed(1).replace(".", ",");
      const grade = gradeFor(studentItem.id, key); return grade && !grade.pending && typeof grade.value === "number" ? grade.value.toFixed(1).replace(".", ",") : "—";
    };
    const headerFont = "700 16px sans-serif"; const bodyFont = "15px sans-serif";
    const rowHeight = 42; const padding = 24; const columnGap = 28; const maxColumnWidth = 320; const maxCanvasWidth = 8192;
    const measure = document.createElement("canvas").getContext("2d"); if (!measure) return;
    const rows = students.map((studentItem) => columns.map((column) => valueFor(studentItem, column.key)));
    const widths = columns.map((column, index) => {
      measure.font = headerFont; let width = measure.measureText(column.label).width;
      measure.font = bodyFont; rows.forEach((row) => { width = Math.max(width, measure.measureText(row[index]).width); });
      return Math.ceil(Math.min(maxColumnWidth, Math.max(48, width)));
    });
    const offsets = widths.reduce<number[]>((acc, _, index) => [...acc, index === 0 ? padding : acc[index - 1] + widths[index - 1] + columnGap], []);
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(maxCanvasWidth, Math.max(760, offsets[offsets.length - 1] + widths[widths.length - 1] + padding));
    canvas.height = 72 + students.length * rowHeight;
    const context = canvas.getContext("2d"); if (!context) return;
    const fit = (text: string, width: number) => {
      if (context.measureText(text).width <= width) return text;
      let cut = text; while (cut.length > 1 && context.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
      return `${cut}…`;
    };
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#18212f"; context.font = headerFont;
    columns.forEach((column, index) => context.fillText(fit(column.label, widths[index]), offsets[index], 42));
    context.strokeStyle = "#d9e0ea"; context.beginPath(); context.moveTo(16, 58); context.lineTo(canvas.width - 16, 58); context.stroke(); context.font = bodyFont;
    rows.forEach((row, rowIndex) => {
      const y = 88 + rowIndex * rowHeight;
      row.forEach((value, columnIndex) => { context.fillStyle = "#18212f"; context.fillText(fit(value, widths[columnIndex]), offsets[columnIndex], y); });
      if (rowIndex < students.length - 1) { context.strokeStyle = "#eef1f5"; context.beginPath(); context.moveTo(16, y + 14); context.lineTo(canvas.width - 16, y + 14); context.stroke(); }
    });
    try {
      const link = document.createElement("a");
      link.download = `notazod-corte-${activePeriod.number}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (cause) {
      console.error("No se pudo generar la imagen de exportación", cause);
      setExportError("No se pudo generar la imagen con esas columnas. Probá reducir la cantidad de campos.");
    }
  }

  function openRenameActivity(item: GradeItem) {
    if (activeState === "locked") return;
    setRenameItem(item); setRenameName(item.name); setDeleteActivityConfirm(false); setDeleteActivityError(""); setRenameModal(true);
  }

  async function handleDeleteActivity() {
    if (!renameItem || renameItem.isExam || !activePeriod || activeState === "locked") return;
    const removedId = renameItem.id;
    setDeleteActivityError("");
    try {
      await deleteGradeItem(removedId);
      const remove = (items: GradeItem[]) => items.filter((item) => item.id !== removedId);
      setGradeItems(remove); setItemsByPeriod((current) => ({ ...current, [activePeriod.id]: remove(current[activePeriod.id] ?? []) }));
      setGrades((current) => current.filter((grade) => grade.itemId !== removedId));
      setExportColumns((current) => current.filter((key) => key !== removedId));
      setRenameModal(false); setRenameItem(null); setDeleteActivityConfirm(false);
    } catch (error) {
      setDeleteActivityError(`No se pudo eliminar la actividad. No se borró ningún dato. Detalle: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function openCampusCheck() {
    setCheckGroups([]); setCheckError(""); setCampusStatus(""); setCheckState("idle"); setCheckModal(true);
  }

  async function runCheck() {
    setCheckError(""); setCampusStatus(""); setCheckState("checking");
    try {
      const result = await runCampusCheck(setCampusStatus);
      setCheckGroups(result);
      setCampusCheckResult(result);
      setCheckState("done");
    } catch (cause) {
      setCheckError(cause instanceof Error ? cause.message : String(cause));
      setCheckState("error");
    }
  }

  function openCourseSync() {
    setSyncPlan([]); setSyncResults([]); setSyncError(""); setCampusStatus(""); setSyncState("idle"); setSyncModal(true);
  }

  async function readCourseSync() {
    setSyncError(""); setCampusStatus(""); setSyncState("reading");
    try {
      const groups = await readCampusCourses(setCampusStatus);
      setSyncPlan(planCourseSync(groups, await loadSyncCourses(), currentSemester()));
      setSyncState("preview");
    } catch (cause) { setSyncError(cause instanceof Error ? cause.message : String(cause)); setSyncState("error"); }
  }

  async function applySync() {
    setSyncState("applying");
    try {
      setSyncResults(await applyCourseSync(syncPlan));
      setCourses(await listCourses());
      setSyncState("done");
    } catch (cause) { setSyncError(cause instanceof Error ? cause.message : String(cause)); setSyncState("error"); }
  }

  function openCampusUpload() {
    setCampusReport(null); setCampusError(""); setCampusState("idle"); setCampusModal(true);
  }

  async function runCampus(save: boolean) {
    if (!selectedCourse) return;
    setCampusError(""); setCampusStatus(""); setCampusState(save ? "saving" : "checking");
    try {
      const report = await runCampusUpload(selectedCourse.id, save, setCampusStatus);
      setCampusReport(report);
      setCampusState(save ? "done" : "preview");
    } catch (cause) {
      setCampusError(cause instanceof Error ? cause.message : String(cause));
      setCampusState("error");
    }
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

  useEffect(() => {
    if (!gradeModal) return;
    requestAnimationFrame(() => {
      gradeInputRef.current?.focus();
      gradeInputRef.current?.select();
    });
  }, [gradeModal, gradeIndex]);

  function openGradeWalkthrough(item: GradeItem, studentIndex?: number) {
    const itemPeriod = periods.find((period) => period.id === item.periodId);
    if (!students.length || itemPeriod?.closed) return;
    let resolvedIndex = studentIndex;
    if (resolvedIndex === undefined) {
      const gradeableIndexes = gradeableStudentIndexes(item.id);
      if (!gradeableIndexes.length) { setError("No hay estudiantes por calificar en esta actividad."); return; }
      resolvedIndex = gradeableIndexes[0];
    }
    setGradeItem(item);
    setGradeIndex(resolvedIndex);
    const existing = gradeFor(students[resolvedIndex].id, item.id);
    setGradeValue(existing && !existing.pending ? String(existing.value).replace(".", ",") : "");
    setGradeError("");
    setGradeModal(true);
    void refreshGradeHistory(students[resolvedIndex].id, item.id);
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
    const updatedGrades = [...grades.filter((grade) => !(grade.studentId === nextGrade.studentId && grade.itemId === nextGrade.itemId)), nextGrade];
    advanceGradeWalkthrough(direction, updatedGrades);
  }

  async function clearGrade(direction: 1 | -1) {
    if (!gradeItem || !students.length) return;
    const gradePeriod = periods.find((period) => period.id === gradeItem.periodId);
    if (gradePeriod?.closed) { setGradeError("No se puede editar un corte cerrado."); return; }
    const current = students[gradeIndex];
    try {
      await deleteGrade(current.id, gradeItem.id);
    } catch {
      setGradeError("No se puede editar un corte cerrado.");
      return;
    }
    const updatedGrades = grades.filter((grade) => !(grade.studentId === current.id && grade.itemId === gradeItem.id));
    setGrades(updatedGrades);
    await refreshGradeHistory(current.id, gradeItem.id);
    navigateGrade(direction, updatedGrades);
  }

  async function refreshGradeHistory(studentId: string, itemId: string) {
    const history = await listGradeHistory(studentId, itemId);
    setGradeHistory(history);
  }

  async function undoGrade() {
    if (!gradeItem || !students.length) return;
    const gradePeriod = periods.find((period) => period.id === gradeItem.periodId);
    if (gradePeriod?.closed) { setGradeError("No se puede editar un corte cerrado."); return; }
    const current = students[gradeIndex];
    let restored: Grade | null;
    try {
      restored = await undoLastGrade(current.id, gradeItem.id);
    } catch {
      setGradeError("No se puede editar un corte cerrado.");
      return;
    }
    const updatedGrades = grades.filter((grade) => !(grade.studentId === current.id && grade.itemId === gradeItem.id));
    if (restored) updatedGrades.push(restored);
    setGrades(updatedGrades);
    setGradeValue(restored && !restored.pending ? String(restored.value).replace(".", ",") : "");
    setGradeError("");
    await refreshGradeHistory(current.id, gradeItem.id);
  }

  function openGradeHistory() {
    setGradeHistoryModal(true);
  }

  function formatHistoryState(value: number | null, pending: number | null) {
    if (value === null || pending === null) return "Sin nota";
    if (pending) return "Pendiente";
    return String(value).replace(".", ",");
  }

  function navigateGrade(direction: 1 | -1, gradesList: Grade[] = grades) {
    if (!gradeItem || !students.length) return;
    const nextIndex = Math.min(Math.max(gradeIndex + direction, 0), students.length - 1);
    setGradeIndex(nextIndex);
    const existing = gradesList.find((grade) => grade.studentId === students[nextIndex].id && grade.itemId === gradeItem.id);
    setGradeValue(existing && !existing.pending ? String(existing.value).replace(".", ",") : "");
    setGradeError("");
    void refreshGradeHistory(students[nextIndex].id, gradeItem.id);
  }

  function advanceGradeWalkthrough(direction: 1 | -1, updatedGrades: Grade[]) {
    if (!gradeItem) return;
    setGrades(updatedGrades);
    const gradeableIndexes = gradeableStudentIndexes(gradeItem.id, updatedGrades);
    const nextIndex = direction === 1
      ? gradeableIndexes.find((index) => index > gradeIndex)
      : [...gradeableIndexes].reverse().find((index) => index < gradeIndex);
    if (nextIndex === undefined) { setGradeModal(false); return; }
    setGradeIndex(nextIndex);
    const existing = updatedGrades.find((grade) => grade.studentId === students[nextIndex].id && grade.itemId === gradeItem.id);
    setGradeValue(existing && !existing.pending ? String(existing.value).replace(".", ",") : "");
    setGradeError("");
    void refreshGradeHistory(students[nextIndex].id, gradeItem.id);
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

  const field = (key: keyof StudentDraft, label: string, type = "text") => (
    <TextInput label={label} value={student[key]} type={type} required error={studentErrors[key]} onChange={(event) => updateStudent(key, event.currentTarget.value)} />
  );

  function templateFieldOptions() {
    const fixedFields: { key: string; label: string }[] = [
      { key: "code", label: "Código" },
      { key: "name", label: "Nombre" },
      { key: "email", label: "Correo institucional" },
      { key: "document", label: "Documento" },
      { key: "personalEmail", label: "Correo personal" },
    ];
    const gradeFields = gradeItems.map((item) => ({ key: String(item.id), label: String(item.name ?? item.id) }));
    const seen = new Set<string>();
    return [...fixedFields, ...gradeFields].filter((column) => {
      if (!column.key || seen.has(column.key)) return false;
      seen.add(column.key);
      return true;
    });
  }

  function toggleTemplateColumn(key: string, checked: boolean) {
    setTemplateColumns((current) => {
      const safeCurrent = Array.isArray(current) ? current.filter((value): value is string => typeof value === "string") : [];
      if (checked) return safeCurrent.includes(key) ? safeCurrent : [...safeCurrent, key];
      return safeCurrent.filter((value) => value !== key);
    });
  }

  function downloadGradeTemplate(format: "csv" | "xls") {
    if (!activePeriod || !students.length) return;
    const labels: Record<string, string> = { code: "Código", name: "Nombre", email: "Correo institucional", document: "Documento", personalEmail: "Correo personal" };
    const headers = templateColumns.map((key) => String(labels[key] ?? gradeItems.find((item) => item.id === key)?.name ?? key));
    const lines = [headers, ...students.map((studentItem) => templateColumns.map((key) => {
      const gradeItem = gradeItems.find((item) => item.id === key);
      if (gradeItem) {
        const existing = gradeFor(studentItem.id, gradeItem.id);
        return existing && !existing.pending ? String(existing.value) : "";
      }
      const value = key === "code" ? studentItem.code : key === "name" ? studentItem.fullName : key === "email" ? studentItem.institutionalEmail : key === "document" ? studentItem.documentId : key === "personalEmail" ? studentItem.personalEmail : "";
      return String(value ?? "");
    }))];
    const csv = lines.map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(";")).join("\n");
    const html = `<html><head><meta charset="utf-8"></head><body><table>${lines.map((line) => `<tr>${line.map((value) => `<td>${value.replace(/"/g, "")}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    const link = document.createElement("a");
    link.download = `plantilla-notas-corte-${activePeriod.number}.${format}`;
    const objectUrl = URL.createObjectURL(new Blob([format === "csv" ? csv : html], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.ms-excel" }));
    link.href = objectUrl;
    link.click();
    URL.revokeObjectURL(objectUrl);
    setTemplateModal(false);
  }

  async function checkForUpdates(showModal = true) {
    if (showModal) {
      setUpdateModal(true);
      setUpdateState("checking");
      setUpdateError("");
      setUpdateProgress(0);
      setPendingUpdate(null);
    }
    try {
      const update = await check();
      if (!update) {
        if (showModal) setUpdateState("none");
        return;
      }
      setPendingUpdate(update);
      setUpdateState("available");
      setUpdateModal(true);
    } catch (cause) {
      if (showModal) {
        setUpdateError(cause instanceof Error ? cause.message : String(cause));
        setUpdateState("error");
      }
    }
  }

  async function installUpdate() {
    if (!pendingUpdate) return;
    setUpdateState("installing");
    setUpdateProgress(0);
    setUpdateError("");
    try {
      let downloaded = 0;
      let total = 0;
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setUpdateProgress(total ? Math.round((downloaded / total) * 100) : 0);
        }
        if (event.event === "Finished") setUpdateProgress(100);
      });
      setUpdateState("installed");
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : String(cause));
      setUpdateState("error");
    }
  }

  if (fatalStartupError) {
    return (
      <Container size="sm" py="xl">
        <Stack gap="md">
          <Title order={2} c="red">No se pudo abrir NOTAZOD</Title>
          <Text role="alert">
            La restauración de la copia de seguridad falló y no se pudo confirmar que la base de datos activa quedara intacta.
            Por seguridad, NOTAZOD no abrió ninguna base de datos para evitar crear una vacía.
          </Text>
          <Text size="sm" c="dimmed">{fatalStartupError}</Text>
          <Text size="sm">
            Contactá soporte técnico y conservá el archivo de respaldo mencionado arriba antes de intentar nada más.
          </Text>
        </Stack>
      </Container>
    );
  }

  // Home agenda (S2-S5): current-semester courses feed the banner, the week and the main list.
  const homeSemester = currentSemester(now);
  const homeCourses = courses.filter((course) => course.semester === homeSemester);
  const homeWeek = buildWeek(homeCourses);
  const otherSemesters = [...new Set(courses.map((course) => course.semester))].filter((semesterName) => semesterName !== homeSemester).sort().reverse();
  const studentCountLabel = (count: number) => `${count} ${count === 1 ? "estudiante" : "estudiantes"}`;
  const renderHomeCourses = (list: Course[]) => (
    <nav className="home-courses" aria-label="Cursos">
      {list.map((course) => (
        <Tooltip key={course.id} label={course.name} openDelay={300} withinPortal>
          <button type="button" className="home-course" style={courseColorStyle(course.color) as CSSProperties} aria-label={`${course.name}, ${studentCountLabel(course.students)}`} onClick={() => void openCourse(course)}>
            <span className="home-dot" aria-hidden="true" />
            <b>{course.name}</b>
            <small>{course.students}</small>
          </button>
        </Tooltip>
      ))}
    </nav>
  );

  const darkTheme = colorScheme === "dark";
  const themeSwitch = (
    <Switch
      className="theme-switch"
      size="md"
      labelPosition="left"
      label={darkTheme ? "Tema oscuro" : "Tema claro"}
      checked={darkTheme}
      onChange={(event) => setColorScheme(event.currentTarget.checked ? "dark" : "light")}
      thumbIcon={<Icon name={darkTheme ? "moon" : "sun"} size={12} />}
    />
  );

  return (
    <AppShell header={selectedCourse ? undefined : { height: 48 }} navbar={selectedCourse ? { width: 260, breakpoint: "xs" } : undefined} padding="md">
      {selectedCourse ? (
        <AppShell.Navbar className="course-sidebar" aria-label="Panel del curso">
          <div className="theme-row">{themeSwitch}</div>
          <button type="button" className="sidebar-back" onClick={() => { setSelectedCourse(null); setGroups([]); setMemberships([]); setViewMode("list"); }}>← Volver a cursos</button>
          <div>
            <p className="sidebar-label">Cursos {sidebarSemester}</p>
            <nav className="sidebar-courses" aria-label="Cursos">
              {sidebarCourses.map((course) => (
                <div key={course.id} className="sidebar-course-row" data-selected={course.id === selectedCourse.id || undefined} style={courseColorStyle(course.color) as CSSProperties}>
                  <Popover opened={paletteCourseId === course.id} onChange={(opened) => setPaletteCourseId(opened ? course.id : null)} position="bottom-start" shadow="md" withinPortal>
                    <Popover.Target>
                      <button type="button" className="course-dot" aria-label={`Color de ${course.name}: ${COURSE_COLOR_SWATCHES[course.color].label}`} aria-haspopup="true" aria-expanded={paletteCourseId === course.id} onClick={() => setPaletteCourseId((current) => current === course.id ? null : course.id)} />
                    </Popover.Target>
                    <Popover.Dropdown className="course-palette">
                      <div role="group" aria-label={`Elegir color de ${course.name}`}>
                        {COURSE_COLORS.map((color) => (
                          <button key={color} type="button" className="course-swatch" style={courseColorStyle(color) as CSSProperties} aria-label={COURSE_COLOR_SWATCHES[color].label} aria-pressed={course.color === color} onClick={() => void handleCourseColor(course, color)} />
                        ))}
                      </div>
                    </Popover.Dropdown>
                  </Popover>
                  <Tooltip label={course.name} openDelay={300} position="right" withinPortal>
                    <button type="button" className="sidebar-course" aria-current={course.id === selectedCourse.id ? "page" : undefined} onClick={() => void openCourse(course)}>
                      <span>{course.name}</span><small>{course.students}</small>
                    </button>
                  </Tooltip>
                </div>
              ))}
            </nav>
          </div>
          <div>
            <p className="sidebar-label">Mostrar</p>
            <div className="sidebar-filters" role="group" aria-label="Filtrar estudiantes">
              {studentFilterOptions.map((option) => {
                const unavailable = option.key === STUDENT_FILTER.CAMPUS && !campusCheckResult;
                return (
                  <Tooltip key={option.key} label={option.description} openDelay={300} withinPortal>
                    <button type="button" className="sidebar-filter" data-filter={option.key} aria-pressed={studentFilter === option.key} aria-describedby={`filter-${option.key}-description`} disabled={unavailable} onClick={() => setStudentFilter(option.key)}>
                      <b>{unavailable ? "" : filterCounts[option.key]}</b><span>{option.label}</span>
                      <span id={`filter-${option.key}-description`} hidden>{option.description}</span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
            {!campusCheckResult ? <Text size="xs" c="dimmed" mt={4}>Ejecutá "Verificar Campus" para ver qué notas faltan por subir.</Text> : null}
          </div>
          <div className="sidebar-actions">
            <p className="sidebar-label">Campus y datos</p>
            <button type="button" className="accent" onClick={() => setCourseModal(true)}><Icon name="plus" />Crear curso</button>
            <button type="button" onClick={openCourseSync}><Icon name="sync" />Sincronizar cursos</button>
            <button type="button" onClick={openCampusCheck}><Icon name="check" />Verificar Campus</button>
            <button type="button" onClick={() => void openCampusWindow()} aria-label="Abrir el Campus de Unimayor en una ventana de NOTAZOD"><Icon name="external" />Abrir Campus</button>
            <button type="button" onClick={() => void handleExportBackup()} aria-label="Exportar copia de seguridad de NOTAZOD"><Icon name="download" />Exportar copia de seguridad</button>
            <button type="button" onClick={() => void handleRestoreBackup()} aria-label="Restaurar copia de seguridad de NOTAZOD"><Icon name="upload" />Restaurar copia de seguridad</button>
            <button type="button" onClick={() => void checkForUpdates()} aria-label="Buscar actualizaciones de NOTAZOD"><Icon name="clock" />Buscar actualizaciones</button>
            <button type="button" onClick={() => void openUrl("https://github.com/CT-Zodiako/NOTAZOD")} aria-label="Abrir repositorio de NOTAZOD en GitHub"><Icon name="code" />GitHub</button>
          </div>
        </AppShell.Navbar>
      ) : (
      <AppShell.Header className="app-header">
        <Container size="xl" fluid className="header-inner">
          <img className="brand-logo" src="/branding/notazod-logo.png" alt="NOTAZOD" />
          <Group gap="xs" wrap="nowrap">
            {themeSwitch}
            <Menu shadow="md" width={260} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Más opciones"><Icon name="dots" /></ActionIcon>
              </Menu.Target>
              <Menu.Dropdown className="home-menu">
                <Menu.Item leftSection={<Icon name="external" />} onClick={() => void openCampusWindow()} aria-label="Abrir el Campus de Unimayor en una ventana de NOTAZOD">Abrir Campus</Menu.Item>
                <Menu.Item leftSection={<Icon name="check" />} onClick={openCampusCheck}>Verificar Campus</Menu.Item>
                <Menu.Divider />
                <Menu.Item leftSection={<Icon name="download" />} onClick={() => void handleExportBackup()} aria-label="Exportar copia de seguridad de NOTAZOD">Exportar copia de seguridad</Menu.Item>
                <Menu.Item leftSection={<Icon name="upload" />} onClick={() => void handleRestoreBackup()} aria-label="Restaurar copia de seguridad de NOTAZOD">Restaurar copia de seguridad</Menu.Item>
                <Menu.Divider />
                <Menu.Item leftSection={<Icon name="clock" />} onClick={() => void checkForUpdates()} aria-label="Buscar actualizaciones de NOTAZOD">Buscar actualizaciones</Menu.Item>
                <Menu.Item leftSection={<Icon name="code" />} onClick={() => void openUrl("https://github.com/CT-Zodiako/NOTAZOD")} aria-label="Abrir repositorio de NOTAZOD en GitHub">Ver proyecto en GitHub</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Container>
      </AppShell.Header>
      )}
      <AppShell.Main>
        <Container size="xl" fluid>
          <Stack gap="md">
            {!selectedCourse ? (
              <div className="home-title">
                <Title order={1}>Hoy, {weekdayName(now.getDay())}</Title>
                <Group gap="xs">
                  <Button variant="default" leftSection={<Icon name="sync" />} onClick={openCourseSync}>Sincronizar cursos</Button>
                  <Button leftSection={<Icon name="plus" />} onClick={() => setCourseModal(true)}>Crear curso</Button>
                </Group>
              </div>
            ) : null}
            {error ? <Text c="red" role="alert">{error}</Text> : null}
            {backupMessage ? <Text c={backupMessage.type === "success" ? "green" : "red"} role="status">{backupMessage.text}</Text> : null}
            {restoreMessage ? <Text c={restoreMessage.type === "success" ? "green" : "red"} role="status">{restoreMessage.text}</Text> : null}
            {loading ? <Text c="dimmed">Cargando tus cursos…</Text> : null}
            {!selectedCourse ? (
              loading ? null : courses.length === 0 ? (
                <div className="home-empty">
                  <Text fw={700}>Todavía no tenés cursos.</Text>
                  <Text c="dimmed" size="sm">Usá Sincronizar cursos para traerlos del Campus o Crear curso para empezar uno.</Text>
                </div>
              ) : (() => {
                const nextSlot = nextClass(homeCourses, now);
                const nextCourse = nextSlot ? homeCourses.find((course) => course.id === nextSlot.slot.courseId) : undefined;
                return (
                  <>
                    {nextSlot && nextCourse ? (
                      <section className="home-next" aria-label="Próxima clase" style={courseColorStyle(nextCourse.color) as CSSProperties}>
                        <span className="home-dot" aria-hidden="true" />
                        <div className="home-next-body">
                          <span className="home-next-label">{nextClassLabel(nextSlot)}</span>
                          <b>{nextCourse.name}</b>
                          <Text c="dimmed" size="sm" truncate>{[nextSlot.slot.group, nextSlot.slot.room, studentCountLabel(nextCourse.students)].filter(Boolean).join(" · ")}</Text>
                        </div>
                        <Button rightSection={<Icon name="chevronRight" />} onClick={() => void openCourse(nextCourse)}>Abrir curso</Button>
                      </section>
                    ) : (
                      <section className="home-next" aria-label="Próxima clase" style={courseColorStyle("primary") as CSSProperties}>
                        <span className="home-dot" aria-hidden="true" />
                        <div className="home-next-body">
                          <span className="home-next-label">Próxima clase</span>
                          <Text c="dimmed" size="sm">Los horarios de tus cursos llegan del Campus con Sincronizar cursos.</Text>
                        </div>
                      </section>
                    )}
                    <div className="home-week" style={{ "--week-columns": homeWeek.length } as CSSProperties}>
                      {homeWeek.map((column) => (
                        <section key={column.day} className="home-day" data-today={column.day === now.getDay() || undefined} aria-label={weekdayName(column.day)}>
                          <h3>{dayLabel(column.day)}</h3>
                          {column.slots.map((slot) => {
                            const slotCourse = homeCourses.find((course) => course.id === slot.courseId);
                            const time = `${formatTime(slot.start)}–${formatTime(slot.end)}`;
                            return (
                              <Tooltip key={`${slot.courseId}-${slot.start}-${slot.end}-${slot.room}`} label={[slot.courseName, time, slot.room].filter(Boolean).join(" · ")} openDelay={300} withinPortal>
                                <button type="button" className="home-slot" style={courseColorStyle(slot.color) as CSSProperties} onClick={() => { if (slotCourse) void openCourse(slotCourse); }}>
                                  <b>{slot.courseName}</b>
                                  <span>{time}</span>
                                  {slot.room ? <span>{slot.room}</span> : null}
                                </button>
                              </Tooltip>
                            );
                          })}
                        </section>
                      ))}
                    </div>
                    <section aria-label={`Todos los cursos ${homeSemester}`}>
                      <h2 className="home-heading">Todos los cursos · {homeSemester}</h2>
                      {homeCourses.length ? renderHomeCourses(homeCourses) : <Text c="dimmed" size="sm">No hay cursos del semestre {homeSemester}.</Text>}
                    </section>
                    {otherSemesters.length ? (
                      <section aria-label="Otros semestres">
                        <h2 className="home-heading">Otros semestres</h2>
                        <Stack gap="sm">
                          {otherSemesters.map((semesterName) => (
                            <div key={semesterName}>
                              <p className="home-subheading">{semesterName}</p>
                              {renderHomeCourses(courses.filter((course) => course.semester === semesterName))}
                            </div>
                          ))}
                        </Stack>
                      </section>
                    ) : null}
                  </>
                );
              })()
            ) : (
              <Stack gap="md">
                <div className="course-header">
                  <div><Title order={1} className="course-title" style={courseColorStyle(selectedCourse.color) as CSSProperties}><span className="course-title-dot" aria-hidden="true" />{selectedCourse.name}</Title><Text c="dimmed" size="sm" mt={4}>{courseSubtitle}</Text></div>
                  <Group gap="xs">
                    <Button color="green" variant="light" disabled={!students.length} onClick={openCampusUpload}>Subir al Campus</Button>
                    <Menu shadow="md" width={240}><Menu.Target><Button color="pink" variant="filled" disabled={activeState !== "active"}>Calificar ▾</Button></Menu.Target><Menu.Dropdown>{gradeItems.map((item) => <Menu.Item key={item.id} onClick={() => openGradeWalkthrough(item)}>Calificar {item.name}</Menu.Item>)}<Menu.Divider /><Menu.Item onClick={() => openGroupGradeModal()}>Calificar grupo</Menu.Item></Menu.Dropdown></Menu>
                    <Menu shadow="md" width={220} position="bottom-end"><Menu.Target><Button variant="default" aria-label="Más acciones del curso">⋯</Button></Menu.Target><Menu.Dropdown><Menu.Item color="red" onClick={() => { setDeleteCourseError(""); setDeleteCourseModal(true); }}>Eliminar curso</Menu.Item></Menu.Dropdown></Menu>
                  </Group>
                </div>
                <Group justify="space-between" wrap="wrap">
                  <SegmentedControl aria-label="Cortes" value={activePeriod?.id ?? ""} data={periods.map((period) => ({ value: period.id, label: <span className={periodState(period) === "locked" ? "corte-locked" : undefined}>{`Corte ${period.number} · ${periodState(period) === "locked" ? "Cerrado" : "Abierto"}`}</span> }))} onChange={(value) => { const index = periods.findIndex((period) => period.id === value); if (index >= 0) void selectPeriod(index); }} />
                  <SegmentedControl aria-label="Vista" value={viewMode} data={[{ value: "list", label: "Notas" }, { value: "groups", label: "Grupos" }]} onChange={(value) => setViewMode(value === "groups" ? "groups" : "list")} />
                </Group>
                <Group justify="space-between" align="flex-end" wrap="wrap"><Group align="flex-end" wrap="wrap" gap="xs"><TextInput aria-label="Buscar estudiante" placeholder="Nombre, código o correo" value={studentSearch} onChange={(event) => setStudentSearch(event.currentTarget.value)} w={240} /><Button color="blue" variant="light" onClick={openSplitEditor} disabled={activeState === "locked"}>Actividades {activePeriod?.activityPercent ?? 40}% · {examLabel} {activePeriod?.examPercent ?? 60}%</Button><Button variant="default" disabled={activeState !== "active"} onClick={() => setActivityModal(true)}>Agregar actividad</Button><Button variant="default" onClick={() => setStudentModal(true)}>Agregar estudiante</Button></Group><Group align="flex-end" wrap="wrap" gap="xs"><Button onClick={openRoulette} disabled={!students.length} style={{ background: "linear-gradient(90deg, #ff3b3b, #ff9500, #ffe135, #2ecc71, #3b82f6, #8b5cf6, #ec4899)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>Ruleta</Button><Menu shadow="md" width={220}><Menu.Target><Button color="violet" variant="light" disabled={!students.length}>Exportar</Button></Menu.Target><Menu.Dropdown><Menu.Item onClick={() => { setExportError(""); setExportModal(true); }}>Exportar imagen</Menu.Item><Menu.Item onClick={() => { setTemplateColumns(["code", "name", "email", ...gradeItems.map((item) => item.id)]); setTemplateModal(true); }}>Exportar planilla</Menu.Item></Menu.Dropdown></Menu><Button variant={activeState === "locked" ? "light" : "default"} color={activeState === "locked" ? "green" : "orange"} onClick={() => void togglePeriodClosed()}>{activeState === "locked" ? "Reabrir corte" : "Cerrar corte"}</Button></Group></Group>
                {viewMode === "groups" ? (() => {
                  const unassignedStudents = filteredStudents.filter((studentItem) => !groupForStudent(studentItem.id));
                  const renderUnassignedMember = (studentItem: Student) => (
                    <Group key={studentItem.id} gap="xs" wrap="nowrap">
                      <Text fw={600} size="sm" onClick={() => openStudentDetail(studentItem)} style={{ cursor: "pointer", flex: 1, minWidth: 0 }} truncate>{studentItem.fullName}</Text>
                      <Text size="xs" c="dimmed" style={{ minWidth: 70 }}>{studentItem.code}</Text>
                      {activeState !== "locked" ? (
                        <Select
                          size="xs"
                          placeholder="Mover a grupo…"
                          searchable
                          maxDropdownHeight={220}
                          comboboxProps={{ withinPortal: true, position: "bottom-start" }}
                          scrollAreaProps={{ type: "always", scrollbarSize: 10 }}
                          data={[{ value: "__none__", label: "Sin grupo" }, ...groups.map((groupOption) => ({ value: groupOption.id, label: groupOption.name }))]}
                          value="__none__"
                          onChange={(value) => { if (!value || value === "__none__") return; void handleDropOnGroup(value, studentItem.id); }}
                          style={{ width: 160 }}
                        />
                      ) : null}
                    </Group>
                  );
                  const renderGroupMember = (studentItem: Student) => (
                    <Group key={studentItem.id} gap="xs" wrap="nowrap">
                      <Text fw={600} size="sm" onClick={() => openStudentDetail(studentItem)} style={{ cursor: "pointer", flex: 1, minWidth: 0 }} truncate>{studentItem.fullName}</Text>
                      {activeState !== "locked" ? (
                        <Button size="xs" color="red" variant="subtle" onClick={() => void handleDropOnGroup(null, studentItem.id)}>Sacar del grupo</Button>
                      ) : null}
                    </Group>
                  );
                  const groupGrid = (
                    <Stack gap="md">
                      <Group align="flex-end">
                        <TextInput label="Nombre del grupo" placeholder="Ej. Grupo 1 (vacío = automático)" value={newGroupName} onChange={(event) => setNewGroupName(event.currentTarget.value)} disabled={activeState === "locked"} />
                        <Button onClick={() => void handleCreateGroup()} disabled={activeState === "locked"}>Crear grupo</Button>
                        <Button variant="light" onClick={openCopyGroupsModal} disabled={activeState === "locked" || periods.filter((period) => period.id !== activePeriod?.id).length === 0}>Copiar grupos</Button>
                        <Button variant="default" onClick={() => setGroupManageModal(true)} disabled={!groups.length}>Renombrar o eliminar grupos</Button>
                      </Group>
                      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
                        {groups.map((group) => {
                          const memberStudents = filteredStudents.filter((studentItem) => groupForStudent(studentItem.id)?.id === group.id);
                          return (
                            <Card key={group.id} withBorder padding="sm">
                              <Stack gap="xs">
                                <Group justify="space-between">
                                  <Title order={5}>{group.name}</Title>
                                  <Group gap="xs">
                                    <Button size="xs" color="grape" variant="light" disabled={activeState === "locked"} onClick={() => openGroupGradeModal(group.id)}>Calificar grupo</Button>
                                    <Button size="xs" color="red" variant="light" disabled={activeState === "locked"} onClick={() => openDeleteGroupConfirm(group)}>Eliminar grupo</Button>
                                  </Group>
                                </Group>
                                {memberStudents.length ? (
                                  <Stack gap={4}>{memberStudents.map((studentItem) => renderGroupMember(studentItem))}</Stack>
                                ) : <Text c="dimmed" size="sm">Sin estudiantes en este grupo.</Text>}
                              </Stack>
                            </Card>
                          );
                        })}
                      </SimpleGrid>
                    </Stack>
                  );
                  if (!unassignedStudents.length) return groupGrid;
                  return (
                    <Group align="flex-start" wrap="nowrap" gap="md">
                      <div style={{ flex: "0 0 280px" }}>
                        <Card withBorder padding="sm">
                          <Stack gap="xs">
                            <Title order={5}>Estudiantes sin grupo</Title>
                            <Stack gap={4}>{unassignedStudents.map(renderUnassignedMember)}</Stack>
                          </Stack>
                        </Card>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {groupGrid}
                      </div>
                    </Group>
                  );
                })() : visibleStudents.length ? (
                  <div>
                    <Table.ScrollContainer minWidth={760}>
                      <Table className="grade-table heat-table" highlightOnHover withTableBorder>
                        <Table.Thead><Table.Tr><Table.Th>#</Table.Th><Table.Th>Estudiante</Table.Th>{gradeItems.map((item) => <Table.Th key={item.id} className="editable-header heat-header" onClick={() => openRenameActivity(item)} title="Editar nombre">{item.name} ✎</Table.Th>)}<Table.Th className="heat-header">Nota del corte</Table.Th><Table.Th className="heat-header">Acumulada</Table.Th>{activePeriod?.number === 3 ? <Table.Th className="heat-header">Nota final</Table.Th> : null}<Table.Th className="heat-header">Campus</Table.Th></Table.Tr></Table.Thead>
                        <Table.Tbody>{visibleStudents.map((item, studentIndex) => {
                          const status = studentStatuses.get(item.id)!;
                          const summary = courseCalculation(item.id);
                          return (
                            <Table.Tr key={item.id}>
                              <Table.Td>{studentIndex + 1}</Table.Td>
                              <Table.Td className="student-name-cell" onClick={() => openStudentDetail(item)} title="Ver información y notas"><b>{item.fullName}</b><small>{item.code} · {item.institutionalEmail}</small></Table.Td>
                              {gradeItems.map((gradeItem) => {
                                const grade = gradeFor(item.id, gradeItem.id);
                                const tint = heatTint(grade);
                                const tintStyle = tint.kind === "graded" ? { "--heat-color": `var(${tint.token})`, "--heat-percent": `${tint.percent}%` } as CSSProperties : undefined;
                                return <Table.Td key={gradeItem.id} className={`grade-cell heat-cell heat-${tint.kind}`} style={tintStyle} onClick={() => openGradeWalkthrough(gradeItem, students.findIndex((studentItem) => studentItem.id === item.id))} title={activeState === "active" ? "Editar nota" : "Corte cerrado"}>{tint.kind === "graded" && grade ? grade.value.toFixed(1).replace(".", ",") : tint.kind === "pending" ? "Pend." : "—"}</Table.Td>;
                              })}
                              <Table.Td className={`period-grade-cell ${isAtRisk(status.periodGrade) ? "is-failing" : "is-passing"}`} title={activeState === "active" ? "Corte abierto: la nota puede cambiar" : "Corte cerrado"}>{status.periodGrade.toFixed(1).replace(".", ",")}</Table.Td>
                              <Table.Td className="summary-cell">{summary.accumulated === null ? <Text c="dimmed" span>—</Text> : summary.accumulated.toFixed(1).replace(".", ",")}</Table.Td>
                              {activePeriod?.number === 3 ? <Table.Td className="summary-cell">{summary.final === null ? <Text c="dimmed" span>En curso</Text> : <Badge color={summary.final < 3 ? "red" : "green"}>{summary.final.toFixed(1).replace(".", ",")}</Badge>}</Table.Td> : null}
                              <Table.Td className="summary-cell">{status.campus ? <span className={`campus-state campus-${status.campus}`}>{campusStateLabels[status.campus]}</span> : <Text c="dimmed" span>—</Text>}</Table.Td>
                            </Table.Tr>
                          );
                        })}</Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                    <p className="heat-legend">0,0 <span aria-hidden="true" /> 5,0 · el color se intensifica cuanto más lejos está la nota de 3,0 · rayado = pendiente</p>
                  </div>
                ) : <Card withBorder><Text c="dimmed">{students.length ? "Ningún estudiante coincide con la búsqueda o el filtro." : "Este curso todavía no tiene estudiantes."}</Text></Card>}
              </Stack>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
      <footer className="app-footer">
        <Text size="xs" c="dimmed">NOTAZOD V1 · Gestión académica offline</Text>
        <Button variant="subtle" size="compact-xs" onClick={() => void openUrl("https://github.com/CT-Zodiako/NOTAZOD")} aria-label="Abrir NOTAZOD en GitHub">Ver proyecto en GitHub</Button>
      </footer>

      <Modal opened={updateModal} onClose={() => setUpdateModal(false)} title="Actualizaciones" centered>
        <Stack>
          {updateState === "checking" ? <Text c="dimmed">Buscando actualizaciones…</Text> : null}
          {updateState === "none" ? <Text>Ya tenés la última versión instalada.</Text> : null}
          {updateState === "available" && pendingUpdate ? (
            <>
              <Text>Hay una versión nueva disponible: <b>{pendingUpdate.version}</b>.</Text>
              {pendingUpdate.body ? <Text size="sm" c="dimmed" className="update-notes">{pendingUpdate.body}</Text> : null}
              <Text size="xs" c="dimmed">La descarga puede tardar según tu conexión. No cierres NOTAZOD durante la instalación.</Text>
            </>
          ) : null}
          {updateState === "installing" ? (
            <>
              <Text>Descargando e instalando la versión {pendingUpdate?.version}…</Text>
              <Progress value={updateProgress} aria-label="Progreso de la descarga" />
            </>
          ) : null}
          {updateState === "installed" ? <Text c="green">La actualización se instaló. Cerrá y volvé a abrir NOTAZOD para usar la versión nueva.</Text> : null}
          {updateState === "error" ? (
            <>
              <Text c="red" role="alert">No se pudo completar la búsqueda de actualizaciones.</Text>
              {updateError ? <Text size="xs" c="dimmed">{updateError}</Text> : null}
            </>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setUpdateModal(false)} disabled={updateState === "installing"}>Cerrar</Button>
            {updateState === "available" ? <Button onClick={() => void installUpdate()}>Descargar e instalar</Button> : null}
            {updateState === "error" ? <Button onClick={() => void checkForUpdates()}>Reintentar</Button> : null}
          </Group>
        </Stack>
      </Modal>
      <Modal opened={studentDetailModal} onClose={() => setStudentDetailModal(false)} title={selectedStudent?.fullName ?? "Estudiante"} centered size="lg"><Stack>{selectedStudent ? <><Text size="sm">Código: <b>{selectedStudent.code}</b></Text><Text size="sm">Documento: <b>{selectedStudent.documentId}</b></Text><Text size="sm">Correo institucional: <b>{selectedStudent.institutionalEmail}</b></Text><Text size="sm">Correo personal: <b>{selectedStudent.personalEmail}</b></Text>{periods.map((period) => <Card key={period.id} withBorder><Stack gap="xs"><Group justify="space-between"><Text fw={700}>Corte {period.number}</Text><Badge color={period.closed ? "gray" : "green"}>{period.closed ? "Cerrado" : "Abierto"}</Badge></Group>{(itemsByPeriod[period.id] ?? []).map((item) => { const grade = gradeFor(selectedStudent.id, item.id); return <Group key={item.id} justify="space-between"><Text size="sm">{item.name}</Text><Button size="xs" variant="light" disabled={Boolean(period.closed)} onClick={() => { setStudentDetailModal(false); openGradeWalkthrough(item, students.findIndex((studentItem) => studentItem.id === selectedStudent.id)); }}>{grade ? (grade.pending ? "Pendiente 0,0" : grade.value.toFixed(1).replace(".", ",")) : "Sin nota"}</Button></Group>; })}</Stack></Card>)}</> : null}</Stack></Modal>
      <Modal opened={rouletteModal} onClose={closeRoulette} title={`Ruleta · ${selectedCourse?.name ?? ""}`} centered><Stack align="center"><Group justify="center"><Text c="dimmed" size="sm">{students.length} {students.length === 1 ? "estudiante" : "estudiantes"} en este curso</Text><Switch size="sm" label="Voz" checked={rouletteVoiceEnabled} onChange={(event) => setRouletteVoiceEnabled(event.currentTarget.checked)} /></Group>{rouletteWinner ? <Stack align="center" gap={4}><Title order={3}>Jugador {rouletteWinner.fullName}, eliminado</Title><Text size="sm" c="dimmed">Código: {rouletteWinner.code}</Text></Stack> : rouletteSpinning ? <Title order={3} c="dimmed">{rouletteDisplayName}</Title> : <Text c="dimmed">Presioná elegir al azar para empezar</Text>}<Group justify="flex-end"><Button variant="default" onClick={closeRoulette}>Cerrar</Button><Button onClick={spinRoulette} disabled={!students.length || rouletteSpinning}>{rouletteSpinning ? "Girando…" : "Elegir al azar"}</Button></Group></Stack></Modal>
      <Modal opened={deleteCourseModal} onClose={() => { setDeleteCourseModal(false); setDeleteConfirmation(""); setDeleteCourseError(""); }} title="Eliminar curso" centered><Stack><Text c="red">Esta acción elimina permanentemente estudiantes, actividades y notas.</Text><Text size="sm">Escribí exactamente <b>{selectedCourse?.name}</b> para confirmar.</Text><TextInput label="Confirmación" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.currentTarget.value)} autoFocus />{deleteCourseError ? <Text c="red" size="sm" role="alert">{deleteCourseError}</Text> : null}<Group justify="flex-end"><Button variant="default" onClick={() => setDeleteCourseModal(false)}>Cancelar</Button><Button color="red" onClick={() => void handleDeleteCourse()} disabled={deleteConfirmation.trim() !== selectedCourse?.name}>Eliminar definitivamente</Button></Group></Stack></Modal>
      <Modal opened={courseModal} onClose={() => setCourseModal(false)} title="Crear curso" centered><Stack><TextInput label="Nombre del curso" placeholder="Ej. Cálculo I" value={name} onChange={(event) => setName(event.currentTarget.value)} required /><TextInput label="Semestre" value={semester} onChange={(event) => setSemester(event.currentTarget.value)} required /><Text size="sm" c="dimmed">Se crearán tres cortes abiertos. Podés cerrar o reabrir cada corte manualmente cuando quieras.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setCourseModal(false)}>Cancelar</Button><Button onClick={handleCreateCourse} disabled={!name.trim()}>Crear curso</Button></Group></Stack></Modal>
      <Modal opened={studentModal} onClose={() => setStudentModal(false)} title="Agregar estudiante" centered><Stack>{field("fullName", "Nombre completo")}{field("code", "Código")}{field("documentId", "Documento")}{field("institutionalEmail", "Correo institucional", "email")}{field("personalEmail", "Correo personal", "email")}<Group justify="flex-end"><Button variant="default" onClick={() => setStudentModal(false)}>Cancelar</Button><Button onClick={handleCreateStudent} disabled={Object.values(student).some((value) => !value.trim())}>Agregar</Button></Group></Stack></Modal>
      <Modal opened={templateModal} onClose={() => setTemplateModal(false)} title="Qué querés exportar" centered><Stack><Text size="sm" c="dimmed">Elegí las columnas de la plantilla y después el formato.</Text>{templateFieldOptions().map((column) => <Checkbox key={column.key} label={column.label} checked={templateColumns.includes(column.key)} onChange={(event) => toggleTemplateColumn(column.key, event.currentTarget.checked)} />)}<Text size="sm" c="dimmed">Formato</Text><Group><Button disabled={!templateColumns.length} onClick={() => downloadGradeTemplate("csv")}>CSV</Button><Button variant="light" disabled={!templateColumns.length} onClick={() => downloadGradeTemplate("xls")}>Excel (.xls)</Button></Group></Stack></Modal>
      <Modal opened={exportModal} onClose={() => setExportModal(false)} title={`Elegir columnas · Corte ${activePeriod?.number ?? ""}`} centered><Stack><Text size="sm" c="dimmed">Elegí qué información querés incluir en la imagen.</Text>{exportColumnOptions.map((column) => <Checkbox key={column.key} label={column.label} checked={exportColumns.includes(column.key)} onChange={(event) => { const checked = event.currentTarget.checked; setExportColumns((current) => { const safeCurrent = Array.isArray(current) ? current.filter((value): value is string => typeof value === "string") : []; return checked ? safeCurrent.includes(column.key) ? safeCurrent : [...safeCurrent, column.key] : safeCurrent.filter((key) => key !== column.key); }); }} />)}{exportError ? <Text size="sm" c="red">{exportError}</Text> : null}<Group justify="flex-end"><Button variant="default" onClick={() => setExportModal(false)}>Cancelar</Button><Button disabled={!hasExportSelection} onClick={exportPeriodImage}>Descargar imagen</Button></Group></Stack></Modal>
      <Modal opened={checkModal} onClose={() => { if (checkState !== "checking") setCheckModal(false); }} title="Verificar notas en el Campus" centered size="xl">
        <Stack>
          {checkState === "idle" ? <><Text size="sm">NOTAZOD va a leer cada grupo del Campus y comparar, estudiante por estudiante, la nota de cada corte con la "Nota del corte" de NOTAZOD. Solo se revisan los cortes que tienen notas en NOTAZOD. No se escribe ni se guarda nada en el Campus.</Text><Text size="sm" c="dimmed">Si el Campus te pide iniciar sesión, hacelo en su ventana.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setCheckModal(false)}>Cancelar</Button><Button color="teal" onClick={() => void runCheck()}>Verificar</Button></Group></> : null}
          {checkState === "checking" ? <Group wrap="nowrap"><Loader size="sm" /><Stack gap={2}><Text size="sm">Leyendo el Campus...</Text>{campusStatus ? <Text size="sm" c="dimmed">{campusStatus}</Text> : null}</Stack></Group> : null}
          {checkState === "error" ? <><Text c="red" size="sm" style={{ whiteSpace: "pre-wrap" }}>{checkError}</Text><Group justify="flex-end"><Button variant="default" onClick={() => setCheckModal(false)}>Cerrar</Button><Button onClick={() => void runCheck()}>Reintentar</Button></Group></> : null}
          {checkState === "done" ? (() => {
            const matched = checkGroups.filter((group) => group.status === "verified");
            const failed = checkGroups.filter((group) => group.status === "failed");
            const unmatched = checkGroups.length - matched.length - failed.length;
            const byCourse = [...new Set(matched.map((group) => group.course!))].map((course) => ({ course, rows: matched.filter((group) => group.course === course).flatMap((group) => group.rows) }));
            const pending = byCourse.reduce((sum, item) => sum + item.rows.filter((row) => row.state !== "uploaded").length, 0);
            return <>
              <Text fw={600} c={pending || failed.length ? "red" : "green"}>{pending || failed.length ? `Faltan ${pending} nota${pending === 1 ? "" : "s"} por subir o corregir${failed.length ? ` y ${failed.length} grupo${failed.length === 1 ? "" : "s"} no se pudo${failed.length === 1 ? "" : "ieron"} verificar` : ""}.` : "Todas las notas de NOTAZOD están subidas en el Campus."}</Text>
              {!byCourse.length ? <Text size="sm">Ningún grupo del Campus coincide con un curso de NOTAZOD.</Text> : null}
              {byCourse.map(({ course, rows }) => {
                const periods = [...new Set(rows.map((row) => row.period))].sort();
                const wrong = rows.filter((row) => row.state !== "uploaded");
                return <Card key={course} withBorder>
                  <Stack gap="xs">
                    <Group justify="space-between"><Text fw={600}>{course}</Text><Badge color={wrong.length ? "red" : "green"}>{wrong.length ? `${wrong.length} pendiente${wrong.length === 1 ? "" : "s"}` : "Todo subido"}</Badge></Group>
                    {periods.length ? <Group gap="xs">{periods.map((period) => { const inPeriod = rows.filter((row) => row.period === period); const ok = inPeriod.filter((row) => row.state === "uploaded").length; return <Badge key={period} variant="light" color={ok === inPeriod.length ? "green" : "red"}>Corte {period}: {ok}/{inPeriod.length} subidas</Badge>; })}</Group> : <Text size="sm" c="dimmed">Este curso todavía no tiene notas en NOTAZOD.</Text>}
                    {wrong.length ? <Table striped withTableBorder><Table.Thead><Table.Tr><Table.Th>Corte</Table.Th><Table.Th>Código</Table.Th><Table.Th>Estudiante</Table.Th><Table.Th>Campus</Table.Th><Table.Th>NOTAZOD</Table.Th><Table.Th>Estado</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{wrong.map((row) => <Table.Tr key={`${row.period}-${row.code}`}><Table.Td>{row.period}</Table.Td><Table.Td>{row.code}</Table.Td><Table.Td>{row.name}</Table.Td><Table.Td>{row.campus || "—"}</Table.Td><Table.Td>{row.notazod}</Table.Td><Table.Td>{row.state === "missing" ? <Badge color="red" variant="light">Falta</Badge> : <Badge color="orange" variant="light">Distinta</Badge>}</Table.Td></Table.Tr>)}</Table.Tbody></Table> : null}
                  </Stack>
                </Card>;
              })}
              {failed.map((group) => <Text key={group.key} size="sm" c="red">No se pudo verificar {group.key}: {group.reason}{group.missingCodes?.length ? ` (${group.missingCodes.join(", ")})` : ""}</Text>)}
              {unmatched ? <Text size="sm" c="dimmed">{unmatched} grupo{unmatched === 1 ? "" : "s"} del Campus sin curso en NOTAZOD.</Text> : null}
              <Group justify="flex-end"><Button variant="default" onClick={() => void runCheck()}>Verificar de nuevo</Button><Button onClick={() => setCheckModal(false)}>Cerrar</Button></Group>
            </>;
          })() : null}
        </Stack>
      </Modal>

      <Modal opened={syncModal} onClose={() => { if (syncState !== "reading" && syncState !== "applying") setSyncModal(false); }} title="Sincronizar cursos desde el Campus" centered size="xl">
        <Stack>
          {syncState === "idle" ? <><Text size="sm">NOTAZOD va a leer cada grupo de "Información estudiantes" del Campus. Los grupos que ya tenés como curso solo suman los estudiantes que falten; los demás se crean como cursos nuevos del semestre {currentSemester()}. Los cortes ya cerrados en el Campus se importan como "Nota del Campus" solo si en NOTAZOD ese corte todavía no tiene notas. También se actualizan el programa, horario y salón de cada grupo. No se borra ninguna nota.</Text><Text size="sm" c="dimmed">Primero vas a ver una vista previa. Si el Campus te pide iniciar sesión, hacelo en su ventana.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setSyncModal(false)}>Cancelar</Button><Button color="green" onClick={() => void readCourseSync()}>Leer el Campus</Button></Group></> : null}
          {syncState === "reading" || syncState === "applying" ? <Group wrap="nowrap"><Loader size="sm" /><Stack gap={2}><Text size="sm">{syncState === "reading" ? "Leyendo el Campus..." : "Creando cursos y estudiantes..."}</Text>{syncState === "reading" && campusStatus ? <Text size="sm" c="dimmed">{campusStatus}</Text> : null}</Stack></Group> : null}
          {syncState === "error" ? <><Text c="red" size="sm" style={{ whiteSpace: "pre-wrap" }}>{syncError}</Text><Group justify="flex-end"><Button variant="default" onClick={() => setSyncModal(false)}>Cerrar</Button><Button onClick={() => void readCourseSync()}>Reintentar</Button></Group></> : null}
          {syncState === "preview" ? (() => {
            const pending = syncPlan.filter((action) => action.kind !== "conflict");
            const students = pending.reduce((sum, action) => sum + action.toAdd.length, 0);
            return <>
              {syncPlan.map((action) => <Card key={action.groupKeys.join("+")} withBorder><Stack gap="xs">
                <Group justify="space-between" wrap="nowrap"><Text fw={700} size="sm">{action.kind === "conflict" ? action.groupKeys[0] : action.courseName}</Text><Badge color={action.kind === "create" ? "blue" : action.kind === "conflict" ? "red" : action.toAdd.length || action.periodImports.length ? "green" : "gray"}>{action.kind === "create" ? "Curso nuevo" : action.kind === "conflict" ? "No se toca" : action.toAdd.length ? `Agregar ${action.toAdd.length}` : action.periodImports.length ? "Importar notas" : "Actualizar datos"}</Badge></Group>
                {action.kind !== "conflict" ? <Text size="xs" c="dimmed">Grupos del Campus: {action.campusGroups.map((group) => `${group.group} · ${group.program} · ${group.schedule} · ${group.room}`).join("; ")}</Text> : <Text size="sm" c="red">{action.reason}</Text>}
                {action.kind !== "conflict" && action.toAdd.length ? <Table striped withTableBorder><Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Documento</Table.Th><Table.Th>Correo institucional</Table.Th><Table.Th>Correo personal</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{action.toAdd.map((student) => <Table.Tr key={student.code}><Table.Td>{student.code}</Table.Td><Table.Td>{student.fullName}</Table.Td><Table.Td>{student.documentId}</Table.Td><Table.Td>{student.institutionalEmail}</Table.Td><Table.Td>{student.personalEmail}</Table.Td></Table.Tr>)}</Table.Tbody></Table> : null}
                {action.kind !== "conflict" && action.skipped.length ? <Text size="sm" c="orange">No se agregan: {action.skipped.map((item) => `${item.row.code || item.row.fullName} (${item.reason})`).join("; ")}</Text> : null}
                {action.kind !== "conflict" ? action.periodImports.map((item) => <Text key={item.period} size="sm" c="blue">Corte {item.period}: se importan {item.grades.length} notas del Campus como actividad "Nota del Campus" (Actividades 100%) y el corte queda cerrado.</Text>) : null}
                {action.kind !== "conflict" ? action.periodSkips.map((item) => <Text key={`${item.period}-${item.reason}`} size="sm" c="dimmed">{item.period ? `Corte ${item.period}: ` : ""}{item.reason}</Text>) : null}
                {action.kind === "add" && action.notInCampus.length ? <Text size="sm" c="orange">En NOTAZOD pero no en el Campus (no se borran): {action.notInCampus.join(", ")}</Text> : null}
              </Stack></Card>)}
              <Text size="sm">{pending.length ? `Se van a crear o completar ${pending.length} curso${pending.length === 1 ? "" : "s"} con ${students} estudiante${students === 1 ? "" : "s"}. Antes se guarda una copia de seguridad.` : "No hay nada para agregar: tus cursos ya están al día."}</Text>
              <Group justify="flex-end"><Button variant="default" onClick={() => setSyncModal(false)}>Cancelar</Button><Button color="green" disabled={!pending.length} onClick={() => void applySync()}>Sincronizar</Button></Group>
            </>;
          })() : null}
          {syncState === "done" ? <>{syncResults.map((result) => <Text key={result.courseName} size="sm" c={result.failed.length ? "orange" : undefined}>{result.courseName}: {result.created ? "curso creado, " : ""}{result.added} estudiante{result.added === 1 ? "" : "s"} agregado{result.added === 1 ? "" : "s"}{result.failed.length ? ` · no se pudieron agregar: ${result.failed.map((item) => item.code).join(", ")}` : ""}{result.imported.map((item) => ` · corte ${item.period}: ${item.grades} notas importadas y cerrado`).join("")}{result.importSkipped.map((item) => ` · ${item.period ? `corte ${item.period}: ` : ""}${item.reason}`).join("")}</Text>)}<Group justify="flex-end"><Button onClick={() => setSyncModal(false)}>Cerrar</Button></Group></> : null}
        </Stack>
      </Modal>
      <Modal opened={campusModal} onClose={() => { if (campusState !== "checking" && campusState !== "saving") setCampusModal(false); }} title={`Subir al Campus · ${selectedCourse?.name ?? ""}`} centered size="xl">
        <Stack>
          {campusState === "idle" ? <><Text size="sm">NOTAZOD va a abrir el Campus en una ventana propia, buscar los grupos de este curso y comparar cada estudiante por código. Primero vas a ver una vista previa: nada se guarda hasta que lo confirmes.</Text><Text size="sm" c="dimmed">Si el Campus te pide iniciar sesión, ingresá usuario, contraseña y código en esa ventana. NOTAZOD sigue solo cuando entrás.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setCampusModal(false)}>Cancelar</Button><Button color="green" onClick={() => void runCampus(false)}>Verificar en el Campus</Button></Group></> : null}
          {campusState === "checking" || campusState === "saving" ? <Group wrap="nowrap"><Loader size="sm" /><Stack gap={2}><Text size="sm">{campusState === "checking" ? "Verificando en el Campus..." : "Guardando en el Campus..."}</Text>{campusStatus ? <Text size="sm" c="dimmed">{campusStatus}</Text> : null}</Stack></Group> : null}
          {campusState === "error" ? <><Text c="red" size="sm" style={{ whiteSpace: "pre-wrap" }}>{campusError}</Text><Group justify="flex-end"><Button variant="default" onClick={() => setCampusModal(false)}>Cerrar</Button><Button onClick={() => void runCampus(false)}>Reintentar verificación</Button></Group></> : null}
          {(campusState === "preview" || campusState === "done") && campusReport ? (() => {
            const done = campusState === "done";
            const scoped = campusReport.groups.filter((group) => group.inScope);
            const verified = scoped.filter((group) => group.status === "verified");
            const changes = verified.reduce((sum, group) => sum + group.rows.filter((row) => row.campus !== row.notazod).length, 0);
            const campusCodes = new Set(scoped.flatMap((group) => group.rows.map((row) => row.code)));
            const notInCampus = [...new Set(scoped.flatMap((group) => group.notInCampus ?? []))].filter((code) => !campusCodes.has(code));
            return <>
              {campusReport.stoppedWith ? <Text c="red" size="sm">Se detuvo: {campusReport.stoppedWith}</Text> : null}
              {!scoped.length ? <Text size="sm">Ningún grupo del Campus coincide con los estudiantes de este curso.</Text> : null}
              {scoped.map((group) => <Card key={group.key} withBorder><Stack gap="xs">
                <Group justify="space-between" wrap="nowrap"><Text fw={700} size="sm">{group.key}</Text>{done && group.status === "verified" ? <Badge color={group.saved ? "green" : "red"}>{group.saved ? "Guardado y confirmado" : "No confirmado"}</Badge> : <Badge color={group.status === "verified" ? "green" : "red"}>{group.status === "verified" ? "Verificado" : "No verificado"}</Badge>}</Group>
                <Text size="xs" c="dimmed">Columna abierta en el Campus: {group.openColumn ? `Nota ${group.openColumn}` : "ninguna"}{group.notazodPeriodClosed === false ? " · Atención: el corte sigue abierto en NOTAZOD" : ""}</Text>
                {group.reason ? <Text size="sm" c="red">{group.reason}</Text> : null}
                {group.missingCodes?.length ? <Text size="sm" c="red">Códigos que no están en NOTAZOD: {group.missingCodes.join(", ")}</Text> : null}
                {group.rows.length ? <Table striped withTableBorder><Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Estudiante</Table.Th><Table.Th>{done ? "Antes" : "Campus"}</Table.Th><Table.Th>{done ? "Guardada" : "NOTAZOD"}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{group.rows.map((row) => <Table.Tr key={row.code}><Table.Td>{row.code}</Table.Td><Table.Td>{row.name}</Table.Td><Table.Td>{row.campus}</Table.Td><Table.Td>{row.confirmed === false ? <Badge color="red">{row.notazod} sin confirmar</Badge> : row.campus !== row.notazod ? <Badge color="blue" variant="light">{row.notazod}</Badge> : row.notazod}</Table.Td></Table.Tr>)}</Table.Tbody></Table> : null}
              </Stack></Card>)}
              {notInCampus.length ? <Text size="sm" c="orange">Estudiantes de NOTAZOD que no aparecen en el Campus: {notInCampus.join(", ")}</Text> : null}
              {done ? <Group justify="flex-end"><Button onClick={() => setCampusModal(false)}>Cerrar</Button></Group> : <>
                <Text size="sm" c={campusReport.canSave ? undefined : "red"}>{campusReport.canSave ? `Se van a guardar ${changes} nota${changes === 1 ? "" : "s"} nueva${changes === 1 ? "" : "s"} o cambiada${changes === 1 ? "" : "s"} en ${verified.length} grupo${verified.length === 1 ? "" : "s"} del Campus.` : "No se puede guardar: hay grupos de este curso sin verificar."}</Text>
                <Group justify="flex-end"><Button variant="default" onClick={() => setCampusModal(false)}>Cancelar</Button><Button color="green" disabled={!campusReport.canSave} onClick={() => void runCampus(true)}>Guardar en el Campus</Button></Group>
              </>}
            </>;
          })() : null}
        </Stack>
      </Modal>
      <Modal opened={renameModal} onClose={() => { setRenameModal(false); setDeleteActivityConfirm(false); setDeleteActivityError(""); }} title="Editar actividad" centered><Stack>{deleteActivityConfirm ? <><Text c="red">Vas a eliminar <b>{renameItem?.name}</b> de este corte.</Text><Text size="sm">{renameItemGradeCount ? `Se borrarán también ${renameItemGradeCount} nota${renameItemGradeCount === 1 ? "" : "s"} registrada${renameItemGradeCount === 1 ? "" : "s"} en esta actividad.` : "Esta actividad no tiene notas registradas."} Antes de eliminar se guarda una copia de seguridad interna.</Text>{deleteActivityError ? <Text c="red" size="sm" role="alert">{deleteActivityError}</Text> : null}<Group justify="flex-end"><Button variant="default" onClick={() => { setDeleteActivityConfirm(false); setDeleteActivityError(""); }}>Volver</Button><Button color="red" onClick={() => void handleDeleteActivity()}>Eliminar actividad</Button></Group></> : <><TextInput label="Nombre" value={renameName} onChange={(event) => setRenameName(event.currentTarget.value)} autoFocus /><Group justify="space-between">{renameItem && !renameItem.isExam ? <Button variant="subtle" color="red" onClick={() => setDeleteActivityConfirm(true)}>Eliminar actividad</Button> : <div />}<Group><Button variant="default" onClick={() => setRenameModal(false)}>Cancelar</Button><Button onClick={() => void handleRenameActivity()} disabled={!renameName.trim()}>Guardar</Button></Group></Group></>}</Stack></Modal>
      <Modal opened={activityModal} onClose={() => setActivityModal(false)} title={`Agregar actividad · Corte ${activePeriod?.number ?? ""}`} centered><Stack><TextInput label="Nombre de la actividad" placeholder="Ej. Taller 2" value={activityName} onChange={(event) => setActivityName(event.currentTarget.value)} autoFocus required /><Group justify="flex-end"><Button variant="default" onClick={() => setActivityModal(false)}>Cancelar</Button><Button onClick={() => void handleCreateActivity()} disabled={!activityName.trim()}>Agregar</Button></Group></Stack></Modal>
      <Modal opened={splitModal} onClose={() => setSplitModal(false)} title={`Porcentajes · Corte ${activePeriod?.number ?? ""}`} centered><Stack><Text size="sm" c="dimmed">La suma debe ser exactamente 100%.</Text><NumberInput label="Actividades" suffix=" %" min={0} max={100} value={activityPercent} onChange={(value) => { const next = typeof value === "number" ? value : 0; setActivityPercent(next); setExamPercent(100 - next); }} /><NumberInput label={examLabel} suffix=" %" min={0} max={100} value={examPercent} onChange={(value) => { const next = typeof value === "number" ? value : 0; setExamPercent(next); setActivityPercent(100 - next); }} /><Text c={activityPercent + examPercent === 100 ? "green" : "red"}>Total: {activityPercent + examPercent}%</Text><Group justify="flex-end"><Button variant="default" onClick={() => setSplitModal(false)}>Cancelar</Button><Button onClick={() => void saveSplit()} disabled={activityPercent + examPercent !== 100}>Guardar</Button></Group></Stack></Modal>
      <Modal opened={groupManageModal} onClose={() => { setGroupManageModal(false); setRenameGroupTarget(null); setRenameGroupName(""); }} title={`Grupos · Corte ${activePeriod?.number ?? ""}`} centered>
        <Stack>
          {activeState === "locked" ? <Text size="sm" c="dimmed">Este corte está cerrado. No se pueden crear, renombrar ni eliminar grupos.</Text> : null}
          <Group align="flex-end">
            <TextInput label="Nombre del grupo" placeholder="Ej. Grupo 1 (vacío = automático)" value={newGroupName} onChange={(event) => setNewGroupName(event.currentTarget.value)} disabled={activeState === "locked"} />
            <Button onClick={() => void handleCreateGroup()} disabled={activeState === "locked"}>Crear</Button>
          </Group>
          <Stack gap="xs">
            {groups.length ? groups.map((group) => (
              <Group key={group.id} justify="space-between">
                {renameGroupTarget?.id === group.id ? (
                  <Group>
                    <TextInput value={renameGroupName} onChange={(event) => setRenameGroupName(event.currentTarget.value)} autoFocus />
                    <Button size="xs" onClick={() => void handleRenameGroup()} disabled={!renameGroupName.trim()}>Guardar</Button>
                    <Button size="xs" variant="default" onClick={() => { setRenameGroupTarget(null); setRenameGroupName(""); }}>Cancelar</Button>
                  </Group>
                ) : (
                  <>
                    <Text>{group.name}</Text>
                    <Group gap="xs">
                      <Button size="xs" variant="default" onClick={() => openRenameGroup(group)} disabled={activeState === "locked"}>Renombrar</Button>
                      <Button size="xs" color="red" variant="subtle" onClick={() => openDeleteGroupConfirm(group)} disabled={activeState === "locked"}>Eliminar</Button>
                    </Group>
                  </>
                )}
              </Group>
            )) : <Text size="sm" c="dimmed">Todavía no hay grupos en este corte.</Text>}
          </Stack>
          <Group justify="flex-end"><Button variant="default" onClick={() => setGroupManageModal(false)}>Cerrar</Button></Group>
        </Stack>
      </Modal>
      <Modal opened={copyGroupsSourceModal} onClose={closeCopyGroupsModal} title="Copiar grupos desde otro corte" centered>
        <Stack>
          <Select label="Corte de origen" placeholder="Elegí un corte" data={periods.filter((period) => period.id !== activePeriod?.id).map((period) => ({ value: period.id, label: `Corte ${period.number}` }))} value={copyGroupsSourceId} onChange={(value) => { setCopyGroupsSourceId(value); setCopyGroupsError(""); }} />
          {copyGroupsError ? <Text size="sm" c="red">{copyGroupsError}</Text> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeCopyGroupsModal}>Cancelar</Button>
            <Button onClick={requestCopyGroups} disabled={!copyGroupsSourceId}>Copiar grupos</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={copyGroupsConfirm} onClose={() => setCopyGroupsConfirm(false)} title="Reemplazar grupos del corte" centered>
        <Stack>
          <Text size="sm">Este corte ya tiene grupos. Copiar desde otro corte reemplaza la organización actual (grupos y asignaciones). Esta acción no se puede deshacer.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCopyGroupsConfirm(false)}>Cancelar</Button>
            <Button color="red" onClick={() => void handleCopyGroups()}>Reemplazar</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={!!deleteGroupTarget} onClose={() => setDeleteGroupTarget(null)} title="Eliminar grupo" centered>
        <Stack>
          <Text size="sm">¿Seguro que querés eliminar el grupo "{deleteGroupTarget?.name}"? Esta acción no se puede deshacer.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteGroupTarget(null)}>Cancelar</Button>
            <Button color="red" onClick={() => { if (deleteGroupTarget) { void handleDeleteGroup(deleteGroupTarget.id); } setDeleteGroupTarget(null); }}>Eliminar</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={groupGradeModal} onClose={() => setGroupGradeModal(false)} title="Calificar grupo" centered>
        <Stack>
          {activeState === "locked" ? <Text size="sm" c="dimmed">Este corte está cerrado. No se pueden calificar grupos.</Text> : null}
          <Select label="Grupo" placeholder="Elegí un grupo" data={groups.map((group) => ({ value: group.id, label: group.name }))} value={groupGradeGroupId} onChange={(value) => { setGroupGradeGroupId(value); setGroupGradeError(""); }} disabled={activeState === "locked"} />
          <Select label="Actividad" placeholder="Elegí una actividad" data={gradeItems.map((item) => ({ value: item.id, label: item.name }))} value={groupGradeItemId} onChange={(value) => { setGroupGradeItemId(value); setGroupGradeError(""); }} disabled={activeState === "locked"} />
          <TextInput label="Nota (0,0 a 5,0)" value={groupGradeValue} error={groupGradeError} inputMode="decimal" onChange={(event) => { setGroupGradeValue(event.currentTarget.value); setGroupGradeError(""); }} disabled={activeState === "locked"} />
          <Text size="xs" c="dimmed">Dejar la nota vacía la marca como pendiente para todos los integrantes del grupo.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setGroupGradeModal(false)}>Cancelar</Button>
            <Button onClick={() => void handleSaveGroupGrade()} disabled={activeState === "locked"}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={gradeModal} onClose={() => setGradeModal(false)} title={gradeItem ? `Calificar · ${gradeItem.name}` : "Calificar"} centered size="560px" onKeyDown={(event) => { const key = event.key.toLowerCase(); if (key === "enter") { event.preventDefault(); if (event.ctrlKey) { void clearGrade(event.shiftKey ? -1 : 1); } else { void commitGrade(event.shiftKey ? -1 : 1); } return; } if (key === "escape") { event.preventDefault(); setGradeModal(false); return; } if (key === "l") { event.preventDefault(); void commitGrade(1); return; } if (key === "h") { event.preventDefault(); void commitGrade(-1); return; } if (key === "z" && event.ctrlKey) { event.preventDefault(); void undoGrade(); return; } }}><Stack><Text c="dimmed">{(() => { const indexes = gradeItem ? gradeableStudentIndexes(gradeItem.id) : []; const position = indexes.indexOf(gradeIndex); return position >= 0 ? `Por calificar ${position + 1} de ${indexes.length}` : "Editando estudiante"; })()}</Text><Title order={3}>{students[gradeIndex]?.fullName}</Title><Text size="sm" c="dimmed">Código {students[gradeIndex]?.code}</Text><TextInput ref={gradeInputRef} label="Nota (0,0 a 5,0)" value={gradeValue} error={gradeError} autoFocus inputMode="decimal" onChange={(event) => { setGradeValue(event.currentTarget.value); setGradeError(""); }} /><Group justify="space-between" wrap="nowrap"><Button variant="default" onClick={() => void commitGrade(-1)} disabled={gradeIndex === 0}>Anterior <span className="shortcut">Shift+Enter · H</span></Button><Button variant="light" color="gray" onClick={() => void clearGrade(1)}>Quitar nota <span className="shortcut">Ctrl+Enter</span></Button><Button onClick={() => void commitGrade(1)}>Siguiente <span className="shortcut">Enter · L</span></Button></Group><Group justify="space-between"><Button variant="subtle" onClick={openGradeHistory} disabled={!gradeHistory.length}>Historial</Button><Button variant="subtle" color="orange" onClick={() => void undoGrade()} disabled={activeState === "locked" || !gradeHistory.some((entry) => !entry.undone)}>Deshacer <span className="shortcut">Ctrl+Z</span></Button></Group></Stack></Modal>
      <Modal opened={gradeHistoryModal} onClose={() => setGradeHistoryModal(false)} title={gradeItem ? `Historial · ${students[gradeIndex]?.fullName} · ${gradeItem.name}` : "Historial"} centered>
        <Stack>
          {gradeHistory.length ? gradeHistory.map((entry) => (
            <Group key={entry.id} justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text size="sm">{entry.action === "save" ? "Nota guardada" : "Nota eliminada"}{entry.undone ? " · Deshecho" : ""}</Text>
                <Text size="xs" c="dimmed">{formatHistoryState(entry.previousValue, entry.previousPending)} → {formatHistoryState(entry.newValue, entry.newPending)}</Text>
              </Stack>
              <Text size="xs" c="dimmed">{new Date(entry.createdAt).toLocaleString()}</Text>
            </Group>
          )) : <Text size="sm" c="dimmed">Sin historial para este estudiante y actividad.</Text>}
          <Group justify="flex-end"><Button variant="default" onClick={() => setGradeHistoryModal(false)}>Cerrar</Button></Group>
        </Stack>
      </Modal>
    </AppShell>
  );
}

export default App;
