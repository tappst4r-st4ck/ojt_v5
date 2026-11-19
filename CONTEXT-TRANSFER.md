# Context Transfer — TESDA Scheduling Dashboard (ojt_v5)

## Project
- Next.js 16 app (Node ≥22) in `main/`. Git root is `ojt_v5/`. Remote: `origin` → `github.com/tappst4r-st4ck/ojt_v5`.
- Working branch: `feat/ui-redesign` (in sync with origin at `ddbee31`). **Never commit to main.**
- Data lives in Google Sheets (4 tabs: Diplomas, Master Schedule, Faculty, Courses) via a service account. Google Drive is used for curriculum exports. Upstash Redis handles rate limiting, lockout and the read cache.
- Auth: Google sign-in → JWT cookie. Roles: **Head Trainer** (the only editor) and Trainee (read-only).

## Where things are
- UI is a static page:
  - `main/public/tesda-main-screen.html`
  - `main/public/tesda-main-screen.js` (all frontend logic)
  - `main/public/tesda-main-screen.css` (compiled, don't edit by hand)
- Tailwind source is `main/styles/tesda-main-screen.css`. Run `npm run build:css` after changing classes. A test fails if the compiled CSS is stale.
- API routes are under `main/app/api/{auth,data,drive,import,records,setup}`.
- Server libraries are in `main/lib/`:
  - Data access: `google-sheets.js`, `google-drive.js`
  - Auth and access: `auth.js`, `permissions.mjs`, `request-origin.mjs` (CSRF)
  - Abuse protection: `rate-limit.mjs`, `account-lockout.mjs`
  - Validation: `record-validation.mjs`
  - Shared: `security-headers.mjs`, `shared-redis.mjs`
- Tests: `main/test/*.test.mjs`. Run `npm test` (20 tests, all passing).
- `CHANGELOG.md` is at the repo root. Add an entry under `[Unreleased]` for every change.

## Hard rules
1. **Strict CSP.** No inline `<script>` and no `on*=` handlers. Use `data-click="action:arg"` (also `data-change`, `data-input`, `data-submit`; split multiple steps with `|`). Every action must be registered in the `pageActions` allow-list in `tesda-main-screen.js`, and tests enforce this.
2. Every write API route must call `isSameOriginMutation()`, and a test enforces it.
3. Never commit `main/desktop.ini`.
4. Commit or push only when the user asks.
5. Style: minimal, shortest working diff, short replies.

## Recent features (already done)
- **Upload to Drive:** saves to `Diploma's / Year N / <CODE> Year N Curriculum` as a Google Sheet and replaces it on re-upload.
- **Export to PDF dialog:** pick a diploma and year, then Sheets → PDF saved into the `Curriculum PDFs` folder (Head Trainer only).
- **Print:** reuses the same dialog in print mode for every role. `openCurriculumPdfModal('print')` switches the title, icon and submit action to `printCurriculumReport`.
- **Dashboard "View schedule" per trainer:** `viewTrainerSchedule(index)` sets the schedule filters to that trainer's school year, diploma, year and semester. It then outlines their cards (`ring-2`), fades the others (`opacity-40`) and shows `#trainerHighlightChip`. The chip's × calls `clearTrainerHighlight`.
- **`switchView` fix:** the schedule branch now calls `renderTimetable()`.

## Dev/verify
- `cd main && npm run dev` starts the app. Role preview in the browser console: `pageActions.startRolePreview('head' | 'trainee')`.
- A `SESSION_SECRET` in `.env.local` is required for role preview.
- `GOOGLE_DRIVE_FOLDER_ID` must point to a Shared Drive folder, because service accounts can't own files.

## Open items
- None pending. The production checklist is at the bottom of `CHANGELOG.md`: OAuth origins, secret rotation, build, test and deploy to Vercel.
  