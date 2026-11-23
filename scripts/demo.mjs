import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const node = process.execPath;
const cli = path.resolve("dist/cli.js");
const manifest = path.resolve("fixtures/valid/suite.manifest.json");
const invalidManifest = path.resolve("fixtures/invalid/suite.manifest.json");

const blocked = path.resolve("reports/candidate-bad");
const clean = path.resolve("reports/candidate-clean");
const malformed = mkdtempSync(path.join(tmpdir(), "modelshift-malformed-"));

const blockedRun = run(cli, ["compare", "--manifest", manifest, "--out", blocked]);
assert(blockedRun.status === 1, `blocked candidate should exit 1, got ${blockedRun.status}`);
assert(blockedRun.stdout.includes("decision: block"), "blocked summary missing decision");
assert(
  blockedRun.stdout.includes("field order_id pattern"),
  "blocked summary missing order_id field",
);
assert(blockedRun.stderr.startsWith("report:"), "report path should stay on stderr");
const blockedReport = JSON.parse(readFileSync(path.join(blocked, "gate.json"), "utf8"));
assert(blockedReport.criticalRegressions.length === 1, "expected one critical regression");
assert(blockedReport.criticalRegressions[0].fields.includes("order_id"), "expected order_id");
assert(
  readFileSync(path.join(blocked, "ci.txt"), "utf8").includes("decision=block"),
  "missing CI summary",
);
assert(
  readFileSync(path.join(blocked, "gate.html"), "utf8").includes("&lt;script&gt;"),
  "HTML export did not escape model text",
);

const cleanRun = run(cli, [
  "compare",
  "--manifest",
  manifest,
  "--candidate-dir",
  "recordings/candidate-clean",
  "--out",
  clean,
]);
assert(cleanRun.status === 0, `clean candidate should exit 0, got ${cleanRun.status}`);
assert(cleanRun.stdout.includes("decision: pass"), "clean summary missing decision");

const malformedRun = run(cli, ["compare", "--manifest", invalidManifest, "--out", malformed]);
assert(malformedRun.status === 2, `invalid manifest should exit 2, got ${malformedRun.status}`);
assert(
  malformedRun.stderr.includes("invalid_config:"),
  "invalid manifest should explain the configuration error",
);
assert(
  malformedRun.stderr.includes("baselineVersion"),
  "invalid manifest should name the missing field",
);
assert(
  !malformedRun.stdout.includes("decision:"),
  "invalid manifest should not print a gate decision",
);

console.log(`blocked report: ${path.join(blocked, "gate.json")}`);
console.log(`clean report: ${path.join(clean, "gate.json")}`);
console.log("demo: pass");
rmSync(malformed, { recursive: true, force: true });

function run(command, args) {
  const result = spawnSync(node, [command, ...args], { encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
