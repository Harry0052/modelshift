import { readFileSync } from "node:fs";
import { sha256 } from "./canonical.js";
import { GateError } from "./errors.js";
import { resolveInside } from "./paths.js";
import type { LoadedSuite, Recording } from "./types.js";

type ProviderTable = {
  schemaVersion: "1";
  modelVersion: string;
  outputs: Record<string, unknown>;
};

export function applyLocalProvider(suite: LoadedSuite, tablePath: string): LoadedSuite {
  const resolved = resolveInside(suite.rootDir, tablePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new GateError(2, "invalid_config", [
      `cannot read local provider table: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  if (!isProviderTable(parsed)) {
    throw new GateError(2, "invalid_config", [
      "local provider table must be schemaVersion 1 with modelVersion and outputs",
    ]);
  }
  if (parsed.modelVersion !== suite.manifest.candidateVersion) {
    throw new GateError(3, "quarantined", [
      `local provider version ${parsed.modelVersion} does not match candidate ${suite.manifest.candidateVersion}`,
    ]);
  }
  for (const item of suite.cases) {
    const output = parsed.outputs[item.spec.caseId];
    if (output === undefined) {
      item.candidate = null;
      continue;
    }
    const recording: Recording = {
      schemaVersion: "1",
      caseId: item.spec.caseId,
      workflowId: item.spec.workflowId,
      modelVersion: parsed.modelVersion,
      status: "completed",
      attempts: [{ attempt: 1, status: "completed", output }],
      output,
    };
    item.candidate = recording;
    item.candidatePath = `local-provider:${sha256(item.spec.caseId).slice(0, 12)}`;
  }
  return suite;
}

function isProviderTable(value: unknown): value is ProviderTable {
  if (value === null || typeof value !== "object") return false;
  const table = value as Partial<ProviderTable>;
  return (
    table.schemaVersion === "1" &&
    typeof table.modelVersion === "string" &&
    table.outputs !== null &&
    typeof table.outputs === "object"
  );
}
