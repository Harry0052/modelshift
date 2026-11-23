import { Ajv, type ValidateFunction } from "ajv";
import { canonicalStringify } from "./canonical.js";
import type { Assertion } from "./types.js";

const outputAjv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
const compiled = new WeakMap<object, ValidateFunction>();

export type FieldResult = {
  field: string;
  assertion: string;
  expected: string;
  actual: string;
};

export type ContractResult = {
  passed: boolean;
  failures: FieldResult[];
};

export function checkContract(schema: Record<string, unknown>, assertions: Assertion[], output: unknown): ContractResult {
  const shape = checkShape(schema, output);
  if (!shape.passed) return shape;
  const failures: FieldResult[] = [];
  for (const assertion of assertions) {
    const failure = checkAssertion(assertion, output);
    if (failure) failures.push(failure);
  }
  return { passed: failures.length === 0, failures };
}

function checkShape(schema: Record<string, unknown>, output: unknown): ContractResult {
  let validate = compiled.get(schema);
  if (!validate) {
    validate = outputAjv.compile(schema);
    compiled.set(schema, validate);
  }
  if (validate(output)) return { passed: true, failures: [] };
  const failures = (validate.errors ?? []).map((error) => ({
    field: error.instancePath ? error.instancePath.slice(1).replaceAll("/", ".") : "(root)",
    assertion: "schema",
    expected: error.message ?? "match the output schema",
    actual: preview(output),
  }));
  return { passed: false, failures };
}

function checkAssertion(assertion: Assertion, output: unknown): FieldResult | undefined {
  const located = locate(output, assertion.path);
  if (!located.found) {
    return {
      field: assertion.path,
      assertion: assertion.type,
      expected: expectedText(assertion),
      actual: "(missing)",
    };
  }
  const actual = located.value;
  if (assertion.type === "exact" && !sameValue(actual, assertion.value)) {
    return field(assertion, preview(actual));
  }
  if (assertion.type === "enum") {
    if (typeof actual !== "string" || !assertion.values?.includes(actual)) {
      return field(assertion, preview(actual));
    }
  }
  if (assertion.type === "pattern") {
    if (typeof actual !== "string" || !new RegExp(assertion.pattern ?? "").test(actual)) {
      return field(assertion, preview(actual));
    }
  }
  if (assertion.type === "maxLength") {
    if (typeof actual !== "string" || actual.length > (assertion.max ?? 0)) {
      return field(assertion, preview(actual));
    }
  }
  return undefined;
}

function field(assertion: Assertion, actual: string): FieldResult {
  return {
    field: assertion.path,
    assertion: assertion.type,
    expected: expectedText(assertion),
    actual,
  };
}

function expectedText(assertion: Assertion): string {
  if (assertion.type === "exact") return preview(assertion.value);
  if (assertion.type === "enum") return (assertion.values ?? []).join("|");
  if (assertion.type === "pattern") return assertion.pattern ?? "";
  return `length <= ${assertion.max ?? 0}`;
}

function locate(value: unknown, dotted: string): { found: boolean; value: unknown } {
  let current = value;
  for (const part of dotted.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[part];
  }
  return { found: true, value: current };
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalStringify(left) === canonicalStringify(right);
}

function preview(value: unknown): string {
  const text = typeof value === "string" ? JSON.stringify(value) : canonicalStringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}
