// The other services keep a copy of the flag list. VolunteerAPI's file is the source
// of truth; this fails when a copy has a different flag or value (KEY_DECISIONS.md, "Feature gates").
const fs = require("fs");
const path = require("path");
const { featureFlags } = require("../config/featureFlags");

// Reads `name: true,` (JavaScript) and `"name": True,` (Python) lines.
const readFlags = (relativePath) => {
    const source = fs.readFileSync(path.join(__dirname, "..", "..", relativePath), "utf8");
    const flags = {};
    for (const [, name, value] of source.matchAll(/^\s*"?(\w+)"?\s*:\s*(true|false)\s*,/gim)) {
        flags[name] = value.toLowerCase() === "true";
    }
    return flags;
};

describe("feature flag copies match VolunteerAPI/config/featureFlags.js", () => {
    test("the reader parses this service's own file", () => {
        expect(readFlags("VolunteerAPI/config/featureFlags.js")).toEqual(featureFlags);
    });

    test.each(["VolunteerSearch/feature_flags.py"])("%s", (copy) => {
        expect(readFlags(copy)).toEqual(featureFlags);
    });
});
