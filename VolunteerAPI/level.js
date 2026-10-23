// Backfill: recompute every user's level from their points with the server's formula.
// Run manually from VolunteerAPI/: `node level.js`. New points already update the level (D-API-005).
const { PrismaClient } = require("@prisma/client");
const { getLevelFromPoints } = require("./lib/gamification");

const prisma = new PrismaClient();

async function updateAllUserLevels() {
  const users = await prisma.user.findMany();

  for (const user of users) {
    const correctLevel = getLevelFromPoints(user.points || 0);

    if (user.level !== correctLevel) {
      await prisma.user.update({
        where: { id: user.id },
        data: { level: correctLevel },
      });
      console.log(`Updated ${user.id} to level ${correctLevel}`);
    }
  }

  console.log("All user levels updated.");
  await prisma.$disconnect();
}

updateAllUserLevels().catch((e) => {
  console.error(e);
  prisma.$disconnect();
});
