# TESDA Scheduling Dashboard

This is a Next.js App Router application with a Google Sheets-backed API. The dashboard permits public read-only browsing, hides faculty phone numbers and email addresses from signed-out visitors, and allows changes only when the signed-in Google account matches a Faculty worksheet row whose role is `Head Trainer`.

## Local development

1. Create a Google Cloud project, enable the Google Sheets API and Google Drive API, and create a dedicated service account.
2. Create a spreadsheet and share it with the service account email as an editor.
3. Create a Google OAuth web client. Add `http://localhost:3000` as an authorized JavaScript origin.
4. Create an Upstash Redis database and copy its REST URL and token.
5. Copy `.env.example` to `.env.local` and fill in the values:
   - `GOOGLE_CLIENT_ID`: the OAuth web client ID. It is public configuration, but must match the server-side token audience.
   - `GOOGLE_SHEETS_ID`: the spreadsheet ID from its URL.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`: server-only service-account credentials. The Sheets client uses only the Sheets scope. Drive endpoints still require the full Drive scope for folder discovery and copying existing spreadsheets; use a dedicated service account and share only this app's required spreadsheet and Drive assets with it. Moving to `drive.file` requires a per-file authorization flow or a redesigned copy workflow.
   - `SESSION_SECRET`: a random secret with at least 32 characters.
   - `SETUP_TOKEN`: a separate random secret used for the initial worksheet setup request.
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: required in production for shared API rate limits and authentication lockout.
   - `ENABLE_ROLE_PREVIEW`: local UI preview only; production always disables previews.
6. Run `npm install`, then `npm run dev` from this folder.

Do not commit `.env.local`, service-account credentials, OAuth client secrets, or setup tokens. The API uses an HTTP-only, same-site session cookie. Browser code never receives the service-account credentials.

For local UI testing without repeated sign-in, set `ENABLE_ROLE_PREVIEW=true` in `.env.local` and restart the server. The app opens in Head Trainer preview and the login screen offers both Head Trainer and Trainee previews. These previews only change the visible interface; all API writes still require a real Google session and Head Trainer role. Production disables previews regardless of this setting.

Rate limiting and failed-login lockout use Upstash Redis in production. The app fails closed with `503` responses if the Redis variables are missing or the service is unavailable. Local development may use an in-memory fallback when the variables are absent; that fallback is not suitable for deployment. Production hosting must provide a trusted `x-real-ip` header from its reverse proxy. The in-memory local fallback is only for development and tests.

## Initialize the spreadsheet

The setup endpoint creates these worksheets and writes their column headers:

- `Diplomas`: Diploma ID, Diploma Code, Diploma Name, Diploma Years
- `Courses`: Course ID, Diploma Code, Diploma Name, Diploma Year, Semester, Course Code, Course Name, Lec Units, Lab Units, Total Units, Pre-Requisites, Resultant Qualification
- `Faculty`: Faculty ID, Last Name, First Name, M.I., Department, Role, Qualifications, Mobile Number, Contact Email
- `Master Schedule`: Schedule ID, Diploma Code, Diploma Name, Course Code, Course Name, Scheduled Time, Assigned Trainer, Lecture Units, Lab Units, Diploma Year, Semester, School Year, Day

The endpoint is `POST /api/setup`. Send `{"seed": true}` to seed each empty worksheet with the dashboard's existing prototype sample data, or `{"seed": false}` to create only the headers. Existing non-empty worksheets are preserved. The sample data does not contain a Head Trainer account.

Existing Diploma worksheets with the original three-column header are migrated by appending `Diploma Years`; existing programs default to three years. New Diploma records must specify a whole number from 1 through 6.

After seeding, add the initial Head Trainer row directly in the `Faculty` worksheet. Use a unique Faculty ID, the exact Google sign-in email, and the role `Head Trainer`. This is required before that account can receive editing access. A signed-in faculty member with any other role is read-only.

If `SETUP_TOKEN` is configured, the setup endpoint requires it in the `x-setup-token` header. Keep this token private and remove or rotate it after initialization. The endpoint only accepts same-origin POST requests. Share the service account only with the target spreadsheet and required Drive assets; do not share an entire staff or organization Drive.

## API and access model

- `GET /api/data` and `GET /api/records/{Diplomas|Courses|Faculty|Master%20Schedule}` provide read access.
- Signed-out reads of `Faculty` omit `Mobile Number` and `Contact Email`.
- `POST /api/auth/login` verifies a Google ID token on the server, then matches its verified email against the `Faculty` worksheet.
- `GET /api/auth/me` reports the current session; `POST /api/auth/logout` clears it.
- Create, update, and delete requests under `/api/records/...` re-read the user's current Faculty role and require `Head Trainer`. Client-side control visibility is only a usability feature and is not the authorization boundary.
- Record IDs are stable UUIDs generated by the browser on create.

## Deploy on Vercel

Deploy the `main` folder as the Vercel project root and configure the same environment variables in the Vercel project settings, including both Upstash Redis REST variables. Add the deployed HTTPS origin to the Google OAuth client's authorized JavaScript origins. Keep the Google private key, `SESSION_SECRET`, `SETUP_TOKEN`, and Upstash token as server-side environment variables only.

The application and API must be deployed together. GitHub Pages cannot host the Next.js API routes or protect the Google credentials. Deployment and live Google Sheets verification require the Google Cloud project, spreadsheet, and Vercel environment to be configured by the project owner.

Before deployment, revoke or rotate any API key that was previously committed to Git history. Do not reuse the exposed key.