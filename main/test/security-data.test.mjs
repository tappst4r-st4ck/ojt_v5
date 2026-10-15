import test from "node:test";
import assert from "node:assert/strict";
import { hasScheduleConflict, redactFacultyContacts, validateRecord } from "../lib/record-validation.mjs";
import { isHeadTrainerRole } from "../lib/permissions.mjs";
import { isSameOriginMutation } from "../lib/request-origin.mjs";

test("same-origin mutation checks use forwarded request host and protocol", () => {
  const request = {
    url: "http://localhost:3010/api/records/Courses",
    headers: new Headers({
      origin: "http://127.0.0.1:3010",
      host: "127.0.0.1:3010",
    }),
  };
  assert.equal(isSameOriginMutation(request), true);
  assert.equal(isSameOriginMutation({
    url: request.url,
    headers: new Headers({ origin: "https://attacker.example", host: "127.0.0.1:3010" }),
  }), false);
  assert.equal(isSameOriginMutation({
    url: request.url,
    headers: new Headers({
      origin: "https://tesda.example",
      host: "internal.vercel",
      "x-forwarded-host": "tesda.example",
      "x-forwarded-proto": "https, http",
    }),
  }), true);
});

test("only approved Head Trainer roles grant editing access", () => {
  assert.equal(isHeadTrainerRole("Head Trainer"), true);
  assert.equal(isHeadTrainerRole("head trainer admin"), true);
  assert.equal(isHeadTrainerRole("Lead Instructor"), false);
  assert.equal(isHeadTrainerRole(""), false);
});

test("signed-out faculty results redact phone and email", () => {
  const [record] = redactFacultyContacts([{
    id: "faculty-1",
    mobileNumber: "+639307603532",
    email: "trainer@example.gov.ph",
    firstName: "Trainer",
  }]);
  assert.deepEqual(record, { id: "faculty-1", firstName: "Trainer" });
  assert.equal("mobileNumber" in record, false);
  assert.equal("email" in record, false);
});

test("faculty records require +63 mobile format and a valid email", () => {
  const faculty = {
    id: "faculty-1",
    lastName: "Trainer",
    firstName: "Example",
    department: "DCET",
    role: "Trainer",
    qualifications: "NC II",
    mobileNumber: "+639307603532",
    email: "trainer@example.gov.ph",
  };
  assert.equal(validateRecord("Faculty", faculty), null);
  assert.match(validateRecord("Faculty", { ...faculty, mobileNumber: "09307603532" }), /\+63/);
  assert.match(validateRecord("Faculty", { ...faculty, email: "not-an-email" }), /email/i);
});

test("course numeric fields reject invalid and negative values", () => {
  const course = {
    id: "course-1",
    diplomaCode: "DCMT",
    diplomaName: "Diploma",
    diplomaYear: 1,
    semester: 1,
    code: "CRP 121",
    name: "Carpentry",
    qualification: "NC II",
    lecUnits: 2,
    labUnits: 2,
    totalUnits: 4,
  };
  assert.equal(validateRecord("Courses", course), null);
  assert.match(validateRecord("Courses", { ...course, diplomaYear: "unknown" }), /number/);
  assert.match(validateRecord("Courses", { ...course, labUnits: -1 }), /non-negative/);
});

test("schedule slots conflict only when all slot coordinates match", () => {
  const record = {
    id: "schedule-1",
    diplomaCode: "DCMT",
    diplomaYear: 1,
    semester: 1,
    schoolYear: "SY 2024-2025",
    day: "Monday",
    scheduledTime: "10:00 AM - 11:30 AM",
  };
  assert.equal(hasScheduleConflict([record], { ...record, id: "schedule-2" }), true);
  assert.equal(hasScheduleConflict([record], { ...record, day: "Tuesday" }), false);
  assert.equal(hasScheduleConflict([record], record, record.id), false);
});
