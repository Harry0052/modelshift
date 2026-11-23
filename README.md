# ModelShift

ModelShift compares a candidate model with a pinned baseline and blocks a release when a critical workflow contract regresses. Recorded outputs are the default. The tool does not call a model provider and does not need credentials.

Money in the sample suite is integer cents. Case counts are exact. A timeout or a missing recording is insufficient evidence, not a behavior regression.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer

## Install

```bash
npm ci
npm run build
```

## Demo

From a checkout, one command runs the seeded candidate, the corrected candidate, and the invalid manifest:

```bash
npm run demo
```

The seeded candidate must block. Its report is written to `reports/candidate-bad/`:

| File | What it is |
| --- | --- |
| `gate.json` | Deterministic machine-readable decision |
| `summary.txt` | Human summary, newly failing cases first |
| `gate.html` | The same summary with model text escaped |
| `ci.txt` | One-line CI summary |

Expected decision: `block`, exit code 1, one critical regression. The broken field is `order_id` on `order-desk/order-extract`. The candidate value is `1042`. The contract is `^ORD-[0-9]{4}$`. The noncritical refund case is `fixed`, the address case is `continuously_failing`, and the invoice case is a timeout after 2 attempts with retries configured at 1.

Trace that finding:

1. Open `reports/candidate-bad/summary.txt` and read the `newly failing` section.
2. Note `evidence: recordings/baseline/order-extract.json | recordings/candidate-bad/order-extract.json`.
3. Open those files under `fixtures/valid/`. The baseline output is `ORD-1042`. The candidate output is `1042`.
4. The hand calculation is in `fixtures/oracle/calculations.md`: 2 widgets × 950 cents = 1900 cents, which both sides still match.

The corrected candidate writes `reports/candidate-clean/gate.json` with decision `pass` and exit code 0.

Machine output stays on stdout. The report path is on stderr. For JSON only:

```bash
node dist/cli.js compare --manifest fixtures/valid/suite.manifest.json --out reports/candidate-bad --format json
```

## Invalid input

A manifest that omits the baseline version, uses a severity the schema does not allow, and has no assertions is rejected before a gate decision. Exit code 2:

```bash
node dist/cli.js compare --manifest fixtures/invalid/suite.manifest.json --out reports/invalid
```

The stderr lines start with `invalid_config:` and name the broken fields. Fix the manifest and run `compare` again. Exit code 3 means the baseline is quarantined or critical evidence is missing; that is also not a behavior regression.

## Commands

```bash
node dist/cli.js --help
node dist/cli.js validate --manifest fixtures/valid/suite.manifest.json
node dist/cli.js compare --manifest fixtures/valid/suite.manifest.json --out reports/candidate-bad
node dist/cli.js compare --manifest fixtures/valid/suite.manifest.json --candidate-dir recordings/candidate-clean --out reports/candidate-clean
node dist/cli.js run --provider local --manifest fixtures/valid/suite.manifest.json --provider-table local-provider.json --out reports/local
```

| Exit code | Meaning |
| --- | --- |
| 0 | Gate passed, or `validate` accepted the suite |
| 1 | Gate blocked on a new critical regression |
| 2 | Invalid configuration |
| 3 | Insufficient evidence or a quarantined baseline |

## Fixtures

The sample cases are original and hand-authored. Terms and checksums are in `fixtures/FIXTURE-MANIFEST.json`. Nothing is downloaded at runtime.

## License

MIT. See [LICENSE](LICENSE).
