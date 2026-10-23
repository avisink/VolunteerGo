const request = require("supertest");
const { getLevelFromPoints, pointsForOpportunity } = require("../lib/gamification");

// $transaction runs its callback against the same mock client, like Prisma's interactive transactions.
jest.mock("../db/db", () => {
    const client = {
        user: { findUnique: jest.fn(), update: jest.fn() },
        opportunity: { findUnique: jest.fn() },
    };
    client.$transaction = jest.fn((fn) => fn(client));
    return client;
});

const mockVerifyIdToken = jest.fn();
jest.mock("../firebase/firebaseAdmin.js", () => ({
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const prisma = require("../db/db");
const app = require("../app");

beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1" });
});

describe("getLevelFromPoints", () => {
    test.each([
        [0, 1],
        [14, 1],
        [15, 2], // 15 to reach level 2
        [34, 2],
        [35, 3], // then 20 more
        [60, 4], // then 25 more
        [-5, 1],
        [undefined, 1],
    ])("%p points is level %p", (points, level) => {
        expect(getLevelFromPoints(points)).toBe(level);
    });
});

describe("pointsForOpportunity", () => {
    test("uses the opportunity's own value, or 10 when it has none", () => {
        expect(pointsForOpportunity({ points: 25 })).toBe(25);
        expect(pointsForOpportunity({ points: 0 })).toBe(10);
    });
});

describe("PUT /users/:id/opportunities/add", () => {
    const apply = (body = { opportunityId: 5 }) =>
        request(app).put("/users/1/opportunities/add").set("Authorization", "Bearer t").send(body);

    test("awards the opportunity's points and recomputes the level on the server", async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1", points: 10, level: 1, opportunities: [] });
        prisma.opportunity.findUnique.mockResolvedValue({ id: 5, points: 10 });
        prisma.user.update
            .mockResolvedValueOnce({ id: 1, points: 20 })
            .mockResolvedValueOnce({ id: 1, points: 20, level: 2, opportunities: [{ id: 5 }] });

        const res = await apply();

        expect(res.status).toBe(200);
        expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
            where: { id: 1 },
            data: { opportunities: { connect: { id: 5 } }, points: { increment: 10 } },
        });
        expect(prisma.user.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { level: 2 } }));
        expect(res.body).toMatchObject({ points: 20, level: 2, pointsAwarded: 10, leveledUp: true });
    });

    test("ignores points and level sent by the client", async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1", points: 0, level: 1, opportunities: [] });
        prisma.opportunity.findUnique.mockResolvedValue({ id: 5, points: 10 });
        prisma.user.update
            .mockResolvedValueOnce({ id: 1, points: 10 })
            .mockResolvedValueOnce({ id: 1, points: 10, level: 1, opportunities: [{ id: 5 }] });

        const res = await apply({ opportunityId: 5, points: 9999, level: 50 });

        expect(res.body).toMatchObject({ points: 10, level: 1, pointsAwarded: 10 });
    });

    test("doesn't award points twice for the same opportunity", async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1", points: 10, level: 1, opportunities: [{ id: 5 }] });
        prisma.opportunity.findUnique.mockResolvedValue({ id: 5, points: 10 });

        const res = await apply();

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ points: 10, pointsAwarded: 0, leveledUp: false });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test("returns 403 when applying on behalf of another user", async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-2", opportunities: [] });

        const res = await apply();

        expect(res.status).toBe(403);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test("returns 404 for an unknown opportunity", async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1", opportunities: [] });
        prisma.opportunity.findUnique.mockResolvedValue(null);

        const res = await apply();

        expect(res.status).toBe(404);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test("returns 400 without an opportunityId", async () => {
        const res = await apply({});

        expect(res.status).toBe(400);
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
});

describe("PUT /users/points", () => {
    test("no longer exists, so clients can't set their own score", async () => {
        const res = await request(app)
            .put("/users/points")
            .set("Authorization", "Bearer t")
            .send({ points: 9999, level: 50 });

        expect(res.status).toBe(404);
    });
});
