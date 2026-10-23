# CONTEXT.md

Running notes on this codebase — quirks, gotchas, and things worth knowing that don't belong in `CLAUDE.md`'s architecture overview. This file is updated regularly as new things are found; newest entries go at the top of each section. If a note here turns into something Claude must actively enforce (not just be aware of), promote it to `KEY_DECISIONS.md`.

## Current status / session handoff

_Last updated 2026-10-22 (second session). Start here in a new session; overwrite this section as things change, don't append._

**Where things stand**
- Working branch: `context-setting` (the user prefers committing here and opening PRs from it). PRs go to the **fork's** `main`: `gh pr create -R avisink/VolunteerGo --base main`. Never target `ftl-pod/VolunteerGo`.
- PRs #1–#3 are merged (context docs; API tests + READMEs + documentation rule; CI + auth/search tests).
- **PR #4 (this session):** server-side points/levels (D-API-005), UI lint cleanup with blocking lint in CI (D-UI-002), the advisory Claude PR review (`review` job in `ci.yml` + `/pr-review` skill, KEY_DECISIONS.md), and the quick fixes from the first `/pr-review 4` run.
- Tests: VolunteerAPI has 26 Jest tests (`opportunities`, `auth`, `gamification`); VolunteerSearch has 12 pytest tests; VolunteerUI has none (lint must be error-free, then build).
- Latest decision IDs: **D-API-005, D-UI-002, D-SEARCH-001**.

**Decisions made in the second session**
- D-API-005: points are awarded by the apply endpoint on the server (opportunity's `points`, default 10). The level is recomputed in the same transaction. `PUT /users/points` is gone. Apply now requires auth and must be for yourself.
- D-UI-002: lint errors fixed (including a mousemove re-render storm in HomeHero and a dead user download in ProfilePage), `react-refresh` rule off for `contexts/`/`hooks/`, lint blocking in CI. 7 `exhaustive-deps` warnings left on purpose.
- KEY_DECISIONS "PR review: Claude-rated, advisory": `review` job in `ci.yml` (runs after api/ui/search pass; subscription token) + `.claude/skills/pr-review/SKILL.md`, which ends with a **Quick fixes** section.
- The user also has a **user-level `/skillify` skill** (`~/.claude/skills/skillify/`, not in this repo). It scans transcripts for asks made 3+ times and proposes parameterized skills.

**Waiting on the user**
- Turn on PR review: run `claude setup-token` locally and save the printed token as the **`CLAUDE_CODE_OAUTH_TOKEN` repo secret**. It uses the Claude subscription (no per-run bill) and skips without the secret. Watch the first real run: the action's auth and the sticky-comment step haven't run yet.
- Creating a **new Firebase project** and a **Supabase** database (checklist under "Pending setup" below). When ready, Claude adds `directUrl` to `schema.prisma` (plus a decision entry), runs `prisma migrate deploy` + `node seed.js`, starts all three services to verify, and records the Supabase/hosting move in KEY_DECISIONS.md.
- Deciding hosting for the API, search and frontend.
- Optional: branch protection on `main` requiring the three `ci.yml` checks (not PR review, which is advisory).

**Suggested next tasks**
1. Move **badge awarding** to the server too (`POST /badges/give` is unauthenticated and called from `utils/badgeService.js`), same pattern as D-API-005.
2. Add auth to the remaining write endpoints (opportunities/organizations/badges CRUD, `DELETE /users/:id`, save/unsave).
3. Fix the 7 `exhaustive-deps` warnings one at a time with manual browser testing.
4. Smaller fixes: VolunteerSearch `/search` 500 with no opportunities; `requests` missing from `requirements.txt`; `npm run seed` misconfigured; unmounted chat route.
5. Supabase + Firebase setup (blocked on the user).
6. Later: integration tests against real Postgres in CI; UI component tests; free-provider map.

**Environment notes for Claude**
- The user's npm config blocks package install scripts (`allowScripts`). Don't approve them; tests don't need them. CI uses `npm ci --ignore-scripts`.
- Local versions are Node 26 and Python 3.14; CI uses Node 24 and Python 3.13. For VolunteerSearch tests, make a venv outside the repo (or `.venv/`, which is gitignored) and run `pip install -r requirements-test.txt`.
- Never print `.env` or key contents. Check variable names, lengths or formats only.

## Pending setup (waiting on the user)

Status as of 2026-10-22. Key values were never printed or committed.

**Context:** this repo (`avisink/VolunteerGo`) is the user's own fork of the team project (`ftl-pod/VolunteerGo`). The original Firebase project (`ftlcapstone`), the Render deployments and database, and possibly other API accounts were set up by a teammate. The user is **moving every external service onto accounts they own**. Record that as a repo-wide decision in KEY_DECISIONS.md once the services are chosen.

Services to recreate under the user's own accounts:

- [ ] **Firebase (new project).** Email/password is the only sign-in method the code uses.
  1. Create the project and add a **Web app**. Copy its config into `VolunteerUI/.env` (`VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`). The old values there are also shifted by one line, so replace them all.
  2. **Authentication → Sign-in method → enable Email/Password.** `localhost` is an authorized domain by default; add the deployed frontend domain later.
  3. **Project settings → Service accounts → Generate new private key.** For local dev, save the downloaded JSON **as the file** `VolunteerAPI/firebase/serviceAccountKey.json` (currently 0 bytes). `firebaseAdmin.js` only reads `FIREBASE_SERVICE_ACCOUNT` from `.env` when `NODE_ENV=production`, and it must then be the whole JSON **on one line, wrapped in single quotes**. The value currently in `VolunteerAPI/.env` is multi-line, so dotenv only reads `{` and parsing fails.
  4. Old Firebase users don't carry over. That's fine, because the database is being recreated too.
- [ ] **Database: Supabase Postgres.** The old Render DB (`DATABASE_URL` in `VolunteerAPI/.env`) accepts TCP but closes every Postgres connection (Prisma `P1017`), so it's expired/suspended. Supabase hosts **only the database**, not the Express or FastAPI servers.
  1. Create a project. Under **Connect → ORMs → Prisma**, copy the **transaction pooler** (port `6543`, append `?pgbouncer=true`) and the **session pooler** (port `5432`). Don't use the direct `db.<ref>.supabase.co` host: it's IPv6-only and fails on most home networks and on Render.
  2. `VolunteerAPI/.env`: `DATABASE_URL=<transaction pooler>`, `DIRECT_URL=<session pooler>`. Then add `directUrl = env("DIRECT_URL")` to `prisma/schema.prisma` (needs a decision log entry).
  3. `npx prisma migrate deploy`, then `node seed.js` (loads `opp_scraper/opp_scraper/opportunity_updated.json` plus badges). Users are recreated automatically on first sign-in (`ProfileContext` calls `POST /users` on a 404).
  4. Supabase free projects **pause after ~7 days without activity**. Restore from the dashboard before demos.
- [ ] **Hosting for the API, search service and frontend.** Supabase can't run these. Options: Render (free web services sleep when idle), Railway, Fly.io; the frontend also fits Vercel, Netlify or Cloudflare Pages. Until deployed, use local URLs: `VolunteerUI/.env` → `VITE_API_BASE_URL=http://localhost:3000`, `VITE_SEARCH_URL=http://localhost:8000`; `VolunteerAPI/.env` → `PORT=3000` (VolunteerSearch defaults to 3000; the current value is `5000`), `FRONTEND_URL=http://localhost:5173` (currently the Render site, which would block local CORS).
- [ ] **SendGrid.** Working key verified, but check who owns the account. A new account needs a verified sender identity before it can send. The key should live only in `VolunteerAPI/.env` (it's also in `VolunteerUI/.env`, where nothing uses it).
- [ ] **Pexels and LocationIQ.** Working keys verified; replace them if they belong to the teammate. Both have free tiers, and LocationIQ needs no card.
- [ ] **OpenAI.** Only needed if the unmounted chat feature is revived.
- [ ] **Google Maps / Geocode.** Don't recreate (D-UI-001). The old keys were removed from `VolunteerUI/.env` but **are still in `VolunteerAPI/.env`** (as `VITE_GOOGLE_*`, unused by API code). Whoever owns that Google Cloud project should delete the keys, because they were public in the deployed bundle and caused the ~$800 bill.

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
- **Most VolunteerAPI write endpoints are unauthenticated**: create/update/delete for opportunities, organizations and badges, `DELETE /users/:id`, and the save/unsave routes take no token (apply is protected since D-API-005). Intentional for development, or a gap to close? Relevant to the SRS's security requirements, if it has any.
- **`npm run seed` likely doesn't work**: it runs `npx prisma db seed`, but `VolunteerAPI/package.json` has no `"prisma": { "seed": "node seed.js" }` block, so Prisma has no seed command to run. `node seed.js` works directly. Should the config be added, or the script changed to `node seed.js`?
