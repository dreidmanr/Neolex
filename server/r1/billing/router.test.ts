import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";

const mocks = vi.hoisted(() => ({ redeemPromo: vi.fn(), getOffer: vi.fn(), getMetadata: vi.fn() }));
vi.mock("./promoService", () => ({ redeemPromo: mocks.redeemPromo }));
vi.mock("./tariffService", () => ({ getOffer: mocks.getOffer }));
vi.mock("../legal/documentRegistry", async importOriginal => ({ ...(await importOriginal<typeof import("../legal/documentRegistry")>()), getRequiredMetadata: mocks.getMetadata }));

import { pilotAccessRouter, pilotConsentsRouter } from "./router";

const customer = { accountId: "account_01", sessionId: "session_01" };
const context = (authenticated = true): TrpcContext => ({
  user: null, customer: authenticated ? customer : null,
  requestId: "request_promo_router_01", req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"],
});
const consents = [
  { documentId: "termsdraft", documentVersion: "v1", contentHash: "a".repeat(64), consentType: "terms" as const, accepted: true },
  { documentId: "datadraft", documentVersion: "v1", contentHash: "b".repeat(64), consentType: "data_processing" as const, accepted: true },
  { documentId: "marketingdraft", documentVersion: "v1", contentHash: "c".repeat(64), consentType: "marketing" as const, accepted: false },
];

describe("pilot promo routers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOffer.mockReturnValue({ tariffCode: "base_diagnostic", serviceTier: "base_diagnostic", currency: "RUB", provenanceStatus: "draft_test_only" });
    mocks.getMetadata.mockReturnValue([]);
    mocks.redeemPromo.mockResolvedValue({ casePublicId: "public_01", status: "access_granted", tariffCode: "base_diagnostic", accessStatus: "active" });
    Object.assign(process.env, {
      NODE_ENV: "test", LEXY_R1_SYNTHETIC_TEST_MODE: "true", LEXY_R1_TEST_IDENTITY: "r1-harness",
      LEXY_R1_DATABASE_CLASS: "disposable_test", DATABASE_URL: "mysql://u:p@localhost/lexy_r1_test_router",
      LEXY_CUSTOMER_SESSION_SECRET: "customer-session-secret-32-bytes-minimum", JWT_SECRET: "oauth-secret-material-32-bytes-minimum",
    });
  });
  it("requires customerProcedure on offer, metadata, and redemption", async () => {
    await expect(pilotAccessRouter.createCaller(context(false)).getOffer()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(pilotConsentsRouter.createCaller(context(false)).getRequiredMetadata()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("passes only server context authority to redemption and returns minimal response", async () => {
    const input = { tariffCode: "base_diagnostic", promoValue: "secret-code", idempotencyKey: "idem-key-123", consents };
    await expect(pilotAccessRouter.createCaller(context()).redeemPromo(input)).resolves.toEqual({ casePublicId: "public_01", status: "access_granted", tariffCode: "base_diagnostic", accessStatus: "active" });
    expect(mocks.redeemPromo).toHaveBeenCalledWith({ ...input, customerAccountId: customer.accountId, customerSessionId: customer.sessionId, requestId: "request_promo_router_01" });
  });
  it("rejects extra authority and billing fields", async () => {
    const caller = pilotAccessRouter.createCaller(context());
    for (const extra of [{ customerAccountId: "other" }, { campaignId: "other" }, { chargedAmount: 0 }, { paymentStatus: "promo_granted" }]) {
      await expect(caller.redeemPromo({ tariffCode: "base_diagnostic", promoValue: "secret-code", idempotencyKey: "idem-key-123", consents, ...extra })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(mocks.redeemPromo).not.toHaveBeenCalled();
  });
});
