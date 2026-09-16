import { describe, expect, it } from "vitest";
import {
  DocumentIntakeValidationError,
  validateDocumentUpload,
} from "./documentIntake";

const pdf = new TextEncoder().encode("%PDF-1.7\nsynthetic");
const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

function expectRejected(input: Parameters<typeof validateDocumentUpload>[0], code: string) {
  expect(() => validateDocumentUpload(input)).toThrowError(
    expect.objectContaining({ code } satisfies Partial<DocumentIntakeValidationError>),
  );
}

describe("R2 document intake", () => {
  it("accepts PDF only with matching extension, MIME and signature", () => {
    const manifest = validateDocumentUpload({
      fileName: "charter.pdf",
      category: "DOC-CORPORATE",
      mimeType: "application/pdf",
      bytes: pdf,
    });
    expect(manifest).toMatchObject({
      format: "pdf",
      status: "uploaded",
      trustedContent: false,
      promptInjectionRisk: "untrusted_document_content",
    });
    expect(manifest.contentHashSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts DOCX container signature and keeps content untrusted", () => {
    expect(validateDocumentUpload({
      fileName: "contract.docx",
      category: "DOC-CONTRACTS",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: docx,
    }).format).toBe("docx");
  });

  it("rejects mismatched MIME, extension, signature and category", () => {
    expectRejected({ fileName: "x.pdf", category: "DOC-CORPORATE", mimeType: "text/plain", bytes: pdf }, "extension_mime_mismatch");
    expectRejected({ fileName: "x.pdf", category: "DOC-CORPORATE", mimeType: "application/pdf", bytes: new TextEncoder().encode("not-pdf") }, "pdf_signature_mismatch");
    expectRejected({ fileName: "x.exe", category: "DOC-CORPORATE", mimeType: "application/pdf", bytes: pdf }, "extension_mime_mismatch");
    expectRejected({ fileName: "x.pdf", category: "UNKNOWN", mimeType: "application/pdf", bytes: pdf }, "unsupported_category");
  });

  it("rejects unsafe names and oversized input", () => {
    expectRejected({ fileName: "../x.pdf", category: "DOC-CORPORATE", mimeType: "application/pdf", bytes: pdf }, "invalid_file_name");
    expectRejected({ fileName: "x.pdf", category: "DOC-CORPORATE", mimeType: "application/pdf", bytes: new Uint8Array(25 * 1024 * 1024 + 1) }, "size_limit");
  });
});
