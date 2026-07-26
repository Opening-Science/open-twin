import { ConnectorError, type ConnectorErrorCode } from '@open-twin/fhir-core';

export const CONNECTOR = 'hl7v2';

/**
 * Where in the message something went wrong, expressed without quoting the message.
 *
 * An HL7 v2 message is a patient's record. `OBX-5` of a haematology result is a
 * number that, with the code beside it, is a diagnosis; `PID-5` is a name. None of
 * it belongs in a log line, an exception message, a stack trace or an error-reporting
 * service, and `Error.cause` is not an exception to that — it is serialised by every
 * logger that serialises anything.
 *
 * So a location is a segment name, its ordinal position in the message and a field
 * number. That is enough to find the problem in the original message, which the
 * operator has and the log reader does not.
 */
export interface Location {
  readonly segment: string;
  /** 0-based position of the segment within the message. */
  readonly position: number;
  readonly field?: string;
}

export function locate(location: Location): string {
  const at = `${location.segment}[${location.position}]`;
  return location.field ? `${at} ${location.field}` : at;
}

/** Collects every problem found while converting one message. */
export class IssueLog {
  private readonly errors: ConnectorError[] = [];

  add(message: string, code: ConnectorErrorCode, location: Location): void {
    this.errors.push(new ConnectorError(message, { code, connector: CONNECTOR, operation: locate(location) }));
  }

  addError(error: ConnectorError): void {
    this.errors.push(error);
  }

  get all(): readonly ConnectorError[] {
    return this.errors;
  }
}
