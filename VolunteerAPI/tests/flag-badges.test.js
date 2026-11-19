// The badges flag (FEATURE_FLAGS.md): off, /badges answers 503 and the actions that award
// badges (apply, onboarding) still succeed, just without badges.
const request = require("supertest");

jest.mock("../db/db", () => {
    const client = {
        user: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn(), count: jest.fn() },
        opportunity: { findUnique: jest.fn() },
        badge: { findMany: jest.fn(), findUnique: jest.fn() },
    };
    client.$transaction = jest.fn((fn) => fn(client));
    return client;
});
const mockVerifyIdToken = jest.fn();
jest.mock("../firebase/firebaseAdmin.js", () => ({
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const prisma = require("../db/db");
const { featureFlags } = require("../config/featureFlags");
const app = require("../app");

const shipped = featureFlags.badges;
const NEWCOMER = { id: 9, name: "Newcomer Badge" };

beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1" });
    prisma.badge.findMany.mockResolvedValue([NEWCOMER]);
});
afterEach(() => {
    featureFlags.badges = shipped;
});

const onboard = () => {
    prisma.user.upsert.mockResolvedValue({ id: 1 });
    prisma.user.findUnique.mockResolvedValue({ badges: [] }); // owned badges
    return request(app).post("/users/onboarding").set("Authorization", "Bearer t").send({ name: "Ayo" });
};

const applyFirstTime = () => {
    prisma.user.findUnique
        .mockResolvedValueOnce({ id: 1, firebaseUid: "uid-1", points: 0, level: 1, opportunities: [] })
        .mockResolvedValue({ badges: [] });
    prisma.opportunity.findUnique.mockResolvedValue({ id: 5, points: 10, tags: ["animals"] });
    prisma.user.update
        .mockResolvedValueOnce({ id: 1, points: 10 })
        .mockResolvedValueOnce({ id: 1, points: 10, level: 1, opportunities: [{ id: 5 }] })
        .mockResolvedValue({});
    prisma.user.count.mockResolvedValue(0);
    return request(app).put("/users/1/opportunities/add").set("Authorization", "Bearer t").send({ opportunityId: 5 });
};

test("ships on", () => {
    expect(shipped).toBe(true);
});

describe("off", () => {
    beforeEach(() => {
        featureFlags.badges = false;
    });

    test.each([
        ["get", "/badges"],
        ["get", "/badges/1"],
        ["post", "/badges"],
        ["delete", "/badges/1"],
    ])("%s %s answers 503", async (method, path) => {
        const res = await request(app)[method](path).set("Authorization", "Bearer t");
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ error: "Feature temporarily unavailable", feature: "badges" });
    });

    test("onboarding still succeeds, with no badges", async () => {
        const res = await onboard();
        expect(res.status).toBe(200);
        expect(res.body.badgesEarned).toEqual([]);
        expect(prisma.badge.findMany).not.toHaveBeenCalled();
    });

    test("applying still awards points, with no badges", async () => {
        const res = await applyFirstTime();
        expect(res.status).toBe(200);
        expect(res.body.pointsAwarded).toBe(10);
        expect(res.body.badgesEarned).toEqual([]);
        expect(prisma.badge.findMany).not.toHaveBeenCalled();
    });
});

describe("on", () => {
    test("onboarding awards the Newcomer badge", async () => {
        featureFlags.badges = true;
        const res = await onboard();
        expect(res.body.badgesEarned).toEqual([NEWCOMER]);
    });
});
