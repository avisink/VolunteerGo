const { isEnabled } = require("../config/featureFlags");

// Route middleware: answers 503 while the feature's flag is off. Put it before the
// auth middleware so a switched-off feature answers the same way for everyone.
// The flag name is checked once here, so a typo fails when the app starts (D-API-009).
const requireFeature = (flagName) => {
  isEnabled(flagName);
  return (req, res, next) => {
    if (!isEnabled(flagName)) {
      return res.status(503).json({
        error: "Feature temporarily unavailable",
        feature: flagName,
      });
    }
    next();
  };
};

module.exports = { requireFeature };
