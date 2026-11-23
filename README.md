# ModelShift

ModelShift compares a candidate model with a pinned baseline and blocks a release when a critical workflow contract regresses. The default path reads recorded outputs. It does not call a model provider and does not need credentials.

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer

## Install and test

```bash
npm ci
npm test
```

`npm test` compiles TypeScript and runs the Vitest suite. Check the bundled fixture without the test runner:

```bash
npm run validate
```

Expected output:

```text
valid suite order-desk-release
cases: 8
baseline: recorded-baseline-1.0.0
candidate: recorded-candidate-1.1.0
retries: 1
```

Compare the pinned baseline with the seeded candidate. The command writes `gate.json`, `summary.txt`, and `gate.html` and exits 1 because the critical order id regressed:

```bash
npm run build
node dist/cli.js compare --manifest fixtures/valid/suite.manifest.json --out reports/candidate-bad
```

The corrected candidate passes and exits 0:

```bash
node dist/cli.js compare --manifest fixtures/valid/suite.manifest.json --candidate-dir recordings/candidate-clean --out reports/candidate-clean
```

An optional local provider replays the clean outputs without a network call:

```bash
node dist/cli.js run --provider local --manifest fixtures/valid/suite.manifest.json --provider-table local-provider.json --out reports/local
```

The invalid fixture is rejected with an actionable configuration error and exit code 2:

```bash
npm run validate:invalid
```

## Fixtures

The eight workflow cases, both candidate recordings, and the hand-calculated oracle live under `fixtures/`. Terms, checksums, and the authoring method are in `fixtures/FIXTURE-MANIFEST.json`. The gate does not fetch remote data.

## License

MIT. See [LICENSE](LICENSE).
