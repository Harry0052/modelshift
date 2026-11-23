import path from "node:path";
import { checkContract, type ContractResult, type FieldResult } from "./assertions.js";
import { GateError } from "./errors.js";
import type { LoadOptions } from "./load.js";
import { loadSuite } from "./load.js";
import { redactValue } from "./redact.js";
import { toolVersion } from "./version.js";
import type { LoadedCase, LoadedSuite, Recording, Severity } from "./types.js";

export type PairOutcome =
  "passing" | "newly_failing" | "fixed" | "continuously_failing" | "inconclusive" | "quarantined";

export type AttemptEvidence = {
  attempt: number;
  status: string;
  contract: "pass" | "fail" | "not_applicable";
};

export type SideEvidence = {
  present: boolean;
  modelVersion: string | null;
  status: string;
  attempts: AttemptEvidence[];
  failures: FieldResult[];
  output: unknown;
};

export type CaseEvidence = {
  caseId: string;
  workflowId: string;
  severity: Severity;
  configHash: string;
  inputSha256: string;
  schemaSha256: string;
  outcome: PairOutcome;
  flaky: boolean;
  reason: string;
  recovery: string;
  retriesConfigured: number;
  baseline: SideEvidence;
  candidate: SideEvidence;
  evidence: {
    baseline: string;
    candidate: string;
  };
};

export type GateReport = {
  schemaVersion: "1";
  tool: "modelshift";
  toolVersion: string;
  suiteId: string;
  decision: "pass" | "block" | "insufficient_evidence" | "quarantined";
  exitCode: 0 | 1 | 3;
  baselineVersion: string;
  candidateVersion: string;
  retriesConfigured: number;
  units: string;
  limitations: string;
  recovery: string;
  criticalRegressions: Array<{
    workflowId: string;
    caseId: string;
    fields: string[];
  }>;
  counts: {
    passing: number;
    newlyFailing: number;
    fixed: number;
    continuouslyFailing: number;
    inconclusive: number;
    quarantined: number;
  };
  reasons: string[];
  cases: CaseEvidence[];
};

const OUTCOME_ORDER: PairOutcome[] = [
  "newly_failing",
  "quarantined",
  "inconclusive",
  "continuously_failing",
  "fixed",
  "passing",
];
const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export function compareSuite(manifestPath: string, options: LoadOptions = {}): GateReport {
  try {
    return evaluateSuite(loadSuite(manifestPath, options));
  } catch (error) {
    if (error instanceof GateError && error.category === "quarantined") {
      return quarantinedReport(manifestPath, error.details);
    }
    throw error;
  }
}

export function evaluateSuite(suite: LoadedSuite): GateReport {
  const cases = suite.cases.map((item) => evaluateCase(suite, item)).sort(compareEvidence);
  const criticalRegressions = cases
    .filter((item) => item.severity === "critical" && item.outcome === "newly_failing")
    .map((item) => ({
      workflowId: item.workflowId,
      caseId: item.caseId,
      fields: uniqueFields(item.candidate.failures),
    }));
  const criticalGap = cases.some(
    (item) =>
      item.severity === "critical" &&
      (item.outcome === "inconclusive" || item.outcome === "quarantined"),
  );
  let decision: GateReport["decision"] = "pass";
  let exitCode: GateReport["exitCode"] = 0;
  if (criticalRegressions.length > 0) {
    decision = "block";
    exitCode = 1;
  } else if (criticalGap) {
    decision = "insufficient_evidence";
    exitCode = 3;
  }
  return {
    schemaVersion: "1",
    tool: "modelshift",
    toolVersion,
    suiteId: suite.manifest.suiteId,
    decision,
    exitCode,
    baselineVersion: suite.manifest.baselineVersion,
    candidateVersion: suite.manifest.candidateVersion,
    retriesConfigured: suite.manifest.retries,
    units: "Money is integer cents. Counts are cases. Contract comparisons are exact.",
    limitations:
      "The gate reads recorded outputs, or the explicit local provider. It does not call a hosted model, grade prose, or run tools.",
    recovery: suiteRecovery(decision),
    criticalRegressions,
    counts: countOutcomes(cases),
    reasons: [],
    cases,
  };
}

function quarantinedReport(manifestPath: string, reasons: string[]): GateReport {
  return {
    schemaVersion: "1",
    tool: "modelshift",
    toolVersion,
    suiteId: path.basename(manifestPath),
    decision: "quarantined",
    exitCode: 3,
    baselineVersion: "",
    candidateVersion: "",
    retriesConfigured: 0,
    units: "Money is integer cents. Counts are cases. Contract comparisons are exact.",
    limitations:
      "The gate reads recorded outputs, or the explicit local provider. It does not call a hosted model, grade prose, or run tools.",
    recovery: suiteRecovery("quarantined"),
    criticalRegressions: [],
    counts: {
      passing: 0,
      newlyFailing: 0,
      fixed: 0,
      continuouslyFailing: 0,
      inconclusive: 0,
      quarantined: 0,
    },
    reasons,
    cases: [],
  };
}

function evaluateCase(suite: LoadedSuite, item: LoadedCase): CaseEvidence {
  const baseline = evaluateSide(item, item.baseline);
  const candidate = evaluateSide(item, item.candidate);
  const flaky = baseline.flaky || candidate.flaky;
  const classified = classify(baseline.state, candidate.state, flaky);
  const reason = specificReason(classified.reason, baseline, candidate, suite.manifest.retries);
  return {
    caseId: item.spec.caseId,
    workflowId: item.spec.workflowId,
    severity: item.spec.severity,
    configHash: item.configHash,
    inputSha256: item.spec.inputSha256,
    schemaSha256: item.schemaSha256,
    outcome: classified.outcome,
    flaky,
    reason,
    recovery: caseRecovery(classified.outcome, item.spec.severity),
    retriesConfigured: suite.manifest.retries,
    baseline: sideEvidence(item.baseline, baseline, suite.manifest.redactions),
    candidate: sideEvidence(item.candidate, candidate, suite.manifest.redactions),
    evidence: {
      baseline: relativeEvidence(suite.rootDir, item.baselinePath),
      candidate: relativeEvidence(suite.rootDir, item.candidatePath),
    },
  };
}

type SideState = "pass" | "fail" | "timeout" | "error" | "missing" | "flaky";

type EvaluatedSide = {
  state: SideState;
  flaky: boolean;
  failures: FieldResult[];
  attempts: AttemptEvidence[];
};

function evaluateSide(item: LoadedCase, recording: Recording | null): EvaluatedSide {
  if (!recording) {
    return { state: "missing", flaky: false, failures: [], attempts: [] };
  }
  const attempts = recording.attempts.map((attempt) => {
    if (attempt.status !== "completed") {
      return {
        attempt: attempt.attempt,
        status: attempt.status,
        contract: "not_applicable" as const,
      };
    }
    const output = attempt.output !== undefined ? attempt.output : recording.output;
    const result =
      output === undefined
        ? failedMissing()
        : checkContract(item.schema, item.spec.assertions, output);
    return {
      attempt: attempt.attempt,
      status: attempt.status,
      contract: result.passed ? ("pass" as const) : ("fail" as const),
      result,
    };
  });
  if (recording.status === "timeout") {
    return { state: "timeout", flaky: false, failures: [], attempts: strip(attempts) };
  }
  if (recording.status === "error") {
    return { state: "error", flaky: false, failures: [], attempts: strip(attempts) };
  }
  const graded: ContractResult[] = [];
  for (const attempt of attempts) {
    if ("result" in attempt && attempt.result) graded.push(attempt.result);
  }
  const passes = graded.filter((result) => result.passed).length;
  if (graded.length > 1 && passes > 0 && passes < graded.length) {
    const failures = graded.find((result) => !result.passed)?.failures ?? [];
    return { state: "flaky", flaky: true, failures, attempts: strip(attempts) };
  }
  const representative = graded.find((result) => !result.passed) ?? graded[0];
  if (!representative || representative.passed) {
    return { state: "pass", flaky: false, failures: [], attempts: strip(attempts) };
  }
  return {
    state: "fail",
    flaky: false,
    failures: representative.failures,
    attempts: strip(attempts),
  };
}

function failedMissing(): ContractResult {
  return {
    passed: false,
    failures: [{ field: "(root)", assertion: "schema", expected: "output", actual: "(missing)" }],
  };
}

function strip(attempts: Array<AttemptEvidence & { result?: ContractResult }>): AttemptEvidence[] {
  return attempts.map(({ attempt, status, contract }) => ({ attempt, status, contract }));
}

function suiteRecovery(decision: GateReport["decision"]): string {
  if (decision === "block") {
    return "Do not ship this candidate. Inspect each newly failing critical field, then compare again. Fixed and continuously failing cases are not new regressions.";
  }
  if (decision === "insufficient_evidence") {
    return "Add a completed recording for every critical case and compare again. A timeout or missing file is not a behavior regression.";
  }
  if (decision === "quarantined") {
    return "Restore the input bytes or review the version pin before comparing. A hash or version mismatch is not a model regression.";
  }
  return "Critical coverage is complete and no critical contract newly failed. Review fixed and continuously failing cases before depending on them.";
}

function caseRecovery(outcome: PairOutcome, severity: Severity): string {
  if (outcome === "newly_failing" && severity === "critical") {
    return "This critical field blocks the release. Fix the candidate output or keep the pinned baseline.";
  }
  if (outcome === "newly_failing")
    return "This field changed. It does not block the release unless you raise its severity.";
  if (outcome === "inconclusive")
    return "Collect another completed attempt. Do not count this case as a pass or a regression.";
  if (outcome === "quarantined")
    return "Re-pin the input hash or model version in a reviewed manifest change.";
  if (outcome === "fixed")
    return "The candidate now meets the contract. This is not a new regression.";
  if (outcome === "continuously_failing")
    return "Both versions miss this contract. It is a known gap, not a new regression.";
  return "No action. Both sides meet the contract.";
}

function specificReason(
  fallback: string,
  baseline: EvaluatedSide,
  candidate: EvaluatedSide,
  retries: number,
): string {
  if (candidate.state === "timeout") {
    return `candidate timeout after ${candidate.attempts.length} attempts; retries configured ${retries}`;
  }
  if (baseline.state === "timeout") {
    return `baseline timeout after ${baseline.attempts.length} attempts; retries configured ${retries}`;
  }
  if (candidate.state === "missing") return "candidate recording is missing";
  if (baseline.state === "missing") return "baseline recording is missing";
  return fallback;
}

function classify(
  baseline: SideState,
  candidate: SideState,
  flaky: boolean,
): { outcome: PairOutcome; reason: string } {
  if (flaky)
    return {
      outcome: "inconclusive",
      reason: "attempts disagreed; flaky result is not a behavior regression",
    };
  if (baseline === "missing" || candidate === "missing") {
    return { outcome: "inconclusive", reason: "recording is missing" };
  }
  if (baseline === "timeout" || candidate === "timeout") {
    return {
      outcome: "inconclusive",
      reason: "timeout is insufficient evidence, not a behavior regression",
    };
  }
  if (baseline === "error" || candidate === "error") {
    return {
      outcome: "inconclusive",
      reason: "provider or setup error is not a behavior regression",
    };
  }
  if (baseline === "pass" && candidate === "pass")
    return { outcome: "passing", reason: "both sides meet the contract" };
  if (baseline === "pass" && candidate === "fail")
    return { outcome: "newly_failing", reason: "candidate failed a contract the baseline met" };
  if (baseline === "fail" && candidate === "pass")
    return { outcome: "fixed", reason: "candidate meets a contract the baseline missed" };
  return {
    outcome: "continuously_failing",
    reason: "both sides miss the contract; this is not a new regression",
  };
}

function sideEvidence(
  recording: Recording | null,
  evaluated: EvaluatedSide,
  redactions: string[],
): SideEvidence {
  const output =
    recording?.status === "completed"
      ? redactValue(representativeOutput(recording), redactions)
      : null;
  return {
    present: recording !== null,
    modelVersion: recording?.modelVersion ?? null,
    status: recording?.status ?? "missing",
    attempts: evaluated.attempts,
    failures: evaluated.failures,
    output,
  };
}

function representativeOutput(recording: Recording): unknown {
  const withOutput = recording.attempts.find((attempt) => attempt.output !== undefined);
  return withOutput?.output !== undefined ? withOutput.output : recording.output;
}

function uniqueFields(failures: FieldResult[]): string[] {
  return [...new Set(failures.map((failure) => failure.field))];
}

function countOutcomes(cases: CaseEvidence[]): GateReport["counts"] {
  const counts = {
    passing: 0,
    newlyFailing: 0,
    fixed: 0,
    continuouslyFailing: 0,
    inconclusive: 0,
    quarantined: 0,
  };
  for (const item of cases) {
    if (item.outcome === "passing") counts.passing += 1;
    else if (item.outcome === "newly_failing") counts.newlyFailing += 1;
    else if (item.outcome === "fixed") counts.fixed += 1;
    else if (item.outcome === "continuously_failing") counts.continuouslyFailing += 1;
    else if (item.outcome === "inconclusive") counts.inconclusive += 1;
    else counts.quarantined += 1;
  }
  return counts;
}

function compareEvidence(left: CaseEvidence, right: CaseEvidence): number {
  const outcome = OUTCOME_ORDER.indexOf(left.outcome) - OUTCOME_ORDER.indexOf(right.outcome);
  if (outcome !== 0) return outcome;
  const severity = SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity);
  if (severity !== 0) return severity;
  return `${left.workflowId}/${left.caseId}`.localeCompare(`${right.workflowId}/${right.caseId}`);
}

function relativeEvidence(rootDir: string, filePath: string): string {
  if (filePath.startsWith("local-provider:")) return filePath;
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}
