# CONTEXT.md

Running notes on this codebase — quirks, gotchas, and things worth knowing that don't belong in `CLAUDE.md`'s architecture overview. This file is updated regularly as new things are found; newest entries go at the top of each section. If a note here turns into something Claude must actively enforce (not just be aware of), promote it to `KEY_DECISIONS.md`.

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

- **`VolunteerUI` lint fails on existing code**: `npm run lint` reports 36 errors and 7 warnings (as of 2026-10-22), none from recent changes. A CI lint step will fail until these are fixed or the rules are relaxed. Decide which when setting up CI.
- **`VITE_CLERK_PUBLISHABLE_KEY` is required even though Clerk is unused**: `VolunteerUI/src/main.jsx` throws `Missing Publishable Key` at startup without it, so the UI won't render. Set any placeholder value locally. Removing the check counts as touching Clerk/auth wiring, so ask first (KEY_DECISIONS.md).
- **`Chat` field naming mismatch**: `VolunteerAPI/chatModel/chatModel.js` reads/writes `conversationID` in its Prisma calls, but the `Chat` model in `prisma/schema.prisma` defines the field as `conversationId`. Verify which is actually correct (or whether this is silently broken) before touching chat persistence.
- **`@clerk/*` packages are unused**: they're listed in `package.json` for both `VolunteerAPI` and `VolunteerUI`, but nothing imports them (only the leftover env-var check in `main.jsx` remains, see above) — Firebase is the real auth system. See KEY_DECISIONS.md.
- **`OpportunityContext` caches opportunities in `localStorage`**: the unfiltered opportunity list is cached client-side and reused across sessions; only filtered/forced-refetch requests hit the network. Stale-looking data after a backend change is expected behavior, not a bug — clear `localStorage` or pass `forceRefetch` to see fresh data.
- **`level.js` and `opp_scraper/` are standalone scripts**, not wired into `server.js` — they're run manually (`node level.js`, Scrapy CLI) rather than as part of the normal request flow.

## Open questions / things to verify

- **Chat endpoint is unmounted**: `VolunteerAPI/routes/chatRoutes.js` defines `POST /` → `chatHandler`, but `app.js` (formerly `server.js`) never does `app.use("/chat", ...)`, so it's unreachable. Intentional (feature shelved) or an oversight? Combined with the `conversationID`/`conversationId` mismatch above, chat may be fully dead code.
- **Most VolunteerAPI write endpoints are unauthenticated**: create/update/delete for opportunities, organizations and badges, `DELETE /users/:id`, and the save/apply routes take no token. Intentional for development, or a gap to close? Relevant to the SRS's security requirements, if it has any.
- **`npm run seed` likely doesn't work**: it runs `npx prisma db seed`, but `VolunteerAPI/package.json` has no `"prisma": { "seed": "node seed.js" }` block, so Prisma has no seed command to run. `node seed.js` works directly. Should the config be added, or the script changed to `node seed.js`?
