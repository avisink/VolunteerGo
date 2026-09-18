# CONTEXT.md

Running notes on this codebase — quirks, gotchas, and things worth knowing that don't belong in `CLAUDE.md`'s architecture overview. This file is updated regularly as new things are found; newest entries go at the top of each section. If a note here turns into something Claude must actively enforce (not just be aware of), promote it to `KEY_DECISIONS.md`.

## Known quirks

- **`Chat` field naming mismatch**: `VolunteerAPI/chatModel/chatModel.js` reads/writes `conversationID` in its Prisma calls, but the `Chat` model in `prisma/schema.prisma` defines the field as `conversationId`. Verify which is actually correct (or whether this is silently broken) before touching chat persistence.
- **`@clerk/*` packages are unused**: they're listed in `package.json` for both `VolunteerAPI` and `VolunteerUI`, but nothing in the code imports them — Firebase is the real auth system. See KEY_DECISIONS.md.
- **`OpportunityContext` caches opportunities in `localStorage`**: the unfiltered opportunity list is cached client-side and reused across sessions; only filtered/forced-refetch requests hit the network. Stale-looking data after a backend change is expected behavior, not a bug — clear `localStorage` or pass `forceRefetch` to see fresh data.
- **`level.js` and `opp_scraper/` are standalone scripts**, not wired into `server.js` — they're run manually (`node level.js`, Scrapy CLI) rather than as part of the normal request flow.

## Open questions / things to verify

- (add items here as they come up)
