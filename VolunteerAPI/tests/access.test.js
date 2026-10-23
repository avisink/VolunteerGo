// Server-side badges (D-API-006) and who may call which write endpoints (D-API-007).
const request = require("supertest");
const { badgesForApplication, BADGES } = require("../lib/badges");

jest.mock("../db/db", () => {
    const client = {
        user: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn(), count: jest.fn(), create: jest.fn(), delete: jest.fn() },
        opportunity: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
        organization: { create: jest.fn() },
        badge: { findMany: jest.fn(), create: jest.fn() },
        friendRequest: { findUnique: jest.fn(), update: jest.fn() },
    };
    client.$transaction = jest.fn((fn) => fn(client));
    return client;
});

const mockVerifyIdToken = jest.fn();
jest.mock("../firebase/firebaseAdmin.js", () => ({
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

jest.mock("@sendgrid/mail", () => ({ setApiKey: jest.fn(), send: jest.fn() }));

const prisma = require("../db/db");
const sgMail = require("@sendgrid/mail");
const app = require("../app");

const signedIn = (uid = "uid-1", extra = {}) => mockVerifyIdToken.mockResolvedValue({ uid, ...extra });

beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADMIN_UIDS;
});

describe("badgesForApplication", () => {
    const opportunity = { tags: ["Animals", "community", "animals", "sports"] };

    test("first application, matching tags and top of the leaderboard", () => {
        expect(badgesForApplication({ user: { opportunities: [] }, opportunity, usersAhead: 0 })).toEqual([
            BADGES.FIRST_STEPS, "Animal Advocate", "Heart of the Community", BADGES.IMPACT_LEADER,
        ]);
    });

    test("nothing for a later application with no matching tags behind other users", () => {
        expect(badgesForApplication({ user: { opportunities: [{ id: 1 }] }, opportunity: { tags: ["sports"] }, usersAhead: 3 }))
            .toEqual([]);
    });
});

describe("badges are awarded by the server", () => {
    test("applying returns newly earned badges and connects only ones the user lacks", async () => {
        signedIn();
        prisma.user.findUnique
            .mockResolvedValueOnce({ id: 1, firebaseUid: "uid-1", points: 0, level: 1, opportunities: [] }) // the applicant
            .mockResolvedValueOnce({ badges: [{ name: "Animal Advocate" }] }); // badges already owned
        prisma.opportunity.findUnique.mockResolvedValue({ id: 5, points: 10, tags: ["animals"] });
        prisma.user.update
            .mockResolvedValueOnce({ id: 1, points: 10 })
            .mockResolvedValueOnce({ id: 1, points: 10, level: 1, opportunities: [{ id: 5 }] });
        prisma.user.count.mockResolvedValue(2); // two users ahead: no Impact Leader
        prisma.badge.findMany.mockResolvedValue([{ id: 7, name: BADGES.FIRST_STEPS }]);

        const res = await request(app).put("/users/1/opportunities/add").set("Authorization", "Bearer t").send({ opportunityId: 5 });

        expect(res.status).toBe(200);
        expect(prisma.badge.findMany).toHaveBeenCalledWith({ where: { name: { in: [BADGES.FIRST_STEPS] } } });
        expect(prisma.user.update).toHaveBeenLastCalledWith({ where: { id: 1 }, data: { badges: { connect: [{ id: 7 }] } } });
        expect(res.body.badgesEarned).toEqual([{ id: 7, name: BADGES.FIRST_STEPS }]);
    });

    test("onboarding awards the Newcomer badge", async () => {
        signedIn();
        prisma.user.upsert.mockResolvedValue({ id: 1 });
        prisma.user.findUnique.mockResolvedValue({ badges: [] });
        prisma.badge.findMany.mockResolvedValue([{ id: 9, name: BADGES.NEWCOMER }]);

        const res = await request(app).post("/users/onboarding").set("Authorization", "Bearer t").send({ name: "Ayo" });

        expect(res.status).toBe(200);
        expect(res.body.badgesEarned).toEqual([{ id: 9, name: BADGES.NEWCOMER }]);
    });

    test("accepting a friend request awards the Connector badge to the accepter", async () => {
        signedIn("uid-2");
        prisma.user.findUnique
            .mockResolvedValueOnce({ id: 2 }) // caller lookup by firebaseUid
            .mockResolvedValueOnce({ badges: [] });
        prisma.friendRequest.findUnique.mockResolvedValue({ id: 3, senderId: 1, receiverId: 2, status: "pending" });
        prisma.badge.findMany.mockResolvedValue([{ id: 4, name: BADGES.CONNECTOR }]);

        const res = await request(app).post("/friends/accept").set("Authorization", "Bearer t").send({ requestId: 3 });

        expect(res.status).toBe(200);
        expect(res.body.badgesEarned).toEqual([{ id: 4, name: BADGES.CONNECTOR }]);
    });

    test("POST /badges/give no longer exists", async () => {
        const res = await request(app).post("/badges/give").send({ userId: 1, badgeName: "Impact Leader" });
        expect(res.status).toBe(404);
    });
});

describe("admin-only writes for opportunities, organizations and badges", () => {
    test.each([
        ["post", "/opportunities"],
        ["delete", "/opportunities/1"],
        ["post", "/organizations"],
        ["post", "/badges"],
    ])("%s %s needs a token", async (method, path) => {
        const res = await request(app)[method](path).send({ name: "x" });
        expect(res.status).toBe(401);
    });

    test("a signed-in non-admin gets 403", async () => {
        process.env.ADMIN_UIDS = "admin-uid";
        signedIn("uid-1");

        const res = await request(app).post("/badges").set("Authorization", "Bearer t").send({ name: "x" });

        expect(res.status).toBe(403);
        expect(prisma.badge.create).not.toHaveBeenCalled();
    });

    test("an admin listed in ADMIN_UIDS can write", async () => {
        process.env.ADMIN_UIDS = "someone-else, admin-uid";
        signedIn("admin-uid");
        prisma.badge.create.mockResolvedValue({ id: 1, name: "x" });

        const res = await request(app).post("/badges").set("Authorization", "Bearer t").send({ name: "x" });

        expect(res.status).toBe(201);
    });

    test("reads stay public", async () => {
        prisma.opportunity.findUnique.mockResolvedValue({ id: 1 });
        const res = await request(app).get("/opportunities/1");
        expect(res.status).toBe(200);
    });
});

describe("users can only change their own account", () => {
    test("saving needs a token", async () => {
        const res = await request(app).post("/users/1/saved-opportunities/add").send({ opportunityId: 5 });
        expect(res.status).toBe(401);
    });

    test("saving to someone else's account is 403", async () => {
        signedIn("uid-1");
        prisma.user.findUnique.mockResolvedValue({ firebaseUid: "uid-2" });

        const res = await request(app).post("/users/1/saved-opportunities/add").set("Authorization", "Bearer t").send({ opportunityId: 5 });

        expect(res.status).toBe(403);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test("deleting someone else's account is 403, your own works", async () => {
        signedIn("uid-1");
        prisma.user.findUnique.mockResolvedValueOnce({ firebaseUid: "uid-2" });
        expect((await request(app).delete("/users/1").set("Authorization", "Bearer t")).status).toBe(403);

        prisma.user.findUnique
            .mockResolvedValueOnce({ firebaseUid: "uid-1" }) // requireSelf
            .mockResolvedValueOnce({ id: 1 }); // controller
        expect((await request(app).delete("/users/1").set("Authorization", "Bearer t")).status).toBe(204);
    });

    test("POST /users takes the Firebase uid from the token, not the body", async () => {
        signedIn("uid-1");
        prisma.user.create.mockResolvedValue({ id: 1 });

        const res = await request(app).post("/users").set("Authorization", "Bearer t")
            .send({ firebaseUid: "someone-else", username: "ayo" });

        expect(res.status).toBe(201);
        expect(prisma.user.create).toHaveBeenCalledWith({ data: { username: "ayo", firebaseUid: "uid-1", name: null } });
    });

    test("confirmation email only goes to the signed-in user", async () => {
        signedIn("uid-1", { email: "me@example.com" });

        const res = await request(app).post("/users/send-confirmation-email").set("Authorization", "Bearer t")
            .send({ to: "victim@example.com", subject: "hi", text: "x", html: "x" });

        expect(res.status).toBe(200);
        expect(sgMail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "me@example.com" }));
    });
});
