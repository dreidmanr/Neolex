import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = path.join(import.meta.dirname, "documentRoutes.ts");
const repositoryPath = path.join(import.meta.dirname, "documentRepository.ts");

describe("R2 document HTTP security contract", () => {
  it("uses the customer session, owner case lookup, active grant and document tariff gate", async () => {
    const source = await readFile(sourcePath, "utf8");
    const repository = await readFile(repositoryPath, "utf8");
    expect(source).toContain("authenticateCustomerRequest");
    expect(source).toContain("findOwnedCaseByPublicId");
    expect(source).toContain("findActiveOwnedAccessGrant");
    expect(source).toContain("DOCUMENT_TARIFF_CODE");
    expect(repository).toContain("eq(r1DocumentManifests.customerAccountId");
    expect(repository).toContain("eq(r1DocumentManifests.diagnosticCaseId");
  });

  it("never returns storage key or a public share URL", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).not.toMatch(/storageKey\s*:/);
    expect(source).not.toMatch(/shareUrl|publicUrl|downloadUrl/i);
    expect(source).toContain("Cache-Control");
    expect(source).toContain("private, no-store");
  });

  it("keeps upload constrained to raw PDF/DOCX and uses a neutral not-found response", async () => {
    const source = await readFile(sourcePath, "utf8");
    expect(source).toContain("express.raw({ limit: \"25mb\"");
    expect(source).toContain("application/pdf");
    expect(source).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(source).toContain('res.status(404).json({ error: "Document not found" })');
  });
});
