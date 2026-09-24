/**
 * WHAT: Orchestrates fetch/parse/map (or map-only) into a FHIR Bundle result.
 * NOT:  Must not swallow partial failures; issues go to OperationOutcome (ADR 0006).
GOVERNED BY: DECISIONS.md#d5; DECISIONS.md#d6
 * CORRECTNESS: HL7 validator on emitted bundles in CI; terminology/unit gates on source codings.
 */
import {
  buildBundle,
  ConnectorError,
  type ConnectorVersion,
  subjectReference,
  toOperationOutcome
} from '@open-twin/fhir-core';
import type { Bundle, FhirResource, OperationOutcome, Reference } from 'fhir/r4';
import { CONNECTOR, IssueLog } from '../issues';
import type { DatatypeContext } from '../v2/datatypes';
import { v2Instant } from '../v2/datetime';
import { field, findSegment, type ParsedMessage, parseMessage, type Segment } from '../v2/parser';
import { HL7V2_LOCAL_SYSTEM } from '../v2/tables';
import { obrToDiagnosticReport } from './diagnosticReport';
import { pv1ToEncounter } from './encounter';
import { noteFrom, obxToObservation } from './observation';
import { pidToPatient } from './patient';

export const VERSION = '0.1.0';

const CONNECTOR_VERSION: ConnectorVersion = { connector: CONNECTOR, version: VERSION };

/**
 * The message types this connector converts.
 *
 * ORU^R01 carries observation results; ADT^A01 (admit), A04 (register) and A08
 * (update patient information) carry patient administration and all three use the
 * ADT_A01 message structure. Every other trigger event is refused rather than
 * approximated: the segment groupings differ, and reading an ORM as an ORU attaches
 * an *order* to a patient as though it were a *result*.
 */
const SUPPORTED: Readonly<Record<string, ReadonlySet<string>>> = {
  ORU: new Set(['R01']),
  ADT: new Set(['A01', 'A04', 'A08'])
};

export interface ConvertOptions {
  /**
   * D1: the caller may supply the subject. When they do not, a deterministic
   * `urn:uuid:` reference derived from PID-3 is used and the Patient built from PID
   * is included in the bundle, so the bundle is internally consistent without
   * asserting an identity this connector cannot vouch for.
   */
  readonly subject?: Reference;
  /** Stable sender namespace when MSH-3/MSH-4 are absent or not unique across feeds. */
  readonly sourceNamespace?: string;
  /**
   * `Bundle.timestamp`, used when MSH-7 cannot supply one. The IG notes that "MSH-7
   * does not require a time offset while Bundle.timestamp does", and leaves the
   * choice to the implementer; MSH-7 wins when it carries an offset.
   */
  readonly timestamp: string;
  /**
   * System URI for codes whose v2 coding system is local, unknown or unstated.
   * Defaults to the Foundation-controlled namespace. Supply one per sending system
   * if you exchange with more than one: their local codes are not the same codes.
   */
  readonly localCodeSystem?: string;
  readonly bundleType?: 'collection' | 'transaction';
}

export interface ConversionResult {
  readonly bundle: Bundle;
  /** D6: absence of data is never an exception. Problems are reported, not thrown. */
  readonly issues?: OperationOutcome;
}

/**
 * Converts one HL7 v2 message to a FHIR R4 Bundle.
 *
 * Never throws on message content. A v2 message is a patient record: a parse failure
 * must not put any part of it into an exception, and one unreadable segment must not
 * discard the rest of the record.
 */
export function convertMessage(raw: string, options: ConvertOptions): ConversionResult {
  const issues = new IssueLog();
  const localCodeSystem = options.localCodeSystem ?? HL7V2_LOCAL_SYSTEM;

  const parsed = parseMessage(raw);
  if (!parsed.ok) {
    issues.addError(
      new ConnectorError(PARSE_FAILURES[parsed.reason], {
        code: 'validation',
        connector: CONNECTOR,
        operation: 'MSH'
      })
    );
    return { bundle: emptyBundle(options), issues: toOperationOutcome([...issues.all]) };
  }

  const message = parsed.message;
  const datatypes: DatatypeContext = { encoding: message.encoding, localCodeSystem };
  const msh = findSegment(message, 'MSH');
  const sender = [3, 4].map((number) => [1, 2, 3].map((part) => field(msh, number, part, message.encoding) ?? ''));
  const sourceNamespace =
    options.sourceNamespace?.trim() ||
    (sender.some((parts) => parts.some(Boolean)) ? JSON.stringify(sender) : undefined);
  const controlId = field(msh, 10, 1, message.encoding);
  if (!sourceNamespace || !controlId?.trim()) {
    issues.add(
      'A sender namespace and MSH-10 message control identifier are required for stable resource identity',
      'validation',
      { segment: 'MSH', position: 0 }
    );
    return { bundle: emptyBundle(options), issues: toOperationOutcome([...issues.all]) };
  }
  const messageControlId = JSON.stringify([sourceNamespace, controlId]);

  if (!isSupported(msh, datatypes, issues)) {
    return {
      bundle: emptyBundle(options, messageControlId),
      issues: toOperationOutcome([...issues.all])
    };
  }

  const pid = findSegment(message, 'PID');
  if (pid === undefined) {
    issues.add('The message has no PID segment, so nothing can be attributed to a patient', 'validation', {
      segment: 'PID',
      position: -1
    });
    return { bundle: emptyBundle(options, messageControlId), issues: toOperationOutcome([...issues.all]) };
  }

  // This converter handles one patient per message, never a multi-patient batch.
  if (message.segments.filter((segment) => segment.name === 'PID').length !== 1) {
    issues.add('Multiple PID segments require separate single-patient conversions', 'validation', {
      segment: 'PID',
      position: pid.position
    });
    return { bundle: emptyBundle(options, messageControlId), issues: toOperationOutcome([...issues.all]) };
  }
  const mappedPatient = pidToPatient(pid, datatypes, issues, CONNECTOR, sourceNamespace, options.subject?.reference);
  if (!mappedPatient) {
    return { bundle: emptyBundle(options, messageControlId), issues: toOperationOutcome([...issues.all]) };
  }
  const { patient, subjectKey } = mappedPatient;
  const subject = subjectReference({ reference: options.subject, connector: CONNECTOR, subjectKey });

  const resources: FhirResource[] = [];
  // Only emit the Patient this connector derived when the caller did not name one.
  // Emitting both would put two subjects for one person in a single bundle.
  if (options.subject === undefined) resources.push(patient);

  const pv1 = findSegment(message, 'PV1');
  const encounter = pv1
    ? pv1ToEncounter(pv1, datatypes, issues, { connector: CONNECTOR, subjectKey, messageControlId }, subject)
    : undefined;
  if (encounter) resources.push(encounter.encounter);

  const groups = groupSegments(message);
  for (const group of groups) {
    const results: Reference[] = [];
    for (const observationGroup of group.observations) {
      const observation = obxToObservation(
        observationGroup.obx,
        observationGroup.notes,
        {
          datatypes,
          connector: CONNECTOR,
          subjectKey,
          messageControlId,
          subject,
          ...(encounter ? { encounter: encounter.reference } : {})
        },
        issues
      );
      resources.push(observation);
      if (observation.id) results.push({ reference: `urn:uuid:${observation.id}` });
    }

    if (group.obr === undefined) continue;

    for (const note of group.orderNotes) {
      // The IG's ORU_R01 message map leaves the order-level NTE without a target,
      // and R4's DiagnosticReport has no `note` element to put it in. Dropping it
      // silently would lose a caveat the laboratory chose to attach to the result.
      if (noteFrom(note, datatypes)) {
        issues.add(
          'NTE at order level has no target in the v2-to-FHIR map for ORU_R01 and was not converted',
          'unsupported',
          {
            segment: note.name,
            position: note.position
          }
        );
      }
    }

    const report = obrToDiagnosticReport(
      group.obr,
      {
        datatypes,
        connector: CONNECTOR,
        subjectKey,
        messageControlId,
        subject,
        ...(encounter ? { encounter: encounter.reference } : {}),
        results
      },
      issues
    );
    if (report) resources.push(report);
  }

  const bundle = buildBundle({
    connector: CONNECTOR_VERSION,
    resources,
    timestamp: v2Instant(field(msh, 7, 1, message.encoding)) ?? options.timestamp,
    bundleKey: `${CONNECTOR}|${messageControlId}`,
    ...(options.bundleType ? { type: options.bundleType } : {})
  });

  const outcome = toOperationOutcome([...issues.all]);
  return outcome ? { bundle, issues: outcome } : { bundle };
}

const PARSE_FAILURES: Readonly<Record<'empty' | 'not-a-header' | 'malformed-delimiters', string>> = {
  empty: 'The message is empty',
  'not-a-header': 'The message does not begin with an MSH segment',
  'malformed-delimiters': 'MSH-1 and MSH-2 do not declare a usable set of encoding characters'
};

function isSupported(msh: Segment | undefined, datatypes: DatatypeContext, issues: IssueLog): boolean {
  const messageCode = field(msh, 9, 1, datatypes.encoding);
  const triggerEvent = field(msh, 9, 2, datatypes.encoding);
  const events = messageCode === undefined ? undefined : SUPPORTED[messageCode];

  if (events === undefined || triggerEvent === undefined || !events.has(triggerEvent)) {
    // MSH-9.1 and MSH-9.2 come from closed HL7 tables (0076 and 0003), so naming
    // them makes the issue actionable without quoting anything about the patient.
    // An unrecognised value is not named, because at that point it is free text.
    const named =
      messageCode !== undefined && SUPPORTED[messageCode] !== undefined && triggerEvent !== undefined
        ? `${messageCode}^${triggerEvent}`
        : undefined;
    issues.add(
      named
        ? `Message type ${named} is not supported by this connector`
        : 'MSH-9 carries a message type this connector does not support',
      'unsupported',
      { segment: 'MSH', position: msh?.position ?? 0, field: 'MSH-9' }
    );
    return false;
  }
  return true;
}

/**
 * An ORU_R01 is a sequence of ORDER_OBSERVATION groups, each an OBR followed by its
 * OBX segments, each of which may be followed by its own NTE segments. An ADT has
 * OBX segments with no OBR at all. Both are handled by walking the segments in
 * order: v2 grouping *is* segment order, and any parser that collects all OBX
 * segments and all OBR segments separately loses which result belongs to which order.
 */
interface ObservationGroup {
  readonly obx: Segment;
  readonly notes: Segment[];
}

interface OrderGroup {
  obr?: Segment;
  readonly orderNotes: Segment[];
  readonly observations: ObservationGroup[];
}

function groupSegments(message: ParsedMessage): OrderGroup[] {
  const groups: OrderGroup[] = [];
  let current: OrderGroup | undefined;
  let currentObservation: ObservationGroup | undefined;

  const ensureGroup = (): OrderGroup => {
    current ??= { orderNotes: [], observations: [] };
    if (!groups.includes(current)) groups.push(current);
    return current;
  };

  for (const segment of message.segments) {
    switch (segment.name) {
      case 'OBR': {
        current = { obr: segment, orderNotes: [], observations: [] };
        currentObservation = undefined;
        groups.push(current);
        break;
      }
      case 'OBX': {
        currentObservation = { obx: segment, notes: [] };
        ensureGroup().observations.push(currentObservation);
        break;
      }
      case 'NTE': {
        if (currentObservation) currentObservation.notes.push(segment);
        else if (current?.obr) current.orderNotes.push(segment);
        break;
      }
      default:
        // PID, PV1 and anything else end the current OBX's run of NTE segments.
        currentObservation = undefined;
        break;
    }
  }

  return groups;
}

function emptyBundle(options: ConvertOptions, messageControlId = 'unparsed'): Bundle {
  const bundle = buildBundle({
    connector: CONNECTOR_VERSION,
    resources: [],
    timestamp: options.timestamp,
    bundleKey: `${CONNECTOR}|${messageControlId}`,
    ...(options.bundleType ? { type: options.bundleType } : {})
  });
  // FHIR forbids an empty JSON array: `"entry": []` is a validation error, not an
  // empty bundle. `Bundle.entry` is 0..*, so the element is removed instead.
  bundle.entry = undefined;
  return bundle;
}
