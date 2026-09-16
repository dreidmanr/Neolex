import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isControlledClientRoute } from "../../../client/src/lib/controlledRoutes";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

describe("controlled report client", () => {
  it("keeps the owner report path controlled and mounted before the cabinet fallback", async () => {
    const appSource = await readFile(
      path.join(repositoryRoot, "client/src/App.tsx"),
      "utf8"
    );
    const reportPath = 'path="/cabinet/cases/:publicId/report"';
    expect(
      isControlledClientRoute("/cabinet/cases/case_public_01/report")
    ).toBe(true);
    expect(appSource).toContain(reportPath);
    expect(appSource.indexOf(reportPath)).toBeLessThan(
      appSource.indexOf('path="/cabinet"')
    );
  });

  it("renders only the controlled report projection with a prominent technical watermark", async () => {
    const source = await readFile(
      path.join(repositoryRoot, "client/src/pages/CaseReport.tsx"),
      "utf8"
    );
    expect(source).toContain("trpc.pilot.reports.getByCase.useQuery");
    expect(source).toContain("Технический тестовый черновик");
    expect(source).toContain("report.watermark");
    expect(source).toContain("<PilotShell");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
    expect(source).not.toMatch(
      /canonicalAnswers|activeAnswers|paymentRecordId|accessGrantId/
    );
    expect(source).not.toMatch(
      /shareUrl|downloadUrl|storageUrl|storageKey|navigator\.share/i
    );
    expect(source).not.toMatch(/analytics|LexyWidget|invokeLLM|(?<!re)fetch\s*\(/i);
    expect(source).not.toMatch(/https?:\/\//i);
  });
});
