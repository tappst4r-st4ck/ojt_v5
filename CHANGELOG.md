# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **UI redesign** — Clean bento layout for login, sidebar, dashboard KPIs, schedule, faculty and curriculum views (Tailwind CDN, Plus Jakarta Sans + Inter, Material Symbols).
- **Faculty Loading Report** — Prints A4 landscape from an in-page frame (no pop-up); choose "Save as PDF" in the print dialog.
- **Legibility** — Grey text darkened to meet WCAG AA contrast (slate-300/400 → slate-500; slate-600 on slate-100 backgrounds). Nothing is smaller than 11px, and body copy is at least 12px.
- **Roles** — `Head Trainer` is the only editor role; the unused `Head Trainer Admin` role was removed.
- **Curriculum Hub** — One collapsible panel per diploma with a single table split by year/semester (panels stay open across refreshes). Add Course / Add a Diploma switch slides between modes.
- **Curriculum Print / Export to PDF** — Builds an A4 report for the diploma and year picked in the filters (one page per diploma when "All" is picked). Import from Sheet and Upload to Drive are hidden from read-only users.
- **Upload to Drive** — Saves the picked diploma's curriculum (or every diploma) as a Google Sheet in its Drive folder (`POST /api/drive/curriculum` now takes `{ diplomaCode }`). Formula-like cells are neutralised. Set `GOOGLE_DRIVE_FOLDER_ID` to a Shared Drive folder: service accounts can't own uploaded files.

### Security
- **Removed `/api/add-dmet`** — It wrote to the Sheet with no sign-in, role, origin or rate-limit checks. Use `scripts/add-dmet.mjs` locally instead.
- **CSRF** — `isSameOriginMutation()` now actually covers every write route (import, Drive folders, Drive curriculum were missing it). A test fails if a write route lacks it.
- **Sheets quota** — Reads are cached for 30 s (Redis, or memory in dev) and concurrent reads of a tab are shared; one page load went from 6 Sheets reads to at most 4, usually 0.
- **Concurrent edits** — Creates, updates, deletes and imports hold a per-tab lock and re-read rows fresh, so a row number can't shift to another record mid-write.
- **Imports** — Imported rows now pass the same validation and duplicate/conflict checks as in-app edits, with one read per tab instead of one per row.
- **Drive** — Folder and sheet IDs are validated and Drive queries are properly quoted (prevented query injection in `/api/drive/files`).
- **Lockout** — Only forged/expired Google tokens count toward the per-IP lockout. Previously, faculty signing in with the wrong Google account could lock out a whole shared campus IP. (The 2.2.2 note below said lockout tracked IP + email; it only ever tracked IP.)
- **Privacy** — Replaced real phone numbers and Gmail addresses in seed data and tests with placeholders.
- **Strict CSP** — `script-src` no longer allows `'unsafe-inline'` or the Tailwind CDN, so injected inline scripts and `on*=` handlers are blocked by the browser.
  - Dashboard JavaScript moved to `public/tesda-main-screen.js`; the 49 inline `onclick`/`onchange`/`oninput`/`onsubmit` handlers became `data-click`/`data-change`/`data-input`/`data-submit` actions dispatched from an allow-list (`pageActions`).
  - Tailwind is compiled from `styles/tesda-main-screen.css` to `public/tesda-main-screen.css` by `npm run build:css` (runs automatically before `npm run dev` and `npm run build`). Uses the already-installed `@tailwindcss/postcss`; adds `@tailwindcss/forms` and `postcss` as dev dependencies. **Re-run `npm run build:css` after changing classes while the dev server is running.**
  - Tests fail if a script is inlined, an `on*=` handler returns, an action isn't allow-listed, or the compiled CSS is stale.

### Fixed
- Dashboard alerts no longer crash when faculty exist (removed dead code referencing an undefined variable).

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