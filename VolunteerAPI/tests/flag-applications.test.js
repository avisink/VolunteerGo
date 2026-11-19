// The applications flag (FEATURE_FLAGS.md): off, applying and the applied-list route answer 503
// before auth or the database, so no points, badges or email follow; other routes still work.
const request = require("supertest");

jest.mock("../db/db", () => ({
    user: { findUnique: jest.fn(), update: jest.fn() },
    opportunity: { findUnique: jest.fn() },
}));
const mockVerifyIdToken = jest.fn();
jest.mock("../firebase/firebaseAdmin.js", () => ({
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const prisma = require("../db/db");
const { featureFlags } = require("../config/featureFlags");
const app = require("../app");

const shipped = featureFlags.applications;

beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1" });
});
afterEach(() => {
    featureFlags.applications = shipped;
});

test("ships on", () => {
    expect(shipped).toBe(true);
});

test.each([
    ["put", "/users/1/opportunities/add"],
    ["get", "/users/1/opportunities"],
])("off: %s %s answers 503 before auth or the database", async (method, path) => {
    featureFlags.applications = false;
    const res = await request(app)[method](path).set("Authorization", "Bearer t").send({ opportunityId: 5 });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Feature temporarily unavailable", feature: "applications" });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled(); // no points awarded
});

test("off: other /users routes and browsing still answer", async () => {
    featureFlags.applications = false;
    prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1" });
    prisma.opportunity.findUnique.mockResolvedValue({ id: 5 });
    expect((await request(app).get("/users/by-uid/uid-1")).status).toBe(200);
    expect((await request(app).get("/opportunities/5")).status).toBe(200);
});

test("on: the applied list answers again", async () => {
    featureFlags.applications = true;
    prisma.user.findUnique.mockResolvedValue({ id: 1, opportunities: [{ id: 5 }] });
    const res = await request(app).get("/users/1/opportunities");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 5 }]);
});
