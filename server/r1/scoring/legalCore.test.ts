import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import legalBasisRaw from "../../../shared/legal-core/legal_basis_catalog_v1.json?raw";
import questionnaireRaw from "../../../shared/legal-core/questionnaire_v2.json?raw";
import recommendationRaw from "../../../shared/legal-core/recommendation_mapping_v1.json?raw";
import riskCatalogRaw from "../../../shared/legal-core/risk_catalog_v1.json?raw";
import rulesRaw from "../../../shared/legal-core/rules_v1.json?raw";
import { evaluatePredicate, validatePredicateReferences } from "./core/astEvaluator";
import {
  LEGAL_CORE_CONTENT_SHA256,
  technicalLegalCoreConfigBundle,
  validateLegalCoreConfigBundle,
} from "./core/configBundle";
import { evaluateTechnicalLegalCore } from "./core/evaluator";
import type { FixtureAnswers, LegalCoreArtifactSources } from "./core/types";

interface Fixture {
  readonly id: string;
  readonly caseKind: "questionnaire" | "validation_only" | "document_only";
  readonly releaseTarget: string;
  readonly canonicalAnswers: FixtureAnswers;
  readonly expectedActiveRiskIds: readonly string[];
  readonly expectedRiskProfile: "low" | "medium" | "high" | "critical" | null;
  readonly expectedRecommendationProductCode: string | null;
  readonly expectedEscalation: {
    readonly required: boolean;
    readonly manualReviewRequired: boolean;
    readonly manualFollowUpRequired: boolean;
    readonly lawyerReviewRequired: boolean;
    readonly expectedQueueCodes: readonly string[];
    readonly expectedEvidenceStatus: "questionnaire_based" | "manual_review_required";
  };
  readonly expectedValidation?: {
    readonly valid: false;
    readonly blocksReportGeneration: true;
    readonly reasonCode: "required_active_answers_missing";
  };
  readonly expectedConsistencyFlags?: readonly string[];
  readonly expectedMatchedRuleIds?: readonly string[];
}

const fixtureDirectory = path.resolve(process.cwd(), "fixtures/legal-core/v1");
const pilotFixtures: readonly Fixture[] = fs
  .readdirSync(fixtureDirectory)
  .filter(file => file.endsWith(".json"))
  .sort()
  .map(file => JSON.parse(fs.readFileSync(path.join(fixtureDirectory, file), "utf8")) as Fixture)
  .filter(fixture => fixture.releaseTarget === "release_1_pilot");

function sourceObjects(): LegalCoreArtifactSources {
  return {
    rules: JSON.parse(rulesRaw) as unknown,
    riskCatalog: JSON.parse(riskCatalogRaw) as unknown,
    recommendationMapping: JSON.parse(recommendationRaw) as unknown,
    legalBasisCatalog: JSON.parse(legalBasisRaw) as unknown,
    questionnaire: JSON.parse(questionnaireRaw) as unknown,
  };
}

function reverseObjectKeys<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(value).reverse());
}

describe("Release 1 technical legal-core conformance", () => {
  it("loads the five server-only artifacts under exact draft pins", () => {
    expect(technicalLegalCoreConfigBundle).toMatchObject({
      technicalUse: "technical_test_only",
      releaseId: "lexy-r0-2026-09-12",
      version: "1.0.0-draft.1",
      status: "draft_pending_legal_approval",
      reviewedByLawyer: false,
      contentHashes: LEGAL_CORE_CONTENT_SHA256,
    });
    expect(technicalLegalCoreConfigBundle.rules.releaseFlags.release1Pilot.enabledNow).toBe(false);
    expect(technicalLegalCoreConfigBundle.riskDefinitions).toHaveLength(25);
  });

  it.each(pilotFixtures.map(fixture => [fixture.id, fixture] as const))(
    "%s matches fixture expectations",
    (_id, fixture) => {
      const outcome = evaluateTechnicalLegalCore({ canonicalAnswers: fixture.canonicalAnswers });
      if (fixture.caseKind === "validation_only") {
        expect(outcome.kind).toBe("validation");
        if (outcome.kind !== "validation") throw new Error("expected validation outcome");
        expect(outcome.validation).toMatchObject({
          valid: false,
          blocksRecommendation: true,
          reasonCode: fixture.expectedValidation?.reasonCode,
        });
        expect(outcome.validation.missingRequiredQuestionIds.length).toBeGreaterThan(0);
        expect(outcome.recommendation).toBeNull();
        return;
      }

      expect(outcome.kind).toBe("evaluated");
      if (outcome.kind !== "evaluated") throw new Error("expected evaluated outcome");
      expect(outcome.activeRiskIds).toEqual(fixture.expectedActiveRiskIds);
      expect(outcome.overallRiskProfile).toBe(fixture.expectedRiskProfile);
      expect(outcome.recommendation.productCode).toBe(fixture.expectedRecommendationProductCode);
      expect(outcome.escalation).toMatchObject({
        required: fixture.expectedEscalation.required,
        manualReviewRequired: fixture.expectedEscalation.manualReviewRequired,
        manualFollowUpRequired: fixture.expectedEscalation.manualFollowUpRequired,
        lawyerReviewRequired: fixture.expectedEscalation.lawyerReviewRequired,
        requiredQueueCodes: [...fixture.expectedEscalation.expectedQueueCodes].sort(),
        queueCode: null,
      });
      expect(outcome.evidenceStatus).toBe(fixture.expectedEscalation.expectedEvidenceStatus);
      for (const flag of fixture.expectedConsistencyFlags ?? []) expect(outcome.flags).toContain(flag);
      for (const ruleId of fixture.expectedMatchedRuleIds ?? []) expect(outcome.matchedRuleIds).toContain(ruleId);
      expect(outcome.activeRisks.every(risk => risk.evidence.automaticDocumentConfirmationAllowed === false)).toBe(true);
      expect(outcome.recommendation.productCode).toBeTruthy();
    },
  );

  it("is invariant to input object key permutation", () => {
    const fixture = pilotFixtures.find(item => item.id === "LEXR0-FIXTURE-010")!;
    const normal = evaluateTechnicalLegalCore({ canonicalAnswers: fixture.canonicalAnswers });
    const reversed = evaluateTechnicalLegalCore({
      canonicalAnswers: reverseObjectKeys(fixture.canonicalAnswers as Record<string, FixtureAnswers[string]>),
    });
    expect(reversed).toEqual(normal);
  });

  it("drops stale inactive branch answers before consistency, risk, and recommendation evaluation", () => {
    const fixture = pilotFixtures.find(item => item.id === "LEXR0-FIXTURE-015")!;
    const baseline = evaluateTechnicalLegalCore({ canonicalAnswers: fixture.canonicalAnswers });
    const stale = evaluateTechnicalLegalCore({
      canonicalAnswers: {
        ...fixture.canonicalAnswers,
        b8_q1: "yes",
        b8_q3: "yes",
      },
      previousVisibleQuestionIds: ["b8_q1", "b8_q3"],
    });
    expect(stale.kind).toBe("evaluated");
    expect(baseline.kind).toBe("evaluated");
    if (stale.kind !== "evaluated" || baseline.kind !== "evaluated") throw new Error("expected evaluated outcomes");
    expect(stale.inactiveAnswerQuestionIds).toEqual(["b8_q1", "b8_q3"]);
    expect(stale.activeRiskIds).toEqual(baseline.activeRiskIds);
    expect(stale.overallRiskProfile).toBe(baseline.overallRiskProfile);
    expect(stale.recommendation).toEqual(baseline.recommendation);
  });

  it("records exact answer atom provenance without reading answer labels or text", () => {
    const result = evaluatePredicate(
      {
        op: "all_of",
        args: [
          { op: "answer_contains_any", questionId: "b2_q1", optionIds: ["none", "ooo"] },
          { op: "answer_contains_all", questionId: "b1_q3", optionIds: ["b2c", "mixed"] },
        ],
      },
      {
        answers: {
          b2_q1: { kind: "single", optionId: "none" },
          b1_q3: { kind: "multi", optionIds: ["b2c", "mixed"] },
        },
        activeRiskIds: new Set(),
        activeBranches: {
          consumer: false,
          partners: false,
          dispute_detail: false,
          investment: false,
          contractors: false,
        },
        flags: new Set(),
        activeBranchQuestionCount: 0,
      },
    );
    expect(result).toEqual({
      value: true,
      atoms: [
        {
          op: "answer_contains_any",
          result: true,
          questionId: "b2_q1",
          configuredOptionIds: ["none", "ooo"],
          matchedOptionIds: ["none"],
        },
        {
          op: "answer_contains_all",
          result: true,
          questionId: "b1_q3",
          configuredOptionIds: ["b2c", "mixed"],
          matchedOptionIds: ["b2c", "mixed"],
        },
      ],
    });
  });

  it("fails closed on unsupported or malformed AST and unknown semantic references", () => {
    const context = {
      answers: {},
      activeRiskIds: new Set<string>(),
      activeBranches: {
        consumer: false,
        partners: false,
        dispute_detail: false,
        investment: false,
        contractors: false,
      },
      flags: new Set<never>(),
      activeBranchQuestionCount: 0,
    } as const;
    expect(() => evaluatePredicate({ op: "regex", pattern: ".*" }, context)).toThrow(/unsupported/);
    expect(() => evaluatePredicate({ op: "all_of", args: [] }, context)).toThrow(/must not be empty/);
    expect(() => validatePredicateReferences(
      { op: "answer_contains_any", questionId: "b1_q2", optionIds: ["invented"] },
      {
        questionIds: new Set(["b1_q2"]),
        optionsByQuestionId: new Map([["b1_q2", new Set(["saas"])]]),
        riskIds: new Set(),
        branchIds: new Set(),
      },
    )).toThrow(/unknown option/);
  });

  it("rejects an injectable bundle with a malformed AST or broken reference", () => {
    const malformed = sourceObjects() as Record<string, any>;
    malformed.rules.riskRules[0].when = { op: "regex", pattern: ".*" };
    expect(() => validateLegalCoreConfigBundle(malformed as LegalCoreArtifactSources)).toThrow(/predicate/);

    const unknownRisk = sourceObjects() as Record<string, any>;
    unknownRisk.rules.criticalOverrideRules[0].targetRiskIds = ["LEXR0-RISK-999"];
    expect(() => validateLegalCoreConfigBundle(unknownRisk as LegalCoreArtifactSources)).toThrow(/unknown risk/);
  });

  it("does not use product display text for recommendation or credit decisions", () => {
    const sources = sourceObjects() as Record<string, any>;
    for (const product of sources.recommendationMapping.productCatalog) {
      product.displayName = `same-display-name-for-${Math.floor(product.productCode.length / 1000)}`;
    }
    const bundle = validateLegalCoreConfigBundle(sources as LegalCoreArtifactSources);
    const fixture = pilotFixtures.find(item => item.id === "LEXR0-FIXTURE-003")!;
    const outcome = evaluateTechnicalLegalCore({ canonicalAnswers: fixture.canonicalAnswers }, bundle);
    expect(outcome.kind).toBe("evaluated");
    if (outcome.kind !== "evaluated") throw new Error("expected evaluated outcome");
    expect(outcome.recommendation.productCode).toBe("safe_sales");
    expect(outcome.recommendation.credit.eligible).toBe(true);
  });

  it("keeps the production core free of LLM, network, clock, randomness, DB, and UI dependencies", () => {
    const coreDirectory = path.resolve(process.cwd(), "server/r1/scoring/core");
    const source = fs.readdirSync(coreDirectory)
      .filter(file => file.endsWith(".ts"))
      .map(file => fs.readFileSync(path.join(coreDirectory, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/from\s+["'][^"']*(openai|anthropic|gemini|llm|ai-sdk)/i);
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|Date\.now|new Date|Math\.random|crypto\.randomUUID)\s*\(/);
    expect(source).not.toMatch(/from\s+["'][^"']*(drizzle|database|\.\.\/\.\.\/db|react|client)/i);
    expect(source).not.toMatch(/documentScenario|readability|extractedEvidenceLocator/);
  });
});
