import { beforeEach, describe, expect, it, vi } from "vitest";

const assertGate = vi.hoisted(() => vi.fn());
vi.mock("../releaseGate", () => ({ assertPromoAccessTestAllowed: assertGate }));

import { getOffer, requireTariff } from "./tariffService";

describe("R1 tariff service", () => {
  beforeEach(() => assertGate.mockReset());

  it("returns exactly one safe price-free draft/test offer", () => {
    const offer = getOffer();
    expect(offer).toEqual({
      tariffCode: "lexy-advanced-diagnostic",
      serviceTier: "lexy-advanced-diagnostic",
      currency: "RUB",
      provenanceStatus: "draft_test_only",
    });
    expect(JSON.stringify(offer)).not.toMatch(/amount|price|cost/i);
    expect(assertGate).toHaveBeenCalledOnce();
  });

  it("rejects every unregistered tariff", () => {
    expect(() => requireTariff("premium")).toThrow("Offer is unavailable");
  });
});
