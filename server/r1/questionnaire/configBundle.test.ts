import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import rawQuestionnaireText from "../../../shared/legal-core/questionnaire_v2.json?raw";
import {
  QUESTIONNAIRE_CONTENT_SHA256,
  QUESTIONNAIRE_RELEASE_ID,
  QUESTIONNAIRE_STATUS,
  QUESTIONNAIRE_TECHNICAL_USE,
  QUESTIONNAIRE_VERSION,
  assertTechnicalQuestionnaireBundleAllowed,
  loadTechnicalQuestionnaireBundle,
  technicalQuestionnaireBundle,
  validateQuestionnaireBundle,
} from "./configBundle";

function cloneRaw(): Record<string, any> {
  return JSON.parse(rawQuestionnaireText) as Record<string, any>;
}

function filesBelow(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) result.push(...filesBelow(path));
    else result.push(path);
  }
  return result;
}

describe("technical Questionnaire v2 config bundle", () => {
  it("loads the actual pinned draft artifact as a deeply read-only internal bundle", () => {
    const bundle = loadTechnicalQuestionnaireBundle();
    expect(bundle).toStrictEqual(technicalQuestionnaireBundle);
    expect(bundle).toMatchObject({
      technicalUse: QUESTIONNAIRE_TECHNICAL_USE,
      releaseId: QUESTIONNAIRE_RELEASE_ID,
      version: QUESTIONNAIRE_VERSION,
      status: QUESTIONNAIRE_STATUS,
      reviewedByLawyer: false,
      contentHash: QUESTIONNAIRE_CONTENT_SHA256,
      questionCount: 63,
    });
    expect(bundle.questions).toHaveLength(63);
    expect(bundle.activeCoreQuestionIds).toHaveLength(33);
    expect(bundle.activeBranchQuestionIds).toHaveLength(6);
    expect(bundle.questions.filter(question => question.isCriticalInput)).toHaveLength(24);
    expect(bundle.questions.filter(question => question.activeInPilot)).toHaveLength(39);
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.questions)).toBe(true);
    expect(Object.isFrozen(bundle.questionById.b1_q2.options)).toBe(true);
  });

  it("rejects raw-byte, parsed-value, lifecycle, selection, and semantic reference mismatches", () => {
    const original = cloneRaw();
    expect(() => validateQuestionnaireBundle(original, `${rawQuestionnaireText}\n`)).toThrow(
      /content SHA-256 mismatch/,
    );

    const changedVersion = cloneRaw();
    changedVersion.version = "1.0.0";
    expect(() => validateQuestionnaireBundle(changedVersion)).toThrow(/version is not pinned/);

    const changedStatus = cloneRaw();
    changedStatus.status = "approved";
    expect(() => validateQuestionnaireBundle(changedStatus)).toThrow(/status is not the legal draft status/);

    const changedReview = cloneRaw();
    changedReview.reviewStatus.reviewedByLawyer = true;
    expect(() => validateQuestionnaireBundle(changedReview)).toThrow(/reviewedByLawyer/);

    const duplicateSelection = cloneRaw();
    duplicateSelection.release1Selection.activeCoreQuestionIds[1] =
      duplicateSelection.release1Selection.activeCoreQuestionIds[0];
    expect(() => validateQuestionnaireBundle(duplicateSelection)).toThrow(/duplicates/);

    const badReference = cloneRaw();
    badReference.branches[0].activation.answerOptionIds = ["not_configured"];
    expect(() => validateQuestionnaireBundle(badReference)).toThrow(/unknown option/);
  });

  it("keeps runtime use behind the existing promo synthetic-test gate", () => {
    expect(() => assertTechnicalQuestionnaireBundleAllowed()).toThrow(/Pilot is unavailable/);
  });

  it("keeps the legal-core artifact server-only and absent from the shared presentation contract", () => {
    const root = resolve(import.meta.dirname, "../../..");
    const presentationPath = join(root, "shared/r1/questionnaire.ts");
    const presentation = readFileSync(presentationPath, "utf8");
    expect(presentation).not.toMatch(/legal-core|questionnaire_v2|paidDiagnosticData/);

    const clientRoot = join(root, "client/src");
    const offenders = filesBelow(clientRoot)
      .filter(path => /\.[cm]?[jt]sx?$/.test(path))
      .filter(path => /questionnaire_v2|legal-core/.test(readFileSync(path, "utf8")))
      .map(path => relative(root, path));
    expect(offenders).toEqual([]);
  });
});
