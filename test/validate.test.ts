import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GateError } from "../src/errors.js";
import { isSafePattern } from "../src/paths.js";
import { validateSuite } from "../src/validate.js";

const manifest = path.resolve("fixtures/valid/suite.manifest.json");
const invalidManifest = path.resolve("fixtures/invalid/suite.manifest.json");

describe("validateSuite", () => {
  it("accepts the eight-case recorded suite", () => {
    const report = validateSuite(manifest);
    expect(report.ok).toBe(true);
    expect(report.suiteId).toBe("order-desk-release");
    expect(report.caseCount).toBe(8);
    expect(report.retries).toBe(1);
    expect(report.cases.map((item) => item.caseId)).toEqual([
      "order-extract",
      "order-note-format",
      "invoice-status",
      "address-normalize",
      "refund-reason",
      "shipment-window",
      "tax-total",
      "support-reply",
    ]);
    expect(new Set(report.cases.map((item) => item.configHash)).size).toBe(8);
  });

  it("accepts the clean candidate directory", () => {
    const report = validateSuite(manifest, { candidateDir: "recordings/candidate-clean" });
    expect(report.caseCount).toBe(8);
    expect(report.candidateVersion).toBe("recorded-candidate-1.1.0");
  });

  it("rejects the invalid manifest with an actionable error", () => {
    expect.assertions(3);
    try {
      validateSuite(invalidManifest);
    } catch (error) {
      expect(error).toBeInstanceOf(GateError);
      const gate = error as GateError;
      expect(gate.exitCode).toBe(2);
      expect(gate.details.join("\n")).toMatch(/baselineVersion|severity|assertions/);
    }
  });
});

describe("assertion patterns", () => {
  it("allows the anchored fixture patterns and rejects executable expressions", () => {
    expect(isSafePattern("^ORD-[0-9]{4}$")).toBe(true);
    expect(isSafePattern("^INV-[0-9]{1,6}$")).toBe(true);
    expect(isSafePattern("process.exit(1)")).toBe(false);
    expect(isSafePattern("^(a+)+$")).toBe(false);
  });
});

describe("modelshift validate CLI", () => {
  const cli = path.resolve("dist/cli.js");

  it("prints a valid suite from the public entry point", () => {
    const stdout = execFileSync(process.execPath, [cli, "validate", "--manifest", manifest], {
      encoding: "utf8",
    });
    expect(stdout).toContain("valid suite order-desk-release");
    expect(stdout).toContain("cases: 8");
    expect(stdout).toContain("retries: 1");
  });

  it("rejects the invalid fixture on stderr and exits 2", () => {
    let stderr = "";
    let status = 0;
    try {
      execFileSync(process.execPath, [cli, "validate", "--manifest", invalidManifest], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const failure = error as { status: number; stderr: string };
      status = failure.status;
      stderr = failure.stderr;
    }
    expect(status).toBe(2);
    expect(stderr).toMatch(/invalid_config:/);
    expect(stderr).toMatch(/baselineVersion|severity/);
  });
});
