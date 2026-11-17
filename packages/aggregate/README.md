# @open-twin/aggregate

Takes bundles from several connectors for **one subject** and returns one bundle,
with overlaps reconciled. This is the layer that answers "Oura and Google Health
both reported last night's sleep — which number do we stand behind?"

Two rules hold it together, and both are about not destroying evidence:

1. **Every source Observation survives.** A reconciliation is an added assertion,
   not a replacement, so changing the selection policy later is a re-run over data
   already held — not a re-fetch from a vendor who may no longer serve the window.
2. **Where the evidence gives no basis to prefer a source, none is preferred.**
   The output then says several sources disagreed, and no more. That is the truth.

## Installation

After the package's first npm release:

```bash
npm install @open-twin/aggregate
```

Core is installed as a compatible shared dependency; connectors are not installed.
This package is versioned independently. See [publishing](../../docs/PUBLISHING.md).

## What a reconciliation is

When more than one connector reports the same **measure** on the same **day**, the
aggregator consults `reliabilityFor` in `@open-twin/fhir-core` — graded validation
evidence per _(source, measure)_ pair, with citations — and either:

- emits a **derived Observation** carrying `derivedFrom` pointing at _every_ source
  it considered (not only the winner) and `method` stating the policy in prose, or
- **abstains**, recording why. The abstentions are the substance:
  - _energy expenditure_ abstains outright — published MAPE above 30% for every
    brand tested, so naming a winner would present a confidence nobody has earned;
  - _equally graded sources_ abstain rather than break a tie on array order;
  - _several same-day readings from the preferred source_ abstain because the
    reliability evidence ranks connectors, not readings within one connector;
  - _a single reporting source_ is not a disagreement, so nothing is asserted.

A selection nobody can audit is indistinguishable from a guess, which is why the
policy prose and the citation ride inside the bundle.

The integrator must verify that grouped measurements are comparable. The current
measure/day grouping does not establish matching units, measurement windows or
measurement equivalence. Source selection is experimental; see the
[intended-use guidance](../../docs/INTENDED-USE.md).

## Usage

```ts
import { aggregate } from '@open-twin/aggregate';

const { bundle, reconciliations } = aggregate({
  sources: [
    { bundle: ouraBundle }, // connector read from meta.tag when present
    { connector: 'google-health', bundle: googleBundle }
  ],
  subjectKey: 'user-42',
  timestamp: '2026-06-21T08:00:00Z' // supplied, so the result is reproducible
});

for (const r of reconciliations) {
  // { measure, day, sources, selected?, policy } — one line per overlap,
  // including the overlaps where nothing was selected and why.
}
```

## Preconditions: one subject and canonical source ids

Each connector mints its own `urn:uuid:` subject from its own key unless the
integrator supplies a common one (decision D1). Left alone, nothing would match and
the aggregator would report no overlap — a wrong answer that looks like a clean one.
So `aggregate` **throws** when its sources carry more than one subject reference:
supply the same `subject` to every connector for the same person before aggregating.

Every Observation participating in a derived result must also carry a lowercase
UUID `id`. Connector bundles built with `buildBundle` already satisfy this. A foreign
id-less bundle must be normalised first; aggregation refuses it rather than emitting
an unresolved `urn:uuid:undefined` provenance reference.

## Where the grades come from

`reliability.ts` in `@open-twin/fhir-core` records what the validation literature
says, per source and measure — not a preference order. That distinction does real
work: sleep _duration_ selects google-health over Oura, because Oura's `good` grade
is for sleep–wake _detection_ and it has no published total-sleep-time finding at
all. Extending the table is a citation, not an opinion.

## The measurement catalogue

`createMeasurementCatalogue` combines the declarations of the connectors you register
into one catalogue, grouped by measurement key. It needs no credentials, network or
bundles — only the declaration sets the connector packages export — so it can be built
before any data is fetched, and aggregate needs none of the connectors installed.

```ts
import { createMeasurementCatalogue, sharedCatalogueEntries } from '@open-twin/aggregate';
import { GOOGLE_HEALTH_MEASUREMENTS } from '@open-twin/provider-google-health';
import { OURA_MEASUREMENTS } from '@open-twin/provider-oura';

// Registration order is kept and is the only order used; nothing here ranks sources.
const catalogue = createMeasurementCatalogue([OURA_MEASUREMENTS, GOOGLE_HEALTH_MEASUREMENTS]);

sharedCatalogueEntries(catalogue); // keys two or more registered sources declare
```

Every key a registered connector declares is in the catalogue. A key declared by one
source has `shared: false`; a key declared by two or more has `shared: true` — the keys
a source preference can later apply to. The catalogue describes **supported
capabilities**, not what any bundle contains: matching keys makes two sources
candidates, and whether two actual readings are comparable (unit, context, subject,
time window) is still decided per reading.

Registration fails with a `ConnectorError` listing every problem — a connector
registered twice, a declaration whose unit or context differs from its definition, a
key borrowed from another connector's namespace.

### Runtime measurement resolution and eligibility

`resolveReadings` uses the registered declarations, not the legacy measurement
table, to find values in source bundles and assess them for an explicit request.
It supports Observation values and components matched by their coding **and** their
parent's coding; component order is irrelevant.

```ts
import { resolveReadings } from '@open-twin/aggregate';

const result = resolveReadings({
  catalogue,
  sources: [
    { connector: 'oura', bundle: ouraBundle },
    { connector: 'google-health', bundle: googleBundle }
  ],
  request: {
    key: 'total-sleep-time',
    subject: 'Patient/example', // must be the same exact reference in every reading
    context: { scope: 'sleep-period', statistic: 'total' },
    window: {
      kind: 'period',
      start: '2026-06-20T22:00:00Z',
      end: '2026-06-21T06:00:00Z'
    }
  }
});

for (const { reading, eligibility } of result.readings) {
  // reading keeps the original Observation and, when applicable, its component.
  // eligibility is { kind: 'eligible' } or { kind: 'ineligible', reasons: [...] }.
  // Keep the reading for selection/provenance; do not log its health payload.
}
// result.issues reports undeclared values, ambiguous declaration matches and
// unregistered connectors using input positions, never payloads or subject ids.
```

Eligibility requires a present value of the declared type, its exact emitted UCUM
unit, the declared scope/statistic, the exact subject reference, and a compatible
effective time. A missing numeric value, `dataAbsentReason`, nonfinite number or
quantity comparator is not an exact usable reading. Zero and boolean `false` are
valid values. A parent's absent score does not make its populated components absent.
A value-less panel (`valueType: 'none'`) is not itself a usable reading.

Registered (no result yet), cancelled and entered-in-error Observations are
ineligible, including their components, with `unusable-status`. Preliminary and
unknown statuses are not excluded solely for their status: eligibility is not
confirmation that a result is final or verified.

Ranges, ratios and sampled-data origins must be unitless. The declaration schema
cannot describe their nested units yet, so any `unit`, `system` or `code` on those
nested quantities makes the reading ineligible with `unit-mismatch`, even when
both range bounds use the same unit. No unit compatibility or conversion is inferred.

Value checks also reject out-of-range/fractional integers, reversed ranges,
incompatible range-bound units, zero ratio denominators and malformed temporal or
sampled-data values. Sampled data needs a finite origin, positive sampling period,
valid dimensions, complete sample groups and valid numeric/error/limit tokens;
error/limit tokens alone provide no usable numeric value. Partial dates and open
periods remain valid **values** where FHIR permits them, but cannot serve as complete
effective measurement windows. These eligibility guards are not a full FHIR
structural validator; see the [R4 datatype definitions](https://hl7.org/fhir/R4/datatypes.html)
and [observation statuses](https://hl7.org/fhir/R4/valueset-observation-status.html).

Time compatibility is deliberately conservative:

- Individual readings accept `{ kind: 'instant', at: '...' }` or a complete period.
  Summaries (daily, interval, session, sleep period or physiological cycle) require
  periods; declaration context alone does not establish a measurement window.
- Instants must match exactly; periods must have identical start and end instants,
  with end after start. Offsets are normalized and fractional seconds are preserved.
  Mere overlap or a shared calendar date is insufficient.
- Effective times require a complete date, hours, minutes, seconds and an explicit timezone.
  Date-only markers, incomplete/open periods, `effectiveTiming`, conflicting
  `effective[x]` fields, impossible dates and unsupported leap seconds are ineligible.
  No day boundaries, timezones or tolerances are inferred. Connectors emitting only
  daily markers or a sleep start cannot establish comparable periods with this API.

The resolver never converts a unit, matches different patient references, selects
a source or mutates a bundle/catalogue. It checks matching against **all** of a
source's declarations before filtering by the requested key, so ambiguous codings
cannot turn into an arbitrary match. Multiple same-source readings remain separate
for the selection layer to handle. An empty bundle returns no readings; the
catalogue still records that source's capability. Invalid requests throw a
payload-free `ConnectorError`; eligibility reasons and resolution issues contain
only diagnostic codes and input positions, not health values.

This is the runtime eligibility layer for the configured reconciliation work in
#264/#277. It does not change the legacy `aggregate()` API, which still groups by the
`measureOf` table and selects by reliability grade. Moving that API to opt-in,
configured selection and removing the legacy policy are tracked in #275 and #279.

## Verification

`src/verification/exampleBundle.ts` emits a two-source bundle — one reconciled
measure, one abstention — that runs through the HL7 validator in CI like every
other emitted bundle (`pnpm emit-bundles out/`).
