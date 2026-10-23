# VolunteerAPI

The REST API for VolunteerGo and the system of record. It's built with Node.js and Express, uses PostgreSQL through Prisma, and authenticates users with Firebase ID tokens. VolunteerUI calls it for all reads and writes, and VolunteerSearch reads `/opportunities` from it when it starts.

> This README is a living document. Per the repo's [documentation rule](../CLAUDE.md#documentation-rule-mandatory), update it whenever setup, endpoints, scripts, tests, or architecture change, and record every decision in the [Decision log](#decision-log) below.

## Contents

- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [Endpoints](#endpoints)
- [Authentication](#authentication)
- [Testing](#testing)
- [Known issues](#known-issues)
- [Decision log](#decision-log)

## Setup

Prerequisites: Node.js 18+, a reachable PostgreSQL database, and a Firebase project.

```bash
cd VolunteerAPI
npm install
npx prisma generate          # build the Prisma client from prisma/schema.prisma
npx prisma migrate dev       # apply migrations to your local database
node seed.js                 # optional: load scraped opportunities and badges
npm run dev                  # nodemon, restarts on file changes
```

Firebase admin needs a service-account key. Outside production it reads `firebase/serviceAccountKey.json`, a path relative to the current working directory, so always start the server from inside `VolunteerAPI/`. **Without this file the server crashes on startup** with `ENOENT`.

## Environment variables

Loaded from `VolunteerAPI/.env` via `dotenv`.

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | Prisma | PostgreSQL connection string |
| `PORT` | `server.js` | Port the API listens on (VolunteerSearch defaults to `3000`) |
| `FRONTEND_URL` | `app.js` | The only origin allowed by CORS |
| `NODE_ENV` | `firebase/firebaseAdmin.js` | `production` reads the Firebase key from `FIREBASE_SERVICE_ACCOUNT` instead of the JSON file |
| `FIREBASE_SERVICE_ACCOUNT` | `firebase/firebaseAdmin.js` | Service-account JSON as a string (production only) |
| `JWT_SECRET` | `middleware/auth.js` | Secret for `optionalAuthenticateToken` (JWT, not Firebase) |
| `OPENAI_API_KEY` | `controllers/chatController.js` | Chat feature (currently unreachable, see [Known issues](#known-issues)) |
| `VITE_SENDGRID_API_KEY` | `controllers/userController.js` | Application confirmation emails |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm start` | Start with node |
| `npm test` | Run the Jest test suite |
| `node seed.js` | Seed the database. **Deletes all Opportunity, Organization and Badge rows first.** |
| `node level.js` | Backfill: recompute every user's level from their points with the shared formula. Only needed for data written before D-API-005 |
| `npx prisma migrate dev --name <name>` | Create and apply a migration after editing `schema.prisma` |
| `npx prisma generate` | Regenerate the Prisma client |

`npm run seed` exists but probably doesn't work, see [Known issues](#known-issues).

## Project structure

```
VolunteerAPI/
├── app.js              # builds and exports the Express app (middleware + routes); no listen
├── server.js           # entry point: imports app.js and calls app.listen(PORT)
├── routes/             # one router per resource, mounted in app.js
├── controllers/        # request handlers; talk to the database via db/db.js
├── middleware/auth.js  # verifyFirebaseToken (Firebase) and optionalAuthenticateToken (JWT)
├── lib/gamification.js # points-per-application and the level curve (the only place they're computed)
├── db/db.js            # the single shared PrismaClient
├── firebase/           # firebase-admin initialisation (+ serviceAccountKey.json, not committed)
├── prisma/             # schema.prisma (source of truth) and migrations/
├── chatModel/          # Chat persistence helpers
├── opp_scraper/        # Scrapy project that produces opportunity_updated.json for seeding
├── seed.js             # seeds organizations, opportunities and badges
├── level.js            # manual level backfill, uses lib/gamification.js
└── tests/              # Jest + Supertest tests
```

Request flow: `server.js` → `app.js` (CORS, logging, JSON parsing) → `routes/<resource>Routes.js` → optional `verifyFirebaseToken` → `controllers/<resource>Controller.js` → Prisma.

## Data model

`prisma/schema.prisma` is the source of truth. Models: `Organization`, `Opportunity`, `User`, `Chat`, `Badge`, `FriendRequest`.

- `Organization` 1—N `Opportunity`.
- `User` M—N `Opportunity` **twice**: `opportunities` (applied/joined) and `savedOpportunities` (bookmarked). Make sure you're querying or updating the right one.
- `User` M—N `User` through `friends`/`friendOf` (self-relation), plus `FriendRequest` for pending requests with a `status`.
- `User` M—N `Badge`.
- `Chat` stores prompt/response pairs by `conversationId`.

## Endpoints

🔒 means the route requires `Authorization: Bearer <Firebase ID token>`.

**`/opportunities`**
| Method | Path | Notes |
|---|---|---|
| GET | `/` | Query: `keyword` (name contains), `city` (location contains), `sort_by`, `order=asc\|desc`. Default sort `createdAt asc`. Includes the organization. |
| GET | `/cities?q=` | Up to 20 unique city names taken from matching **organization** locations (`"City, ST"`) |
| GET | `/:id` | 404 if not found |
| POST | `/` | Create |
| PUT | `/:id` | Update |
| DELETE | `/:id` | Delete |

**`/organizations`** and **`/badges`**: standard CRUD (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`). Badges also have `POST /badges/give` to award a badge.

**`/users`**
| Method | Path | Notes |
|---|---|---|
| GET | `/` | All users |
| GET | `/:id` | By database ID |
| GET | `/by-uid/:uid` | By Firebase UID |
| POST | `/` | Create user |
| GET | `/:id/opportunities` | Applied/joined opportunities |
| PUT | `/:id/opportunities/add` 🔒 | Apply to an opportunity. `:id` must be the caller (403 otherwise). Awards the opportunity's `points` (10 if it has none), recomputes the level, and returns `{ opportunities, points, level, pointsAwarded, leveledUp }`. Applying again awards nothing. See [D-API-005](#d-api-005-compute-points-and-levels-on-the-server) |
| GET | `/:id/saved-opportunities` | Saved opportunities |
| POST | `/:id/saved-opportunities/add` | Save |
| POST | `/:id/saved-opportunities/remove` | Unsave |
| POST | `/onboarding` 🔒 | Save onboarding answers |
| POST | `/send-confirmation-email` 🔒 | SendGrid application confirmation |
| DELETE | `/:id` | Delete user |

**`/friends`** 🔒 (every route): `POST /request`, `GET /received-requests`, `GET /sent-requests`, `POST /accept`, `POST /reject`, `POST /cancel`, `POST /unfriend`, `GET /list`.

## Authentication

Firebase Authentication is the only auth system in use (see [KEY_DECISIONS.md](../KEY_DECISIONS.md#auth-firebase-is-canonical-not-clerk)). The client signs in with Firebase, gets an ID token, and sends it as a bearer token. `verifyFirebaseToken` checks the token with `firebase-admin` and attaches the decoded token to `req.user`. The `@clerk/*` dependencies are unused leftovers.

## Testing

Tests use **Jest** and **Supertest** and live in `tests/`. They need no database, no Firebase key, and no `.env`.

```bash
npm test                                  # all tests
npx jest tests/opportunities.test.js      # one file
npx jest -t "returns 404"                 # tests whose name matches
```

How they work:
- Tests import the app from `app.js` and send requests to it in memory with Supertest. No port is opened (see [D-API-001](#d-api-001-split-the-express-app-from-the-server-entry-point)).
- `jest.mock("../db/db", ...)` replaces the Prisma client with mock functions. Each test sets return values such as `prisma.opportunity.findMany.mockResolvedValue([...])` and can check the arguments the controller passed (see [D-API-003](#d-api-003-mock-prisma-and-firebase-in-route-tests)).
- `jest.mock("../firebase/firebaseAdmin.js", ...)` is **required in every test file that loads `app.js`**. `userController.js` imports Firebase admin, which reads the key file as soon as it's imported.

- To test a 🔒 route, mock `firebaseAdmin.js` as `{ auth: () => ({ verifyIdToken: mockVerifyIdToken }) }`. Then make `mockVerifyIdToken` resolve to a fake decoded token (`{ uid: "..." }`) or reject. See `tests/auth.test.js`. The mock function's name must start with `mock` so Jest allows it inside `jest.mock()`.

**Current coverage (25 tests):**
- `tests/opportunities.test.js`: `GET /opportunities` (list, keyword/city filters, 500 on DB error) and `GET /opportunities/:id` (found, 404).
- `tests/auth.test.js`: `verifyFirebaseToken` via `PUT /users/:id/opportunities/add` (no header, non-Bearer header, unverifiable token → 401; a verified uid reaches the controller).
- `tests/gamification.test.js`: the level curve, points per opportunity, and the apply endpoint (awards server-side points, ignores client-sent points/level, no double award, 403 for another user, 404 unknown opportunity, 400 missing id), plus `PUT /users/points` being gone.

To mock `prisma.$transaction`, make it call its callback with the mock client (see the top of `tests/gamification.test.js`).

Everything else is untested so far.

**CI:** the `api` job in `.github/workflows/ci.yml` runs `npm test` on every PR (see [KEY_DECISIONS.md](../KEY_DECISIONS.md#ci-github-actions-one-job-per-service)).

## Known issues

These are also tracked in [CONTEXT.md](../CONTEXT.md).

- **Chat is unreachable.** `routes/chatRoutes.js` is never mounted in `app.js`, and `chatModel.js` uses `conversationID` while the schema says `conversationId`.
- **`npm run seed` probably doesn't work.** `package.json` has no `prisma.seed` setting, so `prisma db seed` has nothing to run. Use `node seed.js`.
- **Most write endpoints have no auth.** Creating, updating and deleting opportunities, organizations and badges, `DELETE /users/:id`, and the save/unsave routes accept requests without a token. (Apply is now protected, D-API-005.)
- **Two simultaneous applies to the same opportunity can award points twice.** The "already applied?" check runs before the transaction (D-API-005). It's unlikely from the UI (the button is disabled while submitting) and costs at most one extra award.
- **Badges are still awarded from the client** (`POST /badges/give` has no auth). Same class of problem D-API-005 fixed for points.
- **`optionalAuthenticateToken` uses a JWT secret, not Firebase,** so it can't validate the tokens the frontend actually sends. It isn't used on any route right now.

## Decision log

Each entry records why the API is the way it is. Newest at the bottom. Format and rules: [CLAUDE.md → Documentation rule](../CLAUDE.md#documentation-rule-mandatory). Decisions that span services live in [KEY_DECISIONS.md](../KEY_DECISIONS.md).

### Inherited decisions (before this log started)

These were in place before 2026-10-22, and their rationale wasn't written down. They're recorded so later decisions can refer to them.

- **Express + Prisma + PostgreSQL** as the API stack. Rationale not documented.
- **Firebase Authentication** for identity. See [KEY_DECISIONS.md](../KEY_DECISIONS.md#auth-firebase-is-canonical-not-clerk).
- **Level computation in a standalone script** (`level.js`) rather than on every points update. Rationale not documented. Superseded by [D-API-005](#d-api-005-compute-points-and-levels-on-the-server); `level.js` is now only a backfill.
- **Seed data comes from a Scrapy scraper** (`opp_scraper/` → `opportunity_updated.json` → `seed.js`). Rationale not documented.

### D-API-001: Split the Express app from the server entry point

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** `server.js` both built the app and called `app.listen()`, and it exported nothing. Automated tests need the app object without starting a real server. Importing `server.js` from a test would open a port, which can clash with a running dev server or other test files and keeps Jest from exiting.
- **Options considered:**
  1. *Split into `app.js` (build and export) and `server.js` (listen).* Chosen.
  2. *Keep one file and only listen when it's run directly* (`if (require.main === module) app.listen(...)`). This works, but mixes two jobs in one file and is easy to break by accident.
  3. *Test against a running server over HTTP.* Slower, needs a free port and process management in CI, and can't use in-process mocks.
- **Decision:** `app.js` creates the app, adds middleware and routes, and exports it. `server.js` only imports it and listens on `PORT`.
- **Rationale:** This is the standard pattern for testing Express apps with Supertest. It keeps startup separate from configuration, and `npm run dev` / `npm start` behave the same as before.
- **Consequences:** New middleware and routes go in `app.js`, not `server.js`. Anything that must run only when the real server starts (opening connections, scheduled jobs) goes in `server.js`. An unused `const { organization } = require("./db/db")` import was dropped in the move.
- **SRS reference:** _TBD_

### D-API-002: Use Jest + Supertest as the test framework

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** The API had no tests (`npm test` just failed on purpose), and automated tests plus CI are the project's next priority.
- **Options considered:**
  1. *Jest + Supertest.* Chosen.
  2. *Mocha + Chai + Sinon.* Works, but needs three libraries to do what Jest does alone, and replacing whole modules needs an extra tool such as `proxyquire`.
  3. *Vitest.* Fast, but built around ES modules and Vite. The API is CommonJS, and Vitest's module mocking for `require()` is less straightforward.
  4. *Node's built-in `node:test`.* No dependencies, but its module mocking is newer and less familiar, and there are fewer examples for Express.
- **Decision:** Jest 30 as the runner and for assertions and mocking. Supertest to send requests to the app. Both are dev dependencies, and `npm test` runs `jest`.
- **Rationale:** `jest.mock()` can replace a CommonJS module before the code under test imports it, which is exactly what's needed to swap out `db/db.js` and `firebaseAdmin.js` (see D-API-003). It works with CommonJS without config, and it's the most widely documented choice for Express, which helps teammates and the class.
- **Consequences:** Jest sets `NODE_ENV=test` automatically (used in D-API-004). Test files go in `tests/` and are named `*.test.js`.
- **SRS reference:** _TBD_

### D-API-003: Mock Prisma and Firebase in route tests

- **Date:** 2026-10-22
- **Status:** Accepted (for now; a real-database integration layer is planned)
- **Context:** Controllers import a single shared `PrismaClient` from `db/db.js`, and `firebaseAdmin.js` reads a service-account key file as soon as it's imported. Running tests against these for real would need a live PostgreSQL database and real Firebase credentials on every machine and in CI.
- **Options considered:**
  1. *Mock both with `jest.mock`.* Chosen for now.
  2. *Test against a real PostgreSQL test database* (local Docker or a CI service container), reset between tests. Checks real queries against the real schema, but is slower and needs database setup, migrations and cleanup.
  3. *Pass the Prisma client into controllers instead of importing it.* Cleaner design, but means refactoring every controller before writing the first test.
- **Decision:** Route tests mock `../db/db` with only the Prisma methods each test file needs, and stub `../firebase/firebaseAdmin.js`.
- **Rationale:** This gets useful tests running today with no infrastructure. The tests are fast and reliable, and they check controller logic: status codes, response shapes, filter and query building, error handling.
- **Consequences / trade-offs:**
  - Mocked tests **can't catch** wrong field names, broken relations, or schema/migration drift (for example, the `conversationID` mismatch would pass a mocked test).
  - Every test file that loads `app.js` must stub Firebase.
  - Testing a 🔒 route needs a mock `admin.auth().verifyIdToken` that returns a fake decoded token.
  - Follow-up: add integration tests against a real Postgres (likely a CI service container), which would be recorded as a new decision.
- **SRS reference:** _TBD_

### D-API-004: Turn off request logging during tests

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** `morgan("dev")` logged every Supertest request, burying Jest's output.
- **Options considered:** (1) Skip morgan when `NODE_ENV === "test"`. Chosen. (2) Run Jest with `--silent`, which doesn't help because morgan writes to stdout directly, not through `console`. (3) Leave it as is.
- **Decision:** `app.js` adds morgan only when `NODE_ENV !== "test"`.
- **Rationale:** Readable test and CI output with a one-line change. Development and production logging don't change.
- **Consequences:** Request logs never show up in test runs. If you're debugging a test, temporarily log inside it.
- **SRS reference:** _TBD_

### D-API-005: Compute points and levels on the server

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** Applying to an opportunity worked like this: the UI added 10 to the user's points, computed the level itself, and sent both to `PUT /users/points`, which saved whatever it received. Any signed-in user could send `{ "points": 99999 }` and top the leaderboard. Separately, `PUT /users/:id/opportunities/add` (apply) had **no auth at all**, so anyone could apply on anyone's behalf. The level formula existed twice (`level.js` and the UI's `ProgressBar`), and `onboarding` also accepted `points`/`level` from the body. Gamification is the core of the product, so its numbers need to be trustworthy.
- **Options considered:**
  1. *Keep `PUT /users/points` but validate it* (only allow +10, check the level matches). Rejected: the server would still be checking the client's math instead of doing it, and the client could still call it without applying.
  2. *Award points inside the apply endpoint.* **Chosen.** The action that earns points and the points themselves change together, in one transaction.
  3. *Award points when an organization accepts the application* (what the old README suggested). Rejected for now: there's no acceptance flow or application status in the data model. Worth revisiting if one is added, since it would reward actual volunteering, not just applying.
  4. *Store the level as derived only* (compute on read, drop `User.level`). Rejected: the leaderboard, profile and friends views already read `level` from many places. Keeping the column but writing it only on the server gets the safety without touching every reader.
- **Decision:**
  - New `lib/gamification.js` holds `getLevelFromPoints` (the existing curve: 15 points to level 2, then 5 more each level) and `pointsForOpportunity`, which uses the opportunity's own `points`, or `DEFAULT_APPLICATION_POINTS` (10) when it's 0. All seeded opportunities have 10, so today's behaviour is unchanged.
  - `PUT /users/:id/opportunities/add` now requires `verifyFirebaseToken`, returns 403 unless `:id` belongs to the caller, returns 404 for an unknown opportunity, and, in one `$transaction`, connects the opportunity, increments `points`, and sets `level` from the new total. It returns `{ opportunities, points, level, pointsAwarded, leveledUp }`. **Re-applying awards nothing** (`pointsAwarded: 0`).
  - `PUT /users/points` and `updateUserPoints` are **removed**. `POST /users/onboarding` ignores `points` and `level` in the body.
  - `level.js` uses the shared helper and is now CommonJS. Its `import` syntax couldn't run in this package before.
  - The UI (`ApplyModal`) no longer computes or sends points. It reads `leveledUp` from the response to trigger the level-up animation. `ProgressBar.getLevelData` stays for display only, with a comment pointing here.
- **Rationale:** The server is the only party that can be trusted with a score. Tying the award to the apply action removes the separate endpoint and makes the award idempotent. Using the opportunity's own `points` field (which already existed and was seeded) lets some opportunities be worth more later with no code change.
- **Consequences / trade-offs:**
  - **Breaking API change:** clients calling `PUT /users/points` now get 404, and apply needs a bearer token. The only caller of each was `ApplyModal`, updated in the same change.
  - The UI's progress bar still uses its own copy of the curve. If the curve changes, update both, or expose level progress from the API.
  - The duplicate-apply check happens before the transaction, so two simultaneous requests could both award points (see Known issues). A unique "application" row would fix this properly.
  - Badges are still granted by client calls to an unauthenticated `POST /badges/give`. That's the obvious next fix of the same kind.
  - Points for things other than applying (e.g. attending) would need new server-side award points, not a general "set points" endpoint.
- **SRS reference:** _TBD_ (gamification: points, levels, leaderboard integrity)

