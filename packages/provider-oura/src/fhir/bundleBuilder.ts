import type { Bundle, Observation } from 'fhir/r4';
import type { OuraResponseParams } from '../api/schemas/client';
import type { OuraPersonal } from '../api/schemas/personal';
import { inferOuraResponse } from '../utils/objectUtils';
import { getSchemaNameRuntime, type SupportedSchemaTypes } from '../utils/typeUtils';
import { mapOuraDailyActivityToFHIR } from './mappers/daily';
import { mapOuraHeartRateToFHIR } from './mappers/heartrate';
import { mapOuraPersonalToFHIR } from './mappers/personal';
import { mapOuraSleepToFHIR } from './mappers/sleep';
import { mapOuraSpo2ToFHIR } from './mappers/spo2';

export function buildBundleFromResponse(response: OuraResponseParams[]): Bundle {
  const entries: (Observation | Bundle)[] = [];

  for (const params of response) {
    const inferredData = inferOuraResponse(params);

    if ('data' in inferredData) {
      switch (getSchemaNameRuntime(inferredData)) {
        case 'daily_activity':
          entries.push(
            ...mapOuraDailyActivityToFHIR(inferredData as SupportedSchemaTypes['daily_activity'], 'unknown')
          );
          break;
        case 'heartrate':
          entries.push(...mapOuraHeartRateToFHIR(inferredData as SupportedSchemaTypes['heartrate']));
          break;
        case 'sleep':
          entries.push(...mapOuraSleepToFHIR(inferredData as SupportedSchemaTypes['sleep']));
          break;
        case 'spo2':
          entries.push(...mapOuraSpo2ToFHIR(inferredData as SupportedSchemaTypes['spo2']));
          break;
        default:
          throw new Error(`Unsupported type: ${params}`);
      }
    } else {
      entries.push(mapOuraPersonalToFHIR(inferredData as OuraPersonal));
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: entries.map((entry) => ({ resource: entry }))
  };
}
