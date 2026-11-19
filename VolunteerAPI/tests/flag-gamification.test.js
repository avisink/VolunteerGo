// The gamification flag (FEATURE_FLAGS.md): off, applying still works but awards no points
// and never levels up. Gamification has no endpoints of its own.
const request = require("supertest");

jest.mock("../db/db", () => {
    const client = {
        user: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
        opportunity: { findUnique: jest.fn() },
        badge: { findMany: jest.fn() },
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
const { pointsForOpportunity } = require("../lib/gamification");
const app = require("../app");

const shipped = featureFlags.gamification;

beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1" });
    prisma.badge.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(3);
});
afterEach(() => {
    featureFlags.gamification = shipped;
});

// A user with 14 points (one short of level 2) applies to a 10-point opportunity.
const apply = (pointsAfter) => {
    prisma.user.findUnique
        .mockResolvedValueOnce({ id: 1, firebaseUid: "uid-1", points: 14, level: 1, opportunities: [{ id: 2 }] })
        .mockResolvedValue({ badges: [] });
    prisma.opportunity.findUnique.mockResolvedValue({ id: 5, points: 10, tags: [] });
    prisma.user.update
        .mockResolvedValueOnce({ id: 1, points: pointsAfter })
        .mockImplementationOnce(async ({ data }) => ({ id: 1, points: pointsAfter, level: data.level, opportunities: [{ id: 2 }, { id: 5 }] }));
    return request(app).put("/users/1/opportunities/add").set("Authorization", "Bearer t").send({ opportunityId: 5 });
};

test("ships on", () => {
    expect(shipped).toBe(true);
});

test("off: applying succeeds, awards 0 points and doesn't level up", async () => {
    featureFlags.gamification = false;
    expect(pointsForOpportunity({ points: 10 })).toBe(0);

    const res = await apply(14);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pointsAwarded: 0, points: 14, level: 1, leveledUp: false });
    expect(prisma.user.update.mock.calls[0][0].data.points).toEqual({ increment: 0 });
    expect(res.body.opportunities).toEqual([{ id: 2 }, { id: 5 }]); // still applied
});

test("on: applying awards the points and levels up", async () => {
    featureFlags.gamification = true;
    const res = await apply(24);
    expect(res.body).toMatchObject({ pointsAwarded: 10, points: 24, level: 2, leveledUp: true });
});
