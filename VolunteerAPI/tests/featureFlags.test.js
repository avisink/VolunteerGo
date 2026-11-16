// The flag helper and the shared 503 middleware (D-API-009).
const express = require("express");
const request = require("supertest");
const { featureFlags, isEnabled } = require("../config/featureFlags");
const { requireFeature } = require("../middleware/featureGate");

const realNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
    featureFlags.testFeature = true; // a flag that exists only in this file
});

afterEach(() => {
    delete featureFlags.testFeature;
    process.env.NODE_ENV = realNodeEnv;
    jest.restoreAllMocks();
});

describe("isEnabled", () => {
    test("is true for a flag that is on and false for one that is off", () => {
        expect(isEnabled("testFeature")).toBe(true);
        featureFlags.testFeature = false;
        expect(isEnabled("testFeature")).toBe(false);
    });

    test("only the boolean true counts as on", () => {
        featureFlags.testFeature = "false";
        expect(isEnabled("testFeature")).toBe(false);
    });

    test("throws for an unknown flag outside production", () => {
        expect(() => isEnabled("noSuchFeature")).toThrow(/Unknown feature flag "noSuchFeature"/);
        expect(() => isEnabled("toString")).toThrow(/Unknown feature flag/); // inherited names don't count
    });

    test("in production an unknown flag logs an error and counts as on", () => {
        process.env.NODE_ENV = "production";
        const logged = jest.spyOn(console, "error").mockImplementation(() => {});
        expect(isEnabled("noSuchFeature")).toBe(true);
        expect(logged).toHaveBeenCalledWith(expect.stringContaining("noSuchFeature"));
    });

    test("every real flag is a boolean", () => {
        delete featureFlags.testFeature;
        for (const [name, value] of Object.entries(featureFlags)) {
            expect([name, typeof value]).toEqual([name, "boolean"]);
        }
    });
});

describe("requireFeature", () => {
    const buildApp = () => {
        const app = express();
        app.get("/gated", requireFeature("testFeature"), (req, res) => res.json({ ok: true }));
        app.get("/other", (req, res) => res.json({ ok: true }));
        return app;
    };

    test("lets the request through while the flag is on", async () => {
        const res = await request(buildApp()).get("/gated");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });

    test("answers 503 with a clear body while the flag is off, and leaves other routes alone", async () => {
        const app = buildApp();
        featureFlags.testFeature = false;

        const gated = await request(app).get("/gated");
        expect(gated.status).toBe(503);
        expect(gated.body).toEqual({ error: "Feature temporarily unavailable", feature: "testFeature" });

        const other = await request(app).get("/other");
        expect(other.status).toBe(200);
    });

    test("a typo in the flag name fails when the route is defined", () => {
        expect(() => requireFeature("noSuchFeature")).toThrow(/Unknown feature flag/);
    });
});
