import "server-only";
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
async function getOrCreateRootFolder(drive) {
  const sharedRoot = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (sharedRoot) {
    assertDriveId(sharedRoot, "GOOGLE_DRIVE_FOLDER_ID");
    return sharedRoot;
  }
  const response = await drive.files.list({
    q: `name=${driveString(ROOT_FOLDER_NAME)} and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (response.data.files?.length > 0) {
    return response.data.files[0].id;
  }
  const folder = await drive.files.create({
    requestBody: {
      name: ROOT_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return folder.data.id;
}

async function getOrCreateDiplomaFolder(drive, rootFolderId, diplomaCode, diplomaName) {
  const folderName = `${diplomaCode} - ${diplomaName}`;
  const response = await drive.files.list({
    q: `name=${driveString(folderName)} and ${driveString(rootFolderId)} in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (response.data.files?.length > 0) {
    return response.data.files[0].id;
  }
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return folder.data.id;
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

// Saves one diploma's curriculum (CSV text) as a Google Sheet in that diploma's folder.
export async function uploadCurriculumCsv(diploma, csv) {
  const drive = await getDriveClient();
  const rootFolderId = await getOrCreateRootFolder(drive);
  const folderId = await getOrCreateDiplomaFolder(drive, rootFolderId, diploma.code, diploma.name);
  const file = await drive.files.create({
    requestBody: {
      name: `${diploma.code} Curriculum ${new Date().toISOString().slice(0, 10)}`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    },
    media: { mimeType: "text/csv", body: csv },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });
  return { diplomaCode: diploma.code, fileName: file.data.name, link: file.data.webViewLink };
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