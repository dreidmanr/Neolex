import { describe, expect, it } from "vitest";
import { evaluateDocumentEvidence } from "./documentEvidenceGate";

describe("document evidence gate", () => {
  const base = { documentCategoryId: "DOC-CONTRACTS", requestedCategoryIds: ["DOC-CONTRACTS"] };
  it("confirms only analyzed matching category", () => {
    expect(evaluateDocumentEvidence({ ...base, documentStatus: "analyzed" })).toMatchObject({ status: "document_confirmed", eligible: true });
    expect(evaluateDocumentEvidence({ ...base, documentStatus: "uploaded" })).toMatchObject({ status: "additional_document_required", eligible: false });
  });
  it("fails closed for mismatch, injection and deleted content", () => {
    expect(evaluateDocumentEvidence({ ...base, documentStatus: "analyzed", documentCategoryId: "DOC-PAYMENTS-CONSUMER" })).toMatchObject({ status: "not_confirmed_by_document", eligible: false });
    expect(evaluateDocumentEvidence({ ...base, documentStatus: "analyzed", instructionLikeContent: true })).toMatchObject({ status: "manual_review_required", eligible: false });
    expect(evaluateDocumentEvidence({ ...base, documentStatus: "deleted" })).toMatchObject({ status: "not_confirmed_by_document", eligible: false });
  });
});
