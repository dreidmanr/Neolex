import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { pilotRouter } from "../cases/router";

function context(customer: TrpcContext["customer"] = null): TrpcContext {
  return {
    user: null,
    customer,
    requestId: "request_questionnaire_router_01",
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const publicId = "public_questionnaire_router_01";

function enableSyntheticGate(): void {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "mysql://test:test@127.0.0.1/lexy_r1_test_router");
  vi.stubEnv("LEXY_R1_SYNTHETIC_TEST_MODE", "true");
  vi.stubEnv("LEXY_R1_TEST_IDENTITY", "r1-harness");
  vi.stubEnv("LEXY_R1_DATABASE_CLASS", "disposable_test");
  vi.stubEnv("LEXY_R1_EMAIL_TRANSPORT", "test");
  vi.stubEnv("LEXY_R1_PAYMENT_PROVIDER", "disabled");
  vi.stubEnv("LEXY_R1_PROMO_CAMPAIGN_ID", "router_campaign");
  vi.stubEnv("JWT_SECRET", "j".repeat(32));
  vi.stubEnv("LEXY_CUSTOMER_SESSION_SECRET", "c".repeat(32));
  vi.stubEnv("LEXY_R1_MAGIC_LINK_SECRET", "m".repeat(32));
  vi.stubEnv("LEXY_R1_EMAIL_IDENTITY_PEPPER", "e".repeat(32));
  vi.stubEnv("LEXY_R1_RATE_LIMIT_PEPPER", "r".repeat(32));
  vi.stubEnv("LEXY_R1_PROMO_VERIFIER", "v".repeat(32));
  vi.stubEnv("LEXY_R1_PROMO_VERIFIER_PEPPER", "p".repeat(32));
  vi.stubEnv("LEXY_R1_QUESTIONNAIRE_IDEMPOTENCY_PEPPER", "q".repeat(32));
}

afterEach(() => vi.unstubAllEnvs());

describe("Questionnaire v2 cases router", () => {
  it("keeps every questionnaire path customerProcedure-only", async () => {
    const caller = pilotRouter.createCaller(context());
    await expect(caller.cases.getDraft({ publicId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.cases.saveAnswer({
      publicId,
      questionId: "b1_q1",
      value: { kind: "text", text: "value" },
      clientMutationId: "mutation_router_01",
      expectedDraftRevision: 0,
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.cases.submit({
      publicId,
      idempotencyKey: "submit_router_01",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("uses strict server-authority inputs and submit accepts no answer map or revision", async () => {
    enableSyntheticGate();
    const caller = pilotRouter.createCaller(context({
      accountId: "account_router_01",
      sessionId: "session_router_01",
    }));
    await expect(caller.cases.saveAnswer({
      publicId,
      questionId: "b1_q1",
      value: { kind: "text", text: "value" },
      clientMutationId: "mutation_router_02",
      expectedDraftRevision: 0,
      owner: true,
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.cases.submit({
      publicId,
      idempotencyKey: "submit_router_02",
      draftRevision: 0,
      answers: {},
      status: "submitted",
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.cases.getDraft({
      publicId,
      visibility: ["b1_q1"],
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
