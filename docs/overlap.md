# Overlap review

Access date: 2026-11-23. ModelShift's acceptance case, held constant below, is:

> A frozen recorded suite must detect every seeded critical contract change, permit the clean candidate, and report missing evidence as a distinct outcome across repeat runs.

The shared fixture used for the probe is three original cases (no third-party dataset):

| Case | Contract | Baseline recording | Candidate recording |
| --- | --- | --- | --- |
| `order-extract` (critical) | `order_id` matches `^ORD-[0-9]{4}$`, `total_cents` is 1900, `currency` is `USD` | passes | `order_id` is `1042` |
| `shipping-note` (noncritical) | `note` contains `tracked` | `shipped` (fails) | `shipped and tracked` (passes) |
| `invoice-status` | JSON object with `status` and `total_cents` | passes | provider error `timeout after 1 attempt` |

Expected release artifact: one critical regression, the noncritical improvement labeled as fixed rather than a new regression, the timeout labeled as missing evidence rather than a behavior failure, and a failing gate. A second candidate with the order id corrected would pass.

## Capability matrix

| Capability | Promptfoo 0.126.0 | OpenAI Evals 3.0.1.post1 | EvalShift CLI 1.7.0 | ModelShift MVP |
| --- | --- | --- | --- | --- |
| Saved cases and deterministic checks | Yes. `is-json`, `javascript`, and other assertion types | Yes. `Match` compares a completion with `ideal` and reports accuracy | Yes. Structural, semantic, judge, and tool evaluators | Yes. Data-only exact, enum, pattern, and schema checks |
| Paired baseline and candidate on one case | Side-by-side providers in one table. No pair label | `Match` accepts one completion function | `compare` replays source and target models | Pair by workflow id, case id, and config hash |
| Critical field blocks even when other cases improve | A failing assertion fails the eval (exit 100). A test-level `threshold` can still pass a weighted score when one assertion fails | No. The summary is accuracy plus bootstrap std | `max_critical_regressions` defaults to 1, so one critical regression is inside budget. Rate budgets use a Wilson interval and can be `inconclusive` on a small suite | One eligible critical `newly_failing` pair blocks |
| Fixed and unchanged failures are not new regressions | No pair taxonomy. A still-failing case fails the eval again | No | Shared tool-conformance misses can be excluded from policy rates. Trace-rule breaches still count against the target even if the source broke them | `fixed` and `continuously_failing` labels, excluded from the new-regression count |
| Changed inputs, invalid schema, or incomplete critical coverage quarantine the baseline | Not a baseline-eligibility concept | Not described | Stale captures are a sync concern. A run still calls models | Quarantine. Do not call it a behavior regression |
| Timeout and retry count distinct from a behavior regression | Observed: timeout is `errors: 1`, separate from `failures: 2`, but the process still exits 100 | Not observed. Live completions required | Latency budgets and provider errors exist. Compare still needs a live call | `inconclusive` timeout with configured retries and observed attempts |
| Offline recorded outputs as the default | Possible with a custom provider. The product path is a live or scripted provider | Requires `OPENAI_API_KEY` for the documented path | Local files stay local, but `compare` calls a provider | Recorded files are the default. Optional local provider is explicit |
| Inert exported report | JavaScript assertions execute supplied code. Output rendering was not the probe target | Not checked | HTML report is a primary artifact and includes model text | Escape model text. Never pass it to a shell |
| Missing evidence exit distinct from a failed gate | Exit 100 for failures and errors. Exit 1 for other errors | Not a release-gate CLI | `--policy-gate` exits 0 on `inconclusive` | Exit 1 block, 2 invalid config, 3 insufficient evidence |

## Sources

### Promptfoo

- Primary URL: https://www.promptfoo.dev/docs/configuration/expected-outputs/
- Repository: https://github.com/promptfoo/promptfoo
- Package: `promptfoo@0.126.0` on npm (registry `time.modified` 2026-11-18). MIT. Repository HEAD observed at `696d3ca44b81abfc37e9419c19dd98924845a256` (2026-11-23), which is a dependency bump after the published package.
- Dataset terms: not applicable. The probe used an original fixture and a local provider.
- Feature evidence: assertion reference and CLI reference (documentation) plus the observed run below.
- Already matches: JSON schema checks, field assertions, multi-provider tables, a non-zero exit when a test fails, and a separate error bucket for provider failures.

### OpenAI Evals

- Primary URL: https://github.com/openai/evals
- Version: `3.0.1.post1` in `pyproject.toml`. Commit `8eac7a7de5215c907fbddc30efdaf316913eccdd` (2026-04-14).
- License: MIT for the code (`LICENSE.md`). Registry datasets have separate terms (CC, ODC, WordNet, public domain, and others) and were not copied.
- Feature evidence: documentation and `evals/elsuite/basic/match.py`. Live run not executed.
- Already matches: versioned eval specs, exact match against an ideal string, and a per-sample match event that can be logged. `Match` returns aggregate `accuracy` and `boostrap_std` for a single completion function. It does not pair a pinned baseline recording with a candidate or emit a severity-weighted release decision.

### EvalShift CLI (closest discovery result)

- Primary URL: https://github.com/evalshift/evalshift-cli
- PyPI: `evalshift` 1.7.0. Commit `59fe0b777a508b7373aeb0d05400bd58c8a0955c`. CLI license Apache-2.0. Capture SDK (`evalshift-sdk`) is MIT. Earlier CLI releases used MIT and then AGPL-3.0-or-later; 1.7.0 is Apache-2.0.
- Docs used: README and `docs/configuration.md` (`migration_policy`, golden suite shape, tool evaluators).
- Dataset terms: not applicable. No EvalShift suite was copied.
- Already matches: two-arm comparison, a written migration verdict, severity, an `inconclusive` status, and a rule that a shared ground-truth miss is not proof the migration is safe.
- Does not cover the acceptance case: the supported compare path replays models through LiteLLM, scores with statistical and tool-call evaluators, and defaults `max_critical_regressions` to 1. `--policy-gate` exits 0 when the verdict is `inconclusive`. That is a different product from an offline exact-contract gate on recorded text and JSON.

GitHub repository search for `LLM evaluation regression baseline contract workflow gate` returned 0 results on 2026-11-23. The named queries still surface Promptfoo, EvalShift, golden-file workflow runners, and CI articles. Those articles describe the same failure mode (an average that hides a broken case) but are not a reusable offline tool.

## Probe outcomes

### Promptfoo — observed run

Command, from `/tmp/modelshift-p01-probe`, using an original `recorded-provider.js` that returns the fixture above and does not call a network provider:

```text
npx --yes promptfoo@0.126.0 eval --no-cache -o results.json
```

Result: exit code 100. Stats `successes: 3`, `failures: 2`, `errors: 1`, `durationMs: 73`, `tokenUsage.total: 0`.

| Case | Baseline cell | Candidate cell |
| --- | --- | --- |
| `order-extract` | success, score 1 | failure, score 0.5, because `is-json` passed and the order-id function returned false |
| `shipping-note` | failure, score 0 | success, score 1 |
| `invoice-status` | success, score 1 | error `timeout after 1 attempt`, score 0 |

The table shows the critical failure and the noncritical improvement at the same time, and it keeps the timeout in `errors` rather than `failures`. It does not emit pair labels, a field name in the reason (the reason is the assertion source), a retry count, a config hash, or a release decision. Exit 100 is shared by assertion failures and the timeout. The candidate order-extract score is 0.5 even though the critical field failed.

### OpenAI Evals — documentation, live run unresolved

`Match.eval_sample` sends `sample["input"]` to one completion function and records whether the completion matches `sample["ideal"]`. `run` reduces match events to accuracy. The README requires `OPENAI_API_KEY` and warns about API cost. No live comparison was run. A paid provider is outside this project's constraints, and the registry datasets were not downloaded. This check cannot show a paired recorded-output gate.

### EvalShift — documentation, live compare unresolved

`evalshift compare` is documented as a five-stage pipeline that runs two models and writes `migration_decision.json` when `migration_policy` is set. Rate budgets are Wilson-CI-aware: a small suite can be `inconclusive` instead of a failure, and `--policy-gate` then exits 0. Tool replay, semantic similarity, and LLM-judge evaluators are in scope for EvalShift and out of scope for this MVP. Installing the CLI and calling a model was not required to see that the published path is not an offline recording comparator. No live compare was run, because that call needs a provider credential.

## Remaining uncertainties

- Promptfoo was observed at npm 0.126.0, not at repository HEAD `696d3ca`. The assertion and exit-code behavior above is from that package.
- EvalShift 1.7.0 may have a local scoring entry point that this review did not execute. The published compare and configuration docs describe provider replay and statistical budgets, which already miss the offline exact-contract acceptance case.
- OpenAI Evals can log per-sample matches. Whether an external script could reconstruct pair labels from two log files was not tested, and it would still be a new tool.

## Decision

**Proceed.** Build a separate offline TypeScript CLI.

Promptfoo already checks outputs and fails the process, but it does not implement the acceptance case: pair labels, quarantine, a distinct missing-evidence result, or a critical gate that stays attached to the field rather than a weighted score. OpenAI Evals is a live registry and reports accuracy. EvalShift is the closest product and already covers agent migration, including tool-call diffs and a hosted policy gate. Contributing an offline exact-contract mode would cut against that statistical, provider-backed design, and its default critical budget and inconclusive exit do not meet the metric. The fixture provenance path is original samples under MIT, with no remote data at runtime.

Integration note: keep using Promptfoo or EvalShift when the question is prompt scoring or agent-tool migration. Use ModelShift when the question is whether a pinned workflow contract regressed between two recorded versions.
