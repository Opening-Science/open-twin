/**
 * WHAT: Maps WHOOP recovery records into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record (verify/terminology-allowlist.json) for LOINC/SNOMED emitted here; UCUM gate for quantities.
 */
import {
  CATEGORY,
  createObservation,
  dataAbsentReason,
  optionalNumericComponent,
  quantity,
  UCUM
} from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import type { WhoopRecovery } from '../../api/schemas/recovery';
import {
  effectiveFromIso,
  LOINC,
  type WhoopMapperContext,
  whoopCoding,
  whoopIdentifier,
  whoopResourceId
} from './shared';

function recoveryKey(row: WhoopRecovery): string {
  return row.sleep_id ?? String(row.cycle_id ?? row.created_at ?? 'unknown');
}

export function mapWhoopRecoveryToFHIR(rows: WhoopRecovery[], context: WhoopMapperContext): Observation[] {
  if (rows.length === 0) return [];

  const observations: Observation[] = [];

  for (const row of rows) {
    const score = row.score;
    if (!score) continue;

    const effective = effectiveFromIso(row.created_at, context.retrievedAt);
    const key = recoveryKey(row);

    if (typeof score.recovery_score === 'number') {
      observations.push(
        createObservation({
          id: whoopResourceId(context, key, 'recovery-score'),
          identifier: whoopIdentifier(key),
          code: whoopCoding('recovery-score', 'WHOOP recovery score'),
          category: CATEGORY.SURVEY,
          subject: context.subject,
          effectiveDateTime: effective,
          valueQuantity: quantity(score.recovery_score, UCUM.SCORE)
        })
      );
    }

    if (typeof score.hrv_rmssd_milli === 'number') {
      observations.push(
        createObservation({
          id: whoopResourceId(context, key, 'hrv-rmssd'),
          identifier: whoopIdentifier(`${key}-hrv`),
          code: whoopCoding('hrv-rmssd', 'HRV RMSSD'),
          category: CATEGORY.VITAL_SIGNS,
          subject: context.subject,
          effectiveDateTime: effective,
          valueQuantity: quantity(score.hrv_rmssd_milli, UCUM.MILLISECOND)
        })
      );
    }

    if (typeof score.resting_heart_rate === 'number') {
      observations.push(
        createObservation({
          id: whoopResourceId(context, key, 'resting-hr'),
          identifier: whoopIdentifier(`${key}-rhr`),
          code: LOINC.HEART_RATE,
          category: CATEGORY.VITAL_SIGNS,
          subject: context.subject,
          effectiveDateTime: effective,
          valueQuantity: quantity(score.resting_heart_rate, UCUM.PER_MINUTE)
        })
      );
    }

    if (typeof score.spo2_percentage === 'number') {
      // Root code stays WHOOP-local: LOINC 59408-5 alone pulls the oxygen-sat
      // profile, which requires magic code 2708-6. Same pattern as Oura spo2.
      observations.push(
        createObservation({
          id: whoopResourceId(context, key, 'spo2'),
          identifier: whoopIdentifier(`${key}-spo2`),
          code: whoopCoding('spo2', 'WHOOP SpO2'),
          category: CATEGORY.VITAL_SIGNS,
          subject: context.subject,
          effectiveDateTime: effective,
          dataAbsentReason: dataAbsentReason('not-applicable'),
          components: [
            optionalNumericComponent(
              [LOINC.OXYGEN_SATURATION, whoopCoding('spo2-percentage', 'SpO2 percentage')],
              score.spo2_percentage,
              UCUM.PERCENT
            )
          ]
        })
      );
    }
  }

  return observations;
}
