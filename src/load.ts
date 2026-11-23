import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { canonicalStringify, sha256 } from "./canonical.js";
import { GateError } from "./errors.js";
import {
  findLongString,
  jsonDepth,
  MAX_INPUT_BYTES,
  MAX_JSON_DEPTH,
  MAX_STRING_LENGTH,
} from "./limits.js";
import { isSafePattern, resolveInside } from "./paths.js";
import { manifestSchema, recordingSchema } from "./schemas.js";
import type { Assertion, LoadedCase, LoadedSuite, Recording, SuiteManifest } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateManifest: ValidateFunction = ajv.compile(manifestSchema);
const validateRecording: ValidateFunction = ajv.compile(recordingSchema);
const outputAjv = new Ajv({ allErrors: true, strict: false, validateSchema: true });

export type LoadOptions = {
  candidateDir?: string;
};

export function loadSuite(manifestPath: string, options: LoadOptions = {}): LoadedSuite {
  const absoluteManifest = path.resolve(manifestPath);
  const rootDir = path.dirname(absoluteManifest);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absoluteManifest, "utf8"));
  } catch (error) {
    throw new GateError(2, "invalid_config", [
      `cannot read suite manifest ${manifestPath}: ${errorMessage(error)}`,
    ]);
  }
  if (!validateManifest(parsed)) {
    throw new GateError(2, "invalid_config", formatAjvErrors(validateManifest.errors));
  }
  const manifest = parsed as SuiteManifest;
  if (options.candidateDir) {
    manifest.candidateDir = options.candidateDir;
  }

  const seen = new Set<string>();
  const cases: LoadedCase[] = [];
  for (const spec of manifest.cases) {
    const key = `${spec.workflowId}/${spec.caseId}`;
    if (seen.has(key)) {
      throw new GateError(2, "invalid_config", [`duplicate case ${key}`]);
    }
    seen.add(key);
    cases.push(loadCase(rootDir, manifest, spec));
  }

  return { manifestPath: absoluteManifest, rootDir, manifest, cases };
}

function loadCase(
  rootDir: string,
  manifest: SuiteManifest,
  spec: SuiteManifest["cases"][number],
): LoadedCase {
  const label = `${spec.workflowId}/${spec.caseId}`;
  assertAssertions(label, spec.assertions);
  const inputPath = resolveSuitePath(rootDir, spec.input, label);
  const schemaPath = resolveSuitePath(rootDir, spec.outputSchema, label);
  const baselinePath = resolveSuitePath(
    rootDir,
    path.posix.join(manifest.baselineDir, spec.recording),
    label,
  );
  const candidatePath = resolveSuitePath(
    rootDir,
    path.posix.join(manifest.candidateDir, spec.recording),
    label,
  );

  const inputBytes = readBytes(inputPath, label, "input");
  if (inputBytes.length > MAX_INPUT_BYTES) {
    throw new GateError(2, "invalid_config", [
      `${label} input is ${inputBytes.length} bytes and exceeds ${MAX_INPUT_BYTES}`,
    ]);
  }
  const inputSha = sha256(inputBytes);
  if (inputSha !== spec.inputSha256) {
    throw new GateError(3, "quarantined", [
      `${label} input hash mismatch: manifest ${spec.inputSha256}, file ${inputSha}`,
    ]);
  }
  const input = parseJson(inputBytes, `${label} input`);
  assertBounded(`${label} input`, input);

  const schemaBytes = readBytes(schemaPath, label, "output schema");
  const schemaSha256 = sha256(schemaBytes);
  const schema = parseJson(schemaBytes, `${label} output schema`);
  assertOutputSchema(label, schema);

  const baseline = readRecording(baselinePath, spec, manifest.baselineVersion, label, "baseline");
  const candidate = readRecording(
    candidatePath,
    spec,
    manifest.candidateVersion,
    label,
    "candidate",
  );
  const configHash = sha256(
    canonicalStringify({
      caseId: spec.caseId,
      workflowId: spec.workflowId,
      severity: spec.severity,
      inputSha256: spec.inputSha256,
      schemaSha256,
      assertions: spec.assertions,
      baselineVersion: manifest.baselineVersion,
      candidateVersion: manifest.candidateVersion,
      redactions: manifest.redactions,
      retries: manifest.retries,
    }),
  );

  return {
    spec,
    input,
    inputBytes: inputBytes.length,
    schema: schema as Record<string, unknown>,
    schemaSha256,
    configHash,
    baselinePath,
    candidatePath,
    baseline,
    candidate,
  };
}

function assertAssertions(label: string, assertions: Assertion[]): void {
  for (const assertion of assertions) {
    if (assertion.type === "exact" && !Object.prototype.hasOwnProperty.call(assertion, "value")) {
      throw new GateError(2, "invalid_config", [
        `${label} exact assertion ${assertion.path} requires value`,
      ]);
    }
    if (assertion.type === "enum" && (!assertion.values || assertion.values.length === 0)) {
      throw new GateError(2, "invalid_config", [
        `${label} enum assertion ${assertion.path} requires values`,
      ]);
    }
    if (assertion.type === "pattern") {
      if (!assertion.pattern || !isSafePattern(assertion.pattern)) {
        throw new GateError(2, "invalid_config", [
          `${label} pattern assertion ${assertion.path} must be a short anchored literal pattern`,
        ]);
      }
    }
    if (assertion.type === "maxLength" && assertion.max === undefined) {
      throw new GateError(2, "invalid_config", [
        `${label} maxLength assertion ${assertion.path} requires max`,
      ]);
    }
  }
}

function readRecording(
  filePath: string,
  spec: SuiteManifest["cases"][number],
  expectedVersion: string,
  label: string,
  side: "baseline" | "candidate",
): Recording | null {
  const bytes = readOptionalBytes(filePath);
  if (bytes === null) return null;
  const parsed = parseJson(bytes, `${label} ${side} recording`);
  if (!validateRecording(parsed)) {
    throw new GateError(2, "invalid_config", [
      `${label} ${side} recording is not a recording envelope`,
      ...formatAjvErrors(validateRecording.errors),
    ]);
  }
  const recording = parsed as Recording;
  if (recording.caseId !== spec.caseId || recording.workflowId !== spec.workflowId) {
    throw new GateError(2, "invalid_config", [
      `${label} ${side} recording identity is ${recording.workflowId}/${recording.caseId}`,
    ]);
  }
  if (recording.modelVersion !== expectedVersion) {
    throw new GateError(3, "quarantined", [
      `${label} ${side} version is ${recording.modelVersion} and the manifest requires ${expectedVersion}`,
    ]);
  }
  const attempts = [...recording.attempts].sort((a, b) => a.attempt - b.attempt);
  attempts.forEach((attempt, index) => {
    if (attempt.attempt !== index + 1) {
      throw new GateError(2, "invalid_config", [
        `${label} ${side} attempts must be numbered 1..n without gaps`,
      ]);
    }
    if (attempt.status !== recording.status) {
      throw new GateError(2, "invalid_config", [
        `${label} ${side} attempt ${attempt.attempt} status ${attempt.status} does not match ${recording.status}`,
      ]);
    }
    if (attempt.status !== "completed" && attempt.output !== undefined) {
      throw new GateError(2, "invalid_config", [
        `${label} ${side} attempt ${attempt.attempt} must not include output`,
      ]);
    }
    if (attempt.output !== undefined) {
      assertBounded(`${label} ${side} attempt ${attempt.attempt}`, attempt.output);
    }
  });
  if (
    recording.status === "completed" &&
    recording.output === undefined &&
    attempts.some((item) => item.output === undefined)
  ) {
    throw new GateError(2, "invalid_config", [
      `${label} ${side} completed recording is missing output`,
    ]);
  }
  if (recording.status !== "completed" && recording.output !== undefined) {
    throw new GateError(2, "invalid_config", [
      `${label} ${side} ${recording.status} recording must not include output`,
    ]);
  }
  if (recording.output !== undefined) {
    assertBounded(`${label} ${side} output`, recording.output);
  }
  return recording;
}

function assertOutputSchema(label: string, schema: unknown): void {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new GateError(2, "invalid_config", [`${label} output schema must be a JSON object`]);
  }
  const document = schema as Record<string, unknown>;
  if (JSON.stringify(document).includes('"$ref"')) {
    throw new GateError(2, "invalid_config", [`${label} output schema must not use $ref`]);
  }
  try {
    outputAjv.compile(document);
  } catch (error) {
    throw new GateError(2, "invalid_config", [
      `${label} output schema is not a usable JSON schema: ${errorMessage(error)}`,
    ]);
  }
}

function assertBounded(label: string, value: unknown): void {
  const depth = jsonDepth(value);
  if (depth > MAX_JSON_DEPTH) {
    throw new GateError(2, "invalid_config", [
      `${label} JSON depth ${depth} exceeds ${MAX_JSON_DEPTH}`,
    ]);
  }
  const longString = findLongString(value, MAX_STRING_LENGTH);
  if (longString) {
    throw new GateError(2, "invalid_config", [
      `${label} contains a string longer than ${MAX_STRING_LENGTH} characters`,
    ]);
  }
}

function resolveSuitePath(rootDir: string, request: string, label: string): string {
  try {
    return resolveInside(rootDir, request);
  } catch (error) {
    throw new GateError(2, "invalid_config", [`${label} ${errorMessage(error)}`]);
  }
}

function readBytes(filePath: string, label: string, kind: string): Buffer {
  const bytes = readOptionalBytes(filePath);
  if (bytes === null) {
    throw new GateError(2, "invalid_config", [`${label} cannot read ${kind}: file is missing`]);
  }
  return bytes;
}

function readOptionalBytes(filePath: string): Buffer | null {
  try {
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      throw new GateError(2, "invalid_config", [`refusing to follow symlink ${filePath}`]);
    }
  } catch (error) {
    if (error instanceof GateError) throw error;
    if (isEnoent(error)) return null;
    throw new GateError(2, "invalid_config", [`cannot read ${filePath}: ${errorMessage(error)}`]);
  }
  return readFileSync(filePath);
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new GateError(2, "invalid_config", [`${label} is not JSON: ${errorMessage(error)}`]);
  }
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return ["value does not match the expected schema"];
  }
  return errors.map((error) => {
    const where = error.instancePath || "/";
    return `${where} ${error.message ?? "is invalid"}`;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
