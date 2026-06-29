import type { Bundle, Observation } from 'fhir/r4';
import type { RequestParams } from '../api/schemas/client';
import type { OuraPersonal } from '../api/schemas/personal';
import { requestOuraData } from '../utils/clientUtils';
import { inferOuraResponse } from '../utils/objectUtils';
import type { SupportedSchemaTypes } from '../utils/typeUtils';
import { mapOuraDailyActivityToFHIR } from './mappers/daily';
import { mapOuraHeartRateToFHIR } from './mappers/heartrate';
import { mapOuraPersonalToFHIR } from './mappers/personal';
import { mapOuraSleepToFHIR } from './mappers/sleep';
import { mapOuraSpo2ToFHIR } from './mappers/spo2';

export async function buildBundleFromResponse(request: RequestParams, bearerToken: string): Promise<Bundle> {
  const entries: (Observation | Bundle)[] = [];

  for (const type of request.types) {
    const ouraResponse = await requestOuraData({ ...request, types: [type] }, bearerToken);
    const inferredData = inferOuraResponse(ouraResponse[0]);

    if ('data' in inferredData) {
      switch (type) {
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
        case 'daily_spo2':
          entries.push(...mapOuraSpo2ToFHIR(inferredData as SupportedSchemaTypes['spo2']));
          break;
        default:
          throw new Error(`Unsupported type: ${type}`);
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
