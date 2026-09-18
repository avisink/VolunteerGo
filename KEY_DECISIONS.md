# KEY_DECISIONS.md

Decisions and constraints Claude must check before making changes in this repo. If a task touches an area covered here, follow the decision below — don't silently revisit, "fix", or work around it. If a task seems to require going against one of these, stop and ask the user first.

Add new entries above the template at the bottom, using the same format.

---

## Auth: Firebase is canonical, not Clerk

- **Decision:** Firebase Authentication (`firebase-admin` on the backend, `firebase/auth` on the frontend) is the one auth system in use.
- **Why:** Unknown/not documented — inferred from the fact that `middleware/auth.js`, `firebase/firebaseAdmin.js`, `useAuth.jsx`, and `firebase.js` are all wired into the live request/render path, while `@clerk/*` packages sit unused in both `package.json` files.
- **Constraint for Claude:** Do not build new auth flows on Clerk, and do not remove or replace Firebase auth with Clerk, unless the user explicitly asks for it. Treat `@clerk/*` dependencies as dead weight, not as a signal that a migration is in progress.

---

<!--
Template for new entries:

## <short title>

- **Decision:** what was decided
- **Why:** the reasoning, if known (say "unknown/not documented" if it isn't)
- **Constraint for Claude:** what this means for future changes — what to do, and what not to do without asking first
-->
