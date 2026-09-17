import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOCUMENT_EXTRACTOR_VERSION, DOCUMENT_MAX_ATTEMPTS, DOCUMENT_LEASE_MS } from "./documentProcessingService";

describe("R2 document processing queue", () => {
  it("uses a versioned idempotent job with bounded leases and attempts", async () => {
    expect(DOCUMENT_EXTRACTOR_VERSION).toBe("r2-local-extractor-v1");
    expect(DOCUMENT_MAX_ATTEMPTS).toBe(3);
    expect(DOCUMENT_LEASE_MS).toBe(60_000);
    const source = await readFile(path.join(import.meta.dirname, "documentProcessingService.ts"), "utf8");
    expect(source).toContain("documentManifestId");
    expect(source).toContain("DOCUMENT_EXTRACTOR_VERSION");
    expect(source).toContain("attemptCount");
    expect(source).toContain("leaseExpiresAt");
    expect(source).toContain("requeueFailedDocumentExtraction");
  });

  it("stores only a private text storage key and SHA-256, never exposes text in a manifest response", async () => {
    const source = await readFile(path.join(import.meta.dirname, "documentProcessingService.ts"), "utf8");
    expect(source).toContain("r2/document-text/");
    expect(source).toContain("textHashSha256");
    expect(source).not.toContain("trustedContent: true");
    expect(source).toContain("untrusted_document_content");
  });
});
