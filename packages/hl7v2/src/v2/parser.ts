/**
 * WHAT: HL7 v2 parse/datatype/encoding helpers.
 * NOT:  Must not invent FHIR codings; fhir/ and tables own clinical mapping.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: HL7 v2 encoding rules; golden fixtures from HL7 v2-to-FHIR IG where used.
 */
import { type EncodingCharacters, type EncodingResult, readEncodingCharacters, unescapeText } from './encoding';

/**
 * A parsed segment.
 *
 * `fields[i]` holds field number `i + 1`, including for MSH. That uniformity is
 * worth the one special case it costs: MSH-1 *is* the field separator, so splitting
 * `MSH|^~\&|SndApp|...` on the separator yields a list whose first element is the
 * segment name and whose second is MSH-2, leaving every MSH field one place to the
 * left of every other segment's. Off-by-one on MSH-9 is the difference between
 * reading a message type and reading a security field.
 */
export interface Segment {
  readonly name: string;
  /** 0-based position of this segment in the message, for reporting a location. */
  readonly position: number;
  /** `fields[n - 1]` is field n; each field is a list of repetitions. */
  readonly fields: readonly Repetition[][];
}

/** One repetition of a field: components, each of which is a list of subcomponents. */
export interface Repetition {
  readonly components: readonly (readonly string[])[];
}

export interface ParsedMessage {
  readonly encoding: EncodingCharacters;
  readonly segments: readonly Segment[];
}

export type ParseResult =
  | { readonly ok: true; readonly message: ParsedMessage }
  | { readonly ok: false; readonly reason: 'empty' | 'not-a-header' | 'malformed-delimiters' };

/**
 * Segments are separated by a carriage return in the standard. Real senders and
 * intermediaries emit CRLF or bare LF often enough that rejecting them would reject
 * genuine patient records over a line ending.
 */
const SEGMENT_SEPARATOR = /\r\n|\r|\n/;

export function parseMessage(raw: string): ParseResult {
  const lines = raw.split(SEGMENT_SEPARATOR).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { ok: false, reason: 'empty' };

  const header = lines[0] as string;
  const encodingResult: EncodingResult = readEncodingCharacters(header);
  if (!encodingResult.ok) return { ok: false, reason: encodingResult.reason };
  const encoding = encodingResult.encoding;

  const segments: Segment[] = [];
  for (const [position, line] of lines.entries()) {
    const parts = line.split(encoding.field);
    const name = (parts[0] ?? '').trim();
    if (name.length === 0) continue;

    const rawFields = name === 'MSH' ? [encoding.field, ...parts.slice(1)] : parts.slice(1);
    const fields = rawFields.map((value, index) =>
      // MSH-2 declares the delimiters; splitting it on them would destroy it.
      name === 'MSH' && index === 1 ? [literal(value)] : splitRepetitions(value, encoding)
    );
    segments.push({ name, position, fields });
  }

  return { ok: true, message: { encoding, segments } };
}

function literal(value: string): Repetition {
  return { components: [[value]] };
}

function splitRepetitions(value: string, encoding: EncodingCharacters): Repetition[] {
  return value.split(encoding.repetition).map((repetition) => ({
    components: repetition.split(encoding.component).map((component) => component.split(encoding.subcomponent))
  }));
}

export function findSegments(message: ParsedMessage, name: string): Segment[] {
  return message.segments.filter((segment) => segment.name === name);
}

export function findSegment(message: ParsedMessage, name: string): Segment | undefined {
  return message.segments.find((segment) => segment.name === name);
}

/** Every repetition of field `n`. Empty when the field is absent or blank. */
export function repetitions(segment: Segment | undefined, n: number): readonly Repetition[] {
  const field = segment?.fields[n - 1];
  if (!field) return [];
  return field.filter((repetition) => !isBlank(repetition));
}

export function repetition(segment: Segment | undefined, n: number, index = 0): Repetition | undefined {
  return repetitions(segment, n)[index];
}

/**
 * Component `c` of a repetition, unescaped. Component 1 of a field written without
 * any component separator is the field itself, which is what makes `OBX-3` usable
 * whether it arrives as `8302-2` or as `8302-2^Body Height^LN`.
 */
export function component(rep: Repetition | undefined, c: number, encoding: EncodingCharacters): string | undefined {
  const sub = rep?.components[c - 1]?.[0];
  return clean(sub, encoding);
}

export function subcomponent(
  rep: Repetition | undefined,
  c: number,
  s: number,
  encoding: EncodingCharacters
): string | undefined {
  return clean(rep?.components[c - 1]?.[s - 1], encoding);
}

/** Field `n`, first repetition, component `c`. */
export function field(
  segment: Segment | undefined,
  n: number,
  c: number,
  encoding: EncodingCharacters
): string | undefined {
  return component(repetition(segment, n), c, encoding);
}

function clean(value: string | undefined, encoding: EncodingCharacters): string | undefined {
  if (value === undefined) return undefined;
  // HL7 v2 §2.6: two double quotes are the explicit null, meaning "the sender is
  // deleting this value". That is emphatically not the literal text `""`, and it is
  // not the same as an absent field either — but FHIR has no way to say "delete",
  // so absent is the closest honest reading.
  if (value.trim() === '""') return undefined;
  const text = unescapeText(value, encoding).trim();
  return text.length === 0 ? undefined : text;
}

function isBlank(rep: Repetition): boolean {
  return rep.components.every((components) => components.every((value) => value.trim().length === 0));
}
