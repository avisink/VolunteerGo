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
| `DATABASE_URL` | Prisma | PostgreSQL connection string the app uses. On Supabase: the **transaction pooler** (port `6543`, ending `?pgbouncer=true`) |
| `DIRECT_URL` | Prisma | Connection used by `prisma migrate`. On Supabase: the **session pooler** (port `5432`). Required by `schema.prisma` ([D-API-008](#d-api-008-supabase-connection-settings-and-a-working-seed-script)) |
| `ADMIN_UIDS` | `middleware/auth.js` | Comma-separated Firebase UIDs allowed to create/edit/delete opportunities, organizations and badges. Unset means nobody ([D-API-007](#d-api-007-require-login-on-every-write-and-admins-for-catalog-data)) |
| `PORT` | `server.js` | Port the API listens on (VolunteerSearch defaults to `3000`) |
| `FRONTEND_URL` | `app.js` | The only origin allowed by CORS |
| `NODE_ENV` | `firebase/firebaseAdmin.js` | `production` reads the Firebase key from `FIREBASE_SERVICE_ACCOUNT` instead of the JSON file |
| `FIREBASE_SERVICE_ACCOUNT` | `firebase/firebaseAdmin.js` | Service-account JSON as a string (production only) |
| `JWT_SECRET` | `middleware/auth.js` | Secret for `optionalAuthenticateToken` (JWT, not Firebase) |
| `OPENAI_API_KEY` | `controllers/chatController.js` | Chat feature (currently unreachable, see [Known issues](#known-issues)) |
| `VITE_SENDGRID_API_KEY` | `controllers/userController.js` | Application confirmation emails |

For deployment, `render.yaml` at the repo root lists the same variables (see [KEY_DECISIONS.md](../KEY_DECISIONS.md), hosting entry).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm start` | Start with node |
| `npm test` | Run the Jest test suite |
| `npm run seed` (= `node seed.js`) | Seed the database. **Deletes all Opportunity, Organization and Badge rows first.** |
| `node level.js` | Backfill: recompute every user's level from their points with the shared formula. Only needed for data written before D-API-005 |
| `npx prisma migrate dev --name <name>` | Create and apply a migration after editing `schema.prisma` |
| `npx prisma generate` | Regenerate the Prisma client |


## Project structure

```
VolunteerAPI/
├── app.js              # builds and exports the Express app (middleware + routes); no listen
├── server.js           # entry point: imports app.js and calls app.listen(PORT)
├── routes/             # one router per resource, mounted in app.js
├── controllers/        # request handlers; talk to the database via db/db.js
├── middleware/auth.js  # verifyFirebaseToken (Firebase) and optionalAuthenticateToken (JWT)
├── lib/gamification.js # points-per-application and the level curve (the only place they're computed)
├── lib/badges.js       # badge rules and awardBadges (the only place badges are given)
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

🔒 means the route requires `Authorization: Bearer <Firebase ID token>`. 👤 means `:id` must also be the caller's own user (403 otherwise). 👑 means the caller's UID must be in `ADMIN_UIDS` (403 otherwise). Every write route has at least 🔒 ([D-API-007](#d-api-007-require-login-on-every-write-and-admins-for-catalog-data)).

**`/opportunities`**
| Method | Path | Notes |
|---|---|---|
| GET | `/` | Query: `keyword` (name contains), `city` (location contains), `sort_by`, `order=asc\|desc`. Default sort `createdAt asc`. Includes the organization. |
| GET | `/cities?q=` | Up to 20 unique city names taken from matching **organization** locations (`"City, ST"`) |
| GET | `/:id` | 404 if not found |
| POST | `/` 🔒👑 | Create |
| PUT | `/:id` 🔒👑 | Update |
| DELETE | `/:id` 🔒👑 | Delete |

**`/organizations`** and **`/badges`**: standard CRUD. Reads (`GET /`, `GET /:id`) are public; `POST /`, `PUT /:id` and `DELETE /:id` are 🔒👑. There's no endpoint to award a badge: badges are awarded by the actions that earn them ([D-API-006](#d-api-006-award-badges-on-the-server)).

**`/users`**
| Method | Path | Notes |
|---|---|---|
| GET | `/` | All users |
| GET | `/:id` | By database ID |
| GET | `/by-uid/:uid` | By Firebase UID |
| POST | `/` 🔒 | Create the caller's user row. The Firebase UID comes from the token; the body only gives `username` and optional `name` |
| GET | `/:id/opportunities` | Applied/joined opportunities |
| PUT | `/:id/opportunities/add` 🔒 | Apply to an opportunity. `:id` must be the caller (403 otherwise). Awards the opportunity's `points` (10 if it has none), recomputes the level, awards badges, and returns `{ opportunities, points, level, pointsAwarded, leveledUp, badgesEarned }`. Applying again awards nothing. See [D-API-005](#d-api-005-compute-points-and-levels-on-the-server) |
| GET | `/:id/saved-opportunities` | Saved opportunities |
| POST | `/:id/saved-opportunities/add` 🔒👤 | Save |
| POST | `/:id/saved-opportunities/remove` 🔒👤 | Unsave |
| POST | `/onboarding` 🔒 | Save onboarding answers. Awards the Newcomer badge the first time; returns `badgesEarned` |
| POST | `/send-confirmation-email` 🔒 | SendGrid application confirmation, always sent to the caller's own Firebase email (any `to` in the body is ignored) |
| DELETE | `/:id` 🔒👤 | Delete your own user row |

**`/friends`** 🔒 (every route): `POST /request`, `GET /received-requests`, `GET /sent-requests`, `POST /accept` (awards the accepter the Volunteer Connector badge; returns `badgesEarned`), `POST /reject`, `POST /cancel`, `POST /unfriend`, `GET /list`.

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

**Current coverage (44 tests):**
- `tests/opportunities.test.js`: `GET /opportunities` (list, keyword/city filters, 500 on DB error) and `GET /opportunities/:id` (found, 404).
- `tests/auth.test.js`: `verifyFirebaseToken` via `PUT /users/:id/opportunities/add` (no header, non-Bearer header, unverifiable token → 401; a verified uid reaches the controller).
- `tests/gamification.test.js`: the level curve, points per opportunity, and the apply endpoint (awards server-side points, ignores client-sent points/level, no double award, 403 for another user, 404 unknown opportunity, 400 missing id), plus `PUT /users/points` being gone and `POST /users/onboarding` ignoring client points/level.

- `tests/access.test.js`: badge rules, badges awarded by apply/onboarding/friend-accept, `POST /badges/give` gone, admin-only catalog writes (401/403/allowed with `ADMIN_UIDS`), public reads, self-only saved/delete routes, `POST /users` taking the UID from the token, and confirmation email going only to the caller.

To mock `prisma.$transaction`, make it call its callback with the mock client (see the top of `tests/gamification.test.js`). Tests that need an admin set `process.env.ADMIN_UIDS` and delete it in `beforeEach`.

Everything else is untested so far.

**CI:** the `api` job in `.github/workflows/ci.yml` runs `npm test` on every PR (see [KEY_DECISIONS.md](../KEY_DECISIONS.md#ci-github-actions-one-job-per-service)).

## Known issues

These are also tracked in [CONTEXT.md](../CONTEXT.md).

- **Chat is unreachable.** `routes/chatRoutes.js` is never mounted in `app.js`, and `chatModel.js` uses `conversationID` while the schema says `conversationId`.
- **There's no admin UI.** Catalog data (opportunities, organizations, badges) comes from `seed.js`, or from API calls by someone listed in `ADMIN_UIDS` (D-API-007).
- **Two simultaneous applies to the same opportunity can award points twice.** The "already applied?" check runs before the transaction (D-API-005). It's unlikely from the UI (the button is disabled while submitting) and costs at most one extra award.
- **Friend accept isn't atomic.** `acceptFriendRequest` updates the request and both users in separate queries, so a failure partway can leave the request accepted without the friendship. Badge awarding runs after them.
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

### D-API-006: Award badges on the server

- **Date:** 2026-10-23
- **Status:** Accepted
- **Context:** Badges were awarded by the UI. `utils/badgeService.js` checked the rules in the browser and called `POST /badges/give { userId, badgeName }`, which had **no auth**. Anyone could give any user any badge with one request, the same trust problem D-API-005 fixed for points. The checks also cost 2–4 extra requests per action, and the leaderboard check downloaded every user.
- **Options considered:**
  1. *Protect `POST /badges/give` with a token and a self-check.* Rejected: a signed-in user could still award themselves every badge, because the server wouldn't know whether they'd earned it.
  2. *Award badges inside the actions that earn them.* **Chosen.**
  3. *A periodic job that recomputes everyone's badges.* Rejected: there's nowhere to run one on the free hosting plan, and users expect the "badge earned" modal immediately.
- **Decision:**
  - `lib/badges.js` holds the rules: **Newcomer Badge** (onboarding), **First Steps** (first application), **Animal Advocate / Heart of the Community / Planet Protector** (applying to an opportunity tagged `animals` / `community` / `environment`, case-insensitive), **Impact Leader** (after applying, nobody has more points: **ties count**, where the old check took whoever the database listed first), and **Volunteer Connector** (accepting a friend request; only the accepter gets it, as before).
  - `awardBadges(db, userId, names)` connects only the badges the user doesn't have, skips names with no `Badge` row, and returns the newly earned rows.
  - Apply awards badges inside its transaction. Onboarding and friend accept award them after their writes. All three return `badgesEarned`, which the UI shows in its existing badge modal.
  - `POST /badges/give` and `badgeController.give` are **removed**, and `VolunteerUI/src/utils/badgeService.js` is deleted.
- **Rationale:** Same as D-API-005: the server can only trust what it decides itself. Awarding inside the action keeps the rule and the event together, and the UI gets the result in the same response.
- **Consequences / trade-offs:**
  - **Breaking:** `POST /badges/give` returns 404. Its only callers were in `badgeService.js`, removed in the same change.
  - Badge names in `lib/badges.js` must match the rows `seed.js` creates. A typo means the badge silently never awards (it's skipped, not an error).
  - Users who reached a badge condition before this change don't get it retroactively until they trigger the action again. A backfill script could fix that if needed.
  - Impact Leader is only checked when *you* apply, so you keep it after someone overtakes you (as before).
- **SRS reference:** _TBD_ (gamification: badges)

### D-API-007: Require login on every write, and admins for catalog data

- **Date:** 2026-10-23
- **Status:** Accepted
- **Context:** Most write endpoints accepted requests with no token: create/update/delete for opportunities, organizations and badges, `DELETE /users/:id`, saving and unsaving, and `POST /users` (whose body chose the Firebase UID). Anyone on the internet could delete every opportunity or every user. Separately, `POST /send-confirmation-email` sent any `to`/`subject`/`html` through the project's SendGrid account for any signed-in user, which made it an open email relay.
- **Options considered:**
  1. *Just require a token everywhere.* Rejected for catalog data: any user who signs up could still edit or delete every opportunity.
  2. *Roles in the database* (a `role` column or `Admin` table). Cleaner long-term, but needs a migration and a way to manage roles, and the UI has no admin screens.
  3. *An `ADMIN_UIDS` allowlist in the environment.* **Chosen** for catalog writes: no schema change, easy to set on the host.
  4. *Remove catalog write endpoints entirely* (seed-only). Rejected: they'd be needed for any future admin or organization tools.
- **Decision:**
  - New middleware in `middleware/auth.js`: `requireAdmin` (caller's UID must be in comma-separated `ADMIN_UIDS`; unset means nobody) and `requireSelf` (loads the user in `:id`, 404 if missing, 403 unless it belongs to the caller). Both run after `verifyFirebaseToken`.
  - **Admin-only (🔒👑):** `POST`/`PUT`/`DELETE` on `/opportunities`, `/organizations`, `/badges`. Reads stay public.
  - **Self-only (🔒👤):** `POST /users/:id/saved-opportunities/add|remove`, `DELETE /users/:id`. (Apply already checks this itself, D-API-005.)
  - **`POST /users`** requires a token and takes the UID from it; a `firebaseUid` in the body is ignored.
  - **Confirmation email** always goes to the caller's own token email. A `to` in the body is ignored, and an account with no email gets 400.
  - The UI now sends the token on save/unsave (DraggableCard, OpportunityGrid, SavedPage).
- **Rationale:** Closes every unauthenticated write without a schema change. The allowlist is the smallest thing that keeps catalog data safe until there's a real admin feature.
- **Consequences / trade-offs:**
  - **Breaking:** those routes now return 401 without a token, and 403 for someone else's account or a non-admin.
  - With `ADMIN_UIDS` unset (the default), catalog data can only change through `seed.js`. To get your UID, sign in and look in Firebase Console → Authentication → Users.
  - `requireSelf` adds one small query per protected request.
  - Read endpoints are still public, including `GET /users`, which returns every user's profile. Fine for a public leaderboard, but worth revisiting for privacy.
  - Follow-up: replace `ADMIN_UIDS` with roles if an admin UI is built.
- **SRS reference:** _TBD_ (security)

### D-API-008: Supabase connection settings, and a working seed script

- **Date:** 2026-10-23
- **Status:** Accepted
- **Context:** The database is moving to Supabase (KEY_DECISIONS.md, hosting entry). Supabase's recommended setup for an always-on server is a **transaction pooler** (PgBouncer, port 6543) for the app, but `prisma migrate` doesn't work through PgBouncer in transaction mode. Separately, `npm run seed` ran `prisma db seed` with no seed command configured, so it did nothing useful.
- **Options considered:**
  1. *`DATABASE_URL` = transaction pooler (`?pgbouncer=true`), `DIRECT_URL` = session pooler, plus `directUrl` in `schema.prisma`.* **Chosen.** This is Prisma's and Supabase's documented setup.
  2. *Use the session pooler for everything.* Simpler, but session mode holds a connection per client, so the free tier's connection limit runs out sooner.
  3. *Use the direct connection (`db.<ref>.supabase.co`).* Rejected: it's IPv6-only and fails on many home networks and on Render.
  4. For seeding: *add `"prisma": { "seed": "node seed.js" }`* vs *make the script `node seed.js`*. Chose the second: simpler, and nothing else uses `prisma db seed`.
- **Decision:** `schema.prisma` adds `directUrl = env("DIRECT_URL")`. `npm run seed` is now `node seed.js`.
- **Rationale:** Migrations and runtime each get the connection type they need.
- **Consequences / trade-offs:**
  - **`DIRECT_URL` is now required** wherever Prisma runs migrations (locally, and in the Render build, which runs `prisma migrate deploy`). Set it to the same value as `DATABASE_URL` for a plain local Postgres.
  - Tests are unaffected (they mock Prisma).
- **SRS reference:** _TBD_

