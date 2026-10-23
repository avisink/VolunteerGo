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
  - **`ui`** (Node 24): `npm ci --ignore-scripts`, then `npm run lint` (blocking since 2026-10-22, D-UI-002; it was non-blocking at first), then `npm run build`.
  - **`search`** (Python 3.13): `pip install -r requirements-test.txt`, then `pytest`.
  - Read-only token permissions, npm/pip caching, and superseded runs on the same branch are cancelled.
- **Why:**
  - Each job matches how that service is actually checked locally.
  - **No secrets are needed.** API tests mock Prisma and Firebase (D-API-003), and search tests stub the API call and skip the embedding model (D-SEARCH-001). This also means CI works on forks and PRs from contributors.
  - `--ignore-scripts` mirrors the local npm setup (install scripts are blocked there) and avoids running third-party install scripts in CI. Nothing the checks need depends on them.
  - Lint started out non-blocking because the UI had 36 lint errors in existing code across 23 files. Blocking on them would have made every PR red until a separate cleanup happened. That cleanup was VolunteerUI D-UI-002 (2026-10-22), and lint has been blocking since then, as the user approved.
- **Consequences:**
  - CI doesn't exercise a real database, real Firebase, or the search service's embedding (development) mode. Those need integration tests later (a Postgres service container is the likely route).
  - Node 24 and Python 3.13 are pinned in CI. Local versions differ (Node 26 / Python 3.14 on the user's machine), so keep the CI versions in line with whatever the deployment host uses once it's chosen.
  - Making the checks *required* before merging is a GitHub branch-protection setting (repo Settings → Branches), not something in this file.
- **SRS reference:** _TBD_
- **Constraint for Claude:** Keep the `api`, `ui` and `search` jobs free of secrets. The only approved exception is the `review` job (PR review entry below). Don't make lint warnings blocking or add path filters without asking. When adding tests to a service, make sure its CI job still runs them; update this entry if the job structure changes.

---

## PR review: Claude-rated, advisory

- **Date:** 2026-10-22
- **Status:** Accepted
- **Context:** The user wanted every PR scanned and rated on risk and code quality, with suggestions for small improvements. The existing CI only says pass/fail, and this repo has rules a linter can't check, mainly the mandatory documentation rule in CLAUDE.md. The user also wanted the same review available locally before opening a PR.
- **Options considered:**
  1. *Static tools only* (SonarCloud, CodeClimate, CodeQL). Good at metrics and known vulnerability patterns, but they can't judge risk in context, check the decision-log rule, or suggest fixes the way the user asked. They also need another account. Not chosen, but CodeQL could be added alongside later.
  2. *A hosted AI review app* (CodeRabbit, Copilot code review, Claude Code's built-in GitHub review). Easy to set up, but the rubric lives outside the repo and can't be run locally the same way.
  3. *`anthropics/claude-code-action` running a rubric that lives in the repo as a skill* (`.claude/skills/pr-review/SKILL.md`). **Chosen.**
- **Decision:**
  - The rubric lives in `.claude/skills/pr-review/SKILL.md`: scores from 1 to 5 for **Risk, Correctness, Code quality, Tests and Docs**, an overall verdict (ready / merge after fixes / needs work), findings with `file:line` and a concrete failure scenario, and up to ~5 **quick fixes** with small diffs. Run it locally as `/pr-review [PR# | branch]`.
  - A `review` job in `.github/workflows/ci.yml` runs it on non-draft PRs, **only after `api`, `ui` and `search` have all passed** (`needs: [api, ui, search]`; if any fails, the review is skipped). It uses `anthropics/claude-code-action@v1`, model `claude-opus-5-5`, `--max-turns 40`, and **read-only tools** plus `Write` for the report file. A shell step then posts or updates **one sticky comment** per PR, found by its `<!-- volunteergo-pr-review -->` marker.
  - It authenticates with the user's **Claude subscription**: a `CLAUDE_CODE_OAUTH_TOKEN` repository secret created with `claude setup-token`. Without it (including on PRs from forks, which GitHub doesn't give secrets to) every step is skipped with a notice, and the job still passes.
  - **Advisory only:** it must not be added as a required check, and a bad score doesn't fail the job.
- **Why:** The rubric is versioned with the code, so a PR can update the rules it's reviewed by. It's the same review locally and in CI. Gating on the other checks means the review never comments on a PR that's already broken, and it doesn't use subscription limits until the cheap checks are green. The three service jobs stay secret-free and reproducible; only the `review` job reads a secret.
- **Consequences:**
  - **Cost:** the first version used an `ANTHROPIC_API_KEY`, which bills per token. With Opus 5.5 and up to 40 turns that's roughly $0.30–$2 per push (an earlier estimate of "cents" was wrong). The user asked for a free option the same day, so it switched to the subscription token: no per-run bill, but **each run uses the plan's usage limits**, shared with the user's own Claude Code sessions. If that becomes a problem, switch `--model` to `claude-sonnet-5-5`, lower `--max-turns`, or trigger on a `review` label instead of every push. Non-LLM alternatives that were considered: a deterministic rules script (docs/tests/size checks), CodeQL and SonarQube Cloud (both free for public repos). They were rejected as the main reviewer because they can't produce the quick-fix suggestions the user wanted, but they could be added alongside.
  - AI reviews can be wrong. Treat findings as suggestions, and tune the skill when it's consistently off.
  - The key is a repo secret. Workflows triggered by `pull_request` from forks can't read it, which is intended (don't switch to `pull_request_target`, which would run fork code with secrets).
  - Follow-up: the user has to add the secret (run `claude setup-token`, then repo Settings → Secrets and variables → Actions → `CLAUDE_CODE_OAUTH_TOKEN`). A subscription token is tied to the user's personal account; for a team-owned repo an org API key would be more appropriate.
- **SRS reference:** _TBD_ (quality assurance / process)
- **History:** On 2026-10-22 this first shipped as a separate `pr-review.yml` that ran in parallel with CI and used an `ANTHROPIC_API_KEY`. The same day, the user asked for (1) the review to run only after the other checks pass, so it moved into `ci.yml` as a `needs:` job (a `workflow_run` trigger was rejected: it runs with secrets in the base repo's context even for fork PRs, and it doesn't show up as a check on the PR), and (2) a free option, so it moved to the subscription token. The "quick wins" section was also renamed **"quick fixes"**, as originally intended.
- **Constraint for Claude:** Don't make this job blocking or required, don't widen its tool permissions to write or push, and don't change the trigger to `pull_request_target` without asking. Change review criteria in the skill file, not the workflow prompt.

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
