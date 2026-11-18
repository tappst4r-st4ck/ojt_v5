import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findRecordConflict, isDriveId, toCsv } from "../lib/record-validation.mjs";
import { runWithLocalLock } from "../lib/security-state.mjs";

const apiRoot = new URL("../app/api/", import.meta.url);

test("every API write handler checks same-origin and requires an authenticated guard", () => {
  const routeFiles = readdirSync(apiRoot, { recursive: true })
    .filter(file => String(file).endsWith("route.js"));
  assert.ok(routeFiles.length > 0);

  for (const file of routeFiles) {
    const source = readFileSync(join(apiRoot.pathname.replace(/^\/([A-Za-z]:)/, "$1"), String(file)), "utf8");
    if (!/export async function (POST|PUT|PATCH|DELETE)\b/.test(source)) continue;
    assert.match(source, /isSameOriginMutation\(request\)/, `${file} must reject cross-origin writes`);
    if (String(file).includes("logout")) continue; // clearing your own cookie needs no role
    assert.match(
      source,
      /requireHeadTrainer\(|authorizedMutation\(|createSessionFromGoogleCredential\(/,
      `${file} must check who is calling before writing`
    );
  }
});

test("record conflicts ignore the record being updated and compare case-insensitively", () => {
  const faculty = [
    { id: "f1", email: "Trainer@Example.com" },
    { id: "f2", email: "other@example.com" },
  ];
  assert.equal(findRecordConflict("Faculty", faculty, { id: "f3", email: " trainer@example.com " }),
    "A faculty record with this email already exists.");
  assert.equal(findRecordConflict("Faculty", faculty, { id: "f1", email: "trainer@example.com" }, "f1"), null);

  const schedule = [{
    id: "s1", diplomaCode: "DCMT", diplomaYear: 1, semester: 2, schoolYear: "SY 2025-2026",
    day: "Monday", scheduledTime: "10:00 AM - 11:30 AM",
  }];
  assert.equal(findRecordConflict("Master Schedule", schedule, { ...schedule[0], id: "s2" }),
    "That timetable slot is already assigned.");
  assert.equal(findRecordConflict("Master Schedule", schedule, schedule[0], "s1"), null);
});

test("Drive IDs reject query-language injection", () => {
  assert.equal(isDriveId("1AbC_dEf-1234567890xyz"), true);
  assert.equal(isDriveId("x' in parents or name contains '"), false);
  assert.equal(isDriveId("short"), false);
  assert.equal(isDriveId(undefined), false);
});

test("local sheet lock runs writes one at a time, even after a failure", async () => {
  const locks = new Map();
  const order = [];
  const step = (label, ms, fail = false) => () => new Promise((resolve, reject) => {
    order.push(`${label}:start`);
    setTimeout(() => {
      order.push(`${label}:end`);
      fail ? reject(new Error(label)) : resolve(label);
    }, ms);
  });

  const first = runWithLocalLock(locks, "Faculty", step("a", 20, true));
  const second = runWithLocalLock(locks, "Faculty", step("b", 1));
  await assert.rejects(first, /a/);
  assert.equal(await second, "b");
  assert.deepEqual(order, ["a:start", "a:end", "b:start", "b:end"]);
});

test("seed data contains no real personal contact details", () => {
  const source = readFileSync(new URL("../lib/sample-data.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@gmail\.com/i);
  for (const [, email] of source.matchAll(/email: "([^"]+)"/g)) {
    assert.match(email, /@example\.com$/);
  }
  for (const [, mobile] of source.matchAll(/mobileNumber: "([^"]+)"/g)) {
    assert.match(mobile, /^\+6390{8}\d$/);
  }
});

test("Drive CSV export quotes cells and neutralises formulas", () => {
  assert.equal(
    toCsv([["Code", 3, 'Say "hi"', "=IMPORTXML(1)", "-1+1", "@SUM", null]]),
    `"Code","3","Say ""hi""","'=IMPORTXML(1)","'-1+1","'@SUM",""`
  );
  assert.equal(toCsv([["a"], ["b"]]), `"a"\r\n"b"`);
});
