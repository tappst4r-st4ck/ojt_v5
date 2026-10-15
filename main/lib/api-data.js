import { appendRecord, deleteRecord, listRecords, updateRecord } from "./google-sheets";
import { requireHeadTrainer } from "./auth";
import {
  hasScheduleConflict,
  redactFacultyContacts,
  validateRecord as validateRecordShape,
} from "./record-validation.mjs";

const collections = new Set(["Diplomas", "Master Schedule", "Faculty", "Courses"]);

export function isCollection(value) {
  return collections.has(value);
}

export function validateRecord(collection, record, { requireId = true } = {}) {
  return validateRecordShape(collection, record, { requireId });
}

export async function getPublicRecords(collection) {
  const records = await listRecords(collection);
  if (collection !== "Faculty") return records;
  const { user } = await requireHeadTrainer();
  if (user) return records;
  return redactFacultyContacts(records);
}

export async function createRecord(collection, record) {
  const invalid = validateRecord(collection, record);
  if (invalid) return { error: invalid, status: 400 };
  const records = await listRecords(collection);
  if (records.some(existing => String(existing.id) === String(record.id))) {
    return { error: "A record with this ID already exists.", status: 409 };
  }
  if (collection === "Diplomas" && records.some(existing =>
    String(existing.code).toLowerCase() === String(record.code).trim().toLowerCase() ||
    String(existing.name).toLowerCase() === String(record.name).trim().toLowerCase()
  )) {
    return { error: "A diploma with this code or name already exists.", status: 409 };
  }
  if (collection === "Faculty" && records.some(existing =>
    String(existing.email).toLowerCase() === String(record.email).trim().toLowerCase()
  )) {
    return { error: "A faculty record with this email already exists.", status: 409 };
  }
  if (collection === "Courses" && records.some(existing =>
    String(existing.diplomaCode) === String(record.diplomaCode) &&
    String(existing.code).toLowerCase() === String(record.code).trim().toLowerCase()
  )) {
    return { error: "A course with this code already exists in the diploma.", status: 409 };
  }
  if (collection === "Master Schedule" && hasScheduleConflict(records, record)) {
    return { error: "That timetable slot is already assigned.", status: 409 };
  }
  await appendRecord(collection, record);
  return { record };
}

export async function replaceRecord(collection, id, record) {
  const invalid = validateRecord(collection, record, { requireId: false });
  if (invalid) return { error: invalid, status: 400 };
  const records = await listRecords(collection);
  const existing = records.find(item => String(item.id) === String(id));
  if (!existing) return { error: "Record not found.", status: 404 };
  const updated = { ...record, id: existing.id };
  if (collection === "Diplomas" && records.some(item => String(item.id) !== String(id) && (
    String(item.code).toLowerCase() === String(updated.code).trim().toLowerCase() ||
    String(item.name).toLowerCase() === String(updated.name).trim().toLowerCase()
  ))) {
    return { error: "A diploma with this code or name already exists.", status: 409 };
  }
  if (collection === "Faculty" && records.some(item =>
    String(item.id) !== String(id) &&
    String(item.email).toLowerCase() === String(updated.email).trim().toLowerCase()
  )) {
    return { error: "A faculty record with this email already exists.", status: 409 };
  }
  if (collection === "Courses" && records.some(item =>
    String(item.id) !== String(id) &&
    String(item.diplomaCode) === String(updated.diplomaCode) &&
    String(item.code).toLowerCase() === String(updated.code).trim().toLowerCase()
  )) {
    return { error: "A course with this code already exists in the diploma.", status: 409 };
  }
  if (collection === "Master Schedule" && hasScheduleConflict(records, updated, id)) {
    return { error: "That timetable slot is already assigned.", status: 409 };
  }
  await updateRecord(collection, existing.rowNumber, updated);
  return { record: updated };
}

export async function removeRecord(collection, id) {
  const records = await listRecords(collection);
  const existing = records.find(item => String(item.id) === String(id));
  if (!existing) return { error: "Record not found.", status: 404 };
  await deleteRecord(collection, existing.rowNumber);
  return {};
}

export async function authorizedMutation() {
  return requireHeadTrainer();
}
