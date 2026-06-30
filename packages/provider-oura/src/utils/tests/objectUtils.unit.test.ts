import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError, type z } from 'zod/v4';
import type { OuraResponseParams } from '../../api/schemas/client';
import type { OuraDailyActivityResponseList } from '../../api/schemas/daily';
import { type OuraPersonal, PersonalSchema } from '../../api/schemas/personal';
import type { SleepListSchema } from '../../api/schemas/sleep';
import { inferOuraResponse } from '../objectUtils';
import * as typeUtils from '../typeUtils';

vi.mock('../../api/schemas/personal', () => ({
  PersonalSchema: {
    safeParse: vi.fn()
  }
}));

describe('inferOuraResponse', () => {
  const zodError: z.core.$ZodIssue = {
    code: 'invalid_type',
    expected: 'string',
    message: 'Invalid id',
    path: ['id']
  };
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully parse and return data matching PersonalSchema when data is absent', () => {
    const mockPersonal = {
      id: '123',
      age: 30,
      weight: 70,
      height: 1.8,
      biological_sex: 'other',
      email: 'email@email.com'
    };
    const mockParsedData: OuraPersonal = { ...mockPersonal };

    vi.mocked(PersonalSchema.safeParse).mockReturnValue({
      success: true,
      data: mockParsedData as OuraPersonal
    });

    const result = inferOuraResponse(mockPersonal);

    expect(PersonalSchema.safeParse).toHaveBeenCalledWith(mockPersonal);
    expect(result).toEqual(mockParsedData);
  });

  it('should throw an error if data is absent and PersonalSchema validation fails', () => {
    const mockParams = {
      id: '',
      age: -5,
      weight: 70,
      height: 1.8,
      biological_sex: 'other',
      email: 'invalid_email'
    };

    vi.mocked(PersonalSchema.safeParse).mockReturnValue({
      success: false,
      error: new ZodError([zodError]) as ZodError<OuraPersonal>
    });

    let thrownError: Error | null = null;
    try {
      inferOuraResponse(mockParams);
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).toBeInstanceOf(ZodError);

    expect((thrownError as ZodError).issues).toStrictEqual([zodError]);
    expect(thrownError?.cause).toStrictEqual(undefined);
  });

  it('should successfully match and return parsed data from the list of supported schemas', () => {
    const getListSpy = vi.spyOn(typeUtils, 'getListOfSupportedSchemas');
    const getNameSpy = vi.spyOn(typeUtils, 'getSchemaNameRuntime').mockReturnValue('sleep');
    const mockParams = {
      data: [
        {
          id: '123',
          bedtime_start: '2023-01-01T00:00:00Z',
          bedtime_end: '2023-01-01T08:00:00Z',
          score: 90,
          day: '2023-01-01'
        }
      ]
    } as unknown as OuraResponseParams;

    vi.mocked(PersonalSchema.safeParse).mockReturnValue({
      success: false,
      error: new ZodError([zodError]) as ZodError<OuraPersonal>
    });

    const mockParsedData = {
      data: [
        {
          id: '123',
          bedtime_start: '2023-01-01T00:00:00Z',
          bedtime_end: '2023-01-01T08:00:00Z',
          score: 90,
          day: '2023-01-01'
        }
      ]
    } as unknown as OuraDailyActivityResponseList;

    const result = inferOuraResponse(mockParams as unknown as OuraResponseParams);

    expect(getListSpy).toHaveBeenCalledTimes(1);
    expect(getNameSpy).toHaveBeenCalledTimes(1);
    expect(getNameSpy).toHaveBeenCalledWith(mockParams.data);
    expect(getNameSpy).toHaveReturnedWith('sleep');
    expect(result).toEqual(mockParsedData);
  });

  it('should throw an error if data is an array but matches no supported schemas', () => {
    const getListSpy = vi.spyOn(typeUtils, 'getListOfSupportedSchemas');
    const getNameSpy = vi.spyOn(typeUtils, 'getSchemaNameRuntime').mockReturnValue('unknown');

    const mockParams = { data: [{ unknown: 'structure' }] };

    vi.mocked(PersonalSchema.safeParse).mockReturnValue({
      success: false,
      error: new ZodError([zodError]) as ZodError<OuraPersonal>
    });

    const mockSchema = {
      safeParse: vi.fn().mockReturnValue({ success: false, error: new ZodError([]) })
    } as unknown as typeof SleepListSchema;

    const mockSupportedList = [
      { schemaName: 'sleep', schema: mockSchema }
    ] as unknown as typeUtils.SupportedSchemaEntry[];

    let thrownError: Error | null = null;
    try {
      inferOuraResponse(mockParams as unknown as OuraResponseParams);
    } catch (err) {
      thrownError = err as Error;
    }

    expect(getListSpy).toHaveBeenCalledTimes(1);
    expect(getNameSpy).toHaveBeenCalledTimes(1);
    expect(getNameSpy).toHaveBeenCalledWith(mockParams.data);
    expect(thrownError).toBeInstanceOf(Error);
    expect(thrownError?.message).toBe('Response data does not match any supported schema.');
    expect(thrownError?.cause).toStrictEqual({ listOfSupportedSchemas: mockSupportedList, params: mockParams });
  });
});
