import type {
  AstEvaluationContext,
  AstEvaluationResult,
  AtomProvenance,
  BranchId,
  LegalCoreFlag,
  Predicate,
} from "./types";
import { optionIdsForAnswer } from "./types";

export class LegalCoreAstError extends Error {
  constructor(message: string) {
    super(`Invalid legal-core predicate: ${message}`);
    this.name = "LegalCoreAstError";
  }
}

const COMPOSITE_OPS = new Set(["all_of", "any_of", "not"]);
export const WHITELISTED_AST_OPS = Object.freeze([
  "all_of",
  "any_of",
  "not",
  "answer_contains_any",
  "answer_contains_all",
  "risk_is_active_any",
  "branch_is_active",
  "flag_is_set",
  "active_branch_question_count_greater_than",
] as const);
const WHITELIST = new Set<string>(WHITELISTED_AST_OPS);
const BRANCH_IDS = new Set<BranchId>([
  "consumer",
  "partners",
  "dispute_detail",
  "investment",
  "contractors",
]);
const FLAG_IDS = new Set<LegalCoreFlag>([
  "critical_override_applied",
  "answers_inconsistent",
  "manual_follow_up_required",
  "lawyer_review_required",
]);

function fail(message: string): never {
  throw new LegalCoreAstError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${path} has unsupported or missing fields`);
  }
}

function nonEmptyUniqueStrings(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== "string" || item.length === 0)) {
    fail(`${path} must be a non-empty string array`);
  }
  const strings = value as string[];
  if (new Set(strings).size !== strings.length) fail(`${path} contains duplicates`);
  return Object.freeze([...strings]);
}

function atom(result: boolean, provenance: Omit<AtomProvenance, "result">): AstEvaluationResult {
  return Object.freeze({ value: result, atoms: Object.freeze([Object.freeze({ ...provenance, result })]) });
}

function evaluateUnknown(value: unknown, context: AstEvaluationContext, path: string): AstEvaluationResult {
  if (!isPlainObject(value)) fail(`${path} must be a plain object`);
  if (typeof value.op !== "string" || !WHITELIST.has(value.op)) {
    fail(`${path}.op is unsupported`);
  }

  if (value.op === "all_of" || value.op === "any_of") {
    exactKeys(value, ["op", "args"], path);
    if (!Array.isArray(value.args) || value.args.length === 0) fail(`${path}.args must not be empty`);
    const children = value.args.map((child, index) => evaluateUnknown(child, context, `${path}.args[${index}]`));
    return Object.freeze({
      value: value.op === "all_of" ? children.every(child => child.value) : children.some(child => child.value),
      atoms: Object.freeze(children.flatMap(child => child.atoms)),
    });
  }

  if (value.op === "not") {
    exactKeys(value, ["op", "arg"], path);
    const child = evaluateUnknown(value.arg, context, `${path}.arg`);
    return Object.freeze({ value: !child.value, atoms: child.atoms });
  }

  if (value.op === "answer_contains_any" || value.op === "answer_contains_all") {
    exactKeys(value, ["op", "questionId", "optionIds"], path);
    if (typeof value.questionId !== "string" || value.questionId.length === 0) {
      fail(`${path}.questionId must be a string`);
    }
    const configured = nonEmptyUniqueStrings(value.optionIds, `${path}.optionIds`);
    const selected = optionIdsForAnswer(context.answers[value.questionId]);
    const matched = configured.filter(optionId => selected.includes(optionId));
    const result = value.op === "answer_contains_any"
      ? matched.length > 0
      : configured.every(optionId => selected.includes(optionId));
    return atom(result, {
      op: value.op,
      questionId: value.questionId,
      configuredOptionIds: configured,
      matchedOptionIds: Object.freeze(matched),
    });
  }

  if (value.op === "risk_is_active_any") {
    exactKeys(value, ["op", "riskIds"], path);
    const riskIds = nonEmptyUniqueStrings(value.riskIds, `${path}.riskIds`);
    const matchedRiskIds = riskIds.filter(id => context.activeRiskIds.has(id));
    return atom(matchedRiskIds.length > 0, {
      op: value.op,
      riskIds,
      matchedRiskIds: Object.freeze(matchedRiskIds),
    });
  }

  if (value.op === "branch_is_active") {
    exactKeys(value, ["op", "branchId", "expected"], path);
    if (typeof value.branchId !== "string" || !BRANCH_IDS.has(value.branchId as BranchId)) {
      fail(`${path}.branchId is unsupported`);
    }
    if (typeof value.expected !== "boolean") fail(`${path}.expected must be boolean`);
    const branchId = value.branchId as BranchId;
    const actual = context.activeBranches[branchId];
    return atom(actual === value.expected, {
      op: value.op,
      branchId,
      expectedBoolean: value.expected,
      actualBoolean: actual,
    });
  }

  if (value.op === "flag_is_set") {
    exactKeys(value, ["op", "flag", "expected"], path);
    if (typeof value.flag !== "string" || !FLAG_IDS.has(value.flag as LegalCoreFlag)) {
      fail(`${path}.flag is unsupported`);
    }
    if (value.expected !== true) fail(`${path}.expected must be true`);
    const flag = value.flag as LegalCoreFlag;
    const actual = context.flags.has(flag);
    return atom(actual, {
      op: value.op,
      flag,
      expectedBoolean: true,
      actualBoolean: actual,
    });
  }

  if (value.op === "active_branch_question_count_greater_than") {
    exactKeys(value, ["op", "value"], path);
    if (!Number.isInteger(value.value) || (value.value as number) < 0) {
      fail(`${path}.value must be a non-negative integer`);
    }
    return atom(context.activeBranchQuestionCount > (value.value as number), {
      op: value.op,
      configuredNumber: value.value as number,
      actualNumber: context.activeBranchQuestionCount,
    });
  }

  fail(`${path}.op is unsupported`);
}

/** Pure total evaluator over the closed rules.schema.json AST vocabulary. */
export function evaluatePredicate(
  predicate: Predicate | unknown,
  context: AstEvaluationContext,
): AstEvaluationResult {
  return evaluateUnknown(predicate, context, "predicate");
}

/** Configuration-time structural/reference walk. Unknown/malformed nodes fail closed. */
export function validatePredicateReferences(
  predicate: Predicate | unknown,
  references: Readonly<{
    questionIds: ReadonlySet<string>;
    optionsByQuestionId: ReadonlyMap<string, ReadonlySet<string>>;
    riskIds: ReadonlySet<string>;
    branchIds: ReadonlySet<string>;
  }>,
): void {
  const inertContext: AstEvaluationContext = {
    answers: Object.freeze({}),
    activeRiskIds: new Set(),
    activeBranches: Object.freeze({
      consumer: false,
      partners: false,
      dispute_detail: false,
      investment: false,
      contractors: false,
    }),
    flags: new Set(),
    activeBranchQuestionCount: 0,
  };
  evaluatePredicate(predicate, inertContext);

  function walk(value: unknown, path: string): void {
    if (!isPlainObject(value) || typeof value.op !== "string") fail(`${path} is malformed`);
    if (value.op === "all_of" || value.op === "any_of") {
      (value.args as unknown[]).forEach((child, index) => walk(child, `${path}.args[${index}]`));
      return;
    }
    if (value.op === "not") {
      walk(value.arg, `${path}.arg`);
      return;
    }
    if (value.op === "answer_contains_any" || value.op === "answer_contains_all") {
      const questionId = value.questionId as string;
      if (!references.questionIds.has(questionId)) fail(`${path} references unknown question ${questionId}`);
      const options = references.optionsByQuestionId.get(questionId);
      for (const optionId of value.optionIds as string[]) {
        if (!options?.has(optionId)) fail(`${path} references unknown option ${questionId}.${optionId}`);
      }
      return;
    }
    if (value.op === "risk_is_active_any") {
      for (const riskId of value.riskIds as string[]) {
        if (!references.riskIds.has(riskId)) fail(`${path} references unknown risk ${riskId}`);
      }
      return;
    }
    if (value.op === "branch_is_active" && !references.branchIds.has(value.branchId as string)) {
      fail(`${path} references unknown branch ${String(value.branchId)}`);
    }
  }

  walk(predicate, "predicate");
}

export function isCompositePredicateOp(op: string): boolean {
  return COMPOSITE_OPS.has(op);
}
