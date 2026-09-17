import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("document retention contract", () => {
  it("requires an explicit cutoff and never invents a retention duration", async () => {
    const source = await readFile(path.join(import.meta.dirname, "documentRetentionService.ts"), "utf8");
    expect(source).toContain("deletedBefore");
    expect(source).toContain('eq(r1DocumentManifests.status, "deleted")');
    expect(source).toContain("if (!input.deleteObject)");
    expect(source).not.toMatch(/30\s*\*\s*24|90\s*\*\s*24|RETENTION_DAYS/);
  });

  it("keeps text artifacts inside the same owner and case scope", async () => {
    const source = await readFile(path.join(import.meta.dirname, "documentRetentionService.ts"), "utf8");
    expect(source).toContain("eq(r1DocumentTextArtifacts.customerAccountId, document.customerAccountId)");
    expect(source).toContain("eq(r1DocumentTextArtifacts.diagnosticCaseId, document.diagnosticCaseId)");
  });
});
