---
name: pr-review
description: Review a VolunteerGo pull request or branch and rate it on risk, code quality, tests and documentation, then list small, concrete improvements ("quick fixes"). Use when the user asks to review, rate, score or sanity-check a PR, a branch or the current changes before merging. Also run by the `review` job in CI.
argument-hint: "[PR number | branch | empty for current branch vs main] [--out <file>]"
---

# PR review for VolunteerGo

Review the change in `$ARGUMENTS` and produce **one** markdown report in the format below.
This skill is used two ways, with the same rubric (KEY_DECISIONS.md → "PR review: Claude-rated, advisory"):

- **Locally:** `/pr-review`, `/pr-review 7` or `/pr-review my-branch`. Print the report in chat.
- **In CI:** the `review` job in `.github/workflows/ci.yml` (after the other checks pass) passes `<PR number> --out pr-review.md`. Write the report to that file
  and nothing else; a later workflow step posts it as a single sticky PR comment. Don't post comments yourself.

The review is **advisory**: it never blocks a merge. Be accurate rather than harsh or flattering.

## 1. Get the change

- PR number → `gh pr view <n> --json title,body,baseRefName,headRefName,files` and `gh pr diff <n>`.
- Branch name → `git diff main...<branch>` and `git log main..<branch> --oneline`.
- Nothing given → the current branch against `main`, plus uncommitted changes (`git diff main...HEAD`, `git diff HEAD`).

Read the diff, then **open the changed files** (and anything they call) for context. A diff alone hides
callers, missing validation and duplicated logic. Skip lockfiles, `dist/`, and generated Prisma files.

## 2. Check against this repo's rules

Read these before judging. They are what "good" means here:

- `CLAUDE.md`: especially the **documentation rule**. Every decision needs a full entry (date, context, options
  considered, decision, rationale, consequences, SRS reference) in the service README's decision log
  (`D-API-NNN` / `D-UI-NNN` / `D-SEARCH-NNN`) or in `KEY_DECISIONS.md` if it spans services, **in the same PR**.
  READMEs must be updated when setup, env vars, endpoints, routes, scripts or tests change.
- `KEY_DECISIONS.md`: the "Constraint for Claude" lines (Firebase is the only auth system, CI stays free of secrets
  except the PR-review job, no Google Maps keys, etc.).
- `CONTEXT.md`: known quirks, so you don't report a known issue as new (you may note it got worse).

Service-specific things to look for:

- **VolunteerAPI:** routes that write data without `verifyFirebaseToken`, or that act on `:id` without checking it
  belongs to `req.user.uid`; trusting client-sent `points`/`level` (D-API-005); `opportunities` vs `savedOpportunities`
  mix-ups; `prisma` calls missing `await`; Prisma errors leaked to clients; new tests that forget the Firebase mock.
- **VolunteerUI:** secrets or paid keys in `VITE_` variables (they're public); new `localStorage` caching; effects
  that refetch on every render; work that lint would flag (lint blocks CI).
- **VolunteerSearch:** changes that only touch one of the two `/search` paths (`IS_PRODUCTION` keyword vs embeddings);
  new dependencies missing from `requirements.txt` / `requirements-test.txt`.
- **Everywhere:** new behaviour without tests, CI not covering new tests, `.env` contents or keys committed.

## 3. Score it

Score each dimension 1 to 5, and justify every score with a specific file or line. Don't use generic praise.

| Dimension | 5 means | 1 means |
|---|---|---|
| **Risk** (5 = safest) | Small, isolated, easy to revert, covered by tests | Touches auth/data/money paths, breaks an API contract, or could lose data, with no tests |
| **Correctness** | No bugs found after reading callers and edge cases | A clear bug on a normal path |
| **Code quality** | Matches surrounding style, no duplication, clear names, right altitude | Hard to follow, copy-pasted logic, dead code added |
| **Tests** | New behaviour and its failure paths are tested and run in CI | Behaviour changed with no tests |
| **Docs** | Decision entries and README updates present and complete (per CLAUDE.md) | A decision or contract change with nothing written down |

**Overall verdict**, from the scores and findings:
- ✅ **Ready to merge**: no blocking findings, nothing below 3.
- ⚠️ **Merge after fixes**: something to fix, but it's small.
- ⛔ **Needs work**: a correctness or security problem, or Risk ≤ 2 without tests.

## 4. Findings

List real problems first, most severe first. Each one needs a `file:line`, what goes wrong in a concrete scenario
("a signed-in user can send `{points: 9999}` and…"), and a suggested fix. Label each **Blocking** or **Should fix**.
If you're not sure something is a bug, say so and say what would confirm it. Don't pad the list. "No findings" is a fine result.

## 5. Quick fixes

Then list **small improvements that make the code better without changing behaviour**: each one a few lines,
safe, and local. Examples: remove an unused import or state variable, replace a duplicated formula with the shared helper,
add a missing `await`, collapse an `if/else` that returns booleans, give a magic number a name, add a missing test case
for an edge the PR already handles. Give each one a `file:line` and a tiny suggested diff:

````markdown
- `VolunteerAPI/controllers/userController.js:42`: `opportunityId` reaches Prisma as a string; coerce it once.
  ```diff
  - const { opportunityId } = req.body;
  + const opportunityId = Number(req.body.opportunityId);
  ```
````

Keep it to the best ~5. Skip pure formatting nits that lint or Prettier would catch.

## 6. Report format

Use exactly this shape (the CI step looks for the first line to find and update its comment):

```markdown
<!-- volunteergo-pr-review -->
## 🤖 PR review: <verdict emoji + words>

<one or two sentences: what the PR does and the main thing a reviewer should know>

| Risk | Correctness | Code quality | Tests | Docs |
|:-:|:-:|:-:|:-:|:-:|
| n/5 | n/5 | n/5 | n/5 | n/5 |

<one line per score that isn't 5, saying why>

### Findings
<numbered list, or "No findings.">

### Quick fixes
<bulleted list with diffs, or "None, nice and tidy.">

<sub>Advisory review by Claude using `.claude/skills/pr-review`. It doesn't block merging. Reviewed commit `<short sha>`.</sub>
```

In local mode, after the report, offer to apply the quick fixes.
