const request = require("supertest");

jest.mock("../db/db", () => ({
    user: {
        update: jest.fn(),
    },
}));

// Stand-in for firebase-admin: verifyIdToken is the only call the auth middleware makes.
const mockVerifyIdToken = jest.fn();
jest.mock("../firebase/firebaseAdmin.js", () => ({
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const prisma = require("../db/db");
const app = require("../app");

beforeEach(() => {
    jest.clearAllMocks();
});

describe("verifyFirebaseToken (via PUT /users/points)", () => {
    test("rejects a request with no Authorization header", async () => {
        const res = await request(app).put("/users/points").send({ points: 10, level: 1 });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized" });
        expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    test("rejects a non-Bearer Authorization header", async () => {
        const res = await request(app)
            .put("/users/points")
            .set("Authorization", "Basic abc123")
            .send({ points: 10, level: 1 });

        expect(res.status).toBe(401);
        expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    test("rejects a token Firebase can't verify", async () => {
        mockVerifyIdToken.mockRejectedValue(new Error("expired"));

        const res = await request(app)
            .put("/users/points")
            .set("Authorization", "Bearer bad-token")
            .send({ points: 10, level: 1 });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Invalid token" });
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test("passes a verified user's uid through to the controller", async () => {
        mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1" });
        prisma.user.update.mockResolvedValue({ id: 1, points: 10, level: 1 });

        const res = await request(app)
            .put("/users/points")
            .set("Authorization", "Bearer good-token")
            .send({ points: 10, level: 1 });

        expect(res.status).toBe(200);
        expect(mockVerifyIdToken).toHaveBeenCalledWith("good-token");
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { firebaseUid: "firebase-uid-1" },
            data: { points: 10, level: 1 },
        });
    });
});

describe("PUT /users/points validation", () => {
    test("returns 400 when points or level is missing", async () => {
        mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1" });

        const res = await request(app)
            .put("/users/points")
            .set("Authorization", "Bearer good-token")
            .send({ points: 10 });

        expect(res.status).toBe(400);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });
});
