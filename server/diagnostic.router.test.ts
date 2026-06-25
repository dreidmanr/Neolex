import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock all DB helpers and notification
vi.mock("./db", () => ({
  createSession: vi.fn().mockResolvedValue({ id: 1, sessionToken: "test-token-123", status: "started" }),
  getSessionByToken: vi.fn().mockResolvedValue({ id: 1, sessionToken: "test-token-123", status: "started" }),
  updateSessionStatus: vi.fn().mockResolvedValue(undefined),
  completeSession: vi.fn().mockResolvedValue(undefined),
  saveContact: vi.fn().mockResolvedValue(undefined),
  getContactBySession: vi.fn().mockResolvedValue({ name: "Test", email: "test@example.com", phone: null, productName: "TestApp", website: null }),
  saveConsent: vi.fn().mockResolvedValue(undefined),
  upsertAnswer: vi.fn().mockResolvedValue(undefined),
  getAnswersBySession: vi.fn().mockResolvedValue([
    { questionId: "q1_product_type", answerId: "saas", answerText: null },
  ]),
  saveScoringResult: vi.fn().mockResolvedValue(undefined),
  getScoringResultBySession: vi.fn().mockResolvedValue({
    riskCategory: "low",
    totalScore: 2,
    hasCriticalEvent: false,
    criticalEvents: "[]",
    significantRisks: "[]",
    riskBlocks: "[]",
    mainConclusion: "Низкий риск.",
  }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

function makeCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("diagnostic.createSession", () => {
  it("returns a session token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.diagnostic.createSession();
    expect(result.sessionToken).toBeTruthy();
  });
});

describe("diagnostic.saveConsents", () => {
  it("saves consents when user agreement is accepted", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.diagnostic.saveConsents({
      sessionToken: "test-token-123",
      userAgreementAccepted: true,
      marketingAccepted: false,
    });
    expect(result.success).toBe(true);
  });

  it("throws when user agreement is not accepted", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.diagnostic.saveConsents({
        sessionToken: "test-token-123",
        userAgreementAccepted: false,
        marketingAccepted: false,
      })
    ).rejects.toThrow("User agreement acceptance is required");
  });

  it("throws when session not found", async () => {
    const { getSessionByToken } = await import("./db");
    vi.mocked(getSessionByToken).mockResolvedValueOnce(undefined);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.diagnostic.saveConsents({
        sessionToken: "nonexistent",
        userAgreementAccepted: true,
        marketingAccepted: false,
      })
    ).rejects.toThrow("Session not found");
  });
});

describe("diagnostic.saveContact", () => {
  it("saves contact with valid email", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.diagnostic.saveContact({
      sessionToken: "test-token-123",
      email: "user@example.com",
      name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.diagnostic.saveContact({
        sessionToken: "test-token-123",
        email: "not-an-email",
      })
    ).rejects.toThrow();
  });
});

describe("diagnostic.saveAnswer", () => {
  it("saves an answer for a valid session", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.diagnostic.saveAnswer({
      sessionToken: "test-token-123",
      questionId: "q1_product_type",
      answerId: "saas",
    });
    expect(result.success).toBe(true);
  });
});

describe("diagnostic.getAnswers", () => {
  it("returns saved answers for a session", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.diagnostic.getAnswers({ sessionToken: "test-token-123" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].questionId).toBe("q1_product_type");
  });
});

describe("diagnostic.complete", () => {
  it("completes a session and returns scoring", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.diagnostic.complete({
      sessionToken: "test-token-123",
      answers: {
        q1_product_type: "saas",
        q2_customers: "b2b_only",
        q3_data: "no_pd",
        q4_storage: "russia_only",
        q5_ip_rights: "rights_full",
        q6_documents: "docs_full",
        q7_payments: "invoice",
        q8_contractors: "no_contractors",
      },
    });
    expect(result.success).toBe(true);
    expect(result.scoring.riskCategory).toBe("low");
  });
});

describe("diagnostic.getResults", () => {
  it("returns results for a completed session", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.diagnostic.getResults({ sessionToken: "test-token-123" });
    expect(result).not.toBeNull();
    expect(result?.result.riskCategory).toBe("low");
  });

  it("returns null for non-existent session", async () => {
    const { getSessionByToken } = await import("./db");
    vi.mocked(getSessionByToken).mockResolvedValueOnce(undefined);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.diagnostic.getResults({ sessionToken: "nonexistent" });
    expect(result).toBeNull();
  });
});
