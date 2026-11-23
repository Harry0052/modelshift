import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CaseEvidence, GateReport } from "./evaluate.js";
import { GateError } from "./errors.js";

export function writeReport(
  report: GateReport,
  outDir: string,
): { jsonPath: string; textPath: string; htmlPath: string } {
  const resolved = path.resolve(outDir);
  mkdirSync(resolved, { recursive: true });
  const jsonPath = path.join(resolved, "gate.json");
  const textPath = path.join(resolved, "summary.txt");
  const htmlPath = path.join(resolved, "gate.html");
  const ciPath = path.join(resolved, "ci.txt");
  const summary = renderSummary(report);
  const ci = renderCiSummary(report);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(textPath, summary);
  writeFileSync(htmlPath, renderHtml(summary));
  writeFileSync(ciPath, ci);
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    try {
      appendFileSync(stepSummary, ci);
    } catch {
      // The report files are the supported export. A missing Actions summary file is not a gate failure.
    }
  }
  return { jsonPath, textPath, htmlPath };
}

export function renderSummary(report: GateReport): string {
  const lines = [
    `ModelShift ${report.toolVersion}`,
    `decision: ${report.decision}`,
    `exit: ${report.exitCode}`,
    `suite: ${report.suiteId}`,
    `baseline: ${report.baselineVersion || "(unavailable)"}`,
    `candidate: ${report.candidateVersion || "(unavailable)"}`,
    `retries configured: ${report.retriesConfigured}`,
    `units: ${report.units}`,
    `limitations: ${report.limitations}`,
    `recovery: ${report.recovery}`,
    `critical regressions: ${report.criticalRegressions.length}`,
    `counts: passing ${report.counts.passing}, newly failing ${report.counts.newlyFailing}, fixed ${report.counts.fixed}, continuously failing ${report.counts.continuouslyFailing}, inconclusive ${report.counts.inconclusive}, quarantined ${report.counts.quarantined}`,
  ];
  if (report.reasons.length > 0) {
    lines.push("", "quarantine:");
    for (const reason of report.reasons) lines.push(`- ${reason}`);
  }
  const groups: Array<[string, CaseEvidence["outcome"]]> = [
    ["newly failing", "newly_failing"],
    ["quarantined", "quarantined"],
    ["inconclusive", "inconclusive"],
    ["continuously failing", "continuously_failing"],
    ["fixed", "fixed"],
    ["passing", "passing"],
  ];
  for (const [title, outcome] of groups) {
    const rows = report.cases.filter((item) => item.outcome === outcome);
    if (rows.length === 0) continue;
    lines.push("", `${title}:`);
    for (const item of rows) lines.push(renderCase(item));
  }
  lines.push("");
  return lines.join("\n");
}

export function renderCiSummary(report: GateReport): string {
  const fields = report.criticalRegressions
    .map((item) => `${item.workflowId}/${item.caseId}:${item.fields.join(",")}`)
    .join(" ");
  return [
    `modelshift decision=${report.decision} exit=${report.exitCode} critical_regressions=${report.criticalRegressions.length}${fields ? ` cases=${fields}` : ""}`,
    "",
  ].join("\n");
}

function renderCase(item: CaseEvidence): string {
  const lines = [
    `- ${item.workflowId}/${item.caseId} ${item.severity} ${item.outcome}${item.flaky ? " flaky" : ""}`,
    `  reason: ${item.reason}`,
    `  recovery: ${item.recovery}`,
    `  config: ${item.configHash}`,
    `  input sha256: ${item.inputSha256}`,
    `  baseline version: ${item.baseline.modelVersion ?? "(missing)"} status ${item.baseline.status} attempts ${item.baseline.attempts.length}`,
    `  candidate version: ${item.candidate.modelVersion ?? "(missing)"} status ${item.candidate.status} attempts ${item.candidate.attempts.length}`,
    `  retries configured: ${item.retriesConfigured}`,
    `  evidence: ${item.evidence.baseline} | ${item.evidence.candidate}`,
    `  baseline output: ${formatOutput(item.baseline.output)}`,
    `  candidate output: ${formatOutput(item.candidate.output)}`,
  ];
  const failures = item.outcome === "fixed" ? item.baseline.failures : item.candidate.failures;
  for (const failure of failures) {
    lines.push(
      `  field ${failure.field} ${failure.assertion}: expected ${failure.expected}; actual ${failure.actual}`,
    );
  }
  if (item.outcome === "newly_failing") {
    for (const failure of item.baseline.failures) {
      lines.push(
        `  baseline field ${failure.field} ${failure.assertion}: expected ${failure.expected}; actual ${failure.actual}`,
      );
    }
  }
  return lines.join("\n");
}

export function renderHtml(summary: string): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>ModelShift gate</title>",
    "</head>",
    "<body>",
    "<pre>",
    escapeHtml(summary),
    "</pre>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function formatOutput(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  const text = JSON.stringify(value);
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function assertOutputDir(outDir: string | undefined): string {
  if (!outDir || outDir.includes("\0")) {
    throw new GateError(2, "invalid_config", ["compare requires --out <directory>"]);
  }
  return outDir;
}
