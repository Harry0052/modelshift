# Contributing

ModelShift is an offline release gate. Changes should keep the sample suite runnable with `npm ci` and `npm run demo` on Node.js 22, without a paid service or a network call during the gate.

## Setup

```bash
npm ci
npm test
npm run demo
```

`npm test` builds the TypeScript and runs Vitest. `npm run format:check` checks the Prettier layout used by CI.

## Fixtures

Sample cases are original and hand-authored. Do not add production prompts, provider credentials, personal data, or third-party datasets. If you change an input, update its `inputSha256` and `fixtures/FIXTURE-MANIFEST.json`. The expected gate result is explained in `fixtures/oracle/calculations.md`.

## Commits

Use a conventional commit prefix such as `feat`, `fix`, `test`, `docs`, or `chore`. Do not commit `node_modules/`, `dist/`, or generated `reports/`.
