# Confidence — rule-support, not disease probability

Status: binding for `interpretation-contract.v0.2`.

`confidence` on a state is **rule-support**. It answers: *how completely,
recently, and strongly did the evidence support applying this rule?* It does
**not** answer: *how likely is disease?* A renderer that shows it as risk is
non-conformant (D-j).

Reference implementation (normative for this repository):
`packages/interpretation-contract/src/confidence.ts`.

## Formula

$$
\texttt{confidence} = C \times R \times S
$$

where each factor is in $[0, 1]$ and the product is in $[0, 1]$.

**Precondition.** `contributing` must be non-empty (`n_{\mathrm{contributing}} \ge 1`).
An empty contributing list makes the state **invalid** (see reject fixture
`empty-contributing`); confidence is **not computed** for that state. Division
by zero is therefore outside the contract.

| Factor | Symbol | Definition |
|---|---|---|
| Completeness | $C$ | Exact rational $\dfrac{n_{\mathrm{present}}}{n_{\mathrm{contributing}}}$ where $n_{\mathrm{present}}$ counts contributors with `status = present` and $n_{\mathrm{contributing}} = \|\texttt{contributing}\| \ge 1$. Never approximate $C$ in binary float before the product. |
| Recency | $R$ | If no contributor has `status = present`, $R = 0$. Otherwise $R = \min_{c:\texttt{present}} r(\Delta t_c)$ with $\Delta t_c$ from the elapsed-day procedure below. Exact decimal / rational in $[0, 1]$. |
| Rule strength | $S$ | Author-declared constant for the rule that emitted the state, in $[0, 1]$. Recorded in the rule registry (not in this contract). Default for an unregistered rule is $0$. **API boundary:** $S$ (and $R$) must be supplied as exact decimal strings or rationals — never as IEEE-754 binary floats (`0.1 + 0.2` is non-conformant input). |

### Elapsed-day procedure $\Delta t$

Both `as_of` and `observed_at` are UTC instants. The string **must** include
`Z` or an explicit numeric offset (`+00:00`, `-05:00`, …). A timezone-less
local datetime is rejected — `Date.parse` would otherwise use the host zone
and change $\Delta t$.

1. Let $m = t_{\texttt{as\_of}} - t_{\texttt{observed\_at}}$ in **milliseconds** (Unix epoch ms).
2. **Clamp before flooring:** if $m < 0$ (observation after `as_of`, clock skew), set $\Delta t = 0$ and stop.
3. Otherwise $\Delta t = \lfloor m / 86\,400\,000 \rfloor$ where $86\,400\,000 = 24 \times 60 \times 60 \times 1000$ (SI day in ms — **not** calendar-date subtraction, **not** half-up of fractional days).

So $30.0 \le$ fractional days $< 31.0$ yields $\Delta t = 30$. A 30.5-day span floors to $30$, not $31$.

| Age $\Delta t$ (integer days) | $r$ |
|---|---:|
| $\Delta t \le 30$ | $1.0$ |
| $30 < \Delta t \le 90$ | $0.7$ |
| $90 < \Delta t \le 180$ | $0.4$ |
| $\Delta t > 180$ | $0.1$ |
| `observed_at` missing on a `present` contributor | treat as $r = 0$ |

Boundary vectors (after clamp + floor):

| $\Delta t$ | $r$ |
|---:|---:|
| 0 | 1.0 |
| 30 | 1.0 |
| 31 | 0.7 |
| 90 | 0.7 |
| 91 | 0.4 |
| 180 | 0.4 |
| 181 | 0.1 |

### Rounding and serialization

Compute the product $P = C \times R \times S$ in **exact rational arithmetic** (or equivalent decimal arithmetic with sufficient precision). Do **not** multiply IEEE-754 doubles and then round — that disagrees on half-ties.

Quantize $P$ to four decimal places with **half-up away from zero for non-negative $P$**:

$$
\texttt{rounded} = \frac{\left\lfloor 10000 \cdot P + \tfrac{1}{2} \right\rfloor}{10000}
$$

For exact rational $P = a/b$ with $a \ge 0$, $b > 0$:

$$
\texttt{scaled} = \left\lfloor \frac{2 \cdot a \cdot 10000 + b}{2 \cdot b} \right\rfloor,\quad
\texttt{rounded} = \texttt{scaled} / 10000
$$

Tie vector: $C = 1$, $R = 1$, $S = 0.00015$ $\Rightarrow$ $P = 0.00015$ $\Rightarrow$ **0.0002** (not 0.0001).

Canonical serialization of the rounded value: fixed-point decimal string with **exactly four** digits after the point, no exponent, no trailing trim (`1` → `1.0000`, `0.2133` → `0.2133`). Bit-for-bit agreement means this string (and the identical rational $n/10000$).

## Worked example

Document `as_of = 2026-07-28T00:00:00Z`. Rule strength $S = 0.8$.
Contributing markers the rule read:

| biomarker_id | status | observed_at | $\Delta t$ (days) | $r$ |
|---|---|---|---:|---:|
| BM-072 | present | 2026-07-01T00:00:00Z | 27 | 1.0 |
| BM-190 | present | 2026-04-01T00:00:00Z | 118 | 0.4 |
| BM-200 | missing | — | — | — |

- $C = 2/3$ (exact).
- $R = \min(1.0, 0.4) = 0.4$.
- $S = 0.8$.

$$
\texttt{confidence} = (2/3) \times 0.4 \times 0.8 = 0.2133\overline{3} \rightarrow \mathbf{0.2133}
$$

Canonical string: `0.2133`.

## Forbidden readings

- Do not label confidence as “risk”, “probability”, or “chance of disease”.
- Do not invert confidence into a traffic-light diagnosis.
- Do not omit contributors with `missing` / `stale` / `no_reference_interval` /
  `unit_incommensurable` to inflate $C$ (D-k).
