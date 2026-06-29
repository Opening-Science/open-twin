import type { OuraResponseParams } from '../api/schemas/client';
import { type OuraPersonal, PersonalSchema } from '../api/schemas/personal';
import { getListOfSupportedSchemas, type SupportedSchemaName, type SupportedSchemaTypes } from './typeUtils';

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

  const listOfSupportedSchemas = getListOfSupportedSchemas();
  for (const { schema } of listOfSupportedSchemas) {
    const parseResult = schema.safeParse(params);
    if (parseResult.success) {
      return parseResult.data;
    }
  }

  throw new Error('Response data does not match any supported schema.', {
    cause: { listOfSupportedSchemas, params }
  });
}
