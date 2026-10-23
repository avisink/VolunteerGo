# CONTEXT.md

Running notes on this codebase — quirks, gotchas, and things worth knowing that don't belong in `CLAUDE.md`'s architecture overview. This file is updated regularly as new things are found; newest entries go at the top of each section. If a note here turns into something Claude must actively enforce (not just be aware of), promote it to `KEY_DECISIONS.md`.

## Current status / session handoff

_Last updated 2026-10-23. Start here in a new session; overwrite this section as things change, don't append._

**Where things stand**
- Working branch: `context-setting` (the user prefers committing here and opening PRs from it). PRs go to the **fork's** `main`: `gh pr create -R avisink/VolunteerGo --base main`. Never target `ftl-pod/VolunteerGo`.
- PRs #1–#3 are merged. **PR #4** (server points D-API-005, lint D-UI-002, Copilot PR review) was open and green at the start of 2026-10-23. The badges/auth/hosting work below was committed on top of it, so it's in PR #4 unless #4 was merged first.
- Tests: VolunteerAPI has **44** Jest tests (`opportunities`, `auth`, `gamification`, `access`); VolunteerSearch has 12 pytest tests; VolunteerUI has none (lint must be error-free, then build).
- Latest decision IDs: **D-API-008, D-UI-002, D-SEARCH-002**. KEY_DECISIONS.md has entries for auth, CI, PR review (Claude superseded → Copilot) and hosting.

**Decisions made 2026-10-23**
- D-API-006: badges are awarded only by the server (`lib/badges.js`) inside apply, onboarding and friend accept, and returned as `badgesEarned`. `POST /badges/give` and the UI's `badgeService.js` were removed.
- D-API-007: every write needs a token. Catalog writes (opportunities/orgs/badges) need `ADMIN_UIDS`; `:id` user writes are self-only; `POST /users` takes the UID from the token; confirmation email only goes to the caller.
- D-API-008: `directUrl` in `schema.prisma` for Supabase; `npm run seed` = `node seed.js`.
- D-SEARCH-002: `requirements-prod.txt` (no PyTorch) and CORS from `FRONTEND_URL`.
- KEY_DECISIONS "Hosting": Render free tier for all three services via `render.yaml`, Supabase for the DB, new Firebase project, all on the user's accounts.

**Waiting on the user** (steps below)
1. Merge PR #4.
2. Firebase + Supabase setup, then tell Claude. Claude then runs `npx prisma migrate deploy` + `npm run seed`, starts all three services locally, and tests sign-up → onboarding (Newcomer badge) → apply (points, level, badges) → save.
3. Then the Render deploy.
4. Copilot code review ruleset (and optionally "require status checks" on `main`).

**Suggested next tasks for Claude**
1. After setup: the end-to-end local check above, then help with the Render deploy.
2. Fix the 7 `exhaustive-deps` warnings one at a time, with browser testing.
3. Smaller fixes: VolunteerSearch `/search` 500 with no opportunities; unmounted chat route; friend accept not atomic.
4. Later: integration tests against real Postgres in CI; UI component tests; free-provider map.

**Environment notes for Claude**
- The user's npm config blocks package install scripts (`allowScripts`). Don't approve them; tests don't need them. CI uses `npm ci --ignore-scripts`.
- Local versions are Node 26 and Python 3.14; CI uses Node 24 and Python 3.13. For VolunteerSearch tests, make a venv outside the repo (or `.venv/`, which is gitignored) and run `pip install -r requirements-test.txt`.
- Never print `.env` or key contents. Check variable names, lengths or formats only. Firebase **project IDs** aren't secret, so they're fine to check.

## Pending setup (waiting on the user)

Status as of 2026-10-23. `VolunteerAPI/firebase/serviceAccountKey.json` and `VolunteerUI/.env` still point at the teammate's **`ftlcapstone`** Firebase project, and `DATABASE_URL` still points at the dead Render database. All secret files are gitignored.

**1. Firebase (new project, free Spark plan)**
1. [console.firebase.google.com](https://console.firebase.google.com) → **Create a project** (e.g. `volunteergo`). Google Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
3. Project Overview → the **`</>` (Web)** icon → register an app (no Firebase Hosting). Copy the six `firebaseConfig` values into `VolunteerUI/.env`: `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`. Replace all six; the old ones are also shifted by one line.
4. ⚙️ **Project settings → Service accounts → Generate new private key.** Save the download **over** `VolunteerAPI/firebase/serviceAccountKey.json`. Locally the API reads this file; `FIREBASE_SERVICE_ACCOUNT` in `VolunteerAPI/.env` is only read when `NODE_ENV=production`, so delete that line locally.
5. After deploying: **Authentication → Settings → Authorized domains → Add** the Render UI domain.
6. Old users don't carry over. That's fine, because the database is new too. `ProfileContext` creates the user row on first sign-in.

**2. Supabase (free)**
1. [supabase.com](https://supabase.com) → sign in with GitHub → **New project**. Choose a strong **database password** and save it in a password manager, pick the nearest region, Free plan.
2. Once it's ready: **Connect** (top bar) → **ORMs → Prisma**. It shows two URLs: the **transaction pooler** (port `6543`, ends `?pgbouncer=true`) and the **session pooler** (port `5432`). Replace `[YOUR-PASSWORD]` in both; URL-encode special characters in the password (e.g. `@` → `%40`). Don't use the direct `db.<ref>.supabase.co` host (IPv6-only).
3. `VolunteerAPI/.env`: `DATABASE_URL=<transaction pooler>`, `DIRECT_URL=<session pooler>`.
4. Supabase free projects **pause after ~7 days without activity**. Restore them from the dashboard before demos.

**3. Local `.env` fixes (same time)**
- `VolunteerAPI/.env`: `PORT=3000` (currently `5000`), `FRONTEND_URL=http://localhost:5173` (currently the old Render site, which blocks local CORS), and optionally `ADMIN_UIDS=<your Firebase UID>` (Authentication → Users, after signing up). Delete the unused `VITE_GOOGLE_*`, `VITE_FIREBASE_*` and `VITE_API_BASE_URL` lines.
- `VolunteerSearch/.env`: `VITE_API_BASE_URL=http://localhost:3000` (currently the old Render API).
- `VolunteerUI/.env`: needs `VITE_CLERK_PUBLISHABLE_KEY` set to anything (see Known quirks). Remove the `VITE_SENDGRID_*` lines, which nothing in the UI uses.

**4. Render deploy (after local works)**
1. [render.com](https://render.com) → sign in with GitHub (no card needed) → **New → Blueprint** → pick `avisink/VolunteerGo`. It reads `render.yaml` and creates `volunteergo-api`, `volunteergo-search` and `volunteergo-ui`.
2. It asks for every `sync: false` value. Fill in the secrets now (Supabase URLs, `FIREBASE_SERVICE_ACCOUNT` = the whole key JSON, SendGrid, Firebase web config, LocationIQ, Pexels). For the URLs you don't know yet, enter a placeholder.
3. After the first deploy, copy each service's `.onrender.com` URL and set: API `FRONTEND_URL` = UI URL; search `VITE_API_BASE_URL` = API URL and `FRONTEND_URL` = UI URL; UI `VITE_API_BASE_URL` = API URL and `VITE_SEARCH_URL` = search URL. **Redeploy the UI** (VITE values are baked in at build time).
4. Add the UI domain to Firebase authorized domains (step 1.5).
5. **SendGrid:** the sender is hardcoded as `volunteergoconfirmation@outlook.com` in `userController.js`. A new SendGrid account must verify that sender (or another one, plus a code change) before emails send. Applying still works if email fails.

**Other services**
- [ ] **Pexels and LocationIQ:** working keys verified; replace them if they belong to the teammate (both free, no card).
- [ ] **OpenAI:** only needed if the unmounted chat feature is revived.
- [ ] **Google Maps / Geocode:** don't recreate (D-UI-001). Whoever owns that Google Cloud project should delete the old keys; they were public in the deployed bundle and caused the ~$800 bill.

## Map / geocoding alternatives (if a map comes back)

The map page is a stretch feature: its code is kept, but its Google keys are removed (D-UI-001). When it's rebuilt, use something with no surprise billing:

- **Geocoding: LocationIQ.** The project already has a working key (`VITE_LOCATIONIQ_ACCESS_TOKEN`). The free tier is 5,000 requests/day and needs no credit card, so it can't bill you. Its API is OpenStreetMap/Nominatim-compatible.
- **Geocoding: Nominatim** (OpenStreetMap's public geocoder). Free with no key, but limited to 1 request/second and needs an identifying User-Agent. Fine for small scripts, not for per-page-view use.
- **Map rendering: Leaflet + `react-leaflet` with OpenStreetMap tiles.** Free, no key, simple. OSM's tile policy discourages heavy traffic, which is fine at class-project scale.
- **Map rendering: MapLibre GL JS** (open-source fork of Mapbox GL) with **OpenFreeMap** tiles (free, no key) or **MapTiler**'s free tier. Better looking and faster than Leaflet, with vector tiles.
- **Mapbox:** generous free tier, but needs a card on file, so overage billing is possible. Avoid for the same reason as Google.
- **Whatever is chosen, geocode once, not per view.** The old page geocoded every opportunity's address on every visit, which is what multiplies API calls. Store `latitude`/`longitude` on `Opportunity` when it's created or seeded and read them from the DB. Set usage caps or budget alerts on any paid key, and never put an unrestricted paid key in a `VITE_` variable (it's public).

## Known quirks

- **`VolunteerUI` lint has 7 known warnings** (`react-hooks/exhaustive-deps`) and 0 errors since D-UI-002. Errors fail CI. Don't "fix" a warning by adding a dependency without checking for refetch loops in the browser.
- **`VITE_CLERK_PUBLISHABLE_KEY` is required even though Clerk is unused**: `VolunteerUI/src/main.jsx` throws `Missing Publishable Key` at startup without it, so the UI won't render. Set any placeholder value locally. Removing the check counts as touching Clerk/auth wiring, so ask first (KEY_DECISIONS.md).
- **`Chat` field naming mismatch**: `VolunteerAPI/chatModel/chatModel.js` reads/writes `conversationID` in its Prisma calls, but the `Chat` model in `prisma/schema.prisma` defines the field as `conversationId`. Verify which is actually correct (or whether this is silently broken) before touching chat persistence.
- **`@clerk/*` packages are unused**: they're listed in `package.json` for both `VolunteerAPI` and `VolunteerUI`, but nothing imports them (only the leftover env-var check in `main.jsx` remains, see above) — Firebase is the real auth system. See KEY_DECISIONS.md.
- **`OpportunityContext` caches opportunities in `localStorage`**: the unfiltered opportunity list is cached client-side and reused across sessions; only filtered/forced-refetch requests hit the network. Stale-looking data after a backend change is expected behavior, not a bug — clear `localStorage` or pass `forceRefetch` to see fresh data.
- **`level.js` and `opp_scraper/` are standalone scripts**, not wired into `server.js` — they're run manually (`node level.js`, Scrapy CLI) rather than as part of the normal request flow.

## Open questions / things to verify

- **Chat endpoint is unmounted**: `VolunteerAPI/routes/chatRoutes.js` defines `POST /` → `chatHandler`, but `app.js` (formerly `server.js`) never does `app.use("/chat", ...)`, so it's unreachable. Intentional (feature shelved) or an oversight? Combined with the `conversationID`/`conversationId` mismatch above, chat may be fully dead code.
- **Write endpoints are now all authenticated** (D-API-007). Open question for the SRS: should read endpoints like `GET /users` (every profile, public) stay public?
