import type { Bundle, Observation } from 'fhir/r4';
import type { RequestParams } from '../api/schemas/client';
import type { OuraPersonal } from '../api/schemas/personal';
import { requestOuraData } from '../utils/clientUtils';
import { inferOuraResponse } from '../utils/objectUtils';
import type { TokenHandler } from '../utils/tokenUtils';
import type { SupportedSchemaTypes } from '../utils/typeUtils';
import { mapOuraCardiovascularAgeToFHIR } from './mappers/cardiovascular';
import { mapOuraDailyActivityToFHIR } from './mappers/daily';
import { mapOuraHeartRateToFHIR } from './mappers/heartrate';
import { mapOuraPersonalToFHIR } from './mappers/personal';
import { mapOuraReadinessToFHIR } from './mappers/readiness';
import { mapOuraResilienceToFHIR } from './mappers/resilience';
import { mapOuraRestModeToFHIR } from './mappers/restmode';
import { mapOuraRingConfigToFHIR } from './mappers/ringconfig';
import { mapOuraSessionToFHIR } from './mappers/session';
import { mapOuraSleepToFHIR } from './mappers/sleep';
import { mapOuraSpo2ToFHIR } from './mappers/spo2';
import { mapOuraStressToFHIR } from './mappers/stress';
import { mapOuraVO2MaxToFHIR } from './mappers/vo2max';
import { mapOuraWorkoutToFHIR } from './mappers/workout';

export async function buildBundleFromResponse(
  request: RequestParams,
  tokenHandler: TokenHandler,
  sandbox: boolean = false
): Promise<Bundle | undefined> {
  const entries: (Observation | Bundle)[] = [];
  const responses = await requestOuraData(request, tokenHandler, sandbox);
  for (let i = 0; i < request.types.length; i++) {
    const type = request.types[i];
    const inferredData = inferOuraResponse(responses[i]);

    if (inferredData) {
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
          case 'workout':
            entries.push(...mapOuraWorkoutToFHIR(inferredData as SupportedSchemaTypes['workout']));
            break;
          case 'daily_cardiovascular_age':
            entries.push(
              ...mapOuraCardiovascularAgeToFHIR(inferredData as SupportedSchemaTypes['daily_cardiovascular_age'])
            );
            break;
          case 'vO2_max':
            entries.push(...mapOuraVO2MaxToFHIR(inferredData as SupportedSchemaTypes['vO2_max']));
            break;
          case 'daily_readiness':
            entries.push(...mapOuraReadinessToFHIR(inferredData as SupportedSchemaTypes['daily_readiness']));
            break;
          case 'daily_resilience':
            entries.push(...mapOuraResilienceToFHIR(inferredData as SupportedSchemaTypes['daily_resilience']));
            break;
          case 'daily_stress':
            entries.push(...mapOuraStressToFHIR(inferredData as SupportedSchemaTypes['daily_stress']));
            break;
          case 'rest_mode_period':
            entries.push(...mapOuraRestModeToFHIR(inferredData as SupportedSchemaTypes['rest_mode_period']));
            break;
          case 'ring_configuration':
            entries.push(...mapOuraRingConfigToFHIR(inferredData as SupportedSchemaTypes['ring_configuration']));
            break;
          case 'session':
            entries.push(...mapOuraSessionToFHIR(inferredData as SupportedSchemaTypes['session']));
            break;
          default:
            throw new Error(`Unsupported type: ${type}`);
        }
      } else {
        entries.push(mapOuraPersonalToFHIR(inferredData as OuraPersonal));
      }
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: entries.map((entry) => ({ resource: entry }))
  };
}
