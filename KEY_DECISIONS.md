# KEY_DECISIONS.md

Decisions and constraints Claude must check before making changes in this repo. If a task touches an area covered here, follow the decision below — don't silently revisit, "fix", or work around it. If a task seems to require going against one of these, stop and ask the user first.

Add new entries above the template at the bottom, using the same format.

---

## Auth: Firebase is canonical, not Clerk

- **Decision:** Firebase Authentication (`firebase-admin` on the backend, `firebase/auth` on the frontend) is the one auth system in use.
- **Why:** Unknown/not documented — inferred from the fact that `middleware/auth.js`, `firebase/firebaseAdmin.js`, `useAuth.jsx`, and `firebase.js` are all wired into the live request/render path, while `@clerk/*` packages sit unused in both `package.json` files.
- **Constraint for Claude:** Do not build new auth flows on Clerk, and do not remove or replace Firebase auth with Clerk, unless the user explicitly asks for it. Treat `@clerk/*` dependencies as dead weight, not as a signal that a migration is in progress.

---

## CI: GitHub Actions, one job per service

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** The repo had no automated checks. Automated tests and CI are the project's top priority, and the repo is a monorepo of three independently built services (Node API, React UI, Python search) with no root build.
- **Options considered:**
  1. *GitHub Actions.* Chosen: built into GitHub, free for public repos and generous for private ones, no extra account, and results show directly on PRs.
  2. *CircleCI / GitLab CI / Jenkins.* Rejected: need a separate account or server, which adds setup and ownership overhead for a fork the user wants to fully own.
  3. *One job running everything in sequence.* Rejected: a failure doesn't point to the service that broke, and nothing runs in parallel.
  4. *Separate workflow files per service with path filters* (only run a service's job when its folder changes). Deferred: faster, but path-filtered required checks are awkward to configure, and the suite is fast enough to run in full.
- **Decision:** One workflow, `.github/workflows/ci.yml`, triggered on every pull request and on pushes to `main`, with three parallel jobs:
  - **`api`** (Node 24): `npm ci --ignore-scripts`, then `npm test`.
  - **`ui`** (Node 24): `npm ci --ignore-scripts`, then `npm run lint` (**non-blocking** for now), then `npm run build`.
  - **`search`** (Python 3.13): `pip install -r requirements-test.txt`, then `pytest`.
  - Read-only token permissions, npm/pip caching, and superseded runs on the same branch are cancelled.
- **Why:**
  - Each job matches how that service is actually checked locally.
  - **No secrets are needed.** API tests mock Prisma and Firebase (D-API-003), and search tests stub the API call and skip the embedding model (D-SEARCH-001). This also means CI works on forks and PRs from contributors.
  - `--ignore-scripts` mirrors the local npm setup (install scripts are blocked there) and avoids running third-party install scripts in CI. Nothing the checks need depends on them.
  - Lint is non-blocking because the UI already has 36 lint errors in existing code across 23 files. Blocking on them would make every PR red until a separate cleanup happens.
- **Consequences:**
  - CI doesn't exercise a real database, real Firebase, or the search service's embedding (development) mode. Those need integration tests later (a Postgres service container is the likely route).
  - Lint regressions won't fail PRs until `continue-on-error` is removed. Follow-up: fix the existing lint errors, then make lint blocking.
  - Node 24 and Python 3.13 are pinned in CI. Local versions differ (Node 26 / Python 3.14 on the user's machine), so keep the CI versions in line with whatever the deployment host uses once it's chosen.
  - Making the checks *required* before merging is a GitHub branch-protection setting (repo Settings → Branches), not something in this file.
- **SRS reference:** _TBD_
- **Constraint for Claude:** Keep CI free of secrets unless the user approves adding them. Don't make lint blocking or add path filters without asking. When adding tests to a service, make sure its CI job still runs them; update this entry if the job structure changes.

---

<!--
Template for new entries (repo-wide decisions; per-service decisions go in that service's README Decision log, see CLAUDE.md):

## <short title>

- **Date:** YYYY-MM-DD
- **Status:** Accepted | Superseded by <title/ID>
- **Context:** the problem or situation that forced a decision
- **Options considered:** each alternative, with why it was or wasn't chosen
- **Decision:** what was decided
- **Why:** the reasoning (say "unknown/not documented" if it isn't known)
- **Consequences:** trade-offs, what this rules out, follow-up work
- **SRS reference:** related requirement(s), if any
- **Constraint for Claude:** what this means for future changes: what to do, and what not to do without asking first
-->
