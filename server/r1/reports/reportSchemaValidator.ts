import reportSchemaRaw from "../../../shared/report/report_schema_v1.json?raw";
import { canonicalSerialize, type CanonicalJsonValue } from "../questionnaire/canonicalJson";
import type { ReportValidationIssue } from "./types";

type Schema = Readonly<Record<string, unknown>>;

const rootSchema = (typeof reportSchemaRaw === "string"
  ? JSON.parse(reportSchemaRaw)
  : reportSchemaRaw) as Schema;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function childPath(path: string, key: string | number): string {
  return typeof key === "number" ? `${path}[${key}]` : `${path}.${key}`;
}

function schemaIssue(path: string, code: string, message: string): ReportValidationIssue {
  return Object.freeze({
    classification: "schema_validation_failed",
    path,
    code,
    message,
  });
}

function resolveRef(ref: unknown): Schema | null {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  let current: unknown = rootSchema;
  for (const token of ref.slice(2).split("/")) {
    if (!isObject(current)) return null;
    current = current[token.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return isObject(current) ? current : null;
}

function equal(left: unknown, right: unknown): boolean {
  try {
    return canonicalSerialize(left as CanonicalJsonValue) ===
      canonicalSerialize(right as CanonicalJsonValue);
  } catch {
    return false;
  }
}

function hasType(value: unknown, type: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function validDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function validUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1;
  } catch {
    return false;
  }
}

function validateNode(
  value: unknown,
  schema: Schema,
  path: string,
  collect: boolean,
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  const add = (code: string, message: string) => {
    issues.push(schemaIssue(path, code, message));
  };

  if (schema.$ref !== undefined) {
    const target = resolveRef(schema.$ref);
    if (!target) {
      add("unsupported_ref", "schema contains an unsupported or unresolved $ref");
      return issues;
    }
    return validateNode(value, target, path, collect);
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(option =>
      isObject(option) && validateNode(value, option, path, false).length === 0
    );
    if (matches.length !== 1) {
      add("one_of", `value must match exactly one schema branch; matched ${matches.length}`);
      return issues;
    }
    issues.push(...validateNode(value, matches[0] as Schema, path, collect));
  }

  if (schema.const !== undefined && !equal(value, schema.const)) {
    add("const", "value does not equal the required constant");
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(item => equal(value, item))) {
    add("enum", "value is not in the allowed enum");
  }
  if (schema.type !== undefined && !hasType(value, schema.type)) {
    add("type", `value is not of type ${String(schema.type)}`);
    return issues;
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      add("min_length", `string must contain at least ${schema.minLength} characters`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      add("pattern", "string does not match the required pattern");
    }
    if (
      (schema.format === "date" && !validDate(value)) ||
      (schema.format === "date-time" && !validDateTime(value)) ||
      (schema.format === "uri" && !validUri(value))
    ) {
      add("format", `string does not match format ${String(schema.format)}`);
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      add("minimum", `number must be at least ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      add("maximum", `number must be at most ${schema.maximum}`);
    }
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      add("exclusive_minimum", `number must be greater than ${schema.exclusiveMinimum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      add("min_items", `array must contain at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      add("max_items", `array must contain at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems === true) {
      const serialized = value.map(item => {
        try {
          return canonicalSerialize(item as CanonicalJsonValue);
        } catch {
          return Symbol("non-canonical");
        }
      });
      if (new Set(serialized).size !== serialized.length) add("unique_items", "array items must be unique");
    }
    if (isObject(schema.items)) {
      value.forEach((item, index) => {
        issues.push(...validateNode(item, schema.items as Schema, childPath(path, index), collect));
      });
    }
    if (isObject(schema.contains)) {
      const matches = value.filter(item =>
        validateNode(item, schema.contains as Schema, path, false).length === 0
      ).length;
      const minimum = typeof schema.minContains === "number" ? schema.minContains : 1;
      if (matches < minimum) add("contains", `array must contain at least ${minimum} matching items`);
    }
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (typeof required === "string" && !Object.prototype.hasOwnProperty.call(value, required)) {
          issues.push(schemaIssue(childPath(path, required), "required", "required property is missing"));
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          issues.push(schemaIssue(childPath(path, key), "additional_property", "unknown property is forbidden"));
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key) && isObject(propertySchema)) {
        issues.push(...validateNode(value[key], propertySchema, childPath(path, key), collect));
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const condition of schema.allOf) {
      if (!isObject(condition)) continue;
      const ifSchema = isObject(condition.if) ? condition.if : null;
      if (ifSchema) {
        const branch = validateNode(value, ifSchema, path, false).length === 0
          ? condition.then
          : condition.else;
        if (isObject(branch)) issues.push(...validateNode(value, branch, path, collect));
      } else {
        issues.push(...validateNode(value, condition, path, collect));
      }
    }
  }
  return issues;
}

/**
 * Offline validator for the checked-in report schema. It intentionally supports
 * exactly the Draft 2020-12 keywords used by report_schema_v1 and fails closed
 * when a reference cannot be resolved.
 */
export function validateReportSchema(snapshot: unknown): readonly ReportValidationIssue[] {
  return Object.freeze(validateNode(snapshot, rootSchema, "$", true));
}

export function reportSchemaDocument(): Schema {
  return rootSchema;
}
