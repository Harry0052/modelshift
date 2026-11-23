# Validation

Access date: 2026-11-23. The checks below use the hand-authored suite in `fixtures/valid`. It is a synthetic fixture, not a production log and not an external dataset. Money is integer cents. Equality is exact. There is no numeric tolerance.

## Environment

| Item | Observed |
| --- | --- |
| OS | Linux 6.12.113+ |
| CPU | 4 vCPU, Intel Xeon |
| Node.js | v22.23.4 |
| npm audit | 0 vulnerabilities |
| Fixture tree | 44 files, 28,546 bytes |
| Blocked report | `reports/candidate-bad/gate.json`, 14,900 bytes |

Direct dependency licenses: Ajv 8.20.0 MIT, TypeScript 5.9.3 Apache-2.0, Vitest 5.1.1 MIT, Prettier 3.10.1 MIT, `@types/node` 22.19.7 MIT.

## Acceptance evidence

| Assertion | Observed result |
| --- | --- |
| A critical case flips to fail while a noncritical case improves | `compare` on `recordings/candidate-bad` exits 1 with decision `block`. `order-extract` is `newly_failing` on `order_id`. `refund-reason` is `fixed`. Counts: passing 4, newly failing 1, fixed 1, continuously failing 1, inconclusive 1. |
| A fixed or unchanged failure is not a new regression | `refund-reason` is `fixed`. `address-normalize` is `continuously_failing`. `criticalRegressions` contains only `order-desk/order-extract`. |
| Changed inputs, an invalid schema, or incomplete critical coverage quarantine the baseline | A changed `order-extract` input exits 3 with decision `quarantined` and no `newly_failing` label. An output schema that uses `$ref` exits 2 with `invalid_config`. Deleting the clean `tax-total` recording exits 3 with decision `insufficient_evidence` and reason `candidate recording is missing`. |
| A timeout stays separate from a behavior regression and shows the retry count | `invoice-status` is `inconclusive`. Reason: `candidate timeout after 2 attempts; retries configured 1`. It is not in `criticalRegressions`. |
| Generated text cannot run a command or become live markup | The support recording contains `<script>alert(1)</script>` and `touch /tmp/modelshift-pwned`. `gate.html` contains `&lt;script&gt;` and no `<script` tag. `/tmp/modelshift-pwned` was absent after the run. The report redacts `customer.email` to `[redacted]`. |
| The frozen suite detects the seeded critical change, permits the clean candidate, and reports missing evidence as its own outcome, including on a repeat | Bad candidate blocks. Clean candidate exits 0 with decision `pass` and both critical cases `passing`. The missing critical recording is `insufficient_evidence`. Two writes of `gate.json` were byte-identical (`cmp` exit 0). |

`npm test` passed 23 tests. `npm run typecheck` passed. `npm run format:check` passed. `npm run demo` passed and wrote `reports/candidate-bad/` and `reports/candidate-clean/`.

## Performance

Budget: the in-process compare of the eight-case suite must finish in under 1,000 ms. The suite is 28 KB of local JSON and does no network or model work, so a second is a wide ceiling for a developer machine, not a throughput target.

Five in-process samples on this host took 33.16, 13.58, 12.69, 11.43, and 10.79 ms. The unit test `compares the frozen suite inside the one-second budget` also passed. A full CLI process, including startup, took 120.4 ms wall time and exited 1.

## Trust boundaries

- Suite paths must stay inside the manifest directory. `../` is rejected.
- Symbolic links are refused before their target is read.
- Inputs larger than 65,536 bytes, JSON deeper than 8, and strings longer than 4,000 characters are invalid configuration.
- Assertion patterns are a short anchored literal subset. Model text is never compiled as code or passed to a shell. `src/` does not import `child_process`.
- Reports are written only as `gate.json`, `summary.txt`, `gate.html`, and `ci.txt` in the requested output directory.
- Configured redaction paths are applied before the report is written.
- HTML export escapes `&`, `<`, `>`, quotes.
- `npm audit` reported no vulnerabilities for the locked tree.

## Fixes made while validating

Following a symlink inside a suite could have read a file outside the manifest directory. Recording reads now reject symlinks, and `test/boundaries.test.ts` covers that case along with oversized input, excess depth, path escape, and the output-file allowlist.

## Residual limitations

- The shipped path does not call a hosted or local language model. `run --provider local` replays a JSON table.
- The pattern language is intentionally smaller than JavaScript regular expressions.
- The performance numbers are one measurement on this virtual machine, not a calibrated benchmark.
- A hash or version mismatch quarantines the whole suite instead of grading the remaining cases. That is deliberate: the baseline is not eligible.
