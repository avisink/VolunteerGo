# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

VolunteerGo is a gamified volunteer-matching platform with three independently-run services in this monorepo:

- **`VolunteerUI/`** — React 19 + Vite frontend.
- **`VolunteerAPI/`** — Node/Express REST API, the system of record (PostgreSQL via Prisma).
- **`VolunteerSearch/`** — Python FastAPI service that does AI-powered opportunity search/recommendations.

There is no root build; each service has its own `package.json`/`requirements.txt` and must be installed and run separately.

**Before making changes, check [KEY_DECISIONS.md](./KEY_DECISIONS.md)** for constraints that must be respected. See [CONTEXT.md](./CONTEXT.md) for running notes, quirks, and things worth knowing that don't belong in this architecture overview — it's updated more frequently than this file.

## Commands

### VolunteerUI (frontend)
```bash
cd VolunteerUI
npm install
npm run dev       # Vite dev server (http://localhost:5173)
npm run build     # production build
npm run lint      # ESLint
npm run preview   # preview a production build
```
There is no test suite in `VolunteerUI`.

### VolunteerAPI (backend)
```bash
cd VolunteerAPI
npm install
npm run dev        # nodemon server.js
npm start          # node server.js
npm run seed       # npx prisma db seed -> runs seed.js
npx prisma migrate dev --name <name>   # create/apply a migration
npx prisma generate                    # regenerate the Prisma client after schema changes
```
There is no test suite in `VolunteerAPI` (`npm test` is a stub that exits 1).

### VolunteerSearch (AI search service)
```bash
cd VolunteerSearch
pip install -r requirements.txt
uvicorn main:app --reload   # dev server, default http://localhost:8000
```

### Running the full stack locally
All three processes are started independently and talk to each other over HTTP — run each `dev`/`uvicorn` command above in its own terminal. `VolunteerAPI` needs a reachable PostgreSQL instance (`DATABASE_URL`) and Firebase project credentials before it will serve requests; `VolunteerSearch` needs `VolunteerAPI` to be running so it can fetch `/opportunities` on startup.

## Architecture

### Data flow between services
- `VolunteerUI` talks directly to `VolunteerAPI` for all CRUD (users, opportunities, organizations, badges, friends) via `VITE_API_BASE_URL`.
- `VolunteerUI` talks directly to `VolunteerSearch` for the AI-powered search/recommendation endpoint (`POST /search`).
- `VolunteerSearch` is stateless with respect to the DB: on startup (FastAPI `lifespan` in `VolunteerSearch/main.py`) it fetches all opportunities from `VolunteerAPI`'s `/opportunities` endpoint, builds a text blob per opportunity, and (in non-production only) encodes them with `sentence-transformers` (`all-MiniLM-L6-v2`) into cached vectors (`opportunity_vecs.pkl`). In production (`ENV=production`) it skips the embedding model entirely and falls back to pure keyword scoring — the two code paths in `/search` (`IS_PRODUCTION` branch) behave quite differently, so check which one is relevant before changing scoring logic. Opportunity data is only refreshed when the service restarts, not live.

### VolunteerAPI structure
Standard Express MVC-ish layout: `routes/` mount path prefixes in `server.js` (`/users`, `/opportunities`, `/organizations`, `/badges`, `/friends`) and delegate to `controllers/`, which use the shared Prisma client from `db/db.js`. `prisma/schema.prisma` is the source of truth for the data model — key relations:
- `Organization` 1—N `Opportunity`.
- `User` M—N `Opportunity` twice (`opportunities` = applied/joined, `savedOpportunities` = bookmarked) — distinguish these when querying or updating.
- `User` M—N `User` (`friends`/`friendOf`, self-relation) plus a separate `FriendRequest` model for pending sender/receiver requests with a `status` field.
- `User` M—N `Badge`.
- `Chat` stores chat prompts/responses by `conversationId` (see CONTEXT.md for a naming mismatch to check before touching chat persistence).

Auth (`middleware/auth.js`) is **Firebase**: `verifyFirebaseToken` verifies a Firebase ID token via `firebase-admin` (`firebase/firebaseAdmin.js`) and attaches the decoded token to `req.user`; `optionalAuthenticateToken` is a separate, JWT-based (not Firebase) guest-optional variant. See KEY_DECISIONS.md before touching auth.

Gamification logic: `level.js` is a standalone script (run manually, not wired into `server.js`) that recomputes every user's level from their points using an incrementing point-threshold curve and backfills `User.level`; apply the same formula if levels need to be computed elsewhere. Badges are awarded through `badgeController.js`/`Badge` model rather than computed on the fly.

`opp_scraper/` is a separate Scrapy project used to scrape opportunity listings into `opportunity_updated.json`, which `seed.js` reads to populate `Organization`/`Opportunity` rows (deduplicating organizations by name) when seeding the database.

### VolunteerUI structure
- `contexts/` holds app-wide React Context providers wrapped around the whole app in `components/App/App.jsx` (`OpportunityProvider`, `ProfileProvider`, `LeaderboardProvider`) plus `hooks/useAuth.jsx`'s `AuthProvider`, which wraps Firebase's `onAuthStateChanged` and exposes `{ user, token, isLoaded, isSignedIn }`.
- `contexts/OpportunityContext.jsx` caches the unfiltered opportunity list in `localStorage` and only hits the network for filtered/forced queries (see CONTEXT.md).
- Routing is a flat `react-router-dom` `<Routes>` tree in `components/App/App.jsx`; each route maps to a same-named folder under `components/`.
- `firebase.js` initializes the Firebase client SDK used by `useAuth.jsx` and by sign-in/sign-up pages.
