import { createHash } from "node:crypto";

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_MAX_PER_CASE = 3;
export const DOCUMENT_SUPPORTED_CATEGORIES = Object.freeze([
  "DOC-CORPORATE",
  "DOC-IP-DEVELOPMENT",
  "DOC-IP-LICENSES",
  "DOC-ACCESS-CONTROL",
  "DOC-PERSONAL-DATA",
  "DOC-CONTRACTS",
  "DOC-PAYMENTS-CONSUMER",
  "DOC-PAYMENT-INFRASTRUCTURE",
  "DOC-MARKETING",
  "DOC-PARTNERS",
  "DOC-REGULATORY",
  "DOC-DISPUTES",
] as const);

export type DocumentCategory = (typeof DOCUMENT_SUPPORTED_CATEGORIES)[number];
export type DocumentFormat = "pdf" | "docx";

export type DocumentUploadManifest = Readonly<{
  fileName: string;
  category: DocumentCategory;
  format: DocumentFormat;
  mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  byteSize: number;
  contentHashSha256: string;
  status: "uploaded";
  trustedContent: false;
  promptInjectionRisk: "untrusted_document_content";
}>;

export class DocumentIntakeValidationError extends Error {
  constructor(readonly code: string) {
    super(`Document upload rejected: ${code}`);
    this.name = "DocumentIntakeValidationError";
  }
}

function assertFileName(fileName: string): void {
  if (!fileName || fileName.length > 180 || fileName.includes("\0") || fileName.includes("/") || fileName.includes("\\")) {
    throw new DocumentIntakeValidationError("invalid_file_name");
  }
}

function assertPdfSignature(bytes: Uint8Array): void {
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") throw new DocumentIntakeValidationError("pdf_signature_mismatch");
}

function assertDocxSignature(bytes: Uint8Array): void {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new DocumentIntakeValidationError("docx_container_signature_mismatch");
  }
}

export function validateDocumentUpload(input: {
  fileName: string;
  category: string;
  mimeType: string;
  bytes: Uint8Array;
}): DocumentUploadManifest {
  assertFileName(input.fileName);
  if (!DOCUMENT_SUPPORTED_CATEGORIES.includes(input.category as DocumentCategory)) {
    throw new DocumentIntakeValidationError("unsupported_category");
  }
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > DOCUMENT_MAX_BYTES) {
    throw new DocumentIntakeValidationError("size_limit");
  }

  const lowerName = input.fileName.toLowerCase();
  let format: DocumentFormat;
  let mimeType: DocumentUploadManifest["mimeType"];
  if (lowerName.endsWith(".pdf") && input.mimeType === "application/pdf") {
    assertPdfSignature(input.bytes);
    format = "pdf";
    mimeType = "application/pdf";
  } else if (
    lowerName.endsWith(".docx") &&
    input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    assertDocxSignature(input.bytes);
    format = "docx";
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else {
    throw new DocumentIntakeValidationError("extension_mime_mismatch");
  }

  return Object.freeze({
    fileName: input.fileName,
    category: input.category as DocumentCategory,
    format,
    mimeType,
    byteSize: input.bytes.byteLength,
    contentHashSha256: createHash("sha256").update(input.bytes).digest("hex"),
    status: "uploaded",
    trustedContent: false,
    promptInjectionRisk: "untrusted_document_content",
  });
}
