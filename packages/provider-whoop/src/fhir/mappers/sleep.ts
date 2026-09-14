/**
 * WHAT: Maps WHOOP sleep records into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record (verify/terminology-allowlist.json) for LOINC/SNOMED emitted here; UCUM gate for quantities.
 */
import { CATEGORY, createObservation, quantity, UCUM } from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import type { WhoopSleep } from '../../api/schemas/sleep';
import {
  effectiveFromIso,
  LOINC,
  type WhoopMapperContext,
  whoopCoding,
  whoopIdentifier,
  whoopResourceId
} from './shared';

export function mapWhoopSleepToFHIR(rows: WhoopSleep[], context: WhoopMapperContext): Observation[] {
  if (rows.length === 0) return [];

  const observations: Observation[] = [];

  for (const row of rows) {
    if (row.nap) continue;
    const score = row.score;
    if (!score) continue;

    const key = row.id ?? String(row.start ?? 'unknown');
    const effective = effectiveFromIso(row.start, context.retrievedAt);

    if (typeof score.sleep_performance_percentage === 'number') {
      observations.push(
        createObservation({
          id: whoopResourceId(context, key, 'sleep-performance'),
          identifier: whoopIdentifier(key),
          code: whoopCoding('sleep-performance', 'WHOOP sleep performance'),
          category: CATEGORY.ACTIVITY,
          subject: context.subject,
          effectiveDateTime: effective,
          valueQuantity: quantity(score.sleep_performance_percentage, UCUM.PERCENT)
        })
      );
    }

    if (typeof score.sleep_efficiency_percentage === 'number') {
      observations.push(
        createObservation({
          id: whoopResourceId(context, key, 'sleep-efficiency'),
          identifier: whoopIdentifier(`${key}-efficiency`),
          code: whoopCoding('sleep-efficiency', 'WHOOP sleep efficiency'),
          category: CATEGORY.ACTIVITY,
          subject: context.subject,
          effectiveDateTime: effective,
          valueQuantity: quantity(score.sleep_efficiency_percentage, UCUM.PERCENT)
        })
      );
    }

    const inBedMs = score.stage_summary?.total_in_bed_time_milli;
    if (typeof inBedMs === 'number') {
      const minutes = Math.round(inBedMs / 60_000);
      observations.push(
        createObservation({
          id: whoopResourceId(context, key, 'time-in-bed'),
          identifier: whoopIdentifier(`${key}-in-bed`),
          code: LOINC.TIME_IN_BED,
          category: CATEGORY.ACTIVITY,
          subject: context.subject,
          effectiveDateTime: effective,
          valueQuantity: quantity(minutes, UCUM.MINUTE)
        })
      );
    }
  }

  return observations;
}
