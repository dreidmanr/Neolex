import { describe, expect, it } from "vitest";
import { technicalQuestionnaireBundle as bundle } from "./configBundle";
import {
  validateAndNormalizeAnswer,
  validateCanonicalAnswer,
} from "./validation";
import { deriveQuestionnaireState } from "./visibility";

const cleanVisible = deriveQuestionnaireState(bundle, {}).visibleQuestionIds;

describe("Questionnaire v2 answer validation", () => {
  it("normalizes configured single and multi answers from server authority", () => {
    expect(
      validateAndNormalizeAnswer(
        bundle,
        "b1_q2",
        { kind: "single", optionId: "saas" },
        cleanVisible,
      ),
    ).toEqual({ kind: "single", optionId: "saas" });

    expect(
      validateAndNormalizeAnswer(
        bundle,
        "b1_q3",
        { kind: "multi", optionIds: ["mixed", "b2c"] },
        cleanVisible,
      ),
    ).toEqual({ kind: "multi", optionIds: ["b2c", "mixed"] });
  });

  it("rejects unknown, unselected, inactive, and currently nonvisible questions", () => {
    const answer = { kind: "single", optionId: "yes" };
    expect(() => validateAndNormalizeAnswer(bundle, "b99_q99", answer, cleanVisible)).toThrow(
      /unknown question/,
    );
    expect(() =>
      validateAndNormalizeAnswer(bundle, "b4_q1", { kind: "multi", optionIds: ["contractors"] }, cleanVisible),
    ).toThrow(/inactive/);
    expect(() => validateAndNormalizeAnswer(bundle, "b11_q3", answer, cleanVisible)).toThrow(
      /inactive/,
    );
    expect(() => validateAndNormalizeAnswer(bundle, "b8_q1", answer, cleanVisible)).toThrow(
      /not visible/,
    );
  });

  it("allows a visible B2C branch input and rejects invalid shape, options, duplicates, and client authority", () => {
    const b2cState = deriveQuestionnaireState(bundle, {
      b1_q3: { kind: "multi", optionIds: ["b2c"] },
    });
    expect(
      validateAndNormalizeAnswer(
        bundle,
        "b8_q1",
        { kind: "single", optionId: "yes" },
        b2cState.visibleQuestionIds,
      ),
    ).toEqual({ kind: "single", optionId: "yes" });

    expect(() =>
      validateAndNormalizeAnswer(bundle, "b1_q2", { kind: "multi", optionIds: ["saas"] }, cleanVisible),
    ).toThrow(/invalid answer shape/);
    expect(() =>
      validateAndNormalizeAnswer(bundle, "b1_q2", { kind: "single", optionId: "bogus" }, cleanVisible),
    ).toThrow(/unknown option/);
    expect(() =>
      validateAndNormalizeAnswer(bundle, "b1_q3", { kind: "multi", optionIds: [] }, cleanVisible),
    ).toThrow(/must not be empty/);
    expect(() =>
      validateAndNormalizeAnswer(
        bundle,
        "b1_q3",
        { kind: "multi", optionIds: ["b2c", "b2c"] },
        cleanVisible,
      ),
    ).toThrow(/duplicate/);
    expect(() =>
      validateAndNormalizeAnswer(
        bundle,
        "b1_q2",
        { kind: "single", optionId: "saas", required: false },
        cleanVisible,
      ),
    ).toThrow(/invalid answer shape/);
    expect(() =>
      validateAndNormalizeAnswer(
        bundle,
        "b1_q2",
        { kind: "single", optionId: ["saas"] },
        cleanVisible,
      ),
    ).toThrow(/single-option/);
    expect(() => validateAndNormalizeAnswer(bundle, "b1_q2", null, cleanVisible)).toThrow(
      /cannot be cleared/,
    );
  });

  it("normalizes text with NFC and trim, treats empty text as clear, and limits Unicode code points", () => {
    expect(
      validateAndNormalizeAnswer(bundle, "b1_q1", { kind: "text", text: "  e\u0301  " }, cleanVisible),
    ).toEqual({ kind: "text", text: "é" });
    expect(
      validateAndNormalizeAnswer(bundle, "b1_q1", { kind: "text", text: " \n\t " }, cleanVisible),
    ).toBeNull();
    expect(validateAndNormalizeAnswer(bundle, "b1_q1", null, cleanVisible)).toBeNull();
    expect(() =>
      validateAndNormalizeAnswer(
        bundle,
        "b1_q1",
        { kind: "text", text: "😀".repeat(10_001) },
        cleanVisible,
      ),
    ).toThrow(/10000 Unicode code points/);
  });

  it("validates persisted data as canonical rather than silently rewriting it", () => {
    expect(() =>
      validateCanonicalAnswer(bundle, "b1_q3", {
        kind: "multi",
        optionIds: ["mixed", "b2c"],
      }),
    ).toThrow(/not canonically ordered/);
    expect(() =>
      validateCanonicalAnswer(bundle, "b1_q1", { kind: "text", text: " padded " }),
    ).toThrow(/not normalized/);
  });
});
