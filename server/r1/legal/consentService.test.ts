import { describe, expect, it, vi } from "vitest";

vi.mock("../releaseGate", () => ({ assertPromoAccessTestAllowed: vi.fn() }));

import { validateConsentAssertions } from "./consentService";
import {
  getDocumentRegistryForValidation,
  getRequiredMetadata,
} from "./documentRegistry";

function assertions(marketing = false) {
  return getDocumentRegistryForValidation().map(document => ({
    documentId: document.documentId,
    documentVersion: document.documentVersion,
    contentHash: document.contentHash,
    consentType: document.consentType,
    accepted: document.consentType === "marketing" ? marketing : true,
  }));
}

describe("draft/test legal metadata registry", () => {
  it("contains exact metadata-only records and no prose or approval state", () => {
    const documents = getRequiredMetadata();
    expect(documents).toHaveLength(3);
    expect(new Set(documents.map(document => document.consentType))).toEqual(
      new Set(["terms", "data_processing", "marketing"]),
    );
    for (const document of documents) {
      expect(document.documentId).toMatch(/^[A-Za-z]+$/);
      expect(document.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(document.href).toBe(`/r1/legal/${document.documentId}`);
      expect(document.provenanceStatus).toBe("draft_test_only");
      expect(Object.keys(document)).not.toContain("body");
      expect(Object.keys(document)).not.toContain("approved");
    }
  });
});

describe("consent assertion validation", () => {
  it.each([false, true])("accepts an explicit marketing decision=%s", marketing => {
    expect(validateConsentAssertions(assertions(marketing))).toEqual(assertions(marketing));
  });

  it.each([
    ["absent", () => assertions().slice(0, 2)],
    ["duplicate", () => [assertions()[0], assertions()[0], assertions()[2]]],
    ["extra", () => [...assertions(), { ...assertions()[0], documentId: "extra" }]],
    ["stale version", () => assertions().map((item, index) => index ? item : { ...item, documentVersion: "old" })],
    ["hash mismatch", () => assertions().map((item, index) => index ? item : { ...item, contentHash: "a".repeat(64) })],
    ["type mismatch", () => assertions().map((item, index) => index ? item : { ...item, consentType: "marketing" as const })],
    ["required false", () => assertions().map((item, index) => index ? item : { ...item, accepted: false })],
  ])("rejects %s assertions", (_label, makeAssertions) => {
    expect(() => validateConsentAssertions(makeAssertions())).toThrow("Consent assertions are invalid");
  });
});
