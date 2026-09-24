# @open-twin/hl7v2

Converts pipe-delimited HL7 v2.x messages to FHIR R4, following the
[HL7 Version 2 to FHIR Implementation Guide](https://build.fhir.org/ig/HL7/v2-to-fhir/).

```ts
import { convertMessage } from '@open-twin/hl7v2';

const { bundle, issues } = convertMessage(message, { timestamp: new Date().toISOString() });
```

`bundle` is a FHIR `Bundle`; `issues` is an `OperationOutcome` listing everything the
connector declined to convert. **Read it.** A conversion that produces a bundle and an
empty-looking result is not the same as one that produced nothing, and this library
reports rather than throws (DECISIONS.md D6).

---

## What it supports

**Message types**

| Message | Trigger events | Structure |
| --- | --- | --- |
| `ORU^R01` | R01 | `ORU_R01` |
| `ADT^A01`, `ADT^A04`, `ADT^A08` | A01 (admit), A04 (register), A08 (update) | `ADT_A01` |

Anything else — ORM, OML, MDM, SIU, VXU, ADT triggers other than those three — is
**refused** and reported as a `not-supported` issue with an empty bundle. The segment
groupings differ between message structures, and reading an ORM as an ORU attaches an
*order* to a patient as though it were a *result*.

**Segments**

| Segment | Target | Fields mapped |
| --- | --- | --- |
| MSH | `Bundle` | MSH-1/-2 (delimiters), MSH-7 (`Bundle.timestamp`), MSH-9 (dispatch), MSH-10 (`Bundle.id` seed) |
| PID | `Patient` | PID-3, PID-5, PID-7, PID-8, PID-29, PID-30 |
| PV1 | `Encounter` | PV1-2, PV1-19, PV1-44, PV1-45 |
| OBR | `DiagnosticReport` | OBR-2, OBR-3, OBR-4, OBR-7, OBR-8, OBR-22, OBR-25 |
| OBX | `Observation` | OBX-1..OBX-3, OBX-5..OBX-8, OBX-11, OBX-14, OBX-17, OBX-20, OBX-21 |
| NTE | `Observation.note` | NTE-3, NTE-6 — when the NTE follows an OBX |

Every other segment in a supported message (EVN, PD1, NK1, PV2, ORC, AL1, IN1, IN3,
PRT, SPM, TQ1, …) is **ignored silently**. They are present in the fixtures and the
converter walks past them.

**The parser** reads segments, fields, repetitions, components and subcomponents using
the delimiters the message declares in MSH-1 and MSH-2 — including a five-character
MSH-2 with a truncation character, which the IG's own `ORU_R01` example uses. Escape
sequences `\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\Xdd..\` (hex) and `\.br\` (line break)
are decoded; `""` is read as the HL7 explicit null. Any other escape sequence —
`\H\`, `\N\`, `\Cxxyy\`, `\Mxxyyzz\`, `\Zdd..\`, the remaining formatting commands — is
left **verbatim** in the text rather than deleted, so the loss stays visible.

---

## Stable identity and upgrades

Conversion requires MSH-10 plus a stable sender namespace from MSH-3/MSH-4 or
`ConvertOptions.sourceNamespace`. Patient identity uses the primary identifier
and assigning authority; local identifiers are scoped to the sender and local
authority. If no stable patient identifier can be formed, supply an explicit
`subject.reference`. Missing identity or multiple PID segments produce an empty
bundle with issues; `pidToPatient` can return `undefined`.

The identity fix changes deterministic resource IDs. Before importing into a
store populated by an earlier version, reconcile existing records or rebuild
from source; blindly repeating upserts can create duplicates. Keep the chosen
sender namespace stable between runs.

## The decisions worth arguing with

### OBX-3: LOINC is what says it is LOINC

`Observation.code` takes its system from CWE.3, the name of the coding system, via HL7
table 0396. `LN` is LOINC, `SCT` is SNOMED CT, `UCUM` is UCUM, `HL7nnnn` is the HL7
Terminology v2 table `v2-nnnn`. Everything else — `L`, `99zzz` ("local general code"),
an unrecognised name, or no coding system at all — is a **local** code and is published
under `http://opentwin.ch/fhir/CodeSystem/hl7v2-local`.

`SNM` and `SNM3` are deliberately *not* mapped to SNOMED CT: table 0396 defines them as
SNOMED 2nd edition and SNOMED International 1993, which are different code systems with
different identifiers.

CWE's alternate triplets (CWE.4–6, CWE.10–12) become additional `Coding` entries, so a
message that carries a local code *and* its LOINC equivalent keeps both, each under the
right system.

Local codes from two different senders are different codes that may collide on the same
identifier. Pass `localCodeSystem` per sender if you exchange with more than one.

### OBX-2 drives the value type

| OBX-2 | Result |
| --- | --- |
| `NM` | `valueQuantity` |
| `ST`, `TX`, `FT` | `valueString` |
| `CE`, `CWE`, `CF`, `CNE`, `IS` | `valueCodeableConcept` |
| `DT`, `DTM`, `TS` | `valueDateTime` |
| anything else | `dataAbsentReason` **and a reported issue** |

`SN`, `NA`, `NR`, `DR`, `TM`, `ED`, `RP`, `EI` and `VR` are not implemented. They are
reported, never approximated: rendering `SN` `<0.10` as the number `0.10` states a
result the laboratory did not report. An OBX-2 value that is not in HL7 table 0125 is
reported without being quoted.

A repeating OBX-5 is reported rather than truncated — the IG routes it to
`Observation.component` through a separate map (`OBX[Observation-Component]`) that this
connector does not implement.

### OBX-6 units go through UCUM or not at all

The unit code is validated against the real UCUM grammar with
[`@lhncbc/ucum-lhc`](https://github.com/lhncbc/ucum-lhc), the same library the
repository's own unit gate uses. A unit that is not valid UCUM is **rejected**: the
Observation gets `dataAbsentReason` and an issue, not a `Quantity` carrying a code UCUM
does not define. `cm^centimeter^UCUM` yields code `cm` with display `centimeter`;
`centimeter` alone is refused.

When OBX-3 carries a LOINC code that `@open-twin/fhir-core` binds to a canonical unit
(D4), the value is **converted** into that unit — `1.9 m` under LOINC 8302-2 becomes
`190 cm`. A unit that is valid UCUM but not commensurable with the canonical one (a
height in kilograms) is rejected as a self-contradictory message rather than converted
away. The conversion is keyed on the *LOINC coding*, so the same digits arriving under a
local coding system are left alone.

### Timestamps keep the offset the sender gave, and never gain one they did not

FHIR R4 says of `dateTime`: *"If hours and minutes are specified, a time zone SHALL be
populated"* and *"Seconds must be provided due to schema type constraints but may be
zero-filled"*.

- Offset present → preserved: `20150602100012.43+0100` → `2015-06-02T10:00:12.43+01:00`.
- Minutes but no seconds, with an offset → seconds zero-filled, which the specification
  permits.
- **No offset → narrowed to the date.** `20150601135800` becomes `2015-06-01`, not
  `2015-06-01T13:58:00Z`. Appending `Z` asserts UTC for a local wall clock and moves the
  instant by up to fourteen hours, across a date boundary (DECISIONS.md D7).
- Hour precision only → narrowed to the date. Zero-filling *minutes* is not sanctioned
  and would be up to 59 minutes wrong.
- `Bundle.timestamp` and `DiagnosticReport.issued` are `instant`, which needs both
  seconds and an offset. Without one they are omitted (`issued`) or fall back to the
  caller's `timestamp` (`Bundle.timestamp`). The IG raises exactly this: *"MSH-7 does
  not require a time offset while Bundle.timestamp does."*

### PID-8 is mapped, not passed through

Via the IG's `AdministrativeSex` ConceptMap: F→female, M→male, O→other, U→unknown,
A→other, N→other. `Patient.gender` has a **required** binding, so a code outside table
0001 cannot be passed through and is not silently turned into `unknown` either — it is
reported and `gender` is left absent.

### No part of a message ever reaches an error

`ConnectorError` carries a message written by this library and a location: a segment
name, its ordinal position and a field number, e.g. `OBX[10] OBX-2`. No field content,
no value, no name, no identifier, not in `Error.cause` either. The only message content
that ever appears in an issue is a code from a **closed HL7 vocabulary** (an OBX-2 value
type in table 0125, a message type in tables 0076/0003), which is metadata rather than
patient data; an unrecognised value is described but never quoted. There is a test that
asserts this over the fixtures and over a message in which every field is unreadable.

### Vital signs

R4 auto-applies its vital-signs profiles to an Observation whose code is in
`http://hl7.org/fhir/ValueSet/observation-vitalsignresult`, whether or not the resource
claims the profile, and those profiles make `category` and `effective[x]` mandatory. So
an Observation carrying one of those thirteen LOINC codes gets the vital-signs category,
and — when OBX-14 is absent, as it is in the IG's own ADT_A01 example — an
`effectivePeriod` carrying a `data-absent-reason` and no value. It is a `Period` rather
than a `dateTime` because the vs-1 invariant fails on a value-less `dateTime`; see the
comment in `src/fhir/observation.ts`. MSH-7 is **not** substituted: when the message was
sent is not when the height was measured.

---

## What it does NOT do

- **No MessageHeader, no Provenance.** The IG maps MSH to both. Neither is emitted.
- **No ServiceRequest and no Specimen.** The IG maps ORC/OBR to them.
- **No `Observation.component`.** A repeating OBX-5 is reported instead.
- **No PID demographics beyond name, birth date, gender and identifiers.** Address,
  telecom, race, ethnicity, religion, language, marital status, mother's maiden name,
  SSN and driver's licence are all mapped by the IG and all deliberately skipped. Each
  is directly identifying and none is needed by an observation-centred use case; a
  connector that copies a whole PID by default makes a re-identification decision on the
  integrator's behalf.
- **No Encounter locations, participants or hospitalization.** Each needs a Location,
  Practitioner or Organization whose identity this connector would have to invent.
- **No performer, no device.** OBX-15, OBX-16, OBX-18 and OBX-23..25 are not mapped.
- **Order-level NTE is not converted.** The IG's ORU_R01 message map gives the NTE that
  follows an OBR no target, and R4's `DiagnosticReport` has no `note` element. It is
  reported as an issue rather than dropped silently. NTE segments following an OBX *are*
  converted, to `Observation.note`.
- **No `Observation.category` except for vital signs.** The IG says category depends on
  MSH-9.2, MSH-3 and the code system ontology, and declines to specify it. So does this.
- **No message acknowledgement, batch (`FHS`/`BHS`) or continuation (`DSC`) handling.**
- **No XML (v2.xml) and no HL7 v2.7+ `truncation` semantics** beyond parsing the
  character out of MSH-2.

---

## Assumptions that could not be verified

1. **The local code system URI.** `http://opentwin.ch/fhir/CodeSystem/hl7v2-local` is a
   Foundation-controlled namespace per D3, but no `CodeSystem` resource defines it yet
   and it is not declared in `verify/conformance/declarations.json`. The HL7 validator
   warns that it cannot be resolved. The warning is correct and stays until the IG
   publishes the resource.
2. **HL7 table 0396 → URI has no published mapping.** The IG's `CWE[CodeableConcept]`
   map says only that "the vocabulary table will give the actual uri" and publishes no
   such table. `LN`→LOINC, `SCT`→SNOMED CT and `UCUM`→UCUM are each verified from two
   sources (table 0396's own definitions and FHIR R4 "Using Codes in Resources"), and
   `HL7nnnn`→`.../CodeSystem/v2-nnnn` is taken from literal assignments in the IG's
   segment maps. It is nonetheless this connector's reading, not the IG's statement.
3. **`Identifier.system` deviates from the IG.** `CX[Identifier]` sends CX.4 to
   `Identifier.system` only when it is already in the FHIR identifier registry, and
   `HD[uri]` would otherwise take HD.1 — a bare namespace name such as `OrdOrg`, which
   is not resolvable by anyone. This connector uses HD.2 with HD.3 = `ISO` or `UUID`,
   producing the `urn:oid:` / `urn:uuid:` form the IG specifies for that case, and emits
   no system otherwise. An assigning authority whose universal id is not a syntactically
   valid OID is dropped **and reported**: the IG's own ORU_R01 example declares
   `3.4.5.6.7` and `8.7.6.4`, and the validator rejects both.
4. **`Observation.status` for an unmapped OBX-11.** The IG maps only A, C, D, F, P, W
   and X. B, I, N, O, R, S, U and V get `unknown` plus an issue. Whether `R` ("results
   entered, not verified") should instead be `preliminary` is a clinical judgement, not
   a mapping one. `TODO(clinical-review):`
5. **`ADT^A04` and `ADT^A08` are accepted on the strength of sharing the `ADT_A01`
   structure.** No A04 or A08 example was available in the IG; both were tested only
   through the A01 example with MSH-9.2 changed.
6. **Unit conversion rounding.** A converted value is rounded to twelve significant
   digits to remove binary floating-point artefacts (`1.9 m` → `190` rather than
   `190.00000000000003`). Twelve digits is far beyond any clinical measurement's
   precision, but it is a chosen number.
7. **The `bodySite` in the exemplar bundle is nonsense, faithfully.** The IG's ORU_R01
   example places `201506011605` in OBX-20 (Observation Site) in two of its three OBX
   segments, where the first segment puts the same value in OBX-19 (Date/Time of the
   Analysis). The connector maps what the message says, so those two Observations get a
   `bodySite` whose code is a timestamp. It is emitted under the *local* code system, so
   nothing false is claimed about a standard terminology, and the fixture was not
   quietly corrected. Second-guessing field positions is how a mapper starts inventing.

---

## Fixtures

Every sample message is transcribed from the IG's own test-conversion page,
[`input/pagecontent/test_conversions.md`](https://github.com/HL7/v2-to-fhir/blob/master/input/pagecontent/test_conversions.md)
(published at <https://build.fhir.org/ig/HL7/v2-to-fhir/test_conversions.html>), with
the page's `<br>` separators replaced by carriage returns and the segment text otherwise
byte-for-byte as published:

- `ORU_R01` — the registered validator bundle (`hl7v2-oru-r01`).
- `ADT_A01` — patient administration with a LOINC-coded body height.
- `MDM_T02` OBX segments — used only as the IG's own example of local coding systems
  alongside a LOINC alternate. This connector does not convert MDM messages.

---

## Verification

```
npx tsc --noEmit          # clean
npx vitest run            # 81 tests, none skipped
npx biome ci              # nothing reported for this package
```

The registered bundle is emitted from this connector's own public entry point over the
IG's ORU_R01 message and checked with the HL7 validator:

```
node verify/build-conformance.mjs
npx tsx verify/emit-bundles.ts /tmp/nc-out
java -jar validator_cli.jar /tmp/nc-out/hl7v2-oru-r01.json \
  -version 4.0.1 -ig verify/conformance/generated -tx n/a \
  -best-practice ignore -jurisdiction uv -output-style compact -level errors
```

**Zero errors.** Two warnings remain, both `A definition for CodeSystem
'http://opentwin.ch/fhir/CodeSystem/hl7v2-local' could not be found` — assumption 1
above.
