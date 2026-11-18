import { appendRecord, deleteRecord, listRecords, updateRecord, withSheetLock } from "./google-sheets";
import { requireHeadTrainer } from "./auth";
import {
  findRecordConflict,
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

// Writes hold the tab lock and read fresh rows, so the row number written to
// can't shift underneath a concurrent edit or delete.
export async function createRecord(collection, record) {
  const invalid = validateRecord(collection, record);
  if (invalid) return { error: invalid, status: 400 };
  return withSheetLock(collection, async () => {
    const records = await listRecords(collection, { fresh: true });
    if (records.some(existing => String(existing.id) === String(record.id))) {
      return { error: "A record with this ID already exists.", status: 409 };
    }
    const conflict = findRecordConflict(collection, records, record);
    if (conflict) return { error: conflict, status: 409 };
    await appendRecord(collection, record);
    return { record };
  });
}

export async function replaceRecord(collection, id, record) {
  const invalid = validateRecord(collection, record, { requireId: false });
  if (invalid) return { error: invalid, status: 400 };
  return withSheetLock(collection, async () => {
    const records = await listRecords(collection, { fresh: true });
    const existing = records.find(item => String(item.id) === String(id));
    if (!existing) return { error: "Record not found.", status: 404 };
    const updated = { ...record, id: existing.id };
    const conflict = findRecordConflict(collection, records, updated, id);
    if (conflict) return { error: conflict, status: 409 };
    await updateRecord(collection, existing.rowNumber, updated);
    return { record: updated };
  });
}

export async function removeRecord(collection, id) {
  return withSheetLock(collection, async () => {
    const records = await listRecords(collection, { fresh: true });
    const existing = records.find(item => String(item.id) === String(id));
    if (!existing) return { error: "Record not found.", status: 404 };
    await deleteRecord(collection, existing.rowNumber);
    return {};
  });
}

export async function authorizedMutation() {
  return requireHeadTrainer();
}
