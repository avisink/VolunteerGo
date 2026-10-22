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
├── utils/              # badgeService, getImage (Pexels), loadGoogleMaps
└── data/opportunities.js   # static sample data, not imported anywhere
```

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
| `/map` | `LocationPage` | Map view. Stretch feature, not linked in the nav, no API keys (D-UI-001) |

## State and data flow

App-wide state lives in React Context. There's no Redux or other state library.

- **`AuthProvider`** (`hooks/useAuth.jsx`, wraps everything in `main.jsx`) listens to Firebase's `onAuthStateChanged` and exposes `{ user, token, isLoaded, isSignedIn }`.
- **`OpportunityProvider`**: `fetchOpportunities(searchResults, forceRefetch)`.
  - The unfiltered list is **cached in `localStorage`** under `opportunities` and reused across sessions without asking the server again.
  - Requests with `keyword` or `city`, or with `forceRefetch`, always fetch from `GET /opportunities`. Filtered results are never cached.
  - So stale data after a backend change is expected: clear `localStorage` or force a refetch.
- **`ProfileProvider`**: loads the signed-in user with `GET /users/by-uid/:uid`. On a 404 it creates the user (`POST /users`), then fetches again. Sends the Firebase token as a bearer token.
- **`LeaderboardProvider`**: `GET /users`, exposes `refreshLeaderboard`.
- **`badgeService`**: client-side badge checks. For example, it awards the "Newcomer Badge" through `POST /badges/give` if the user doesn't already have it.

Network calls use a mix of `fetch` and `axios`.

## Authentication

Firebase Authentication (`firebase/auth`), **email/password sign-in only**, is the only auth system in use (see [KEY_DECISIONS.md](../KEY_DECISIONS.md#auth-firebase-is-canonical-not-clerk)). After sign-in, `useAuth` provides the Firebase ID token, and components send it as `Authorization: Bearer <token>` to the API routes that require it.

## Testing

There are no automated tests yet. `npm run lint` and `npm run build` are the only automated checks. Adding a test setup is planned alongside CI, and the choice will be recorded in the [Decision log](#decision-log).

## Known issues

- **Unused Clerk key is still required.** `main.jsx` throws `Missing Publishable Key` if `VITE_CLERK_PUBLISHABLE_KEY` isn't set, but the value is never used. Clerk was otherwise removed in favour of Firebase. Removing the check needs your confirmation first (see KEY_DECISIONS.md about Clerk).
- **Stale opportunities** from the `localStorage` cache (see above). This is by design, but can be surprising.
- **`src/data/opportunities.js`** isn't imported anywhere.

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
  - `/map` is still reachable by URL, but without keys the map and geocoding just fail to load. Remove the route or show a placeholder if that becomes a problem.
  - **Removing keys from `.env` doesn't revoke them.** They must be deleted in the Google Cloud project that owns them, since they were public in the deployed bundle.
  - Lessons for the rebuild: geocode once and store `latitude`/`longitude` on `Opportunity`, cap usage, and never ship unrestricted paid keys in `VITE_` variables.
  - City autocomplete (`CitySearch`) uses LocationIQ and is unaffected.
- **SRS reference:** _TBD_

_The next UI decision gets ID `D-UI-002`._
