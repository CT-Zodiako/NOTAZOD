import type { Student } from "./db";

export type StudentDraft = Omit<Student, "id" | "courseId">;
export type StudentValidation = Partial<Record<keyof StudentDraft, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStudent(student: StudentDraft, existing: Student[] = []): StudentValidation {
  const errors: StudentValidation = {};
  const required: Array<keyof StudentDraft> = ["fullName", "code", "documentId", "institutionalEmail", "personalEmail"];
  required.forEach((key) => { if (!student[key].trim()) errors[key] = "Este campo es obligatorio."; });
  ["institutionalEmail", "personalEmail"].forEach((key) => {
    const field = key as "institutionalEmail" | "personalEmail";
    if (student[field].trim() && !emailPattern.test(student[field].trim())) errors[field] = "Escribí un correo válido.";
  });
  const unique: Array<keyof StudentDraft> = ["code", "documentId", "institutionalEmail", "personalEmail"];
  unique.forEach((key) => {
    if (student[key].trim() && existing.some((item) => item[key].toLowerCase() === student[key].trim().toLowerCase())) {
      errors[key] = "Ya existe en este curso.";
    }
  });
  return errors;
}

export function hasErrors(errors: StudentValidation) {
  return Object.keys(errors).length > 0;
}

const uniqueFields = [
  { key: "code", label: "Código" },
  { key: "documentId", label: "Documento" },
  { key: "institutionalEmail", label: "Correo institucional" },
  { key: "personalEmail", label: "Correo personal" },
] as const;

type Owner = { fullName: string; code: string; where: "en este curso" | "en esta misma lista" };

// Uniqueness is per course: a student may be in several courses with the same data. Inside one course no
// two students may share a code, document or email. One student may repeat an email in both email fields.
function findClash(row: StudentDraft, owners: Map<string, Owner>) {
  const values = uniqueFields.map(({ key, label }) => ({ label, value: row[key].trim(), lower: row[key].trim().toLowerCase() }));
  for (const [i, a] of values.entries()) {
    for (const b of values.slice(i + 1)) {
      const bothEmails = a.label.startsWith("Correo") && b.label.startsWith("Correo");
      if (a.lower === b.lower && !bothEmails) return `${a.label} y ${b.label.toLowerCase()} son iguales (${a.value}).`;
    }
  }
  for (const { label, value, lower } of values) {
    const owner = owners.get(lower);
    if (owner) return `${label} ${value} ya lo tiene ${owner.fullName} (${owner.code}) ${owner.where}.`;
  }
  return null;
}

export function classifyStudentRows(rows: StudentDraft[], existing: Student[]) {
  const valid: StudentDraft[] = [];
  const incomplete: Array<{ row: StudentDraft; reason: string }> = [];
  const invalid: Array<{ row: StudentDraft; reason: string }> = [];
  const duplicate: Array<{ row: StudentDraft; reason: string }> = [];
  const owners = new Map<string, Owner>();
  const claim = (student: StudentDraft, where: Owner["where"]) => uniqueFields.forEach(({ key }) => {
    const lower = student[key].trim().toLowerCase();
    if (!owners.has(lower)) owners.set(lower, { fullName: student.fullName, code: student.code, where });
  });
  existing.forEach((item) => claim(item, "en este curso"));

  rows.forEach((row) => {
    const required: Array<keyof StudentDraft> = ["fullName", "code", "documentId", "institutionalEmail", "personalEmail"];
    const missing = required.filter((key) => !row[key].trim());
    if (missing.length) { incomplete.push({ row, reason: `Falta: ${missing.join(", ")}.` }); return; }
    const badEmail = [row.institutionalEmail, row.personalEmail].find((email) => !emailPattern.test(email));
    if (badEmail) { invalid.push({ row, reason: `Correo inválido: ${badEmail}.` }); return; }
    const clash = findClash(row, owners);
    if (clash) { duplicate.push({ row, reason: clash }); return; }
    claim(row, "en esta misma lista");
    valid.push(row);
  });
  return { valid, incomplete, invalid, duplicate };
}
