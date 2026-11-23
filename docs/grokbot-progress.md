# Grokbot progress

## P05 — Verify correctness, security, and performance

- **Phase and status:** P05 PASS
- **Files changed:** `docs/validation.md`, `src/load.ts`, `test/boundaries.test.ts`, `package.json`, `package-lock.json`, `.prettierrc.json`, formatted `src/`, `test/`, and `scripts/`
- **Commands and results:**
  - `npm test` → 23 tests passed, including oversized input, depth, path escape, symlink refusal, report allowlist, timeout labeling, quarantine, and the one-second compare budget.
  - `npm run typecheck` → pass. `npm run format:check` → pass. `npm audit` → 0 vulnerabilities.
  - `npm run demo` → pass. Two blocked `gate.json` files were byte-identical. CLI wall time 120.4 ms. In-process samples: 33.16, 13.58, 12.69, 11.43, 10.79 ms. Budget is 1,000 ms.
  - `/tmp/modelshift-pwned` was not created. Direct licenses: Ajv MIT, TypeScript Apache-2.0, Vitest MIT, Prettier MIT.
- **Artifact paths:** `docs/validation.md`, `reports/candidate-bad/gate.json`, `reports/candidate-clean/gate.json`
- **Open issues:** GitHub Actions is defined in P06 and verified on the hosted run in P07. The performance figure is one virtual machine, not a calibrated benchmark.
- **Next phase:** P06 — prepare a reproducible open-source release.

## P04 — Ship the user workflow and reports

- **Phase and status:** P04 PASS
- **Files changed:** `README.md`, `package.json`, `scripts/demo.mjs`, `src/evaluate.ts`, `src/report.ts`, `test/compare.test.ts`
- **Commands and results:**
  - `npm test` → 17 tests passed.
  - `npm run demo` → exit 0. Blocked report `reports/candidate-bad/gate.json` (decision `block`, order_id). Clean report `reports/candidate-clean/gate.json` (decision `pass`). HTML export contains `&lt;script&gt;`.
  - `node dist/cli.js compare --manifest fixtures/invalid/suite.manifest.json --out /tmp/modelshift-invalid-out` → exit 2. Stderr names missing `baselineVersion`, missing `inputSha256`, rejected severity, and empty assertions. No gate decision on stdout.
  - `node dist/cli.js --help` lists validate, compare, run, and exit codes 0, 1, 2, and 3.
  - `--format json` keeps the JSON document on stdout and the `report:` path on stderr.
- **Artifact paths:** `reports/candidate-bad/gate.json`, `reports/candidate-bad/summary.txt`, `reports/candidate-bad/gate.html`, `reports/candidate-bad/ci.txt`, `reports/candidate-clean/gate.json`
- **Open issues:** Formatter, performance budget, and the validation write-up are P05. Hosted CI is P07.
- **Next phase:** P05 — verify correctness, security, and performance.

## P03 — Build the working core

- **Phase and status:** P03 PASS
- **Files changed:** `src/assertions.ts`, `src/evaluate.ts`, `src/report.ts`, `src/redact.ts`, `src/local-provider.ts`, `src/version.ts`, `src/cli.ts`, `src/load.ts`, `src/index.ts`, `test/compare.test.ts`, `fixtures/valid/local-provider.json`, `fixtures/FIXTURE-MANIFEST.json`, `README.md`
- **Commands and results:**
  - `npm test` → 16 tests passed.
  - `node dist/cli.js compare --manifest fixtures/valid/suite.manifest.json --out reports/candidate-bad` → exit 1. Decision `block`. One critical regression, `order-desk/order-extract` field `order_id` (`1042` vs `^ORD-[0-9]{4}$`). Counts: passing 4, newly failing 1, fixed 1, continuously failing 1, inconclusive 1. Invoice timeout shows 2 attempts and retries configured 1. Refund is `fixed`. Address is `continuously_failing`. Note spacing stays `passing`.
  - `node dist/cli.js compare --manifest fixtures/valid/suite.manifest.json --candidate-dir recordings/candidate-clean --out reports/candidate-clean` → exit 0. Decision `pass`. Critical regressions 0. Both critical cases passing. Counts: passing 6, fixed 1, continuously failing 1.
  - A second compare of the blocked suite produced the same JSON bytes (covered by `repeats the same gate bytes`).
- **Artifact paths:** `reports/candidate-bad/gate.json`, `reports/candidate-bad/summary.txt`, `reports/candidate-bad/gate.html`, `reports/candidate-clean/gate.json`, `fixtures/oracle/calculations.md`
- **Open issues:** The README demo is present, and the user-facing recovery text and CI summary are still thin for P04.
- **Next phase:** P04 — ship the user workflow and reports.

## P02 — Create the repository and data contracts

- **Phase and status:** P02 PASS
- **Files changed:** `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `README.md`, `src/**`, `test/validate.test.ts`, `scripts/author-fixtures.mjs`, `fixtures/**`
- **Commands and results:**
  - `npm install` then `npm audit` → 0 vulnerabilities (Ajv 8.20.0, TypeScript 5.9.3, Vitest 5.1.1).
  - `npm test` → build succeeded, 6 tests passed.
  - `node dist/cli.js validate --manifest fixtures/valid/suite.manifest.json` → exit 0, `valid suite order-desk-release`, `cases: 8`, baseline `recorded-baseline-1.0.0`, candidate `recorded-candidate-1.1.0`, `retries: 1`.
  - Same command with `--candidate-dir recordings/candidate-clean` → exit 0, 8 cases.
  - `node dist/cli.js validate --manifest fixtures/invalid/suite.manifest.json` → exit 2. Stderr named the missing `baselineVersion`, the missing `inputSha256`, the rejected severity, and the empty assertions array.
- **Artifact paths:** `fixtures/valid/suite.manifest.json`, `fixtures/invalid/suite.manifest.json`, `fixtures/oracle/calculations.md`, `fixtures/FIXTURE-MANIFEST.json`
- **Open issues:** Compare and the release decision are not implemented yet. The oracle in `fixtures/oracle/calculations.md` is the hand calculation the core must match.
- **Next phase:** P03 — build the working core.

## P01 — Research overlap and confirm the MVP

- **Phase and status:** P01 PASS
- **Files changed:** `docs/overlap.md`, `docs/project-contract.md`, `docs/grokbot-progress.md`
- **Commands and results:**
  - `npm view promptfoo version license` → `0.126.0`, MIT, registry modified 2026-11-18.
  - GitHub commits: promptfoo `696d3ca44b81abfc37e9419c19dd98924845a256` (2026-11-23); openai/evals `8eac7a7de5215c907fbddc30efdaf316913eccdd` (2026-04-14); evalshift/evalshift-cli `59fe0b777a508b7373aeb0d05400bd58c8a0955c` (release 1.7.0).
  - PyPI `evalshift` → `1.7.0`. OpenAI Evals `pyproject.toml` version `3.0.1.post1`, code license MIT.
  - GitHub repository search `LLM evaluation regression baseline contract workflow gate` → 0 results.
  - Observed Promptfoo probe (`promptfoo@0.126.0 eval --no-cache` on an original three-case recorded provider): exit 100; successes 3, failures 2, errors 1; critical order id failed on the candidate only; noncritical note improved; invoice timeout counted as an error. No pair labels, field-level release decision, or distinct insufficient-evidence exit.
  - OpenAI Evals and EvalShift live compares were not run. Both documented paths need a model provider. Evidence is the Match source and EvalShift `migration_policy` docs.
- **Artifact paths:** `docs/overlap.md`, `docs/project-contract.md`. Probe workspace `/tmp/modelshift-p01-probe` (not committed; it contains a Promptfoo results file with a local share URL).
- **Open issues:** EvalShift may have an unreviewed local scoring command. It would not change the proceed decision, because the published compare path is statistical and provider-backed, and `--policy-gate` exits 0 on `inconclusive`.
- **Next phase:** P02 — create the repository foundation and data contracts.
