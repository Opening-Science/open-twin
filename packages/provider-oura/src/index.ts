import type { Bundle, Observation } from "fhir/r4";
import type { RequestParams } from "./api/schemas/client";
import type { OuraPersonal } from "./api/schemas/personal";
import { mapOuraDailyActivityToFHIR } from "./fhir/mappers/daily";
import { mapOuraHeartRateToFHIR } from "./fhir/mappers/heartrate";
import { mapOuraPersonalToFHIR } from "./fhir/mappers/personal";
import { mapOuraSleepToFHIR } from "./fhir/mappers/sleep";
import { mapOuraSpo2ToFHIR } from "./fhir/mappers/spo2";
import { requestOuraData } from "./utils/clientUtils";
import { inferOuraResponse } from "./utils/objectUtils";
import type {
  SupportedSchemaName,
  SupportedSchemaTypes,
} from "./utils/typeUtils";

export async function getSandboxOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal> {
  const data = await requestOuraData(request, bearerToken, true);
  return inferOuraResponse(data);
}

export async function getOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal> {
  const data = await requestOuraData(request, bearerToken);
  return inferOuraResponse(data);
}

export async function getFhirDailyActivityFromOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<Observation[]> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = inferOuraResponse(data);
  if (request.type === "daily_activity") {
    return mapOuraDailyActivityToFHIR(
      inferredData as SupportedSchemaTypes["daily_activity"],
      "unknown",
    );
  }
  return [];
}

export async function getFhirSleepFromOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<Observation[]> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = inferOuraResponse(data);
  if (request.type === "sleep") {
    return mapOuraSleepToFHIR(inferredData as SupportedSchemaTypes["sleep"]);
  }
  return [];
}

export async function getFhirHeartRateFromOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<Observation[]> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = inferOuraResponse(data);
  if (request.type === "heartrate") {
    return mapOuraHeartRateToFHIR(
      inferredData as SupportedSchemaTypes["heartrate"],
    );
  }
  return [];
}

export async function getFhirSpo2FromOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<Observation[]> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = inferOuraResponse(data);
  if (request.type === "daily_spo2") {
    return mapOuraSpo2ToFHIR(inferredData as SupportedSchemaTypes["spo2"]);
  }
  return [];
}

export async function getFhirPersonalFromOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<Bundle> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = inferOuraResponse(data);
  if (request.type === "personal_info") {
    return mapOuraPersonalToFHIR(inferredData as OuraPersonal);
  }
  throw new Error("Unsupported request type for personal data.");
}
