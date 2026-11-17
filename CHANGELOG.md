# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.2] - 2026-11-17

### Added
- **DMET Diploma Support** — Added "Diploma in Machining Technology" (DMET) with full curriculum:
  - 7 courses spanning 2 years (MAC 111–MAC 221)
  - 7 master schedule entries with trainers and time slots
  - Seeded via `/api/add-dmet` endpoint and `sample-data.js`
- **Drive Folder-per-Diploma Structure** — Google Drive integration:
  - Root folder "TESDA Curriculum" with per-diploma subfolders
  - Curriculum sheet upload to respective diploma folders
  - API endpoints: `/api/drive/folders`, `/api/drive/curriculum`, `/api/drive/files`
  - Frontend: "Initialize Drive Folders" button + per-diploma "Export to Drive"
- **Google Sheets Import Feature** — Import from external spreadsheet:
  - Exact header validation across 4 tabs (Diplomas, Master Schedule, Faculty, Courses)
  - Upsert by ID (no duplicates)
  - Frontend modal with format reference and Sheet ID/URL input
  - API: `POST /api/import/sheet` with Head Trainer auth

### Security
- **Rate Limiting** — Sliding window 30 req/min/IP via Upstash Redis
- **Account Lockout** — 5 failed attempts → 15 min lockout (tracks IP + email separately)
- **Security Headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy via middleware
- **CSRF Protection** — `isSameOriginMutation()` on all mutating endpoints (Origin/Referer validation)
- **Input Validation** — Record validation schemas for all collections

### Fixed
- Import modal submit button styling (removed unwanted icon, plain "Import" text)
- Role preview visibility (requires valid `SESSION_SECRET` in `.env.local`)
- Dev server port conflict handling
- PDF-based diploma entry fallback (DMET PDF was scanned images — manual entry via API)

### Infrastructure
- Upstash Redis integration (`@upstash/redis`) for distributed rate limiting + lockout
- Primary region: `ap-southeast-1` (Singapore)
- Database: `ojtv5tesdascheduler`

### Testing
- 10 security tests passing (`test/security-controls.test.mjs`, `test/security-data.test.mjs`)
- Production build successful (`npm run build`)

---

## [2.2.1] - 2026-11-16

### Added
- Google OAuth 2.0 authentication (GIS + ID token verification)
- JWT session management (HMAC-SHA256, 8-hour expiry, HttpOnly cookies)
- Role-based access: Head Trainer Admin (full) vs Trainee (read-only)
- Faculty allowlist from Google Sheets (Head Trainer role check)
- `/api/auth/*` endpoints: login, logout, me, config

### Added
- Google Sheets CRUD core (`lib/google-sheets.js`)
  - 4-tab schema with exact header definitions
  - `listRecords`, `appendRecord`, `updateRecord`, `deleteRecord`
  - `initializeSpreadsheet` with seed data support
  - `importFromSheet` for external spreadsheet import
- Curriculum Hub UI in `tesda-main-screen.html`
  - Diploma cards with expandable course/schedule tables
  - Material Symbols + Tailwind CDN styling
  - Toast notification system

### Security
- Basic rate limiting (in-memory, pre-Redis)
- Same-origin mutation checks on auth endpoints

---

## [2.2.0] - 2026-11-15

### Added
- Initial Next.js 14+ project structure (App Router)
- Google Sheets API integration (service account JWT)
- Basic diploma/schedule/faculty/course data model
- Vercel deployment configuration
- Environment variable templates (`.env.example`)

---

## [2.1.0] - 2026-11-14

### Added
- Project initialization
- Basic folder structure
- Package.json with core dependencies

---

## Pre-Deployment Checklist for v2.2.2 → Production

- [ ] Add Authorized JavaScript Origins in Google Cloud Console:
  - `http://localhost:3000`
  - `https://ojt-v5-tesda-scheduler.vercel.app`
- [ ] Rotate secrets (update both `.env.local` and Vercel Project Settings):
  - Google service-account key (new JSON from IAM)
  - `SESSION_SECRET` = `openssl rand -base64 32`
  - `SETUP_TOKEN` = `openssl rand -base64 24`
  - Upstash REST token (Console → Redis → Settings → Reset Token)
- [ ] Verify production build: `npm run build`
- [ ] Run security tests: `npm test`
- [ ] Deploy to Vercel