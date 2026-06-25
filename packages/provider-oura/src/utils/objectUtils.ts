import { OuraResponseParams } from "../api/schemas/client";
import { OuraPersonal, PersonalSchema } from "../api/schemas/personal";
import {
  getListOfSupportedSchemas,
  SupportedSchemaName,
  SupportedSchemaTypes,
} from "./typeUtils";

export function inferOuraResponse(
  params: OuraResponseParams,
): SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal {
  if (!params.data) {
    console.log("Response data is missing:", params);
    const parseResult = PersonalSchema.safeParse(params);
    if (parseResult.success) {
      return parseResult.data;
    }
    throw new Error("Response data does not match Personal schema.");
  }

  if (!Array.isArray(params.data)) {
    console.log("Response data is not an array:", params.data);
    throw new Error("Response data is not an array.");
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
