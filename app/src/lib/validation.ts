import { Student } from "./db";

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

export function classifyStudentRows(rows: StudentDraft[], existing: Student[]) {
  const valid: StudentDraft[] = [];
  const incomplete: Array<{ row: StudentDraft; reason: string }> = [];
  const invalid: Array<{ row: StudentDraft; reason: string }> = [];
  const duplicate: Array<{ row: StudentDraft; reason: string }> = [];
  const seen = new Set(existing.flatMap((item) => [item.code, item.documentId, item.institutionalEmail, item.personalEmail].map((value) => value.toLowerCase())));

  rows.forEach((row) => {
    const required: Array<keyof StudentDraft> = ["fullName", "code", "documentId", "institutionalEmail", "personalEmail"];
    const missing = required.filter((key) => !row[key].trim());
    if (missing.length) { incomplete.push({ row, reason: `Falta: ${missing.join(", ")}.` }); return; }
    const badEmail = [row.institutionalEmail, row.personalEmail].find((email) => !emailPattern.test(email));
    if (badEmail) { invalid.push({ row, reason: `Correo inválido: ${badEmail}.` }); return; }
    const values = [row.code, row.documentId, row.institutionalEmail, row.personalEmail].map((value) => value.toLowerCase());
    if (values.some((value) => seen.has(value)) || new Set(values).size !== values.length) {
      duplicate.push({ row, reason: "Coincide con un estudiante existente o repetido en el archivo." }); return;
    }
    values.forEach((value) => seen.add(value));
    valid.push(row);
  });
  return { valid, incomplete, invalid, duplicate };
}
