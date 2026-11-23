# Oracle for the order-desk release suite

Hand-authored expected results for the recorded suite. Counts are exact. Money is integer cents. There is no rounding tolerance.

## Arithmetic

- Order total: 2 widgets × 950 cents = 1900 cents.
- Tax: 1900 cents × 80 per thousand = 152 cents. 1900 × 0.08 = 152 exactly.

## Candidate A (`recordings/candidate-bad`)

Configured retries: 1 (one initial attempt plus one retry).

| Case | Severity | Baseline | Candidate | Label | Counts as a new regression |
| --- | --- | --- | --- | --- | --- |
| order-desk/order-extract | critical | `ORD-1042`, 1900 cents | `order_id` `1042` fails `^ORD-[0-9]{4}$` | newly failing | yes, the only critical regression |
| order-desk/order-note-format | low | note `Rush order` | note `Rush  order` | passing | no. Spacing is outside the exact fields |
| billing/invoice-status | low | completed invoice | timeout, 2 attempts | inconclusive timeout | no |
| shipping/address-normalize | low | region `ZZ` fails the enum | region `ZZ` fails the enum | continuously failing | no |
| billing/refund-reason | medium | reason `misc` fails the enum | reason `duplicate` | fixed | no. This is the noncritical improvement |
| shipping/shipment-window | low | ground, 3 days | ground, 3 days | passing | no |
| billing/tax-total | critical | 152 USD | 152 USD | passing | no |
| support/support-reply | low | ticket and body within limits | same body, including markup-like text | passing | no |

Suite decision: `block`. Exit code 1. Critical regressions: 1. Field: `order_id`.

## Candidate B (`recordings/candidate-clean`)

`order-extract` uses `ORD-1042`. `invoice-status` is a completed invoice. The refund remains fixed and the address remains continuously failing.

Suite decision: `pass`. Exit code 0. Critical cases covered: 2 of 2. Critical regressions: 0.
