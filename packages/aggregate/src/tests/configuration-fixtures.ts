/**
 * WHAT: Builds synthetic connector registrations for configuration tests.
 * NOT:  Does not declare real connector capabilities or rank sources.
 * GOVERNED BY: DECISIONS.md#d19
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import {
  MEASUREMENT_SCHEMA_VERSION,
  type MeasurementDeclaration,
  type MeasurementDeclarationSet
} from '@open-twin/fhir-core';

export function registration(connector: string, declarations: MeasurementDeclaration[]): MeasurementDeclarationSet {
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    connector,
    version: 1,
    coverage: 'complete',
    definitions: [],
    declarations
  };
}
