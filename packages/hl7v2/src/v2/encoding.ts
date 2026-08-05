/**
 * WHAT: HL7 v2 parse/datatype/encoding helpers.
 * NOT:  Must not invent FHIR codings; fhir/ and tables own clinical mapping.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: HL7 v2 encoding rules; golden fixtures from HL7 v2-to-FHIR IG where used.
 */
export interface EncodingCharacters {
  readonly field: string;
  readonly component: string;
  readonly repetition: string;
  readonly escape: string;
  readonly subcomponent: string;
  readonly truncation?: string;
}

/** Only a fallback for callers building a message; never assumed when parsing. */
export const DEFAULT_ENCODING: EncodingCharacters = {
  field: '|',
  component: '^',
  repetition: '~',
  escape: '\\',
  subcomponent: '&'
};

export type EncodingResult =
  | { readonly ok: true; readonly encoding: EncodingCharacters }
  | { readonly ok: false; readonly reason: 'not-a-header' | 'malformed-delimiters' };

/**
 * Reads MSH-1 and MSH-2 out of the first segment.
 *
 * The header is positional by definition: the field separator is the fourth
 * character of the message and MSH-2 is everything up to its next occurrence. It
 * cannot be found by splitting, because splitting is what it defines.
 */
export function readEncodingCharacters(header: string): EncodingResult {
  if (header.slice(0, 3) !== 'MSH' || header.length < 8) {
    return { ok: false, reason: 'not-a-header' };
  }

  const field = header.charAt(3);
  const end = header.indexOf(field, 4);
  const declared = end === -1 ? header.slice(4) : header.slice(4, end);

  if (declared.length < 4 || declared.length > 5) {
    return { ok: false, reason: 'malformed-delimiters' };
  }

  const encoding: EncodingCharacters = {
    field,
    component: declared.charAt(0),
    repetition: declared.charAt(1),
    escape: declared.charAt(2),
    subcomponent: declared.charAt(3),
    ...(declared.length === 5 ? { truncation: declared.charAt(4) } : {})
  };

  const all = [field, encoding.component, encoding.repetition, encoding.escape, encoding.subcomponent];
  if (encoding.truncation !== undefined) all.push(encoding.truncation);
  if (new Set(all).size !== all.length) {
    return { ok: false, reason: 'malformed-delimiters' };
  }

  return { ok: true, encoding };
}

const HEX = /^[0-9A-Fa-f]+$/;

/**
 * Reverses the escape sequences defined in HL7 v2 chapter 2 (§2.7.1 "Escape
 * sequences supported ... in ST, TX and FT"):
 *
 *   \F\ \S\ \T\ \R\ \E\   the field, component, subcomponent, repetition and escape
 *                         characters that could not otherwise appear in data
 *   \Xdd..\               hexadecimal character data
 *   \.br\                 begin a new line (an FT formatting command)
 *
 * Anything else — the other formatting commands, `\Cxxyy\`, `\Mxxyyzz\`, `\Zdd..\`,
 * locally defined sequences — is left **verbatim**. Deleting an escape sequence a
 * parser does not understand silently changes a clinical text; leaving it visible
 * keeps the loss obvious to whoever reads the result.
 */
export function unescapeText(value: string, encoding: EncodingCharacters): string {
  const marker = encoding.escape;
  if (!value.includes(marker)) return value;

  let out = '';
  let index = 0;
  while (index < value.length) {
    const start = value.indexOf(marker, index);
    if (start === -1) {
      out += value.slice(index);
      break;
    }
    const end = value.indexOf(marker, start + 1);
    if (end === -1) {
      // Unterminated: not an escape sequence at all, so it is ordinary text.
      out += value.slice(index);
      break;
    }

    out += value.slice(index, start);
    const sequence = value.slice(start + 1, end);
    const decoded = decodeSequence(sequence, encoding);
    out += decoded === undefined ? value.slice(start, end + 1) : decoded;
    index = end + 1;
  }
  return out;
}

function decodeSequence(sequence: string, encoding: EncodingCharacters): string | undefined {
  switch (sequence) {
    case 'F':
      return encoding.field;
    case 'S':
      return encoding.component;
    case 'T':
      return encoding.subcomponent;
    case 'R':
      return encoding.repetition;
    case 'E':
      return encoding.escape;
    case '.br':
      return '\n';
    default:
      break;
  }

  if ((sequence.startsWith('X') || sequence.startsWith('x')) && sequence.length > 1) {
    const digits = sequence.slice(1);
    // Hex data is transmitted in pairs; an odd count is malformed, so it is left
    // verbatim rather than guessed at.
    if (digits.length % 2 !== 0 || !HEX.test(digits)) return undefined;
    let decoded = '';
    for (let i = 0; i < digits.length; i += 2) {
      decoded += String.fromCharCode(Number.parseInt(digits.slice(i, i + 2), 16));
    }
    return decoded;
  }

  return undefined;
}
