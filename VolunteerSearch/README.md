# VolunteerSearch

The AI-powered search and recommendation service for VolunteerGo, built with Python and FastAPI. VolunteerUI calls `POST /search` directly. The service has no database of its own: on startup it downloads every opportunity from VolunteerAPI and keeps them in memory.

> This README is a living document. Per the repo's [documentation rule](../CLAUDE.md#documentation-rule-mandatory), update it whenever setup, endpoints, scoring, tests, or architecture change, and record every decision in the [Decision log](#decision-log) below.

## Setup

Prerequisites: Python 3.10+, and VolunteerAPI running (the service fetches `/opportunities` on startup).

```bash
cd VolunteerSearch
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt     # full deps, including sentence-transformers / PyTorch (large)
# or, for keyword-only mode (ENV=production): pip install -r requirements-prod.txt
uvicorn main:app --reload           # http://localhost:8000
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ENV` | (unset) | `production` switches to **keyword-only scoring** and never loads the embedding model |
| `VITE_API_BASE_URL` | `http://localhost:3000` | VolunteerAPI base URL. The `VITE_` prefix is a leftover from sharing the frontend's `.env`; the service is plain Python, not Vite. |
| `FRONTEND_URL` | (unset) | Comma-separated frontend origins allowed by CORS, e.g. the deployed UI URL. `http://localhost:5173` is always allowed ([D-SEARCH-002](#d-search-002-production-requirements-file-and-configurable-cors)). |

On Render, `render.yaml` at the repo root sets `ENV=production` and installs `requirements-prod.txt`.

## How it works

1. **Startup** (FastAPI `lifespan`): `GET {VITE_API_BASE_URL}/opportunities`. For each opportunity it builds a `text` string (name, description, tags, skills, requirements, location or "Remote", date, points, volunteers needed, organization) and stores the list in `app.state.opps`. If the API is unreachable, it logs `❌ Startup failed` and continues with an **empty list**.
2. **Development mode only** (`ENV` not `production`): it loads `all-MiniLM-L6-v2` and encodes every opportunity's text into a vector. The vectors are cached in `opportunity_vecs.pkl`, and that file is reused as-is on later startups. **Delete it when the opportunities change.**
3. **`POST /search`**: body `{ "search_prompt": str, "user_profile"?: { skills, training, interests, saved_opportunities } }`.
   - Removes English stop words from the prompt, then gives each opportunity a keyword score. Points per keyword found: name 3, location 3, tags 2, skills 2, organization name 1.5, description 1, requirements 1.
   - **Production:** score = keyword score ÷ the best keyword score.
   - **Development:** score = cosine similarity between the opportunity vector and a combined user/search vector, plus 0.4 × the normalized keyword score. The combined vector is 90% search prompt and 10% user profile; the profile itself is weighted from interests, skills, training and saved opportunities.
   - Returns up to 75 results, best first, excluding saved opportunities: `{ "recommendations": [ {...opportunity, "score"} ] }`.
4. **`GET /opps`**: returns the in-memory opportunity list (useful for debugging).

Data is only refreshed on **restart**. New opportunities in the API don't show up in search until the service restarts.

## Feature flags

`feature_flags.py` is this service's copy of the flag list in `VolunteerAPI/config/featureFlags.js` (the source of truth), with the same names and values ([D-SEARCH-003](#d-search-003-feature-flags-copied-from-volunteerapi-with-a-503-dependency)). A test in VolunteerAPI (`tests/featureFlagsSync.test.js`) fails when the two differ, so change a flag in both files.

- `is_enabled("flagName")` is the only way code asks about a flag.
- A gated route declares `dependencies=[Depends(require_feature("flagName"))]`. While the flag is off it answers `503 { "error": "Feature temporarily unavailable", "feature": "<flagName>" }`.
- A flag name that isn't in the list stops the service from starting (`require_feature`), or raises outside production (`is_enabled`). In production `is_enabled` logs it and counts it as on.

Flags so far: `map` (off; UI-only), `confirmationEmail`, `friends`, `badges`, `gamification`. Every flag, what it turns off and how to toggle it: [FEATURE_FLAGS.md](../FEATURE_FLAGS.md).

## Testing

Tests use **pytest** with FastAPI's `TestClient` and live in `tests/`. They need neither VolunteerAPI nor the embedding model.

```bash
pip install -r requirements-test.txt   # light deps only, no PyTorch
pytest -q                               # all tests
pytest tests/test_search.py -k stop     # tests whose name matches
```

How they work:
- `tests/conftest.py` sets `ENV=production` **before** importing `main`, because `main.py` decides at import time whether to load the model.
- The `client` fixture replaces `requests.get` with a stub that returns three sample opportunities, then starts the app with `TestClient` as a context manager so the startup step runs. `client_api_down` simulates VolunteerAPI being unreachable.

**Current coverage:** the flag helper and the 503 dependency (`tests/test_feature_flags.py`), startup loading and text building, behaviour when the API is down, keyword weighting, and `/search` ranking, normalization, location matching, stop words, excluding saved items, and request validation. **Development (embedding) mode is not tested** (see D-SEARCH-001).

## Known issues

- **`/search` crashes when there are no opportunities.** `max(keyword_scores)` on an empty list raises `ValueError` and returns a 500. This happens whenever startup failed, for example because the API was down.
- **Stale cache:** `opportunity_vecs.pkl` is committed and never invalidated. If the opportunities change but the cache doesn't, vectors line up with the wrong opportunities in development mode.
- Dependencies aren't pinned to versions in either requirements file.

## Decision log

Newest at the bottom. Format and rules: [CLAUDE.md → Documentation rule](../CLAUDE.md#documentation-rule-mandatory). Decisions that span services live in [KEY_DECISIONS.md](../KEY_DECISIONS.md).

### Inherited decisions (before this log started)

These were in place before 2026-10-22, and their rationale wasn't written down.

- **A separate Python service for search**, instead of search inside VolunteerAPI. Probably for Python's machine-learning libraries. Rationale not documented.
- **Two scoring modes**: embeddings in development, keyword-only in production. Probably because the model is too heavy for a small production host. Rationale not documented.
- **Load all opportunities into memory at startup** instead of querying per request. Rationale not documented.

### D-SEARCH-001: pytest on the keyword-only path, with a separate light requirements file

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** The service had no tests. `requirements.txt` pulls in `sentence-transformers` and PyTorch (several GB). Development mode downloads a model when `main` is imported, and startup needs a running VolunteerAPI. None of that is practical in CI or in fast local test runs.
- **Options considered:**
  1. *Test production (keyword) mode with stubbed HTTP and a light requirements file.* Chosen.
  2. *Install the full `requirements.txt` in CI and test both modes.* Rejected for now: multi-GB installs and a model download on every run, slow and flaky.
  3. *Mock `sentence_transformers` and `torch` to test development mode cheaply.* Deferred: possible, but the mocks would effectively replace the maths being tested.
  4. *Refactor `main.py` so the model is loaded lazily or injected.* Deferred: a worthwhile refactor, but out of scope for adding the first tests.
- **Decision:** `pytest` + FastAPI `TestClient` (with `httpx2`, which current Starlette recommends over `httpx`). `ENV=production` is forced in `conftest.py`. `requirements-test.txt` lists only what the keyword path needs (`fastapi`, `requests`, `numpy`, `scikit-learn`) plus `httpx2` and `pytest`.
- **Rationale:** It tests the logic that actually runs in production, installs in seconds, needs no network, and runs in CI with no secrets.
- **Consequences / trade-offs:**
  - The embedding/vector path and `build_user_vector` are untested.
  - `requirements-test.txt` must be kept in step with `main.py`'s non-ML imports.
  - Like `requirements.txt`, it isn't version-pinned, so a future library release could break CI unexpectedly.
  - `.pytest_cache/` and `.venv/` were added to `.gitignore`.
- **SRS reference:** _TBD_

### D-SEARCH-002: Production requirements file and configurable CORS

- **Date:** 2026-10-23
- **Status:** Accepted
- **Context:** The service is being deployed to Render's free tier (KEY_DECISIONS.md, hosting entry), which has about 512 MB of RAM. `requirements.txt` installs `sentence-transformers` and PyTorch, which are several GB and wouldn't fit, and production (`ENV=production`) never uses them. CORS origins were hardcoded to the old team deployment (`volunteergo.onrender.com`), so the new frontend would be blocked. `requests` was also missing from `requirements.txt`.
- **Options considered:**
  1. *A separate `requirements-prod.txt` with only the keyword-path deps.* **Chosen.**
  2. *Make `sentence-transformers` optional in `requirements.txt`* (extras or comments). Rejected: pip has no clean "optional" for a plain requirements file.
  3. *Reuse `requirements-test.txt` in production.* Rejected: it includes pytest/httpx2 and lacks uvicorn, and the two files have different purposes.
  4. For CORS: *read origins from `FRONTEND_URL`* (same name the API uses) vs *allow all origins* (`*`). Chose the env variable: `*` with `allow_credentials=True` isn't allowed by browsers anyway, and it would let any site call the service.
- **Decision:** `requirements-prod.txt` = `fastapi`, `uvicorn`, `requests`, `numpy`, `scikit-learn`. CORS allows `http://localhost:5173` plus every comma-separated origin in `FRONTEND_URL` (trailing slashes stripped). `requests` added to `requirements.txt`.
- **Rationale:** Small, fast deploys that match how production actually runs, and no code change needed when the frontend URL changes.
- **Consequences / trade-offs:**
  - Three requirements files to keep in step with `main.py`'s imports (full, prod, test).
  - **Production has no embeddings.** Keyword-only search is what the deployed app uses, as before.
  - Forgetting `FRONTEND_URL` on the host makes the deployed UI's search fail with a CORS error in the browser console.
- **SRS reference:** _TBD_

### D-SEARCH-003: Feature flags copied from VolunteerAPI, with a 503 dependency

- **Date:** 2026-11-16
- **Status:** Accepted
- **Context:** Features can be switched off in code across the app (KEY_DECISIONS.md, "Feature gates: code-level flags, one file per service"). This service deploys on its own and is Python, so it can't import VolunteerAPI's flags file.
- **Options considered:**
  1. *Its own `feature_flags.py` with the same names and values, kept in sync by a test.* Chosen.
  2. *Only list the flags this service uses.* Rejected: "which flags belong here" becomes a judgement call, and the sync test would need an allow-list. A full copy is one simple rule.
  3. *Ask VolunteerAPI for the flags at startup.* Rejected: the service only loads data at startup, so a flag change would need a restart anyway, and it would add another way for startup to fail.
  4. *FastAPI's `HTTPException(503)`.* Rejected for the response: its body is `{ "detail": ... }`, and the UI should see the same body from both backends. A small `FeatureUnavailable` exception and one handler in `main.py` give `{ "error", "feature" }`.
- **Decision:** `feature_flags.py` holds `FEATURE_FLAGS`, `is_enabled(name)` and `require_feature(name)` (a route dependency). `main.py` registers one exception handler that returns the 503. `VolunteerAPI/tests/featureFlagsSync.test.js` compares this file with the API's.
- **Rationale:** Same shape as the API (one file, one helper, one shared 503), so there's one thing to learn.
- **Consequences:**
  - Switching a feature off means editing two files (three with the UI). The sync test runs in the `api` CI job, so a missed copy fails CI there, not in this service's job.
  - The sync test reads this file with a regular expression, so each flag must stay on its own line as `"name": True,` or `"name": False,`.
  - Tests run with `ENV=production`, where `is_enabled` tolerates unknown names. So `require_feature` rejects an unknown name in **every** environment: a typo on a route fails the tests and stops a deploy at startup (Render keeps the previous version running).
- **SRS reference:** _TBD_ (availability / maintainability)
