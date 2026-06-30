import type { OuraResponseParams } from '../api/schemas/client';
import { type OuraPersonal, PersonalSchema } from '../api/schemas/personal';
import {
  getListOfSupportedSchemas,
  getSchemaNameRuntime,
  type SupportedSchemaName,
  type SupportedSchemaTypes
} from './typeUtils';

export function inferOuraResponse(
  params: OuraResponseParams | OuraPersonal
): SupportedSchemaTypes[SupportedSchemaName] | OuraPersonal {
  const parseResult = PersonalSchema.safeParse(params);
  if (parseResult.success) {
    return parseResult.data;
  }

  if (!('data' in params)) {
    throw parseResult.error;
  }
  const runtimeSchemaName = getSchemaNameRuntime(params.data);

  const listOfSupportedSchemas = getListOfSupportedSchemas();
  for (const { schemaName, schema } of listOfSupportedSchemas) {
    if (runtimeSchemaName === schemaName) {
      const parseResult = schema.safeParse(params);
      if (parseResult.success) {
        return parseResult.data;
      }
    }
  }

  throw new Error('Response data does not match any supported schema.', {
    cause: { listOfSupportedSchemas, params }
  });
}
