# Project contract

Decision source: `docs/overlap.md` (proceed, 2026-11-23).

## User and task

A maintainer who ships a product on a language model wants a release gate for workflows customers already rely on. They compare a candidate model version with a pinned baseline on a frozen suite of workflow cases. The gate reads recorded outputs, or an explicit local test provider, and returns a reviewable decision with per-case evidence.

The task is not chatbot ranking, agent replay, fuzzy grading, prompt optimization, or a production rollout.

## MVP behavior

- Match records on workflow id, case id, and a configuration hash of the input, schema, assertions, severity, versions, and redaction list.
- Validate response shape, then apply exact-field assertions (equality, enums, patterns, lengths).
- Label each eligible pair `passing`, `newly_failing`, `fixed`, or `continuously_failing`.
- Label timeouts, missing recordings, version mismatches, flaky attempt sets, and quarantined baselines as `inconclusive` or `quarantined`, never as a new behavior regression.
- Block when an eligible critical pair is `newly_failing`.
- Require conclusive evidence for every critical case. Incomplete critical coverage quarantines the run.
- Keep a fixed or continuously failing case out of the new-regression count.
- Show the configured retry count and the observed attempts for a timeout.
- Redact configured paths before writing a report. Escape model text in the HTML export. Do not pass model text to a shell.

## Minimum dependencies

- Runtime: Node.js 22.
- Language: TypeScript.
- Schema checks: Ajv.
- Tests: Vitest.
- No paid API, no network fetch at gate runtime, and no model provider SDK.

Original hand-written fixtures live in the repository. Their terms are recorded in `fixtures/FIXTURE-MANIFEST.json`. Generation seed: none. Method: hand-authored from the calculations in `fixtures/oracle/`.

## Measurable acceptance case

Suite: eight workflow cases with clean baseline recordings.

Candidate A (seeded):

- Critical `order-extract` changes `ORD-1042` to `1042` while `total_cents` stays 1900.
- Noncritical `refund-reason` changes from a failing enum to an allowed enum (the noncritical total improves).
- `invoice-status` is a timeout with the configured retries exhausted.
- `address-normalize` keeps the same failing region.
- `order-note-format` changes only spacing in an unconstrained note.

Required result, identical on a repeat run:

- Decision `block`, exit code 1.
- Exactly one critical regression: `order-desk` / `order-extract`, field `order_id`.
- `refund-reason` is `fixed` and is not a new regression.
- `address-normalize` is `continuously_failing` and is not a new regression.
- `invoice-status` is a timeout, not a behavior regression, and the report shows the configured retry count.
- Candidate B, the same suite with `ORD-1042` restored and the invoice recording completed, is `pass` with both critical cases covered.

Units are integer cents and dimensionless counts. Numeric comparisons are exact. There is no approximate tolerance.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Gate passed |
| 1 | Gate blocked on an eligible critical regression |
| 2 | Invalid configuration |
| 3 | Insufficient evidence, including a quarantined baseline |

## Out of scope

Tool execution, live markup execution, fuzzy scores, prompt search, hosted dashboards, and automatic production rollout.
