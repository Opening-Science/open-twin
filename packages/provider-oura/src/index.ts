import { OuraResponseParams, RequestParams } from "./api/schemas/client";
import { OuraPersonal } from "./api/schemas/personal";
import { convertDailyActivityToFhir } from "./fhir/convert";
import { DailyActivityFhir } from "./fhir/schemas/daily";
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
): Promise<DailyActivityFhir[]> {
  const data = await requestOuraData(request, bearerToken);
  const inferredData = inferOuraResponse(data);
  if (request.type === "daily_activity") {
    return convertDailyActivityToFhir(
      inferredData as SupportedSchemaTypes["daily_activity"],
      "unknown",
    );
  }
  return [];
}
