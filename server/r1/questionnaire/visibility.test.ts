import { describe, expect, it } from "vitest";
import { technicalQuestionnaireBundle as bundle } from "./configBundle";
import type { EffectiveAnswers } from "./validation";
import { deriveQuestionnaireState } from "./visibility";

function answerSet(entries: EffectiveAnswers): EffectiveAnswers {
  return entries;
}

describe("Questionnaire v2 visibility", () => {
  it("starts with exactly the 33 configured core questions in configuration order", () => {
    const state = deriveQuestionnaireState(bundle, {});
    expect(state.visibleQuestionIds).toEqual(
      bundle.orderedQuestionIds.filter(id => bundle.activeCoreQuestionIds.includes(id)),
    );
    expect(state.visibleQuestionIds).toHaveLength(33);
    expect(state.requiredVisibleQuestionIds).toHaveLength(33);
    expect(state.progress).toEqual({
      activeAnsweredCount: 0,
      requiredAnsweredCount: 0,
      requiredActiveCount: 33,
      complete: false,
      ratio: 0,
    });
    expect(state.visibleSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.visibleQuestionIds).not.toContain("b4_q1");
    expect(state.visibleQuestionIds).not.toContain("b11_q3");
  });

  it("uses configured B2C branch constraints and keeps b8_q3 behind its secondary answer", () => {
    const b2c = deriveQuestionnaireState(bundle, {
      b1_q3: { kind: "multi", optionIds: ["b2c"] },
    });
    expect(b2c.visibleQuestionIds).toContain("b8_q1");
    expect(b2c.visibleQuestionIds).not.toContain("b8_q3");
    expect(b2c.visibleQuestionIds).toHaveLength(34);

    const yes = deriveQuestionnaireState(bundle, {
      b1_q3: { kind: "multi", optionIds: ["b2c"] },
      b8_q1: { kind: "single", optionId: "yes" },
    });
    expect(yes.visibleQuestionIds).toContain("b8_q3");
    expect(yes.visibleQuestionIds).toHaveLength(35);

    const mixed = deriveQuestionnaireState(bundle, {
      b1_q3: { kind: "multi", optionIds: ["b2c"] },
      b8_q1: { kind: "single", optionId: "mixed" },
    });
    expect(mixed.visibleQuestionIds).toContain("b8_q3");

    const noB2c = deriveQuestionnaireState(bundle, {
      b1_q3: { kind: "multi", optionIds: ["mixed"] },
      b8_q1: { kind: "single", optionId: "yes" },
    });
    expect(noB2c.visibleQuestionIds).not.toContain("b8_q1");
    expect(noB2c.visibleQuestionIds).not.toContain("b8_q3");
    expect(noB2c.activeAnswers).not.toHaveProperty("b8_q1");
  });

  it("activates partner and optional dispute branches and reaches all 39 selected questions", () => {
    const state = deriveQuestionnaireState(
      bundle,
      answerSet({
        b1_q3: { kind: "multi", optionIds: ["b2c"] },
        b8_q1: { kind: "single", optionId: "yes" },
        b3_q2: { kind: "multi", optionIds: ["partners"] },
        b12_q1: { kind: "single", optionId: "yes" },
      }),
    );
    expect(state.visibleQuestionIds).toHaveLength(39);
    expect(state.visibleQuestionIds).toEqual(
      bundle.orderedQuestionIds.filter(id =>
        [...bundle.activeCoreQuestionIds, ...bundle.activeBranchQuestionIds].includes(id),
      ),
    );
    expect(state.visibleQuestionIds).toEqual(
      expect.arrayContaining(["b8_q1", "b8_q3", "b9_q1", "b9_q2", "b9_q3", "b12_q2"]),
    );
    expect(state.requiredVisibleQuestionIds).toHaveLength(38);
    expect(state.requiredVisibleQuestionIds).not.toContain("b12_q2");
  });

  it("reports answered branch questions that became invisible as deactivated", () => {
    const prior = deriveQuestionnaireState(bundle, {
      b1_q3: { kind: "multi", optionIds: ["b2c"] },
      b8_q1: { kind: "single", optionId: "yes" },
      b8_q3: { kind: "single", optionId: "yes" },
    });
    const next = deriveQuestionnaireState(
      bundle,
      {
        b1_q3: { kind: "multi", optionIds: ["mixed"] },
        b8_q1: { kind: "single", optionId: "yes" },
        b8_q3: { kind: "single", optionId: "yes" },
      },
      prior.visibleQuestionIds,
    );
    expect(next.deactivatedQuestionIds).toEqual(["b8_q1", "b8_q3"]);
    expect(next.activeAnswers).not.toHaveProperty("b8_q1");
    expect(next.activeAnswers).not.toHaveProperty("b8_q3");
  });

  it("derives sorted manual follow-up triggers for disabled investment without exposing it", () => {
    const preInvestment = deriveQuestionnaireState(bundle, {
      b1_q5: { kind: "single", optionId: "pre_investment" },
    });
    expect(preInvestment.manualFollowUpRequired).toBe(true);
    expect(preInvestment.manualFollowUpTriggerIds).toEqual(["trigger_b1_q5_pre_investment"]);
    expect(preInvestment.visibleQuestionIds).not.toEqual(
      expect.arrayContaining(["b14_q1", "b14_q2", "b14_q3"]),
    );

    const preSale = deriveQuestionnaireState(bundle, {
      b1_q5: { kind: "single", optionId: "pre_sale" },
    });
    expect(preSale.manualFollowUpTriggerIds).toEqual(["trigger_b1_q5_pre_sale"]);
  });

  it("rejects noncanonical effective answers and has no rules/options argument", () => {
    expect(deriveQuestionnaireState.length).toBeLessThanOrEqual(3);
    expect(() =>
      deriveQuestionnaireState(bundle, {
        b1_q3: { kind: "multi", optionIds: ["mixed", "b2c"] },
      }),
    ).toThrow(/not canonically ordered/);
  });
});
