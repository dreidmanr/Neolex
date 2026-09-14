import { describe, expect, it } from "vitest";
import { canonicalSerialize, sha256Hex } from "./canonicalJson";
import { buildQuestionnaireSnapshot } from "./canonicalSnapshot";
import { technicalQuestionnaireBundle as bundle } from "./configBundle";
import { deriveQuestionnaireState } from "./visibility";

describe("canonical questionnaire snapshots", () => {
  it("sorts object keys recursively while preserving arrays", () => {
    expect(
      canonicalSerialize({ z: 1, a: { y: true, b: null }, list: [3, { z: "x", a: "y" }] }),
    ).toBe('{"a":{"b":null,"y":true},"list":[3,{"a":"y","z":"x"}],"z":1}');
    expect(() => canonicalSerialize({ bad: Number.NaN })).toThrow(/non-finite/);
  });

  it("builds a deterministic, answer-only, non-client snapshot", () => {
    const answersA = {
      b8_q1: { kind: "single" as const, optionId: "yes" },
      b1_q3: { kind: "multi" as const, optionIds: ["b2c"] },
      b1_q1: { kind: "text" as const, text: "Lexy" },
    };
    const answersB = {
      b1_q1: { kind: "text" as const, text: "Lexy" },
      b1_q3: { kind: "multi" as const, optionIds: ["b2c"] },
      b8_q1: { kind: "single" as const, optionId: "yes" },
    };
    const stateA = deriveQuestionnaireState(bundle, answersA);
    const stateB = deriveQuestionnaireState(bundle, answersB);
    const first = buildQuestionnaireSnapshot(bundle, stateA, answersA, 7);
    const second = buildQuestionnaireSnapshot(bundle, stateB, answersB, 7);

    expect(first.snapshotJson).toBe(second.snapshotJson);
    expect(first.inputSnapshotHash).toBe(second.inputSnapshotHash);
    expect(first.inputSnapshotHash).toBe(sha256Hex(first.snapshotJson));
    expect(first.activeAnswers).toEqual(answersB);
    expect(first.snapshotJson).not.toMatch(
      /questionText|label|branchConditions|criticalInput|customer|session|publicId/,
    );
    expect(Object.keys(JSON.parse(first.snapshotJson))).toEqual([
      "activeAnswers",
      "contentHash",
      "draftRevision",
      "manualFollowUpTriggerIds",
      "releaseId",
      "version",
      "visibleQuestionIds",
      "visibleSetHash",
    ]);
  });

  it("excludes answers that are not active in the derived state", () => {
    const answers = {
      b1_q3: { kind: "multi" as const, optionIds: ["mixed"] },
      b8_q1: { kind: "single" as const, optionId: "yes" },
    };
    const state = deriveQuestionnaireState(bundle, answers);
    const snapshot = buildQuestionnaireSnapshot(bundle, state, answers, 0);
    expect(snapshot.activeAnswers).not.toHaveProperty("b8_q1");
    expect(snapshot.snapshotJson).not.toContain('"b8_q1":{"kind"');
  });

  it("rejects a tampered visible-set hash and invalid revisions", () => {
    const state = deriveQuestionnaireState(bundle, {});
    expect(() =>
      buildQuestionnaireSnapshot(bundle, { ...state, visibleSetHash: "0".repeat(64) }, {}, 0),
    ).toThrow(/visibleSetHash/);
    expect(() => buildQuestionnaireSnapshot(bundle, state, {}, -1)).toThrow(/draftRevision/);
  });
});
