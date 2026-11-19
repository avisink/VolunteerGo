// The savedOpportunities flag (FEATURE_FLAGS.md): off, the saved-opportunity routes answer 503
// and the rest of /users still works.
const request = require("supertest");

jest.mock("../db/db", () => ({ user: { findUnique: jest.fn(), update: jest.fn() } }));
const mockVerifyIdToken = jest.fn();
jest.mock("../firebase/firebaseAdmin.js", () => ({
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const prisma = require("../db/db");
const { featureFlags } = require("../config/featureFlags");
const app = require("../app");

const shipped = featureFlags.savedOpportunities;
const ROUTES = [
    ["get", "/users/1/saved-opportunities"],
    ["post", "/users/1/saved-opportunities/add"],
    ["post", "/users/1/saved-opportunities/remove"],
];

beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1" });
});
afterEach(() => {
    featureFlags.savedOpportunities = shipped;
});

test("ships on", () => {
    expect(shipped).toBe(true);
});

test.each(ROUTES)("off: %s %s answers 503 before auth or the database", async (method, path) => {
    featureFlags.savedOpportunities = false;
    const res = await request(app)[method](path).set("Authorization", "Bearer t").send({ opportunityId: 5 });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Feature temporarily unavailable", feature: "savedOpportunities" });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
});

test("off: other /users routes still answer", async () => {
    featureFlags.savedOpportunities = false;
    prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1" });
    expect((await request(app).get("/users/1")).status).toBe(200);
});

test("on: saving works again", async () => {
    featureFlags.savedOpportunities = true;
    prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1", savedOpportunities: [] });
    prisma.user.update.mockResolvedValue({ id: 1, savedOpportunities: [{ id: 5 }] });
    const res = await request(app).post("/users/1/saved-opportunities/add").set("Authorization", "Bearer t").send({ opportunityId: 5 });
    expect(res.status).toBe(200);
});
