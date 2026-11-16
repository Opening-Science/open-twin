/**
 * WHAT: Declares the measurements the HL7 v2 connector mints itself — none — under `open` coverage.
 * NOT:  Declares no forwarded OBX code; what a sender puts in OBX-3 is the sender's measurement, and the codings are built by datatypes.ts from the message alone.
 * GOVERNED BY: DECISIONS.md#d18; DECISIONS.md#d4
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: The set is `open` and empty on purpose. Every Observation.code coding is OBX-3 (or its alternate triplets) copied from the message, with only the system name resolved to a URI; the connector emits no component and no constant Observation code. Declaring a LOINC code here because a fixture happens to carry it would claim the connector chose it. An OBX with an empty OBX-3 becomes an Observation with `code.text` and no coding, which no declaration could match.
 */
import { MEASUREMENT_SCHEMA_VERSION, type MeasurementDeclarationSet } from '@open-twin/fhir-core';
import { CONNECTOR } from '../issues';

export const HL7V2_MEASUREMENTS: MeasurementDeclarationSet = {
  schemaVersion: MEASUREMENT_SCHEMA_VERSION,
  connector: CONNECTOR,
  version: 1,
  coverage: 'open',
  definitions: [],
  declarations: []
};
