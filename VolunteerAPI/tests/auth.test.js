const request = require("supertest");

jest.mock("../db/db", () => ({
    user: {
        findUnique: jest.fn(),
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

describe("verifyFirebaseToken (via PUT /users/:id/opportunities/add)", () => {
    test("rejects a request with no Authorization header", async () => {
        const res = await request(app).put("/users/1/opportunities/add").send({ opportunityId: 5 });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized" });
        expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    test("rejects a non-Bearer Authorization header", async () => {
        const res = await request(app)
            .put("/users/1/opportunities/add")
            .set("Authorization", "Basic abc123")
            .send({ opportunityId: 5 });

        expect(res.status).toBe(401);
        expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    test("rejects a token Firebase can't verify", async () => {
        mockVerifyIdToken.mockRejectedValue(new Error("expired"));

        const res = await request(app)
            .put("/users/1/opportunities/add")
            .set("Authorization", "Bearer bad-token")
            .send({ opportunityId: 5 });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Invalid token" });
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    test("passes a verified user's uid through to the controller", async () => {
        mockVerifyIdToken.mockResolvedValue({ uid: "firebase-uid-1" });
        // A different owner proves the controller saw req.user.uid: it answers 403, not 401.
        prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "someone-else", opportunities: [] });

        const res = await request(app)
            .put("/users/1/opportunities/add")
            .set("Authorization", "Bearer good-token")
            .send({ opportunityId: 5 });

        expect(mockVerifyIdToken).toHaveBeenCalledWith("good-token");
        expect(res.status).toBe(403);
    });
});
