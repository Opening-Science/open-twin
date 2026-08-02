# Confidence — rule-support, not disease probability

Status: binding for `interpretation-contract.v0.2`.

`confidence` on a state is **rule-support**. It answers: *how completely,
recently, and strongly did the evidence support applying this rule?* It does
**not** answer: *how likely is disease?* A renderer that shows it as risk is
non-conformant (D-j).

## Formula

\[
\texttt{confidence} = C \times R \times S
\]

where each factor is in \([0, 1]\) and the product is in \([0, 1]\).

| Factor | Symbol | Definition |
|---|---|---|
| Completeness | \(C\) | \(\dfrac{\|\{c \in \texttt{contributing} : c.\texttt{status} = \texttt{present}\}\|}{\|\texttt{contributing}\|}\) |
| Recency | \(R\) | If no contributor has `status = present`, \(R = 0\). Otherwise \(R = \min_{c:\texttt{present}} r(\Delta t_c)\) where \(\Delta t_c\) is age in days of `observed_at` relative to document `as_of`, and \(r\) is the piecewise map below. |
| Rule strength | \(S\) | Author-declared constant for the rule that emitted the state, in \([0, 1]\). Recorded in the rule registry (not in this contract). Default for an unregistered rule is \(0\). |

### Recency map \(r(\Delta t)\)

| Age \(\Delta t\) (days) | \(r\) |
|---|---:|
| \(\Delta t \le 30\) | \(1.0\) |
| \(30 < \Delta t \le 90\) | \(0.7\) |
| \(90 < \Delta t \le 180\) | \(0.4\) |
| \(\Delta t > 180\) | \(0.1\) |
| `observed_at` missing on a `present` contributor | treat as \(r = 0\) |

Round the product to **four decimal places** using half-up rounding
(e.g. `0.12345 → 0.1235`). Two implementations that follow this note must agree
bit-for-bit on the rounded value for the same inputs.

## Worked example

Document `as_of = 2026-07-28T00:00:00Z`. Rule strength \(S = 0.8\).
Contributing markers the rule read:

| biomarker_id | status | observed_at | \(\Delta t\) (days) | \(r\) |
|---|---|---|---:|---:|
| BM-072 | present | 2026-07-01T00:00:00Z | 27 | 1.0 |
| BM-190 | present | 2026-04-01T00:00:00Z | 118 | 0.4 |
| BM-200 | missing | — | — | — |

- \(C = 2 / 3 = 0.6666\ldots\) → use exact fraction until the final product:
  \(C = 2/3\).
- \(R = \min(1.0, 0.4) = 0.4\).
- \(S = 0.8\).

\[
\texttt{confidence} = (2/3) \times 0.4 \times 0.8 = 0.2133\overline{3} \rightarrow \mathbf{0.2133}
\]

## Forbidden readings

- Do not label confidence as “risk”, “probability”, or “chance of disease”.
- Do not invert confidence into a traffic-light diagnosis.
- Do not omit contributors with `missing` / `stale` / `no_reference_interval` /
  `unit_incommensurable` to inflate \(C\) (D-k).
