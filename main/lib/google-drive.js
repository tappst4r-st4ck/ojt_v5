import "server-only";
import { google } from "googleapis";

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

async function getOrCreateRootFolder(drive) {
  const response = await drive.files.list({
    q: `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
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
  });
  return folder.data.id;
}

async function getOrCreateDiplomaFolder(drive, rootFolderId, diplomaCode, diplomaName) {
  const folderName = `${diplomaCode} - ${diplomaName}`;
  const response = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
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

export async function uploadCurriculumSheetToDiplomaFolder(diplomaCode, spreadsheetId, spreadsheetTitle) {
  const drive = await getDriveClient();
  const rootFolderId = await getOrCreateRootFolder(drive);
  const folderName = `${diplomaCode} - ${spreadsheetTitle}`;
  const response = await drive.files.list({
    q: `name='${folderName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });
  let folderId;
  if (response.data.files?.length > 0) {
    folderId = response.data.files[0].id;
  } else {
    const folder = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rootFolderId],
      },
      fields: "id",
    });
    folderId = folder.data.id;
  }

  const fileName = `${diplomaCode}_Curriculum_${new Date().toISOString().split("T")[0]}.xlsx`;
  await drive.files.copy({
    fileId: spreadsheetId,
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    fields: "id",
  });
  return { folderId, fileName };
}

export async function listDiplomaFolders() {
  const drive = await getDriveClient();
  const rootFolderId = await getOrCreateRootFolder(drive);
  const response = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name, createdTime, modifiedTime)",
    spaces: "drive",
    orderBy: "name",
  });
  return response.data.files ?? [];
}

export async function getDiplomaFolderFiles(folderId) {
  const drive = await getDriveClient();
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, createdTime, modifiedTime, size)",
    spaces: "drive",
    orderBy: "modifiedTime desc",
  });
  return response.data.files ?? [];
}