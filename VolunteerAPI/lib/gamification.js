// Points and level rules. The server is the only place these are applied (D-API-005);
// VolunteerUI's ProgressBar.getLevelData uses the same curve for display only.

// Awarded when an opportunity has no point value of its own (Opportunity.points defaults to 0).
const DEFAULT_APPLICATION_POINTS = 10;

// Level 1 → 2 needs 15 points, and each level after that needs 5 more than the last
// (15, 20, 25, ...). Negative or missing points count as level 1.
function getLevelFromPoints(points) {
  if (!points || points < 0) return 1;

  let level = 1;
  let totalPoints = 0;
  let pointsNeeded = 15;

  while (points >= totalPoints + pointsNeeded) {
    totalPoints += pointsNeeded;
    level++;
    pointsNeeded += 5;
  }

  return level;
}

function pointsForOpportunity(opportunity) {
  return opportunity.points > 0 ? opportunity.points : DEFAULT_APPLICATION_POINTS;
}

module.exports = { DEFAULT_APPLICATION_POINTS, getLevelFromPoints, pointsForOpportunity };
