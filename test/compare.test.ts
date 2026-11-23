import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareSuite } from "../src/evaluate.js";

const manifest = path.resolve("fixtures/valid/suite.manifest.json");
const cli = path.resolve("dist/cli.js");

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, stdout: failure.stdout, stderr: failure.stderr };
  }
}

describe("recorded suite gate", () => {
  it("blocks the seeded critical order-id regression and labels the other pairs", () => {
    const report = compareSuite(manifest);
    expect(report.decision).toBe("block");
    expect(report.exitCode).toBe(1);
    expect(report.criticalRegressions).toEqual([
      { workflowId: "order-desk", caseId: "order-extract", fields: ["order_id"] },
    ]);
    expect(report.counts).toEqual({
      passing: 4,
      newlyFailing: 1,
      fixed: 1,
      continuouslyFailing: 1,
      inconclusive: 1,
      quarantined: 0,
    });
    const byId = Object.fromEntries(report.cases.map((item) => [item.caseId, item]));
    expect(byId["order-extract"]?.outcome).toBe("newly_failing");
    expect(byId["order-note-format"]?.outcome).toBe("passing");
    expect(byId["refund-reason"]?.outcome).toBe("fixed");
    expect(byId["address-normalize"]?.outcome).toBe("continuously_failing");
    expect(byId["invoice-status"]?.outcome).toBe("inconclusive");
    expect(byId["invoice-status"]?.reason).toBe("candidate timeout after 2 attempts; retries configured 1");
    expect(byId["tax-total"]?.outcome).toBe("passing");
    expect(JSON.stringify(report)).not.toContain("ada@example.com");
    expect(JSON.stringify(report)).toContain("[redacted]");
  });

  it("passes the corrected candidate with full critical coverage", () => {
    const report = compareSuite(manifest, { candidateDir: "recordings/candidate-clean" });
    expect(report.decision).toBe("pass");
    expect(report.exitCode).toBe(0);
    expect(report.criticalRegressions).toEqual([]);
    const critical = report.cases.filter((item) => item.severity === "critical");
    expect(critical).toHaveLength(2);
    expect(critical.every((item) => item.outcome === "passing")).toBe(true);
    expect(report.cases.find((item) => item.caseId === "refund-reason")?.outcome).toBe("fixed");
    expect(report.cases.find((item) => item.caseId === "address-normalize")?.outcome).toBe("continuously_failing");
  });

  it("repeats the same gate bytes", () => {
    const first = JSON.stringify(compareSuite(manifest));
    const second = JSON.stringify(compareSuite(manifest));
    expect(first).toBe(second);
  });
});

describe("local provider", () => {
  it("compares baseline recordings with the explicit local table", () => {
    const out = mkdtempSync(path.join(tmpdir(), "modelshift-local-"));
    const result = runCli([
      "run",
      "--provider",
      "local",
      "--manifest",
      manifest,
      "--provider-table",
      "local-provider.json",
      "--out",
      out,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("decision: pass");
    rmSync(out, { recursive: true, force: true });
  });
});

describe("compare CLI", () => {
  it("writes a traceable report for the blocked candidate", () => {
    const out = mkdtempSync(path.join(tmpdir(), "modelshift-gate-"));
    const result = runCli(["compare", "--manifest", manifest, "--out", out]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("decision: block");
    expect(result.stdout).toContain("field order_id pattern");
    expect(result.stderr).toContain("report:");
    const report = JSON.parse(readFileSync(path.join(out, "gate.json"), "utf8")) as { decision: string };
    expect(report.decision).toBe("block");
    const html = readFileSync(path.join(out, "gate.html"), "utf8");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(existsSync("/tmp/modelshift-pwned")).toBe(false);
    rmSync(out, { recursive: true, force: true });
  });

  it("passes the clean candidate from the public entry point", () => {
    const out = mkdtempSync(path.join(tmpdir(), "modelshift-clean-"));
    const result = runCli([
      "compare",
      "--manifest",
      manifest,
      "--candidate-dir",
      "recordings/candidate-clean",
      "--out",
      out,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("decision: pass");
    rmSync(out, { recursive: true, force: true });
  });
});

describe("quarantine and evidence", () => {
  it("quarantines a changed input instead of calling it a regression", () => {
    const dir = copySuite();
    const input = path.join(dir, "inputs/order-extract.json");
    writeFileSync(input, readFileSync(input, "utf8").replace("2 widgets", "3 widgets"));
    const out = path.join(dir, "out");
    const result = runCli(["compare", "--manifest", path.join(dir, "suite.manifest.json"), "--out", out]);
    expect(result.status).toBe(3);
    const report = JSON.parse(readFileSync(path.join(out, "gate.json"), "utf8")) as {
      decision: string;
      criticalRegressions: unknown[];
      reasons: string[];
    };
    expect(report.decision).toBe("quarantined");
    expect(report.criticalRegressions).toEqual([]);
    expect(report.reasons.join("\n")).toMatch(/input hash mismatch/);
    expect(JSON.stringify(report)).not.toContain("newly_failing");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects an output schema that uses a remote ref", () => {
    const dir = copySuite();
    writeFileSync(path.join(dir, "schemas/order.schema.json"), '{"$ref":"https://example.invalid/order"}\n');
    const out = path.join(dir, "out");
    const result = runCli(["compare", "--manifest", path.join(dir, "suite.manifest.json"), "--out", out]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/must not use \$ref/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps a flaky attempt set out of the regression count", () => {
    const dir = copySuite();
    const recordingPath = path.join(dir, "recordings/candidate-clean/order-extract.json");
    const recording = JSON.parse(readFileSync(recordingPath, "utf8")) as {
      output: Record<string, unknown>;
      attempts: unknown[];
    };
    const failing = { ...recording.output, order_id: "1042" };
    recording.attempts = [
      { attempt: 1, status: "completed", output: recording.output },
      { attempt: 2, status: "completed", output: failing },
    ];
    writeFileSync(recordingPath, `${JSON.stringify(recording, null, 2)}\n`);
    const out = path.join(dir, "out");
    const result = runCli([
      "compare",
      "--manifest",
      path.join(dir, "suite.manifest.json"),
      "--candidate-dir",
      "recordings/candidate-clean",
      "--out",
      out,
    ]);
    expect(result.status).toBe(3);
    const report = JSON.parse(readFileSync(path.join(out, "gate.json"), "utf8")) as {
      criticalRegressions: unknown[];
      cases: Array<{ caseId: string; outcome: string; flaky: boolean; candidate: { attempts: unknown[] } }>;
    };
    const order = report.cases.find((item) => item.caseId === "order-extract");
    expect(order).toMatchObject({ outcome: "inconclusive", flaky: true });
    expect(order?.candidate.attempts).toHaveLength(2);
    expect(report.criticalRegressions).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports incomplete critical coverage as insufficient evidence", () => {
    const dir = copySuite();
    rmSync(path.join(dir, "recordings/candidate-clean/tax-total.json"));
    const out = path.join(dir, "out");
    const result = runCli([
      "compare",
      "--manifest",
      path.join(dir, "suite.manifest.json"),
      "--candidate-dir",
      "recordings/candidate-clean",
      "--out",
      out,
    ]);
    expect(result.status).toBe(3);
    const report = JSON.parse(readFileSync(path.join(out, "gate.json"), "utf8")) as {
      decision: string;
      criticalRegressions: unknown[];
      cases: Array<{ caseId: string; outcome: string; reason: string }>;
    };
    expect(report.decision).toBe("insufficient_evidence");
    expect(report.criticalRegressions).toEqual([]);
    expect(report.cases.find((item) => item.caseId === "tax-total")).toMatchObject({
      outcome: "inconclusive",
      reason: "candidate recording is missing",
    });
    rmSync(dir, { recursive: true, force: true });
  });
});

function copySuite(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "modelshift-suite-"));
  cpSync(path.resolve("fixtures/valid"), dir, { recursive: true });
  mkdirSync(path.join(dir, "out"), { recursive: true });
  return dir;
}
