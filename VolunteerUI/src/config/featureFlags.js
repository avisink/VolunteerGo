// Feature flags: the one place a feature is switched off in the UI (FEATURE_FLAGS.md, D-UI-004).
// A copy of VolunteerAPI/config/featureFlags.js (the source of truth): same names, same values.
// Set a flag to false and redeploy to turn that feature off; set it back to true to restore it.
export const featureFlags = {
  // /map page (LocationPage). Ships off: no maps API key and known problems (D-UI-001).
  map: false,
  // Application confirmation email (POST /users/send-confirmation-email). Off: applying still works, no email.
  confirmationEmail: true,
  // Friends: requests, friend list, /friends/* endpoints. Off: the Friends tab, buttons and leaderboard filter are hidden.
  friends: true,
  // Badges: /badges endpoints and awarding badges. Off: nothing is awarded and badge sections are hidden.
  badges: true,
  // Gamification: points and levels. Off: applying awards no points, and points/level displays are hidden.
  gamification: true,
  // Saved opportunities: bookmarking and the /saved page. Off: save buttons and the Saved link are hidden.
  savedOpportunities: true,
};

// Always ask through this helper. An unknown name is a typo: it throws in development
// and tests, and in a production build it logs and counts as enabled, so a typo can
// never switch a feature off.
export function isEnabled(flagName) {
  if (!Object.hasOwn(featureFlags, flagName)) {
    const message = `Unknown feature flag "${flagName}". Add it to src/config/featureFlags.js.`;
    if (import.meta.env.DEV) throw new Error(message);
    console.error(message);
    return true;
  }
  return featureFlags[flagName] === true;
}
