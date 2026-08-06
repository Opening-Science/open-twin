/**
 * WHAT: Maps one Anchor biomarker measurement to a FHIR R4 Observation.
 * NOT:  Does not select reference-interval populations; does not invent intervals when none were measured against.
 * GOVERNED BY: docs/contracts/fhir-core.md; D-a (interval on Observation or null)
 * CORRECTNESS: Round-trip / fixture tests for bundle shape; HL7 validator not yet run locally (no JRE) — external authority gap, not an oversight.
 * GOTCHA: reference_interval_id null means omit referenceRange — the interpreter abstains. Never synthesise a range.
 */
import {
  CATEGORY,
  createObservation,
  deterministicId,
  quantity,
  RANGE_TYPE,
  referenceInterval,
  SYSTEMS,
  subjectReference
} from '@open-twin/fhir-core';
import type { Extension, Observation, ObservationReferenceRange, Reference } from 'fhir/r4';
import { getBiomarker, getReferenceInterval, isInterpretiveBandId } from '../catalogue.js';
import {
  assertValidCollectionContext,
  COLLECTION_CONTEXT_EXTENSION,
  type CollectionContext,
  EXT_CYCLE_PHASE,
  EXT_FASTING,
  EXT_TOD_WINDOW
} from '../context.js';
import { AnchorIngestError } from '../errors.js';
import { isPhysiologicallyPossible } from '../physiology.js';
import { resolveUcumUnit, unitCommensurableWithLoinc } from '../units.js';

export const CONNECTOR = { connector: 'anchor', version: '0.1.0' } as const;

export interface BiomarkerMeasurement {
  biomarker_id: string;
  value: number;
  /** Must match the Anchor unit_ucum / LOINC_UNITS entry. */
  unit_ucum: string;
  /**
   * The interval this result was measured against, or null.
   * Null is NOT an error — Observation.referenceRange is omitted (D-a abstain).
   */
  reference_interval_id: string | null;
}

function collectionExtensions(ctx: CollectionContext): Extension[] {
  const parts: Extension[] = [];
  if (ctx.menstrualCyclePhase) {
    parts.push({ url: EXT_CYCLE_PHASE, valueCode: ctx.menstrualCyclePhase });
  }
  if (ctx.fasting !== undefined && ctx.fasting !== null) {
    parts.push({ url: EXT_FASTING, valueBoolean: ctx.fasting });
  }
  if (ctx.timeOfDayWindow) {
    parts.push({ url: EXT_TOD_WINDOW, valueCode: ctx.timeOfDayWindow });
  }
  return parts.length > 0 ? [{ url: COLLECTION_CONTEXT_EXTENSION, extension: parts }] : [];
}

function toFhirRange(
  intervalId: string,
  expectedBiomarkerId: string,
  loincCode: string,
  unitUcum: string
): ObservationReferenceRange {
  // D-c: interpretive bands are already an interpretation — never attach as a measured range.
  if (isInterpretiveBandId(intervalId)) {
    throw new AnchorIngestError(
      'interpretive_band_not_reference_interval',
      `Interval ${intervalId} is an interpretive_band, not a measured reference_interval (D-c)`,
      { biomarker_id: expectedBiomarkerId, loinc_code: loincCode }
    );
  }
  const ri = getReferenceInterval(intervalId);
  if (!ri) {
    throw new AnchorIngestError('unknown_code', `Unknown reference_interval_id ${intervalId}`, {
      biomarker_id: expectedBiomarkerId,
      loinc_code: loincCode
    });
  }
  if (ri.biomarker_id !== expectedBiomarkerId) {
    throw new AnchorIngestError(
      'reference_interval_mismatch',
      `Interval ${intervalId} belongs to ${ri.biomarker_id}, not ${expectedBiomarkerId}`,
      { biomarker_id: expectedBiomarkerId, loinc_code: loincCode }
    );
  }
  const unit = resolveUcumUnit(loincCode, unitUcum);
  if (!unit) {
    throw new AnchorIngestError(
      'unit_incommensurable',
      `Cannot attach interval ${intervalId}: unit not canonical for LOINC ${loincCode}`,
      { loinc_code: loincCode, biomarker_id: ri.biomarker_id }
    );
  }
  if (ri.unit_ucum && ri.unit_ucum !== unitUcum) {
    throw new AnchorIngestError(
      'unit_incommensurable',
      `Interval ${intervalId} unit_ucum does not match measurement unit for LOINC ${loincCode}`,
      { biomarker_id: ri.biomarker_id, loinc_code: loincCode }
    );
  }
  if (ri.low == null && ri.high == null) {
    throw new AnchorIngestError('unknown_code', `Interval ${intervalId} has neither low nor high`, {
      biomarker_id: ri.biomarker_id,
      loinc_code: loincCode
    });
  }
  if (!ri.source_url || !ri.issuer || !ri.retrieved_at) {
    throw new AnchorIngestError('unknown_code', `Interval ${intervalId} missing source provenance`, {
      biomarker_id: ri.biomarker_id,
      loinc_code: loincCode
    });
  }

  return referenceInterval({
    ...(ri.low != null ? { low: ri.low } : {}),
    ...(ri.high != null ? { high: ri.high } : {}),
    unit,
    type: RANGE_TYPE.NORMAL,
    source: {
      url: ri.source_url,
      publisher: ri.issuer,
      retrieved: ri.retrieved_at.slice(0, 10),
      ...(ri.assay ? { version: ri.assay } : {})
    },
    appliesToText: ri.population ?? undefined,
    text: ri.reference_range_text ?? undefined
  });
}

/**
 * Build one Observation. Throws AnchorIngestError on unknown code, unit mismatch,
 * or physiologically impossible value. Missing interval → no referenceRange.
 */
export function mapBiomarkerToObservation(
  measurement: BiomarkerMeasurement,
  ctx: CollectionContext,
  device?: Reference
): Observation {
  try {
    assertValidCollectionContext(ctx);
  } catch (e) {
    throw new AnchorIngestError('invalid_context', e instanceof Error ? e.message : 'Invalid collection context', {
      biomarker_id: measurement.biomarker_id
    });
  }

  const biomarker = getBiomarker(measurement.biomarker_id);
  if (!biomarker) {
    throw new AnchorIngestError('unknown_code', `Unknown biomarker_id ${measurement.biomarker_id}`, {
      biomarker_id: measurement.biomarker_id
    });
  }

  const { loinc_code, loinc_display, unit_ucum: catalogueUnit } = biomarker;

  // D-c before unit checks: a band id must never be treated as a measured interval.
  if (measurement.reference_interval_id != null && isInterpretiveBandId(measurement.reference_interval_id)) {
    throw new AnchorIngestError(
      'interpretive_band_not_reference_interval',
      `Interval ${measurement.reference_interval_id} is an interpretive_band, not a measured reference_interval (D-c)`,
      { biomarker_id: biomarker.biomarker_id, loinc_code }
    );
  }

  if (!unitCommensurableWithLoinc(loinc_display, measurement.unit_ucum, loinc_code)) {
    throw new AnchorIngestError(
      'unit_incommensurable',
      `Unit incommensurable with LOINC ${loinc_code}; catalogue unit_ucum=${catalogueUnit}`,
      { biomarker_id: biomarker.biomarker_id, loinc_code }
    );
  }

  const unit = resolveUcumUnit(loinc_code, measurement.unit_ucum);
  if (!unit) {
    throw new AnchorIngestError(
      'unit_incommensurable',
      `No LOINC_UNITS entry matching ${loinc_code} + measurement unit`,
      { biomarker_id: biomarker.biomarker_id, loinc_code }
    );
  }

  const phys = isPhysiologicallyPossible(measurement.biomarker_id, measurement.value);
  if (!phys.ok) {
    throw new AnchorIngestError(
      'physiologically_impossible',
      `Value outside physiological envelope for ${measurement.biomarker_id}`,
      { biomarker_id: biomarker.biomarker_id, loinc_code }
    );
  }

  const valueQuantity = quantity(measurement.value, unit);
  if (!valueQuantity) {
    throw new AnchorIngestError('physiologically_impossible', `Non-finite value for ${measurement.biomarker_id}`, {
      biomarker_id: biomarker.biomarker_id,
      loinc_code
    });
  }

  // D-a: only the interval it was measured against — or none.
  const referenceRange =
    measurement.reference_interval_id == null
      ? undefined
      : [toFhirRange(measurement.reference_interval_id, measurement.biomarker_id, loinc_code, measurement.unit_ucum)];

  const subject = subjectReference({ connector: CONNECTOR.connector, subjectKey: ctx.subjectKey });

  const observation = createObservation({
    id: deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: ctx.subjectKey,
      recordId: ctx.collectionEventId,
      measure: measurement.biomarker_id
    }),
    code: { system: SYSTEMS.LOINC, code: loinc_code, display: loinc_display },
    category: CATEGORY.LABORATORY,
    subject,
    effectiveDateTime: ctx.effectiveDateTime,
    valueQuantity,
    ...(referenceRange ? { referenceRange } : {}),
    ...(device ? { device } : {})
  });

  const extensions = collectionExtensions(ctx);
  if (extensions.length) {
    observation.extension = extensions;
  }

  return observation;
}
