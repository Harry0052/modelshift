import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/canonical.js";
import { compareSuite } from "../src/evaluate.js";

const cli = path.resolve("dist/cli.js");
const manifest = path.resolve("fixtures/valid/suite.manifest.json");

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, stdout: failure.stdout, stderr: failure.stderr };
  }
}

describe("boundaries", () => {
  it("rejects an oversized input before comparing behavior", () => {
    const dir = copySuite();
    const relative = "inputs/order-extract.json";
    writeFileSync(path.join(dir, relative), `${"x".repeat(70_000)}\n`);
    const result = runCli([
      "compare",
      "--manifest",
      path.join(dir, "suite.manifest.json"),
      "--out",
      path.join(dir, "out"),
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/exceeds 65536/);
    expect(result.stdout).not.toContain("newly_failing");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects JSON deeper than 8", () => {
    const dir = copySuite();
    let value: unknown = { leaf: true };
    for (let depth = 0; depth < 9; depth += 1) value = { nested: value };
    const relative = "inputs/order-extract.json";
    const body = `${JSON.stringify(value)}\n`;
    writeFileSync(path.join(dir, relative), body);
    patchHash(dir, "order-extract", sha256(body));
    const result = runCli([
      "compare",
      "--manifest",
      path.join(dir, "suite.manifest.json"),
      "--out",
      path.join(dir, "out"),
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/JSON depth/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a path that escapes the suite", () => {
    const dir = copySuite();
    const manifestPath = path.join(dir, "suite.manifest.json");
    const document = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      cases: Array<{ caseId: string; input: string }>;
    };
    const order = document.cases.find((item) => item.caseId === "order-extract");
    if (!order) throw new Error("missing case");
    order.input = "../../etc/passwd";
    writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
    const result = runCli(["compare", "--manifest", manifestPath, "--out", path.join(dir, "out")]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/escapes the suite directory/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to follow a symlinked recording", () => {
    const dir = copySuite();
    const recording = path.join(dir, "recordings/candidate-bad/order-extract.json");
    const outside = path.join(dir, "outside.json");
    writeFileSync(outside, readFileSync(recording));
    rmSync(recording);
    symlinkSync(outside, recording);
    const result = runCli([
      "compare",
      "--manifest",
      path.join(dir, "suite.manifest.json"),
      "--out",
      path.join(dir, "out"),
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/refusing to follow symlink/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes only the report files into the output directory", () => {
    const out = mkdtempSync(path.join(tmpdir(), "modelshift-out-"));
    const result = runCli(["compare", "--manifest", manifest, "--out", out]);
    expect(result.status).toBe(1);
    expect(readdirSync(out).sort()).toEqual(["ci.txt", "gate.html", "gate.json", "summary.txt"]);
    rmSync(out, { recursive: true, force: true });
  });

  it("compares the frozen suite inside the one-second budget", () => {
    const start = performance.now();
    const report = compareSuite(manifest);
    const elapsed = performance.now() - start;
    expect(report.decision).toBe("block");
    expect(elapsed).toBeLessThan(1000);
  });
});

function copySuite(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "modelshift-boundary-"));
  cpSync(path.resolve("fixtures/valid"), dir, { recursive: true });
  mkdirSync(path.join(dir, "out"), { recursive: true });
  return dir;
}

function patchHash(dir: string, caseId: string, hash: string): void {
  const manifestPath = path.join(dir, "suite.manifest.json");
  const document = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    cases: Array<{ caseId: string; inputSha256: string }>;
  };
  const item = document.cases.find((entry) => entry.caseId === caseId);
  if (!item) throw new Error(`missing ${caseId}`);
  item.inputSha256 = hash;
  writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`);
}
