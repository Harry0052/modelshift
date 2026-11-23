import type { LoadOptions } from "./load.js";
import { loadSuite } from "./load.js";
import type { ValidationReport } from "./types.js";

export function validateSuite(manifestPath: string, options: LoadOptions = {}): ValidationReport {
  const suite = loadSuite(manifestPath, options);
  return {
    ok: true,
    suiteId: suite.manifest.suiteId,
    baselineVersion: suite.manifest.baselineVersion,
    candidateVersion: suite.manifest.candidateVersion,
    retries: suite.manifest.retries,
    caseCount: suite.cases.length,
    cases: suite.cases.map((item) => ({
      caseId: item.spec.caseId,
      workflowId: item.spec.workflowId,
      severity: item.spec.severity,
      inputSha256: item.spec.inputSha256,
      schemaSha256: item.schemaSha256,
      configHash: item.configHash,
    })),
  };
}
