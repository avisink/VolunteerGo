const request = require("supertest");

// Mock the shared Prisma client so tests don't need a database.
jest.mock("../db/db", () => ({
    opportunity: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
    },
}));

// firebaseAdmin.js reads a service-account key at import time; stub it out.
jest.mock("../firebase/firebaseAdmin.js", () => ({}));

const prisma = require("../db/db");
const app = require("../app");

beforeEach(() => {
    jest.clearAllMocks();
});

describe("GET /opportunities", () => {
    test("returns the opportunity list", async () => {
        const opportunities = [{ id: 1, name: "Beach Cleanup" }];
        prisma.opportunity.findMany.mockResolvedValue(opportunities);

        const res = await request(app).get("/opportunities");

        expect(res.status).toBe(200);
        expect(res.body).toEqual(opportunities);
    });

    test("builds case-insensitive keyword and city filters", async () => {
        prisma.opportunity.findMany.mockResolvedValue([]);

        await request(app).get("/opportunities?keyword=beach&city=Miami");

        const { where } = prisma.opportunity.findMany.mock.calls[0][0];
        expect(where).toEqual({
            name: { contains: "beach", mode: "insensitive" },
            location: { contains: "Miami", mode: "insensitive" },
        });
    });

    test("returns 500 when the database query fails", async () => {
        prisma.opportunity.findMany.mockRejectedValue(new Error("db down"));

        const res = await request(app).get("/opportunities");

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Failed to fetch opportunities" });
    });
});

describe("GET /opportunities/:id", () => {
    test("returns the opportunity when it exists", async () => {
        const opportunity = { id: 7, name: "Food Bank" };
        prisma.opportunity.findUnique.mockResolvedValue(opportunity);

        const res = await request(app).get("/opportunities/7");

        expect(res.status).toBe(200);
        expect(res.body).toEqual(opportunity);
        expect(prisma.opportunity.findUnique.mock.calls[0][0].where).toEqual({ id: 7 });
    });

    test("returns 404 when it doesn't exist", async () => {
        prisma.opportunity.findUnique.mockResolvedValue(null);

        const res = await request(app).get("/opportunities/999");

        expect(res.status).toBe(404);
    });
});
