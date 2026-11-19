# VolunteerUI

The VolunteerGo frontend: a React 19 single-page app built with Vite. Users sign in with Firebase and browse, search, save and apply for volunteer opportunities. They earn points and badges and compete with friends on a leaderboard. It calls **VolunteerAPI** for all reads and writes and **VolunteerSearch** for AI-powered search.

> This README is a living document. Per the repo's [documentation rule](../CLAUDE.md#documentation-rule-mandatory), update it whenever setup, routes, env vars, scripts, tests, or architecture change, and record every decision in the [Decision log](#decision-log) below.

## Contents

- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Pages and routes](#pages-and-routes)
- [State and data flow](#state-and-data-flow)
- [Authentication](#authentication)
- [Testing](#testing)
- [Known issues](#known-issues)
- [Decision log](#decision-log)

## Setup

Prerequisites: Node.js 18+, VolunteerAPI running, and (for search) VolunteerSearch running.

```bash
cd VolunteerUI
npm install
npm run dev        # http://localhost:5173
```

VolunteerSearch only accepts requests from `http://localhost:5173` and the deployed site, so keep the default dev port.

## Environment variables

Loaded from `VolunteerUI/.env`. Vite only exposes variables that start with `VITE_`, and their values are **built into the JavaScript bundle**, so anyone who loads the site can read them. Never put server secrets here.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | VolunteerAPI base URL |
| `VITE_SEARCH_URL` | VolunteerSearch base URL (`POST /search`) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Firebase client config (`src/firebase.js`) |
| `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAP_ID`, `VITE_GOOGLE_GEOCODE_API_KEY` | Map page (stretch feature). **Intentionally unset**, see [D-UI-001](#d-ui-001-keep-the-map-page-as-a-stretch-feature-with-google-maps-keys-removed) |
| `VITE_LOCATIONIQ_ACCESS_TOKEN` | City autocomplete (`CitySearch`) |
| `VITE_PEXELS_API_KEY` | Opportunity images (`src/utils/getImage.js`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Required at startup** even though Clerk is unused, see [Known issues](#known-issues) |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint (`eslint.config.js`) |
| `npm test` | Run the Vitest test suite once |
| `npm run test:watch` | Vitest in watch mode, re-running tests as files change |

## Project structure

```
VolunteerUI/src/
├── main.jsx            # entry: wraps <App> in AuthProvider
├── firebase.js         # Firebase client SDK init (exports auth)
├── components/
│   ├── App/App.jsx     # context providers + the <Routes> tree
│   └── <Feature>/      # one folder per page or component (JSX + CSS)
├── contexts/           # OpportunityContext, ProfileContext, LeaderboardContext
├── hooks/useAuth.jsx   # AuthProvider / useAuth
├── utils/              # getImage (Pexels), loadGoogleMaps
├── config/featureFlags.js  # feature flags and isEnabled(); a copy of VolunteerAPI's list
└── data/opportunities.js   # static sample data, not imported anywhere
```

Tests live outside `src/`, in `VolunteerUI/tests/` (`setup.js`, `helpers.jsx`, `*.test.jsx`).

## Pages and routes

All routes are defined in one flat list in `components/App/App.jsx`. Each one points to the component folder with the same name.

| Path | Component | Purpose |
|---|---|---|
| `/` | `HomePage` | Landing and browse |
| `/search` | `SearchPage` | AI search via VolunteerSearch |
| `/login`, `/signup` | `LoginPage`, `SignupPage` | Firebase sign-in and sign-up |
| `/onboarding` | `Onboarding` | Collect interests, skills and location |
| `/profile` | `ProfilePage` | Your profile, badges, friends (`FriendsPage` is rendered inside it) |
| `/public-profile/:userId` | `PublicProfile` | Another user's profile |
| `/leaderboard` | `Leaderboard` | Points ranking |
| `/saved` | `SavedPage` | Saved opportunities |
| `/opportunity/:id` | `OpportunityPage` | Opportunity detail and apply |
| `/map` | `LocationPage` | Map view. Stretch feature, not linked in the nav, no API keys (D-UI-001). Behind the `map` flag, which ships **off**, so the route shows "Temporarily unavailable" |

## Feature flags

Any gateable feature can be switched off in code while the rest of the app keeps working ([D-UI-004](#d-ui-004-feature-flags-with-a-featuregate-component); cross-service rules in [KEY_DECISIONS.md](../KEY_DECISIONS.md#feature-gates-code-level-flags-one-file-per-service)).

- `src/config/featureFlags.js` is a copy of `VolunteerAPI/config/featureFlags.js` (the source of truth), with the same names and values. A VolunteerAPI test fails if they differ, so change a flag in every copy. `VITE_` values aren't used: flags live in code.
- `isEnabled("flagName")` is the only way code asks about a flag. An unknown name throws in development and tests; in a production build it logs an error and counts as on.
- `<FeatureGate flag="flagName" page>` wraps a route's element: while the flag is off, visiting the route shows `FeatureUnavailable` ("Temporarily unavailable", with a link home) instead of the page.
- `<FeatureGate flag="flagName">` wraps a nav link, button, tab or other entry point: while the flag is off it renders nothing, or its `fallback` prop.
- Code that only *uses* another feature checks `isEnabled` and skips that piece, and should treat a `503` from the API or search service the same way.

Flags so far: `map` (off; UI-only), `confirmationEmail`, `friends`. Every flag, what it turns off and how to toggle it: [FEATURE_FLAGS.md](../FEATURE_FLAGS.md).

## State and data flow

App-wide state lives in React Context. There's no Redux or other state library.

- **`AuthProvider`** (`hooks/useAuth.jsx`, wraps everything in `main.jsx`) listens to Firebase's `onAuthStateChanged` and exposes `{ user, token, isLoaded, isSignedIn }`.
- **`OpportunityProvider`**: `fetchOpportunities(searchResults, forceRefetch)`.
  - The unfiltered list is **cached in `localStorage`** under `opportunities` and reused across sessions without asking the server again.
  - Requests with `keyword` or `city`, or with `forceRefetch`, always fetch from `GET /opportunities`. Filtered results are never cached.
  - So stale data after a backend change is expected: clear `localStorage` or force a refetch.
- **`ProfileProvider`**: loads the signed-in user with `GET /users/by-uid/:uid`. On a 404 it creates the user (`POST /users`), then fetches again. Sends the Firebase token as a bearer token.
- **`LeaderboardProvider`**: `GET /users`, exposes `refreshLeaderboard`.
- **Badges** are awarded by the API (VolunteerAPI D-API-006). Apply, onboarding and friend accept return `badgesEarned`, which `BadgeModal` shows. The old client-side `badgeService` was removed.

Network calls use a mix of `fetch` and `axios`.

## Authentication

Firebase Authentication (`firebase/auth`), **email/password sign-in only**, is the only auth system in use (see [KEY_DECISIONS.md](../KEY_DECISIONS.md#auth-firebase-is-canonical-not-clerk)). After sign-in, `useAuth` provides the Firebase ID token, and components send it as `Authorization: Bearer <token>` to the API routes that require it. Every API write requires it since VolunteerAPI D-API-007, so any new `fetch`/`axios` call that changes data must include the header.

## Testing

Tests use **Vitest** and **React Testing Library** in a simulated browser (jsdom), and live in `tests/` ([D-UI-003](#d-ui-003-vitest--react-testing-library-for-ui-tests)). They need no `.env`, no Firebase project and no running API.

```bash
npm test                              # all tests, once
npm run test:watch                    # re-run on change
npx vitest run tests/smoke.test.jsx   # one file
npx vitest run -t "signed in"         # tests whose name matches
```

How they work:
- `tests/setup.js` runs before every test file. It mocks `src/firebase.js` and `firebase/auth` (so Firebase is never contacted), replaces `fetch` with a stub that answers `200 []`, clears `localStorage`, and resets the URL to `/`.
- `tests/helpers.jsx` has `renderApp(path)`, which renders the whole app the way `main.jsx` does at a given URL, and `signInAs(user)`, which makes the mocked Firebase report a signed-in user. Call `signInAs` **before** `renderApp`. The default is signed out.
- A test that needs specific API data replaces the stub: `fetch.mockImplementation(async (url) => ...)`. Components that use `axios` need `vi.mock('axios')` in that test file.
- Tests import `describe`, `test`, `expect` and `vi` from `vitest` (no globals), so ESLint needs no extra configuration.

**Current coverage (22 tests):**
- `tests/smoke.test.jsx`: the app renders its navbar and home page signed out, and shows the signed-in links and Logout when signed in.
- `tests/flag-friends.test.jsx`: on and off, for `/profile` (Friends tab), `/leaderboard` (Friends filter, `/friends` requests) and `/public-profile/:userId` (add-friend button, `/friends` requests). Mocks `axios`, which these pages use.
- `tests/flag-confirmationEmail.test.jsx`: renders `ApplyModal` with the real providers; with the flag off, submitting still applies, shows no error and never calls the email endpoint; with it on, it does.
- `tests/flag-map.test.jsx`: the `map` flag ships off; off, `/map` shows the unavailable page and the navbar still works; on, the page renders (with `LocationPage` mocked).
- `tests/featureFlags.test.jsx`: `isEnabled` (on, off, unknown name throws in development and logs in a production build) and `FeatureGate` (children while on; the unavailable page with a link home for a page, nothing or the fallback otherwise, while off). Tests switch a flag by setting it on the exported `featureFlags` object and restoring it afterwards.

What they can't catch: anything about the real backend, real Firebase, CSS/layout (CSS isn't loaded), or third-party widgets. Nothing runs in a real browser.

**CI:** the `ui` job in `.github/workflows/ci.yml` runs `npm run lint`, `npm test`, then `npm run build` on every PR. Lint errors fail CI; warnings don't (see [D-UI-002](#d-ui-002-clean-up-lint-and-make-it-blocking-in-ci)).

## Known issues

- **Unused Clerk key is still required.** `main.jsx` throws `Missing Publishable Key` if `VITE_CLERK_PUBLISHABLE_KEY` isn't set, but the value is never used. Clerk was otherwise removed in favour of Firebase. Removing the check needs your confirmation first (see KEY_DECISIONS.md about Clerk).
- **Stale opportunities** from the `localStorage` cache (see above). This is by design, but can be surprising.
- **`src/data/opportunities.js`** isn't imported anywhere.
- **7 `react-hooks/exhaustive-deps` lint warnings** (FriendsPage, DraggableCard, Leaderboard, MapSearch, Onboarding, OpportunityGrid, ProfileContext). They're left on purpose, see [D-UI-002](#d-ui-002-clean-up-lint-and-make-it-blocking-in-ci).

## Decision log

Each entry records why the UI is the way it is. Newest at the bottom. Format and rules: [CLAUDE.md → Documentation rule](../CLAUDE.md#documentation-rule-mandatory). Decisions that span services live in [KEY_DECISIONS.md](../KEY_DECISIONS.md).

### Inherited decisions (before this log started)

These were in place before 2026-10-22, and their rationale wasn't written down. They're recorded so later decisions can refer to them.

- **React + Vite, plain JavaScript (no TypeScript), custom CSS per component.** Rationale not documented.
- **React Context for app-wide state** instead of a state library. Rationale not documented.
- **Cache the unfiltered opportunity list in `localStorage`.** Probably to avoid re-downloading the full list on every visit. Rationale not documented.
- **Firebase Authentication** on the client. See [KEY_DECISIONS.md](../KEY_DECISIONS.md#auth-firebase-is-canonical-not-clerk).
- **Search goes straight from the UI to VolunteerSearch** instead of through VolunteerAPI. Rationale not documented.

### D-UI-001: Keep the map page as a stretch feature, with Google Maps keys removed

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** The `/map` page (`LocationPage`, `MapSearch`, `utils/loadGoogleMaps.js`) uses the Google Maps JavaScript API, Places Autocomplete, and the Google Geocoding API. It geocodes **every opportunity's address on every page load**, so calls grow with opportunities × visits, and the project was billed about **$800**. The nav links were already commented out, but the route still works if visited directly. The keys were in `VITE_` variables, so they were public in the JS bundle.
- **Options considered:**
  1. *Delete the page, components and dependencies.* Rejected: the team wants the map back later as a stretch feature.
  2. *Keep the code, remove the Google keys from the environment, and plan to rebuild on a free provider.* Chosen.
  3. *Keep Google with fixes* (geocode once at seed time, restrict keys, budget cap). Rejected for now: still needs billing enabled on a Google Cloud project.
- **Decision:** All map code and dependencies stay as they are. The Google variables (`VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAP_ID`, `VITE_GOOGLE_GEOCODE_API_KEY`) are removed from local `.env` files. The map is a **stretch feature**; when it's picked up, it should move to a free, no-card provider (see [CONTEXT.md](../CONTEXT.md#map--geocoding-alternatives-if-a-map-comes-back)) and get a new decision entry.
- **Rationale:** Without keys, nothing can bill, and the work already done on the page is kept for reuse.
- **Consequences / trade-offs:**
  - `/map` is still reachable by URL, but without keys the map and geocoding just fail to load. Remove the route or show a placeholder if that becomes a problem. *Update 2026-11-17:* the route is now behind the `map` feature flag, which ships off, so it shows the "Temporarily unavailable" page instead (FEATURE_FLAGS.md). This decision otherwise stands.
  - **Removing keys from `.env` doesn't revoke them.** They must be deleted in the Google Cloud project that owns them, since they were public in the deployed bundle.
  - Lessons for the rebuild: geocode once and store `latitude`/`longitude` on `Opportunity`, cap usage, and never ship unrestricted paid keys in `VITE_` variables.
  - City autocomplete (`CitySearch`) uses LocationIQ and is unaffected.
- **SRS reference:** _TBD_

### D-UI-002: Clean up lint and make it blocking in CI

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** `npm run lint` reported 36 errors and 8 warnings in existing code, so CI ran lint as non-blocking (KEY_DECISIONS.md, CI entry) and new lint problems slipped through. Most errors were unused variables, and some of them were real costs, not just noise:
  - `HomeHero` still ran a `mousemove` listener that set state on **every mouse move** for a sparkle effect whose JSX was commented out, re-rendering the hero constantly.
  - `ProfilePage` kept a mock friends prototype (hardcoded users, a 215-line unused `renderFriends`) and **downloaded every user on each profile visit** for a search box that no longer rendered. The real feature lives in `FriendsPage`.
- **Options considered:**
  1. *Fix the errors, keep warnings as warnings, make lint blocking.* **Chosen.**
  2. *Also fix the 8 `exhaustive-deps` warnings.* Deferred: adding missing dependencies to effects that call functions defined in the component can cause refetch loops. Each one needs a `useCallback` or restructuring, and testing in a browser, and there are no UI tests to catch regressions.
  3. *Silence rules globally* (or `--max-warnings`). Rejected: it hides real problems like the two above.
  4. For `react-refresh/only-export-components` in `contexts/` and `hooks/` (each file exports a Provider and its `use*` hook): *split every hook into its own file* vs *turn the rule off for those folders*. **Chose turning it off for those folders.** Splitting would change ~30 import sites for little gain; the only cost is that editing a context file does a full reload instead of a hot update.
- **Decision:**
  - Removed unused imports, variables, props (`applicant` on `ApplyModal`, `apiLoaded` on `SearchHeader`/`SearchPage`) and dead code (`HomeHero` sparkles and the `arrowAnimation` import, `ProfilePage` mock friends, `Onboarding.handleArrayInput`, `DraggableCard` drag-distance state). Where a state setter is still called but its value is never read, the value is left out of the destructuring (`const [, setX]`) instead of rewriting the logic.
  - `badgeService.checkFirstApplication`'s empty `catch` now logs the error.
  - `ProgressBar.getLevelData` is no longer exported. Its only other user (`ApplyModal`) now gets `leveledUp` from the API (VolunteerAPI D-API-005).
  - `eslint.config.js` turns off `react-refresh/only-export-components` for `src/contexts/**` and `src/hooks/**`.
  - The `ui` CI job's lint step no longer has `continue-on-error`.
- **Rationale:** A blocking lint check stays clean only if it starts clean, and the cleanup also removed a re-render storm and a wasted full-user download.
- **Consequences / trade-offs:**
  - Any lint **error** now fails CI. Warnings still pass.
  - The deleted prototypes are recoverable from git history (before this change) if anyone wants them back.
  - Follow-up: fix the `exhaustive-deps` warnings one at a time, with manual testing, then consider `--max-warnings 0`.
- **SRS reference:** _TBD_

_The next UI decision gets ID `D-UI-003`._

### D-UI-003: Vitest + React Testing Library for UI tests

- **Date:** 2026-11-17
- **Status:** Accepted
- **Context:** The UI had no automated tests; CI only ran lint and build. The feature-gate work (KEY_DECISIONS.md, "Feature gates") needs to prove, per flag, that a switched-off feature's links disappear and its route shows an "unavailable" page. Lint and build can't show that.
- **Options considered:**
  1. *Vitest + React Testing Library + jsdom.* Chosen.
  2. *Jest + React Testing Library* (what VolunteerAPI uses for its tests). Rejected: the UI is ESM with Vite-specific `import.meta.env`, so Jest would need Babel and a second build configuration. Vitest reuses `vite.config.js` and has the same `describe`/`test`/`expect` API.
  3. *Playwright end-to-end tests in a real browser.* Deferred: they need all three services, a database and a Firebase project running in CI. Worth adding later for a few critical flows, not as the first layer.
  4. *Tests next to each component* (`components/NavBar/NavBar.test.jsx`). Rejected for now: `tests/` mirrors VolunteerAPI and VolunteerSearch, and most early tests render the whole app rather than one component.
  5. *Vitest globals* (`describe`/`expect` without imports). Rejected: explicit imports need no ESLint globals configuration.
- **Decision:**
  - Dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`. Configuration is the `test` block in `vite.config.js`.
  - Tests live in `VolunteerUI/tests/`. `setup.js` mocks Firebase and stubs `fetch` for every test; `helpers.jsx` provides `renderApp` and `signInAs`.
  - Scripts `npm test` (`vitest run`) and `npm run test:watch`. The CI `ui` job runs `npm test` between lint and build.
- **Rationale:** One toolchain (Vite) for build and tests, the same test vocabulary as the API's Jest tests, and whole-app rendering exercises routing, the navbar and the context providers together, which is where feature gates act.
- **Consequences:**
  - Firebase and the network are mocked, so these tests can't catch a backend, Firebase or deployment problem. jsdom isn't a real browser: no layout, and CSS is skipped (`css: false`).
  - The default `fetch` stub answers `200 []` to everything. A component that expects an object may log an error in a test until that test supplies real-looking data.
  - The mocked `firebase/auth` only exports what the app uses today (`onAuthStateChanged`, `signOut`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`). A new Firebase import needs adding to `tests/setup.js`.
  - CI's `ui` job takes a few seconds longer and now fails on a failing test.
  - No coverage threshold is set. Coverage starts very low (a smoke test); route and feature-gate tests follow in their own PRs.
- **SRS reference:** _TBD_ (verification / maintainability)

### D-UI-004: Feature flags with a FeatureGate component

- **Date:** 2026-11-17
- **Status:** Accepted
- **Context:** Features can be switched off in code across the app (KEY_DECISIONS.md, "Feature gates: code-level flags, one file per service"). In the UI a switched-off feature must hide its links and entry points, and visiting its route directly must show a friendly page, not a crash or a blank screen.
- **Options considered:**
  1. *A `FeatureGate` component used both around route elements (`page`) and around links and buttons.* Chosen.
  2. *Leave gated routes out of the `<Routes>` list.* Rejected: visiting the URL would match nothing and render a blank page under the navbar, which is what we're trying to avoid.
  3. *A redirect to `/` while off.* Rejected: the user can't tell whether the link was wrong or the feature is down.
  4. *`isEnabled` checks written inline at every call site* (`{isEnabled('x') && <NavLink .../>}`). Allowed where a component needs the boolean itself, but for routes and simple entry points the component keeps the call sites short and the "what's shown while off" rule in one place.
  5. *Flags from `VITE_` environment variables.* Rejected for the same reason as on the API (D-API-009): flags belong in reviewed code, not the Render dashboard. They would also be baked in at build time anyway.
- **Decision:** `src/config/featureFlags.js` (copy of the API's list) exports `featureFlags` and `isEnabled`. `components/FeatureGate` renders its children while on; while off it renders `components/FeatureUnavailable` when `page` is set, otherwise `fallback` (default nothing). An unknown flag throws when `import.meta.env.DEV` is true (dev server and Vitest), and logs and counts as on in a production build. `VolunteerAPI/tests/featureFlagsSync.test.js` now also checks this copy.
- **Rationale:** One component owns what users see while a feature is off. Failing loudly in development catches typos; failing open in production means a typo can't hide a feature from real users.
- **Consequences:**
  - Flags are compiled into the bundle. Toggling one needs a UI redeploy (Render rebuilds the static site); users with the old page open keep the old flags until they reload.
  - The UI can disagree with the API for a few minutes during deploys, so UI code must already handle a `503` from a backend without crashing.
  - A gated feature's code is still in the bundle; it just isn't rendered.
  - `FeatureUnavailable` uses the shared CSS variables from `index.css`. CSS isn't loaded in tests (D-UI-003), so its look is checked by hand, not by tests.
- **SRS reference:** _TBD_ (availability / maintainability)
