import "server-only";
import { Readable } from "node:stream";
import { google } from "googleapis";
import { isDriveId } from "./record-validation.mjs";

// Drive search strings are a query language: quote names, never splice raw input.
function driveString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function assertDriveId(value, label) {
  if (!isDriveId(value)) {
    const error = new Error(`${label} is not a valid Google Drive ID.`);
    error.code = "INVALID_DRIVE_ID";
    throw error;
  }
}

let driveClientPromise;

function getDriveClient() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!serviceAccountEmail || !privateKey) {
    throw new Error("Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.");
  }

  if (!driveClientPromise) {
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    driveClientPromise = auth.authorize().then(() =>
      google.drive({ version: "v3", auth })
    ).catch(error => {
      driveClientPromise = undefined;
      throw error;
    });
  }
  return driveClientPromise;
}

const ROOT_FOLDER_NAME = "TESDA Diploma Curriculum";

// Service accounts can't own uploaded files (no storage quota). Point GOOGLE_DRIVE_FOLDER_ID
// at a folder in a Shared Drive where the service account is a Content manager.
function getOrCreateRootFolder(drive) {
  return process.env.GOOGLE_DRIVE_FOLDER_ID ? getBaseFolder() : getOrCreateFolder(drive, "root", ROOT_FOLDER_NAME);
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const PDF_MIME = "application/pdf";
const DIPLOMAS_FOLDER_NAME = "Diploma's";
const PDF_FOLDER_NAME = "Curriculum PDFs";

// Top of the curriculum tree: the Shared Drive folder when set, else the account's My Drive.
function getBaseFolder() {
  const sharedRoot = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!sharedRoot) return "root";
  assertDriveId(sharedRoot, "GOOGLE_DRIVE_FOLDER_ID");
  return sharedRoot;
}

async function findFile(drive, parentId, name, mimeType) {
  const response = await drive.files.list({
    q: `name=${driveString(name)} and ${driveString(parentId)} in parents and mimeType=${driveString(mimeType)} and trashed=false`,
    fields: "files(id, webViewLink)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return response.data.files?.[0];
}

async function getOrCreateFolder(drive, parentId, name) {
  const existing = await findFile(drive, parentId, name, FOLDER_MIME);
  if (existing) return existing.id;
  const folder = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  return folder.data.id;
}

// Replaces the content of the same-named file in the folder, or creates it.
async function upsertFile(drive, parentId, name, mimeType, media) {
  const existing = await findFile(drive, parentId, name, mimeType);
  const file = existing
    ? await drive.files.update({ fileId: existing.id, media, fields: "id, webViewLink", supportsAllDrives: true })
    : await drive.files.create({
      requestBody: { name, mimeType, parents: [parentId] },
      media,
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });
  return file.data;
}

function getOrCreateDiplomaFolder(drive, rootFolderId, diplomaCode, diplomaName) {
  return getOrCreateFolder(drive, rootFolderId, `${diplomaCode} - ${diplomaName}`);
}

export async function ensureDiplomaFolderStructure(diplomas) {
  const drive = await getDriveClient();
  const rootFolderId = await getOrCreateRootFolder(drive);
  const folderMap = {};
  for (const diploma of diplomas) {
    const folderId = await getOrCreateDiplomaFolder(drive, rootFolderId, diploma.code, diploma.name);
    folderMap[diploma.code] = { folderId, folderName: `${diploma.code} - ${diploma.name}` };
  }
  return { rootFolderId, folderMap };
}

// Saves curriculum rows (CSV text) as the Google Sheet "Diploma's/Year N/<CODE> Year N Curriculum".
// With pdf, the sheet is also exported to "Curriculum PDFs/<sheet name>.pdf", outside the Diploma's tree.
// Re-saving replaces the same files instead of piling up copies.
export async function saveCurriculumSheet(diploma, year, csv, { pdf = false } = {}) {
  const drive = await getDriveClient();
  const base = getBaseFolder();
  const yearFolder = await getOrCreateFolder(drive, await getOrCreateFolder(drive, base, DIPLOMAS_FOLDER_NAME), `Year ${year}`);
  const fileName = `${diploma.code} Year ${year} Curriculum`;
  const sheet = await upsertFile(drive, yearFolder, fileName, SHEET_MIME, { mimeType: "text/csv", body: csv });
  const saved = { diplomaCode: diploma.code, year, fileName, link: sheet.webViewLink };
  if (pdf) {
    const exported = await drive.files.export({ fileId: sheet.id, mimeType: PDF_MIME }, { responseType: "arraybuffer" });
    const pdfFolder = await getOrCreateFolder(drive, base, PDF_FOLDER_NAME);
    const pdfFile = await upsertFile(drive, pdfFolder, `${fileName}.pdf`, PDF_MIME,
      { mimeType: PDF_MIME, body: Readable.from([Buffer.from(exported.data)]) });
    saved.pdfLink = pdfFile.webViewLink;
  }
  return saved;
}

export async function listDiplomaFolders() {
  const drive = await getDriveClient();
  const rootFolderId = await getOrCreateRootFolder(drive);
  const response = await drive.files.list({
    q: `${driveString(rootFolderId)} in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name, createdTime, modifiedTime)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: "name",
  });
  return response.data.files ?? [];
}

export async function getDiplomaFolderFiles(folderId) {
  assertDriveId(folderId, "folderId");
  const drive = await getDriveClient();
  const response = await drive.files.list({
    q: `${driveString(folderId)} in parents and trashed=false`,
    fields: "files(id, name, mimeType, createdTime, modifiedTime, size)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: "modifiedTime desc",
  });
  return response.data.files ?? [];
}