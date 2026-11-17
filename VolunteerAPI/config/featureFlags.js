// Feature flags: the one place a feature is switched off (FEATURE_FLAGS.md, D-API-009).
// Set a flag to false and redeploy to turn that feature off; set it back to true to restore it.
// VolunteerUI and VolunteerSearch keep a copy of this list: change the same flag there too.
const featureFlags = {
  // /map page (LocationPage). Ships off: no maps API key and known problems (D-UI-001).
  map: false,
};

// Always ask through this helper. An unknown name is a typo: it throws outside
// production so it's caught in development and tests, and in production it logs
// and counts as enabled, so a typo can never switch a feature off.
function isEnabled(flagName) {
  if (!Object.hasOwn(featureFlags, flagName)) {
    const message = `Unknown feature flag "${flagName}". Add it to config/featureFlags.js.`;
    if (process.env.NODE_ENV !== "production") throw new Error(message);
    console.error(message);
    return true;
  }
  return featureFlags[flagName] === true;
}

module.exports = { featureFlags, isEnabled };
