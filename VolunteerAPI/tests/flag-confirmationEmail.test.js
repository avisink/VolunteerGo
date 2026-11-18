// The confirmationEmail flag (FEATURE_FLAGS.md): off, the email endpoint answers 503 and nothing is sent.
const request = require("supertest");

jest.mock("../db/db", () => ({ user: { findUnique: jest.fn() } }));
const mockVerifyIdToken = jest.fn();
jest.mock("../firebase/firebaseAdmin.js", () => ({
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));
jest.mock("@sendgrid/mail", () => ({ setApiKey: jest.fn(), send: jest.fn() }));

const sgMail = require("@sendgrid/mail");
const { featureFlags } = require("../config/featureFlags");
const app = require("../app");

const shipped = featureFlags.confirmationEmail;
const sendEmail = () => request(app).post("/users/send-confirmation-email").set("Authorization", "Bearer t")
    .send({ subject: "hi", text: "x", html: "x" });

beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1", email: "me@example.com" });
});
afterEach(() => {
    featureFlags.confirmationEmail = shipped;
});

test("ships on", () => {
    expect(shipped).toBe(true);
});

test("off: the endpoint answers 503 and sends nothing", async () => {
    featureFlags.confirmationEmail = false;
    const res = await sendEmail();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Feature temporarily unavailable", feature: "confirmationEmail" });
    expect(sgMail.send).not.toHaveBeenCalled();
    expect(mockVerifyIdToken).not.toHaveBeenCalled(); // gated before auth
});

test("off: other routes still answer", async () => {
    featureFlags.confirmationEmail = false;
    const prisma = require("../db/db");
    prisma.user.findUnique.mockResolvedValue({ id: 1, firebaseUid: "uid-1" });
    const res = await request(app).get("/users/by-uid/uid-1");
    expect(res.status).toBe(200);
});

test("on: the email is sent", async () => {
    featureFlags.confirmationEmail = true;
    const res = await sendEmail();
    expect(res.status).toBe(200);
    expect(sgMail.send).toHaveBeenCalledTimes(1);
});
