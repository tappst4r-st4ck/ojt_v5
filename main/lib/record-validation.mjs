const requiredFields = {
  Diplomas: ["id", "code", "name", "durationYears"],
  "Master Schedule": ["id", "diplomaCode", "diplomaName", "courseCode", "courseName", "scheduledTime", "assignedTrainer", "day", "schoolYear"],
  Faculty: ["id", "lastName", "firstName", "department", "role", "qualifications", "mobileNumber", "email"],
  Courses: ["id", "diplomaCode", "diplomaName", "diplomaYear", "semester", "code", "name", "qualification"],
};
const numericFields = {
  Diplomas: ["durationYears"],
  "Master Schedule": ["diplomaYear", "semester", "lectureUnits", "labUnits"],
  Courses: ["diplomaYear", "semester", "lecUnits", "labUnits", "totalUnits"],
};

export function validateRecord(collection, record, { requireId = true } = {}) {
  if (!requiredFields[collection]) return "Unknown collection.";
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return "A record object is required.";
  }
  const required = requiredFields[collection].filter(field => requireId || field !== "id");
  for (const field of required) {
    if (record[field] === undefined || String(record[field]).trim() === "") {
      return `${field} is required.`;
    }
  }
  for (const field of numericFields[collection] ?? []) {
    if (record[field] !== undefined && (!Number.isFinite(Number(record[field])) || Number(record[field]) < 0)) {
      return `${field} must be a non-negative number.`;
    }
  }
  if (collection === "Diplomas" && (!Number.isInteger(Number(record.durationYears)) || Number(record.durationYears) < 1 || Number(record.durationYears) > 6)) {
    return "durationYears must be a whole number between 1 and 6.";
  }
  if (collection === "Faculty" && !/^\+63\d{10}$/.test(String(record.mobileNumber))) {
    return "Mobile numbers must use +63 followed by ten digits.";
  }
  if (collection === "Faculty" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(record.email))) {
    return "A valid contact email is required.";
  }
  return null;
}

export function hasScheduleConflict(records, candidate, excludingId = "") {
  return records.some(record =>
    String(record.id) !== String(excludingId) &&
    ["diplomaCode", "diplomaYear", "semester", "schoolYear", "day", "scheduledTime"]
      .every(field => String(record[field]) === String(candidate[field]))
  );
}

const sameText = (left, right) =>
  String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();

// Uniqueness rules shared by API writes and sheet imports. Returns an error message or null.
export function findRecordConflict(collection, records, record, excludingId = "") {
  const others = records.filter(item => String(item.id) !== String(excludingId));
  if (collection === "Diplomas" && others.some(item => sameText(item.code, record.code) || sameText(item.name, record.name))) {
    return "A diploma with this code or name already exists.";
  }
  if (collection === "Faculty" && others.some(item => sameText(item.email, record.email))) {
    return "A faculty record with this email already exists.";
  }
  if (collection === "Courses" && others.some(item =>
    String(item.diplomaCode) === String(record.diplomaCode) && sameText(item.code, record.code)
  )) {
    return "A course with this code already exists in the diploma.";
  }
  if (collection === "Master Schedule" && hasScheduleConflict(others, record)) {
    return "That timetable slot is already assigned.";
  }
  return null;
}

// Google Drive / Sheets file IDs: letters, digits, "-" and "_" only.
export function isDriveId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

// CSV for Drive's CSV -> Google Sheets conversion. Text that starts like a formula
// gets a leading ' so Sheets stores it as text instead of evaluating it.
export function toCsv(rows) {
  return rows.map(row => row.map(value => {
    const text = typeof value === "number" ? String(value) : String(value ?? "").replace(/^[=+\-@\t\r]/, "'$&");
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}

export function redactFacultyContacts(records) {
  return records.map(({ mobileNumber, email, ...record }) => record);
}
