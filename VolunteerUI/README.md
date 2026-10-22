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
| `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAP_ID`, `VITE_GOOGLE_GEOCODE_API_KEY` | Map page and geocoding |
| `VITE_LOCATIONIQ_ACCESS_TOKEN` | Location lookups |
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
| `/map` | `LocationPage` | Map view |

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

Firebase Authentication (`firebase/auth`) is the only auth system in use (see [KEY_DECISIONS.md](../KEY_DECISIONS.md#auth-firebase-is-canonical-not-clerk)). After sign-in, `useAuth` provides the Firebase ID token, and components send it as `Authorization: Bearer <token>` to the API routes that require it.

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

_No new UI decisions have been made yet. The next one gets ID `D-UI-001`._
