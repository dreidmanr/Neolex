import { assertPromoAccessTestAllowed } from "../releaseGate";

export const CONSENT_TYPES = ["terms", "data_processing", "marketing"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export type LegalDocumentMetadata = {
  documentId: string;
  documentVersion: string;
  contentHash: string;
  href: string;
  consentType: ConsentType;
  required: boolean;
  provenanceStatus: "draft_test_only";
};

const DOCUMENTS = Object.freeze([
  Object.freeze({
    documentId: "termsdraft",
    documentVersion: "drafttestv1",
    contentHash: "39d50869958b9e1e0f1604be5db4d7233abd4f47f4175b191927db2f69aa0837",
    href: "/r1/legal/termsdraft",
    consentType: "terms" as const,
    required: true,
    provenanceStatus: "draft_test_only" as const,
  }),
  Object.freeze({
    documentId: "dataprocessingdraft",
    documentVersion: "drafttestv1",
    contentHash: "e9dfed890e0f7ce09cb816257b2da9eeee057277f2c7d36a461ae7d03e26e83d",
    href: "/r1/legal/dataprocessingdraft",
    consentType: "data_processing" as const,
    required: true,
    provenanceStatus: "draft_test_only" as const,
  }),
  Object.freeze({
    documentId: "marketingdraft",
    documentVersion: "drafttestv1",
    contentHash: "3373796434199df7f41c9787f50d0fe78d99e1455ea8be17a9aa206700092ed7",
    href: "/r1/legal/marketingdraft",
    consentType: "marketing" as const,
    required: false,
    provenanceStatus: "draft_test_only" as const,
  }),
] satisfies readonly LegalDocumentMetadata[]);

export function getDocumentRegistryForValidation(): readonly LegalDocumentMetadata[] {
  return DOCUMENTS;
}

export function getRequiredMetadata(): LegalDocumentMetadata[] {
  assertPromoAccessTestAllowed();
  return DOCUMENTS.map(document => ({ ...document }));
}

export function toSafeDocumentMetadata(
  document: LegalDocumentMetadata,
): LegalDocumentMetadata {
  return { ...document };
}

// This catalog is intentionally metadata-only. Legal prose is never present in
// this module or returned by its DTO.
export const LEGAL_REGISTRY_PROVENANCE = "draft_test_only" as const;
