// The friends flag (FEATURE_FLAGS.md): off, every /friends route answers 503 and other routes still work.
const request = require("supertest");

jest.mock("../db/db", () => ({
    user: { findUnique: jest.fn() },
    friendRequest: { findMany: jest.fn() },
}));
const mockVerifyIdToken = jest.fn();
jest.mock("../firebase/firebaseAdmin.js", () => ({
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const prisma = require("../db/db");
const { featureFlags } = require("../config/featureFlags");
const app = require("../app");

const shipped = featureFlags.friends;
const FRIEND_ROUTES = [
    ["post", "/friends/request"],
    ["get", "/friends/received-requests"],
    ["get", "/friends/sent-requests"],
    ["post", "/friends/accept"],
    ["post", "/friends/reject"],
    ["post", "/friends/unfriend"],
    ["get", "/friends/list"],
    ["post", "/friends/cancel"],
];

beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1" });
});
afterEach(() => {
    featureFlags.friends = shipped;
});

test("ships on", () => {
    expect(shipped).toBe(true);
});

test.each(FRIEND_ROUTES)("off: %s %s answers 503 before auth or the database", async (method, path) => {
    featureFlags.friends = false;
    const res = await request(app)[method](path).set("Authorization", "Bearer t").send({});
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Feature temporarily unavailable", feature: "friends" });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
});

test("off: other routes still answer", async () => {
    featureFlags.friends = false;
    prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1" });
    expect((await request(app).get("/users/by-uid/uid-1")).status).toBe(200);
});

test("on: friend routes reach auth again", async () => {
    featureFlags.friends = true;
    const res = await request(app).get("/friends/list"); // no token
    expect(res.status).toBe(401);
});
