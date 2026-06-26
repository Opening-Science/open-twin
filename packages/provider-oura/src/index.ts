import { OuraResponseParams, RequestParams } from "./api/schemas/client";
import { OuraPersonal } from "./api/schemas/personal";
import { mapOuraDailyActivityToFHIR } from "./fhir/schemas/daily";
import { mapOuraHeartRateToFHIR } from "./fhir/schemas/heartrate";
import { FhirPatient, mapOuraPersonalToFHIR } from "./fhir/schemas/personal";
import { FhirObservation, FhirSchema } from "./fhir/schemas/shared";
import { mapOuraSleepToFHIR } from "./fhir/schemas/sleep";
import { mapOuraSpo2ToFHIR } from "./fhir/schemas/spo2";
import { requestOuraData } from "./utils/clientUtils";
import { inferOuraResponse } from "./utils/objectUtils";
import { SupportedSchemaName, SupportedSchemaTypes } from "./utils/typeUtils";

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
): Promise<FhirObservation[]> {
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
): Promise<FhirObservation[]> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = inferOuraResponse(data);
  if (request.type === "sleep") {
    console.log("Mapping inferredData to FHIR sleep observations:");
    return mapOuraSleepToFHIR(inferredData as SupportedSchemaTypes["sleep"]);
  }
  return [];
}

export async function getFhirHeartRateFromOuraData(
  request: RequestParams,
  bearerToken: string,
): Promise<FhirObservation[]> {
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
): Promise<FhirObservation[]> {
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
): Promise<(FhirPatient | FhirObservation)[]> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = inferOuraResponse(data);
  if (request.type === "personal_info") {
    return mapOuraPersonalToFHIR(inferredData as OuraPersonal);
  }
  return [];
}
