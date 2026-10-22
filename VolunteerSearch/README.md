# VolunteerSearch

The AI-powered search and recommendation service for VolunteerGo, built with Python and FastAPI. VolunteerUI calls `POST /search` directly. The service has no database of its own: on startup it downloads every opportunity from VolunteerAPI and keeps them in memory.

> This README is a living document. Per the repo's [documentation rule](../CLAUDE.md#documentation-rule-mandatory), update it whenever setup, endpoints, scoring, tests, or architecture change, and record every decision in the [Decision log](#decision-log) below.

## Setup

Prerequisites: Python 3.10+, and VolunteerAPI running (the service fetches `/opportunities` on startup).

```bash
cd VolunteerSearch
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt     # full deps, including sentence-transformers / PyTorch (large)
uvicorn main:app --reload           # http://localhost:8000
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ENV` | (unset) | `production` switches to **keyword-only scoring** and never loads the embedding model |
| `VITE_API_BASE_URL` | `http://localhost:3000` | VolunteerAPI base URL. The `VITE_` prefix is a leftover from sharing the frontend's `.env`; the service is plain Python, not Vite. |

CORS origins are hardcoded in `main.py`: `http://localhost:5173` and `https://volunteergo.onrender.com`. Update them when the frontend moves to a new host.

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

**Current coverage:** startup loading and text building, behaviour when the API is down, keyword weighting, and `/search` ranking, normalization, location matching, stop words, excluding saved items, and request validation. **Development (embedding) mode is not tested** (see D-SEARCH-001).

## Known issues

- **`/search` crashes when there are no opportunities.** `max(keyword_scores)` on an empty list raises `ValueError` and returns a 500. This happens whenever startup failed, for example because the API was down.
- **`requests` isn't listed in `requirements.txt`.** It's imported directly, but only gets installed as a dependency of `sentence-transformers`. A production-only install would break. `requirements-test.txt` lists it explicitly.
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
