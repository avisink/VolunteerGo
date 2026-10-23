# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

VolunteerGo is a gamified volunteer-matching platform with three independently-run services in this monorepo:

- **`VolunteerUI/`** — React 19 + Vite frontend. Full docs: [VolunteerUI/README.md](./VolunteerUI/README.md).
- **`VolunteerAPI/`** — Node/Express REST API, the system of record (PostgreSQL via Prisma). Full docs: [VolunteerAPI/README.md](./VolunteerAPI/README.md).
- **`VolunteerSearch/`** — Python FastAPI service that does AI-powered opportunity search/recommendations. Full docs: [VolunteerSearch/README.md](./VolunteerSearch/README.md).

There is no root build; each service has its own `package.json`/`requirements.txt` and must be installed and run separately.

**Before making changes, check [KEY_DECISIONS.md](./KEY_DECISIONS.md)** for constraints that must be respected. See [CONTEXT.md](./CONTEXT.md) for running notes, quirks, and things worth knowing that don't belong in this architecture overview — it's updated more frequently than this file.

This repo is also a software engineering class project, so its documentation is a deliverable, not an afterthought. The SRS gives the requirements context (links to be added):
- SRS: _TBD — the user will add the link_

## Documentation rule (mandatory)

Every decision made while working in this repo must be documented in detail **in the same change that makes it**. This includes design and architecture choices, tooling, libraries, test strategy, CI, conventions, and deliberate "we chose not to do X" calls. Treat documentation as part of finishing the task, not a follow-up.

**Where it goes:**
- **Decisions about one service** go in the **Decision log** section of that service's README ([VolunteerAPI/README.md](./VolunteerAPI/README.md), [VolunteerUI/README.md](./VolunteerUI/README.md), [VolunteerSearch/README.md](./VolunteerSearch/README.md)). Give each one the next ID (`D-API-NNN` / `D-UI-NNN` / `D-SEARCH-NNN`).
- **Decisions that span services** (CI, repo layout, auth across services, shared conventions) go in [KEY_DECISIONS.md](./KEY_DECISIONS.md).
- **Quirks, gotchas, and open questions** that aren't decisions go in [CONTEXT.md](./CONTEXT.md).

**What each decision entry must contain:** date, context (the problem or what prompted it), options considered (including ones rejected), the decision, rationale, consequences and trade-offs (what it costs, what it rules out, follow-up work), and, where relevant, which SRS requirement it serves. If an existing decision is reversed, don't delete it: mark it **Superseded by `<new ID>`** and add the new entry.

**Keeping the READMEs current:** when a change affects what a README describes (setup, env vars, endpoints, routes, scripts, tests, architecture), update that README in the same change. The service READMEs are the living, human-facing docs; CLAUDE.md stays a short map for Claude.

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
There is no test suite in `VolunteerUI`. Lint must have 0 errors (CI blocks on them).

### VolunteerAPI (backend)
```bash
cd VolunteerAPI
npm install
npm run dev        # nodemon server.js
npm start          # node server.js
node seed.js       # seed DB (wipes Opportunity/Organization/Badge rows first); `npm run seed` calls `prisma db seed` but no `prisma.seed` command is configured in package.json
npx prisma migrate dev --name <name>   # create/apply a migration
npx prisma generate                    # regenerate the Prisma client after schema changes
```
Tests use Jest + Supertest and live in `VolunteerAPI/tests/`:
```bash
npm test                                   # run all tests
npx jest tests/opportunities.test.js       # one file
npx jest -t "returns 404"                  # tests matching a name
```
`app.js` builds and exports the Express app; `server.js` only calls `app.listen`, so tests `require("../app")` without binding a port. Tests mock `db/db` (the Prisma client) and `firebase/firebaseAdmin.js` (which reads a service-account key at import time) with `jest.mock`, so they need no database or Firebase credentials. Any test file that loads `app.js` must keep the Firebase mock, because `userController.js` imports Firebase admin. Rationale and trade-offs: decisions D-API-001 to D-API-004 in the API README.

### VolunteerSearch (AI search service)
```bash
cd VolunteerSearch
pip install -r requirements.txt
uvicorn main:app --reload   # dev server, default http://localhost:8000

pip install -r requirements-test.txt   # light test deps (no PyTorch)
pytest -q                               # tests; force ENV=production (keyword path), stub the API call
pytest tests/test_search.py -k stop     # tests matching a name
```

### CI
`.github/workflows/ci.yml` (GitHub Actions) runs on every PR and on pushes to `main`, with three parallel jobs and no secrets: `api` (`npm test`), `ui` (`npm run lint`, where errors block and warnings don't, then `npm run build`), and `search` (`pytest`). When adding tests or changing how a service is built, make sure its CI job still covers it.

A fourth job, `review`, runs an **advisory** Claude review on PRs only after the other three pass. It authenticates with the user's Claude subscription (`CLAUDE_CODE_OAUTH_TOKEN` secret, from `claude setup-token`) and skips without it. Its rubric is `.claude/skills/pr-review/SKILL.md`, which also runs locally as `/pr-review`. Change review criteria there. Rationale for both workflows is in KEY_DECISIONS.md.

### Running the full stack locally
All three processes are started independently and talk to each other over HTTP — run each `dev`/`uvicorn` command above in its own terminal. `VolunteerSearch` needs `VolunteerAPI` to be running so it can fetch `/opportunities` on startup.

Environment variables that matter (each service loads its own `.env`):
- **VolunteerAPI**: `DATABASE_URL`, `PORT`, `FRONTEND_URL` (the only CORS origin allowed), `JWT_SECRET`, `OPENAI_API_KEY` (chat controller), `VITE_SENDGRID_API_KEY`. Firebase admin reads `firebase/serviceAccountKey.json` (path relative to cwd, so run from `VolunteerAPI/`) unless `NODE_ENV=production`, where it parses `FIREBASE_SERVICE_ACCOUNT` JSON instead.
- **VolunteerUI**: `VITE_API_BASE_URL`, `VITE_SEARCH_URL` (VolunteerSearch base URL), `VITE_FIREBASE_*`, LocationIQ (city autocomplete), and Pexels keys. The Google Maps/Geocode vars are intentionally unset after a large bill: the `/map` page is a stretch feature (D-UI-001). Don't add Google keys back or introduce a paid maps API without asking; free alternatives are listed in CONTEXT.md.
- **VolunteerSearch**: `ENV` (`production` switches to keyword-only scoring) and, confusingly, `VITE_API_BASE_URL` for the VolunteerAPI URL (defaults to `http://localhost:3000`). CORS origins are hardcoded in `main.py` (`localhost:5173` and the Render deployment).

The root `package.json` is a stray dependency list, not a workspace — don't install or build from the repo root.

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
- `Chat` stores chat prompts/responses by `conversationId` (see CONTEXT.md for a naming mismatch to check before touching chat persistence). Note `routes/chatRoutes.js` exists but is **not mounted** in `server.js`, so the chat endpoint is currently unreachable.

Note: the README describes search as "OpenAI embeddings", but `VolunteerSearch` actually uses local `sentence-transformers` (no OpenAI dependency); OpenAI is only used by the API's chat controller.

Auth (`middleware/auth.js`) is **Firebase**: `verifyFirebaseToken` verifies a Firebase ID token via `firebase-admin` (`firebase/firebaseAdmin.js`) and attaches the decoded token to `req.user`; `optionalAuthenticateToken` is a separate, JWT-based (not Firebase) guest-optional variant. See KEY_DECISIONS.md before touching auth.

Gamification logic: points and levels are computed **only on the server**, in `lib/gamification.js` (D-API-005). Applying to an opportunity (`PUT /users/:id/opportunities/add`, 🔒) awards the opportunity's points and recomputes the level in one transaction. Never add an endpoint that lets the client set points or level. `level.js` is a manual backfill that uses the same helper. Badges are awarded through `badgeController.js`/`Badge` model rather than computed on the fly.

`opp_scraper/` is a separate Scrapy project used to scrape opportunity listings into `opportunity_updated.json`, which `seed.js` reads to populate `Organization`/`Opportunity` rows (deduplicating organizations by name) when seeding the database.

### VolunteerUI structure
- `contexts/` holds app-wide React Context providers wrapped around the whole app in `components/App/App.jsx` (`OpportunityProvider`, `ProfileProvider`, `LeaderboardProvider`) plus `hooks/useAuth.jsx`'s `AuthProvider`, which wraps Firebase's `onAuthStateChanged` and exposes `{ user, token, isLoaded, isSignedIn }`.
- `contexts/OpportunityContext.jsx` caches the unfiltered opportunity list in `localStorage` and only hits the network for filtered/forced queries (see CONTEXT.md).
- Routing is a flat `react-router-dom` `<Routes>` tree in `components/App/App.jsx`; each route maps to a same-named folder under `components/`.
- `firebase.js` initializes the Firebase client SDK used by `useAuth.jsx` and by sign-in/sign-up pages.
