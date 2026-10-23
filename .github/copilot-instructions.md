# VolunteerGo review guide

Monorepo: `VolunteerAPI/` (Express + Prisma), `VolunteerUI/` (React + Vite), `VolunteerSearch/` (FastAPI). Condensed from `.claude/skills/pr-review/SKILL.md`; keep both in sync. Copilot reads only ~4,000 characters, so keep this short.

## Start every review with a scorecard

Score 1–5 (5 = best), one line of reasoning each, citing a file:
- **Risk**: 5 = small, isolated, tested. 1 = auth/data paths or a broken API contract, untested.
- **Correctness**, **Code quality**, **Tests**, **Docs**.

Verdict: ✅ Ready to merge, ⚠️ Merge after fixes, or ⛔ Needs work (a bug, a security hole, or risky with no tests).

Then **Findings** (real problems, most severe first, each with a concrete failing scenario), then **Quick fixes**: up to 5 small, safe improvements that don't change behavior (unused code, duplicated logic, a missing `await`, magic numbers, a missing test case), each with a suggested change. Skip formatting nits.

## Repo rules (flag violations)

- **Documentation rule:** every decision needs an entry **in the same PR**, in the service README's decision log (`D-API-NNN`, `D-UI-NNN`, `D-SEARCH-NNN`) or in `KEY_DECISIONS.md` if it spans services. Each entry needs date, context, options considered, decision, rationale, consequences, and SRS reference. If endpoints, env vars, scripts, setup or tests change, the README must change too.
- **Auth is Firebase only** (`verifyFirebaseToken`). No Clerk, no new auth systems.
- **Points and levels are computed on the server only** (`VolunteerAPI/lib/gamification.js`, D-API-005). Flag any endpoint or client code that sends or sets `points`/`level`.
- **No Google Maps/Geocode keys** and no paid map APIs (D-UI-001).
- `ci.yml` jobs stay free of secrets.

## VolunteerAPI

- Write routes need `verifyFirebaseToken`. Routes taking `:id` must check it belongs to `req.user.uid`.
- Don't confuse `User.opportunities` (applied) with `savedOpportunities` (bookmarked).
- Every Prisma call needs `await`. Don't send raw Prisma errors to clients.
- Tests (Jest + Supertest) must mock `../db/db` **and** `../firebase/firebaseAdmin.js`.

## VolunteerUI

- `VITE_` variables are public: no secrets or paid keys.
- Watch for effects that refetch on every render, and for new `localStorage` caching.
- Lint errors fail CI. `react-hooks/exhaustive-deps` warnings are known; don't fix them without checking for refetch loops.

## VolunteerSearch

- `/search` has two paths (`IS_PRODUCTION` keyword vs embeddings). Flag changes that update only one.
- New dependencies go in `requirements.txt`, and in `requirements-test.txt` if tests need them.

## Everywhere

Flag new behavior without tests, and any committed `.env` contents or keys.
