import "server-only";
import { google } from "googleapis";

export const sheetDefinitions = {
  Diplomas: ["Diploma ID", "Diploma Code", "Diploma Name"],
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

const numericFields = new Set(["diplomaYear", "semester", "lectureUnits", "labUnits", "lecUnits", "totalUnits"]);
const fieldHeaders = {
  Diplomas: {
    id: "Diploma ID",
    code: "Diploma Code",
    name: "Diploma Name",
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

export async function listRecords(tab) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${rangeFor(tab)}!A:${String.fromCharCode(64 + sheetDefinitions[tab].length)}`,
  });
  const rows = response.data.values ?? [];
  return rows.slice(1).map((row, index) => toRecord(tab, row, index + 2));
}

export async function appendRecord(tab, record) {
  const sheets = await getSheetsClient();
  const result = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${rangeFor(tab)}!A:${String.fromCharCode(64 + sheetDefinitions[tab].length)}`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [toValues(tab, record)] },
  });
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

    const records = await listRecords(tab);
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
