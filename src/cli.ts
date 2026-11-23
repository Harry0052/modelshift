#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { compareSuite, evaluateSuite, type GateReport } from "./evaluate.js";
import { formatGateError, GateError } from "./errors.js";
import { loadSuite } from "./load.js";
import { applyLocalProvider } from "./local-provider.js";
import { assertOutputDir, renderSummary, writeReport } from "./report.js";
import { validateSuite } from "./validate.js";

type Options = {
  help: boolean;
  manifest?: string;
  candidateDir?: string;
  out?: string;
  provider?: string;
  providerTable?: string;
  format: "text" | "json";
};

function main(argv: string[]): number {
  let parsed: { command: string | undefined; options: Options };
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(`invalid_config: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Run modelshift --help");
    return 2;
  }
  if (parsed.options.help || !parsed.command || parsed.command === "help") {
    console.log(helpText());
    return 0;
  }
  if (!parsed.options.manifest) {
    console.error(`invalid_config: ${parsed.command} requires --manifest <file>`);
    return 2;
  }
  try {
    if (parsed.command === "validate") return runValidate(parsed.options);
    if (parsed.command === "compare") return runCompare(parsed.options);
    if (parsed.command === "run") return runLocal(parsed.options);
    console.error(`invalid_config: unknown command ${parsed.command}`);
    console.error(helpText());
    return 2;
  } catch (error) {
    if (error instanceof GateError) {
      console.error(formatGateError(error));
      return error.exitCode;
    }
    console.error(`invalid_config: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

function runValidate(options: Options): number {
  const report = validateSuite(options.manifest ?? "", { candidateDir: options.candidateDir });
  if (options.format === "json") console.log(JSON.stringify(report));
  else {
    console.log(`valid suite ${report.suiteId}`);
    console.log(`cases: ${report.caseCount}`);
    console.log(`baseline: ${report.baselineVersion}`);
    console.log(`candidate: ${report.candidateVersion}`);
    console.log(`retries: ${report.retries}`);
  }
  return 0;
}

function runCompare(options: Options): number {
  const outDir = assertOutputDir(options.out);
  const report = compareSuite(options.manifest ?? "", { candidateDir: options.candidateDir });
  const written = writeReport(report, outDir);
  emitReport(options, report, written.jsonPath);
  return report.exitCode;
}

function runLocal(options: Options): number {
  if (options.provider !== "local") {
    throw new GateError(2, "invalid_config", ["run requires --provider local"]);
  }
  const outDir = assertOutputDir(options.out);
  const suite = loadSuite(options.manifest ?? "", { candidateDir: options.candidateDir });
  applyLocalProvider(suite, options.providerTable ?? "local-provider.json");
  const report = evaluateSuite(suite);
  const written = writeReport(report, outDir);
  emitReport(options, report, written.jsonPath);
  return report.exitCode;
}

function emitReport(options: Options, report: GateReport, jsonPath: string): void {
  if (options.format === "json") console.log(JSON.stringify(report));
  else console.log(renderSummary(report).trimEnd());
  console.error(`report: ${jsonPath}`);
}

function parseArgs(argv: string[]): { command: string | undefined; options: Options } {
  const args = argv.slice(2);
  const options: Options = { help: false, format: "text" };
  let command: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for --${key}`);
      }
      index += 1;
      if (key === "manifest") options.manifest = value;
      else if (key === "candidate-dir") options.candidateDir = value;
      else if (key === "out") options.out = value;
      else if (key === "provider") options.provider = value;
      else if (key === "provider-table") options.providerTable = value;
      else if (key === "format") {
        if (value !== "text" && value !== "json") {
          throw new Error("--format must be text or json");
        }
        options.format = value;
      } else {
        throw new Error(`unknown option --${key}`);
      }
      continue;
    }
    if (command) {
      throw new Error(`unexpected argument ${token}`);
    }
    command = token;
  }
  return { command, options };
}

function helpText(): string {
  return [
    "modelshift — offline release gate for model workflow contracts",
    "",
    "Usage:",
    "  modelshift validate --manifest <file> [--candidate-dir <dir>] [--format text|json]",
    "  modelshift compare --manifest <file> --out <dir> [--candidate-dir <dir>] [--format text|json]",
    "  modelshift run --provider local --manifest <file> --out <dir> [--provider-table <file>]",
    "  modelshift --help",
    "",
    "Exit codes:",
    "  0  release gate passed, or the suite fixture is valid",
    "  1  release gate blocked on a critical regression",
    "  2  invalid configuration",
    "  3  insufficient evidence or quarantined baseline",
  ].join("\n");
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = main(process.argv);
}
