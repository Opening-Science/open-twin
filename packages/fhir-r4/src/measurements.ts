/**
 * WHAT: Declares the measurements the foreign FHIR R4 connector mints itself — none — under `open` coverage.
 * NOT:  Declares no forwarded code; every Observation, its code and its components belong to the sending system, and normaliseBundle copies them unchanged.
 * GOVERNED BY: DECISIONS.md#d18; DECISIONS.md#d1; DECISIONS.md#d2
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: The set is `open` and empty on purpose. normaliseBundle rewrites ids, fullUrls, subjects, references, narrative and meta.tag, and never a code, a value or a unit, so there is no coding this connector chooses. Declaring the LOINC codes of the HL7 samples would claim the connector picks them; it forwards whatever the sender sent, and the audit can only check those codes against the sender's own declarations.
 */
import { MEASUREMENT_SCHEMA_VERSION, type MeasurementDeclarationSet } from '@open-twin/fhir-core';

export const FHIR_R4_MEASUREMENTS: MeasurementDeclarationSet = {
  schemaVersion: MEASUREMENT_SCHEMA_VERSION,
  connector: 'fhir-r4',
  version: 1,
  coverage: 'open',
  definitions: [],
  declarations: []
};
