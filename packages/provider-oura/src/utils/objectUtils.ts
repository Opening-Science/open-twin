import { OuraResponseParams } from "../api/schemas/client";
import {
  getListOfSupportedSchemas,
  SupportedSchemaName,
  SupportedSchemaTypes,
} from "./typeUtils";

export function inferOuraResponse(
  params: OuraResponseParams,
): SupportedSchemaTypes[SupportedSchemaName] {
  if (!params.data && !Array.isArray(params.data) && params.data.length === 0) {
    throw new Error("Response data is empty or invalid.");
  }

  const listOfSupportedSchemas = getListOfSupportedSchemas();
  for (const { schema } of listOfSupportedSchemas) {
    const parseResult = schema.safeParse(params);
    if (parseResult.success) {
      return parseResult.data;
    }
  }
  throw new Error("Response data does not match any supported schema.");
}
