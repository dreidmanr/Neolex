export type DocumentEvidenceDecision = Readonly<{
  status: "document_confirmed" | "not_confirmed_by_document" | "additional_document_required" | "manual_review_required";
  eligible: boolean;
  reason: "analyzed_matching_category" | "not_analyzed" | "category_mismatch" | "unsafe_content" | "deleted_or_missing";
}>;

export function evaluateDocumentEvidence(input: {
  documentStatus: "analyzed" | "manual_review_required" | "failed" | "deleted" | "uploaded" | "extracting";
  documentCategoryId: string;
  requestedCategoryIds: readonly string[];
  instructionLikeContent?: boolean;
}): DocumentEvidenceDecision {
  if (input.documentStatus === "deleted" || input.documentStatus === "failed") {
    return { status: "not_confirmed_by_document", eligible: false, reason: "deleted_or_missing" };
  }
  if (input.documentStatus === "manual_review_required" || input.instructionLikeContent) {
    return { status: "manual_review_required", eligible: false, reason: "unsafe_content" };
  }
  if (input.documentStatus !== "analyzed") {
    return { status: "additional_document_required", eligible: false, reason: "not_analyzed" };
  }
  if (!input.requestedCategoryIds.includes(input.documentCategoryId)) {
    return { status: "not_confirmed_by_document", eligible: false, reason: "category_mismatch" };
  }
  return { status: "document_confirmed", eligible: true, reason: "analyzed_matching_category" };
}
