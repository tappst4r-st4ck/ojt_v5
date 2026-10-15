const requiredFields = {
  Diplomas: ["id", "code", "name"],
  "Master Schedule": ["id", "diplomaCode", "diplomaName", "courseCode", "courseName", "scheduledTime", "assignedTrainer", "day", "schoolYear"],
  Faculty: ["id", "lastName", "firstName", "department", "role", "qualifications", "mobileNumber", "email"],
  Courses: ["id", "diplomaCode", "diplomaName", "diplomaYear", "semester", "code", "name", "qualification"],
};
const numericFields = {
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

export function redactFacultyContacts(records) {
  return records.map(({ mobileNumber, email, ...record }) => record);
}
