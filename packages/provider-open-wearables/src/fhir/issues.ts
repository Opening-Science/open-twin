/**
 * WHAT: Open Wearables → FHIR mapping helpers.
 * NOT:  Must not perform HTTP; caller supplies normalised payloads.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: signed review record where codes are emitted; package fixtures are project-published (unverified against a live instance).
 * GOTCHA: Marked unverified against a running Open Wearables instance in BUILD-SUMMARY.
 */
import { ConnectorError } from '@open-twin/fhir-core';
import { CONNECTOR } from '../config/constants';

/**
 * Decision D6: absence of data is never an exception, and one unmappable series
 * type must not discard the rest of the sync. Everything this mapper declines to
 * map is collected here and surfaced as an `OperationOutcome`, so a caller can tell
 * "there was no data in this window" from "there was data and it was dropped".
 *
 * Issues are deduplicated by key: a page of 5000 heart-rate samples in an unknown
 * unit is one problem, not five thousand, and five thousand identical issues would
 * bury the one that matters.
 */
export class IssueLog {
  private readonly seen = new Map<string, ConnectorError>();

  /**
   * `detail` must describe the *schema*, never the data: series type names, field
   * names and unit tokens only. It ends up in `OperationOutcome.diagnostics`, which
   * is logged, forwarded and stored like any other diagnostic string.
   */
  add(key: string, message: string, detail: string): void {
    if (this.seen.has(key)) return;
    this.seen.set(
      key,
      new ConnectorError(message, {
        code: 'unsupported',
        connector: CONNECTOR.connector,
        operation: detail
      })
    );
  }

  errors(): ConnectorError[] {
    return [...this.seen.values()];
  }
}
