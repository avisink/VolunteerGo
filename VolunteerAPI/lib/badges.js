// Badge rules. Badges are only ever awarded here, by the server, as a side effect of the
// action that earns them (D-API-006). Names must match the Badge rows created by seed.js.

const BADGES = {
  NEWCOMER: "Newcomer Badge", // finished onboarding
  FIRST_STEPS: "First Steps", // first application
  IMPACT_LEADER: "Impact Leader", // top of the points leaderboard (ties count) after applying
  CONNECTOR: "Volunteer Connector", // accepted a friend request
};

// Applying to an opportunity with one of these tags (case-insensitive) earns the badge.
const TAG_BADGES = {
  animals: "Animal Advocate",
  community: "Heart of the Community",
  environment: "Planet Protector",
};

// Badges earned by an application. `user` is the state *before* applying (with its
// opportunities), and `usersAhead` how many users have more points than the new total.
function badgesForApplication({ user, opportunity, usersAhead }) {
  const names = [];
  if (user.opportunities.length === 0) names.push(BADGES.FIRST_STEPS);
  for (const tag of opportunity.tags || []) {
    const name = TAG_BADGES[tag.toLowerCase()];
    if (name && !names.includes(name)) names.push(name);
  }
  if (usersAhead === 0) names.push(BADGES.IMPACT_LEADER);
  return names;
}

// Connects the named badges the user doesn't have yet and returns only the newly
// awarded Badge rows (for the UI's "badge earned" modal). Unknown names are skipped.
// `db` is the Prisma client or a transaction client.
async function awardBadges(db, userId, names) {
  if (names.length === 0) return [];

  const owned = await db.user.findUnique({
    where: { id: userId },
    select: { badges: { select: { name: true } } },
  });
  const ownedNames = new Set((owned?.badges || []).map((b) => b.name));
  const missing = names.filter((name) => !ownedNames.has(name));
  if (missing.length === 0) return [];

  const badges = await db.badge.findMany({ where: { name: { in: missing } } });
  if (badges.length === 0) return [];

  await db.user.update({
    where: { id: userId },
    data: { badges: { connect: badges.map((b) => ({ id: b.id })) } },
  });
  return badges;
}

module.exports = { BADGES, TAG_BADGES, badgesForApplication, awardBadges };
