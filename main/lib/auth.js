import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { OAuth2Client } from "google-auth-library";
import { listRecords } from "./google-sheets";
import { isHeadTrainerRole } from "./permissions.mjs";

export { isSameOriginMutation } from "./request-origin.mjs";

const SESSION_COOKIE = "tesda_session";
const SESSION_SECONDS = 60 * 60 * 8;
function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function sign(value) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export async function createSessionFromGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");

  const client = new OAuth2Client(clientId);
  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  } catch {
    const error = new Error("Google credential is invalid or expired.");
    error.code = "INVALID_GOOGLE_CREDENTIAL";
    throw error;
  }
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified || !payload.sub) {
    throw new Error("Google did not return a verified account email.");
  }

  const email = payload.email.trim().toLowerCase();
  const faculty = (await listRecords("Faculty")).find(
    person => String(person.email).trim().toLowerCase() === email
  );
  if (!faculty) {
    const error = new Error("The Google account is not listed in the Faculty Database.");
    error.code = "FACULTY_ACCOUNT_REQUIRED";
    throw error;
  }
  const role = faculty.role;
  const isHeadTrainer = isHeadTrainerRole(role);

  const issuedAt = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    sub: payload.sub,
    email,
    name: payload.name ?? email,
    issuedAt,
    expiresAt: issuedAt + SESSION_SECONDS,
  })).toString("base64url");

  return {
    token: `${body}.${sign(body)}`,
    user: { email, name: payload.name ?? email, role, isHeadTrainer },
  };
}

function verifyToken(token) {
  const [body, providedSignature] = token.split(".");
  if (!body || !providedSignature) return null;

  const expectedSignature = sign(body);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!session.email || session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? verifyToken(token) : null;
}

export function setSessionCookie(response, token) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getAuthenticatedUser() {
  const session = await getSession();
  if (!session) return null;
  const faculty = (await listRecords("Faculty")).find(
    person => String(person.email).trim().toLowerCase() === session.email
  );
  if (!faculty) return null;
  return {
    email: session.email,
    name: session.name,
    role: faculty.role,
    isHeadTrainer: isHeadTrainerRole(faculty.role),
  };
}

export async function requireHeadTrainer() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { user: null, response: Response.json({ error: "Google sign-in is required." }, { status: 401 }) };
  }
  if (!user.isHeadTrainer) {
    return { user, response: Response.json({ error: "Head Trainer access is required." }, { status: 403 }) };
  }
  return { user, response: null };
}
