/**
 * WHAT: The one reader interface every connector implements, and the wrapper interface.
 * NOT:  Does not implement either; HealthDataReader in base.ts is the shared implementation. Writers come with the writer pull request.
 * GOVERNED BY: DECISIONS.md#d16; DECISIONS.md#d6
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: isThisType never touches the network and open never fetches health data; the conformance suite asserts both with a throwing fetch.
 */
import type { HostServices, ReaderDescriptor, ReaderInput, ReaderMetadata, ReadRequest, ReadResult } from './types';

export interface IHealthDataReader {
  readonly descriptor: ReaderDescriptor;

  /** File readers sniff content, never the suffix alone; API readers match `input.sourceId`. Side-effect free. */
  isThisType(input: ReaderInput): Promise<boolean> | boolean;

  /**
   * Validates the config and restores tokens or a cursor through the host stores.
   * Throws `ConnectorError` code `validation`, operation `open`, on an invalid input.
   */
  open(input: ReaderInput, host?: HostServices): Promise<void>;

  describe(): Promise<ReaderMetadata>;

  /**
   * Retrieves or parses, then maps to a FHIR R4 bundle through fhir-core: subject per D1,
   * ids per D2, codes per D3, units per D4, missing data as dataAbsentReason, offsets
   * kept (D7), the connector tag on every Observation, errors as `ConnectorError`.
   */
  read(request: ReadRequest): Promise<ReadResult>;

  /** Persists changed tokens or a cursor through the host stores. Idempotent. */
  close(): Promise<void>;
}

export interface ReaderWrapper extends IHealthDataReader {
  readonly inner: IHealthDataReader | IHealthDataReader[];
}
