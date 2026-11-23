# Changelog

## 0.1.0

- Add an offline CLI that compares recorded baseline and candidate outputs on exact workflow contracts.
- Block a release when an eligible critical case newly fails, including when a noncritical case improves.
- Label fixed, continuously failing, and inconclusive pairs, and keep timeouts and missing recordings out of the regression count.
- Quarantine a baseline whose input hash or model version does not match, and reject symlinks, oversized inputs, and paths that leave the suite.
- Ship the eight-case order-desk fixture, a hand-calculated oracle, and a demo that expects the seeded candidate to block and the corrected candidate to pass.
