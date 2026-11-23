export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ASSERTION_TYPES = ["exact", "enum", "pattern", "maxLength"] as const;
export type AssertionType = (typeof ASSERTION_TYPES)[number];

export type Assertion = {
  path: string;
  type: AssertionType;
  value?: unknown;
  values?: string[];
  pattern?: string;
  max?: number;
};

export type SuiteCase = {
  caseId: string;
  workflowId: string;
  severity: Severity;
  input: string;
  outputSchema: string;
  recording: string;
  assertions: Assertion[];
  inputSha256: string;
};

export type SuiteManifest = {
  schemaVersion: "1";
  suiteId: string;
  baselineVersion: string;
  candidateVersion: string;
  retries: number;
  redactions: string[];
  baselineDir: string;
  candidateDir: string;
  cases: SuiteCase[];
};

export type AttemptStatus = "completed" | "timeout" | "error";

export type RecordingAttempt = {
  attempt: number;
  status: AttemptStatus;
  output?: unknown;
};

export type Recording = {
  schemaVersion: "1";
  caseId: string;
  workflowId: string;
  modelVersion: string;
  status: AttemptStatus;
  attempts: RecordingAttempt[];
  output?: unknown;
};

export type LoadedCase = {
  spec: SuiteCase;
  input: unknown;
  inputBytes: number;
  schema: Record<string, unknown>;
  schemaSha256: string;
  configHash: string;
  baselinePath: string;
  candidatePath: string;
  baseline: Recording | null;
  candidate: Recording | null;
};

export type LoadedSuite = {
  manifestPath: string;
  rootDir: string;
  manifest: SuiteManifest;
  cases: LoadedCase[];
};

export type ValidationReport = {
  ok: true;
  suiteId: string;
  baselineVersion: string;
  candidateVersion: string;
  retries: number;
  caseCount: number;
  cases: Array<{
    caseId: string;
    workflowId: string;
    severity: Severity;
    inputSha256: string;
    schemaSha256: string;
    configHash: string;
  }>;
};
