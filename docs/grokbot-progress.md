# Grokbot progress

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
