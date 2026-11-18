import "server-only";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { getSharedRedis } from "./shared-redis.mjs";
import { findRecordConflict, validateRecord } from "./record-validation.mjs";
import { runWithLocalLock } from "./security-state.mjs";

// Reads are cached briefly so page loads don't exhaust the Sheets read quota
// (60 reads/min for the service account). Anything that writes reads fresh.
const CACHE_TTL_SECONDS = 30;
const LOCK_TTL_MS = 60_000;
const localCache = new Map();
const localLocks = new Map();
const inflightReads = new Map();
const RELEASE_LOCK_SCRIPT = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0`;

function sheetKey(kind, tab) {
  return `tesda:${kind}:${process.env.GOOGLE_SHEETS_ID}:${tab}`;
}

async function readCachedRows(tab) {
  const redis = getSharedRedis();
  if (redis) {
    try {
      return await redis.get(sheetKey("sheet", tab));
    } catch {
      return null;
    }
  }
  const entry = localCache.get(tab);
  return entry && entry.expiresAt > Date.now() ? entry.rows : null;
}

async function writeCachedRows(tab, rows) {
  const redis = getSharedRedis();
  if (redis) {
    await redis.set(sheetKey("sheet", tab), rows, { ex: CACHE_TTL_SECONDS }).catch(() => {});
    return;
  }
  localCache.set(tab, { rows, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 });
}

async function invalidateCachedRows(tab) {
  localCache.delete(tab);
  await getSharedRedis()?.del(sheetKey("sheet", tab)).catch(() => {});
}

// Serializes writes to one tab across all server instances, so row numbers
// read inside fn stay valid until fn finishes.
export async function withSheetLock(tab, fn) {
  const redis = getSharedRedis();
  if (!redis) return runWithLocalLock(localLocks, tab, fn);

  const key = sheetKey("lock", tab);
  const token = randomUUID();
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await redis.set(key, token, { nx: true, px: LOCK_TTL_MS })) {
      try {
        return await fn();
      } finally {
        await redis.eval(RELEASE_LOCK_SCRIPT, [key], [token]).catch(() => {});
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`The ${tab} sheet is busy with another change. Try again.`);
}

export const sheetDefinitions = {
  Diplomas: ["Diploma ID", "Diploma Code", "Diploma Name", "Diploma Years"],
  "Master Schedule": [
    "Schedule ID",
    "Diploma Code",
    "Diploma Name",
    "Course Code",
    "Course Name",
    "Scheduled Time",
    "Assigned Trainer",
    "Lecture Units",
    "Lab Units",
    "Diploma Year",
    "Semester",
    "School Year",
    "Day",
  ],
  Faculty: [
    "Faculty ID",
    "Last Name",
    "First Name",
    "M.I.",
    "Department",
    "Role",
    "Qualifications",
    "Mobile Number",
    "Contact Email",
  ],
  Courses: [
    "Course ID",
    "Diploma Code",
    "Diploma Name",
    "Diploma Year",
    "Semester",
    "Course Code",
    "Course Name",
    "Lec Units",
    "Lab Units",
    "Total Units",
    "Pre-Requisites",
    "Resultant Qualification",
  ],
};

const numericFields = new Set(["durationYears", "diplomaYear", "semester", "lectureUnits", "labUnits", "lecUnits", "totalUnits"]);
const fieldHeaders = {
  Diplomas: {
    id: "Diploma ID",
    code: "Diploma Code",
    name: "Diploma Name",
    durationYears: "Diploma Years",
  },
  "Master Schedule": {
    id: "Schedule ID",
    diplomaCode: "Diploma Code",
    diplomaName: "Diploma Name",
    courseCode: "Course Code",
    courseName: "Course Name",
    scheduledTime: "Scheduled Time",
    assignedTrainer: "Assigned Trainer",
    lectureUnits: "Lecture Units",
    labUnits: "Lab Units",
    diplomaYear: "Diploma Year",
    semester: "Semester",
    schoolYear: "School Year",
    day: "Day",
  },
  Faculty: {
    id: "Faculty ID",
    lastName: "Last Name",
    firstName: "First Name",
    mi: "M.I.",
    department: "Department",
    role: "Role",
    qualifications: "Qualifications",
    mobileNumber: "Mobile Number",
    email: "Contact Email",
  },
  Courses: {
    id: "Course ID",
    diplomaCode: "Diploma Code",
    diplomaName: "Diploma Name",
    diplomaYear: "Diploma Year",
    semester: "Semester",
    code: "Course Code",
    name: "Course Name",
    lecUnits: "Lec Units",
    labUnits: "Lab Units",
    totalUnits: "Total Units",
    prerequisites: "Pre-Requisites",
    qualification: "Resultant Qualification",
  },
};

let sheetsClientPromise;

function getSheetsClient() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
    throw new Error("Google Sheets is not configured. Set GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY.");
  }

  if (!sheetsClientPromise) {
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsClientPromise = auth.authorize().then(() =>
      google.sheets({ version: "v4", auth })
    ).catch(error => {
      sheetsClientPromise = undefined;
      throw error;
    });
  }
  return sheetsClientPromise;
}

function toRecord(tab, row, rowNumber) {
  const headers = fieldHeaders[tab];
  const record = { rowNumber };
  for (const [field, header] of Object.entries(headers)) {
    const index = sheetDefinitions[tab].indexOf(header);
    let value = row[index] ?? "";
    if (field === "durationYears" && value === "") value = 3;
    if (numericFields.has(field) && value !== "") value = Number(value);
    record[field] = value;
  }
  return record;
}

function toValues(tab, record) {
  return sheetDefinitions[tab].map(header => {
    const field = Object.keys(fieldHeaders[tab]).find(key => fieldHeaders[tab][key] === header);
    return field ? (record[field] ?? "") : "";
  });
}

function rangeFor(tab) {
  return `'${tab.replace(/'/g, "''")}'`;
}

async function fetchRows(tab) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${rangeFor(tab)}!A:${String.fromCharCode(64 + sheetDefinitions[tab].length)}`,
  });
  const rows = response.data.values ?? [];
  await writeCachedRows(tab, rows);
  return rows;
}

// fresh: true bypasses the cache; use it whenever row numbers will be written to.
export async function listRecords(tab, { fresh = false } = {}) {
  let rows = fresh ? await fetchRows(tab) : await readCachedRows(tab);
  if (!rows) {
    if (!inflightReads.has(tab)) {
      inflightReads.set(tab, fetchRows(tab).finally(() => inflightReads.delete(tab)));
    }
    rows = await inflightReads.get(tab);
  }
  return rows.slice(1).map((row, index) => toRecord(tab, row, index + 2));
}

export async function appendRecord(tab, record) {
  const sheets = await getSheetsClient();
  if (tab === "Diplomas") await ensureDiplomaDurationHeader(sheets, process.env.GOOGLE_SHEETS_ID);
  const result = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${rangeFor(tab)}!A:${String.fromCharCode(64 + sheetDefinitions[tab].length)}`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [toValues(tab, record)] },
  });
  await invalidateCachedRows(tab);
  return result.data;
}

export async function updateRecord(tab, rowNumber, record) {
  const sheets = await getSheetsClient();
  const result = await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${rangeFor(tab)}!A${rowNumber}:${String.fromCharCode(64 + sheetDefinitions[tab].length)}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [toValues(tab, record)] },
  });
  await invalidateCachedRows(tab);
  return result.data;
}

export async function deleteRecord(tab, rowNumber) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find(item => item.properties?.title === tab);
  if (!sheet?.properties?.sheetId) throw new Error(`The ${tab} worksheet is missing.`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      }],
    },
  });
  await invalidateCachedRows(tab);
}

export async function initializeSpreadsheet({ seedData }) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Map(
    (spreadsheet.data.sheets ?? []).map(sheet => [
      sheet.properties.title,
      sheet.properties.sheetId,
    ])
  );
  const requests = [];

  for (const [title, headers] of Object.entries(sheetDefinitions)) {
    if (!existing.has(title)) {
      requests.push({ addSheet: { properties: { title } } });
    }
  }
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  const results = {};
  for (const [tab, headers] of Object.entries(sheetDefinitions)) {
    if (tab === "Diplomas") await ensureDiplomaDurationHeader(sheets, spreadsheetId);
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${rangeFor(tab)}!A1:${String.fromCharCode(64 + headers.length)}1`,
    });
    const firstRow = current.data.values?.[0] ?? [];
    if (firstRow.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${rangeFor(tab)}!A1:${String.fromCharCode(64 + headers.length)}1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    } else if (firstRow.join("\u0000") !== headers.join("\u0000")) {
      throw new Error(`The ${tab} worksheet headers do not match the required schema.`);
    }

    const records = await listRecords(tab, { fresh: true });
    if (records.length === 0 && seedData[tab]) {
      const rows = seedData[tab].map(record => toValues(tab, record));
      if (rows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${rangeFor(tab)}!A:${String.fromCharCode(64 + headers.length)}`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: rows },
        });
        await invalidateCachedRows(tab);
        results[tab] = `seeded ${rows.length} sample records`;
      } else {
        results[tab] = "initialized";
      }
    } else {
      results[tab] = records.length > 0 ? `${records.length} existing records preserved` : "initialized";
    }
  }
  return results;
}

async function ensureDiplomaDurationHeader(sheets, spreadsheetId) {
  const headers = sheetDefinitions.Diplomas;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${rangeFor("Diplomas")}!A1:${String.fromCharCode(64 + headers.length)}1`,
  });
  const current = response.data.values?.[0] ?? [];
  if (current.length === 0 || current.join("\u0000") === headers.join("\u0000")) return;

  const legacyHeaders = headers.slice(0, -1);
  if (current.join("\u0000") !== legacyHeaders.join("\u0000")) {
    throw new Error("The Diplomas worksheet headers do not match the required schema.");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${rangeFor("Diplomas")}!D1`,
    valueInputOption: "RAW",
    requestBody: { values: [[headers[headers.length - 1]]] },
  });
}

export async function importFromSheet(sourceSpreadsheetId) {
  const sheets = await getSheetsClient();
  const results = { imported: {}, errors: [] };

  for (const tab of Object.keys(sheetDefinitions)) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sourceSpreadsheetId,
        range: rangeFor(tab),
      });

      const rows = response.data.values ?? [];
      if (rows.length <= 1) {
        results.imported[tab] = 0;
        continue;
      }
      if (rows[0].join("\u0000") !== sheetDefinitions[tab].join("\u0000")) {
        results.errors.push(`${tab}: header mismatch`);
        continue;
      }

      // One fresh read per tab; imported rows get the same validation and
      // uniqueness checks as edits made in the app.
      results.imported[tab] = await withSheetLock(tab, async () => {
        const existing = await listRecords(tab, { fresh: true });
        let imported = 0;
        for (let i = 1; i < rows.length; i++) {
          const { rowNumber, ...record } = toRecord(tab, rows[i], i + 1);
          if (!record.id) continue;

          const problem = validateRecord(tab, record) || findRecordConflict(tab, existing, record, record.id);
          if (problem) {
            results.errors.push(`${tab} row ${i + 1}: ${problem}`);
            continue;
          }
          const match = existing.find(item => String(item.id) === String(record.id));
          if (match && match.rowNumber === null) {
            results.errors.push(`${tab} row ${i + 1}: duplicate ID in the source sheet.`);
            continue;
          }
          if (match) {
            await updateRecord(tab, match.rowNumber, record);
            Object.assign(match, record);
          } else {
            await appendRecord(tab, record);
            existing.push({ ...record, rowNumber: null });
          }
          imported++;
        }
        return imported;
      });
    } catch (error) {
      console.error(`Importing ${tab} failed:`, error.message);
      results.errors.push(`${tab}: could not be read or written.`);
    }
  }

  return results;
}
