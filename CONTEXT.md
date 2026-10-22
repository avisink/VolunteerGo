# CONTEXT.md

Running notes on this codebase — quirks, gotchas, and things worth knowing that don't belong in `CLAUDE.md`'s architecture overview. This file is updated regularly as new things are found; newest entries go at the top of each section. If a note here turns into something Claude must actively enforce (not just be aware of), promote it to `KEY_DECISIONS.md`.

## Pending setup (waiting on the user)

- **Firebase service-account key not added yet (as of 2026-10-22).** `VolunteerAPI/firebase/serviceAccountKey.json` is missing locally, so `npm run dev` / `npm start` crash immediately with `ENOENT` from `firebase/firebaseAdmin.js`. The user will add the key and say when it's there. Until then, verify API changes with `npm test` (which mocks Firebase), not by starting the server. It's already gitignored (`VolunteerAPI/.gitignore`: `**/serviceAccountKey.json`); never commit it. Also: CI will need it supplied as a GitHub secret if any job starts the real server.

## Known quirks

- **`VITE_CLERK_PUBLISHABLE_KEY` is required even though Clerk is unused**: `VolunteerUI/src/main.jsx` throws `Missing Publishable Key` at startup without it, so the UI won't render. Set any placeholder value locally. Removing the check counts as touching Clerk/auth wiring, so ask first (KEY_DECISIONS.md).
- **`Chat` field naming mismatch**: `VolunteerAPI/chatModel/chatModel.js` reads/writes `conversationID` in its Prisma calls, but the `Chat` model in `prisma/schema.prisma` defines the field as `conversationId`. Verify which is actually correct (or whether this is silently broken) before touching chat persistence.
- **`@clerk/*` packages are unused**: they're listed in `package.json` for both `VolunteerAPI` and `VolunteerUI`, but nothing imports them (only the leftover env-var check in `main.jsx` remains, see above) — Firebase is the real auth system. See KEY_DECISIONS.md.
- **`OpportunityContext` caches opportunities in `localStorage`**: the unfiltered opportunity list is cached client-side and reused across sessions; only filtered/forced-refetch requests hit the network. Stale-looking data after a backend change is expected behavior, not a bug — clear `localStorage` or pass `forceRefetch` to see fresh data.
- **`level.js` and `opp_scraper/` are standalone scripts**, not wired into `server.js` — they're run manually (`node level.js`, Scrapy CLI) rather than as part of the normal request flow.

## Open questions / things to verify

- **Chat endpoint is unmounted**: `VolunteerAPI/routes/chatRoutes.js` defines `POST /` → `chatHandler`, but `app.js` (formerly `server.js`) never does `app.use("/chat", ...)`, so it's unreachable. Intentional (feature shelved) or an oversight? Combined with the `conversationID`/`conversationId` mismatch above, chat may be fully dead code.
- **Most VolunteerAPI write endpoints are unauthenticated**: create/update/delete for opportunities, organizations and badges, `DELETE /users/:id`, and the save/apply routes take no token. Intentional for development, or a gap to close? Relevant to the SRS's security requirements, if it has any.
- **`npm run seed` likely doesn't work**: it runs `npx prisma db seed`, but `VolunteerAPI/package.json` has no `"prisma": { "seed": "node seed.js" }` block, so Prisma has no seed command to run. `node seed.js` works directly. Should the config be added, or the script changed to `node seed.js`?
