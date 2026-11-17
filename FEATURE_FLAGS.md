# Feature flags

Any single feature can be switched off in code if it has a bug, while the rest of the app keeps running. Flags change by editing code and redeploying: there's no admin UI, no database table and no flag service. Design and rationale: [KEY_DECISIONS.md, "Feature gates"](./KEY_DECISIONS.md#feature-gates-code-level-flags-one-file-per-service), VolunteerAPI D-API-009, VolunteerUI D-UI-004, VolunteerSearch D-SEARCH-003.

## Where flags live

Each service has its own copy of the same list. VolunteerAPI's is the source of truth.

| Service | File | Helper |
|---|---|---|
| VolunteerAPI | `VolunteerAPI/config/featureFlags.js` | `isEnabled(name)`, `requireFeature(name)` route middleware (503) |
| VolunteerUI | `VolunteerUI/src/config/featureFlags.js` | `isEnabled(name)`, `<FeatureGate flag page>` |
| VolunteerSearch | `VolunteerSearch/feature_flags.py` | `is_enabled(name)`, `require_feature(name)` route dependency (503) |

`VolunteerAPI/tests/featureFlagsSync.test.js` fails in CI if the three copies don't have the same flags and values.

## What "off" means

- **API and search service:** the feature's endpoints answer `503 { "error": "Feature temporarily unavailable", "feature": "<name>" }`.
- **UI:** the feature's nav links and entry points are hidden, and visiting its route shows a "Temporarily unavailable" page with a link home.
- **Features that depend on it** skip that piece and keep working.

## Flags

| Flag | Default | What turning it off does | Depends on / affects |
|---|---|---|---|
| `map` | **off** | `/map` shows "Temporarily unavailable" instead of the map page. No backend endpoints. The nav link was already commented out. | Nothing depends on it. Ships off because the page has no maps API key and has had problems (VolunteerUI D-UI-001). |

## Never gated (core)

These keep the app usable at all, so they have no flag:

- Firebase sign-up, login, logout and token verification (`verifyFirebaseToken`).
- User bootstrap: `GET /users/by-uid/:uid` and `POST /users`, called by `ProfileContext` on every signed-in page.
- Onboarding (`POST /users/onboarding`, `/onboarding`): sign-up redirects straight into it.
- `GET /users`, `GET /users/:id`, `DELETE /users/:id`.
- The app shell: router, navbar, home page, and the `/profile` page itself (its tabs are gated individually).

## Switching a feature off

1. In **all three** files above, change the flag to `false` (`False` in Python). Keep each flag on its own line; the sync test reads them as text.
2. Run the tests: `npm test` in `VolunteerAPI` and `VolunteerUI`, `pytest -q` in `VolunteerSearch`.
3. Open a PR, let CI pass, merge to `main`.
4. Render redeploys each service from `main`. The UI is a static build, so the flag takes effect once the UI deploy finishes; people with the site already open get it on their next reload.
5. Check: the feature's endpoints answer 503 and its pages show "Temporarily unavailable".

## Switching it back on

The same steps with `true` (`True`). If the flag was switched off by its own commit, `git revert <that commit>` does it in one step.

## Adding a flag for a new feature

1. Add `name: true,` with a one-line comment to all three files.
2. API: put `requireFeature("name")` on the feature's routes, before the auth middleware. Search service: `dependencies=[Depends(require_feature("name"))]`.
3. UI: wrap the route element in `<FeatureGate flag="name" page>` and each link or button in `<FeatureGate flag="name">`.
4. Code in other features that uses this one: check `isEnabled("name")` and skip that piece.
5. Add tests that switch the flag off and check the 503s and the unavailable page, and add a row to the table above.
