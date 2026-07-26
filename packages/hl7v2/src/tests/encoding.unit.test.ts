import { describe, expect, it } from 'vitest';
import { DEFAULT_ENCODING, readEncodingCharacters, unescapeText } from '../v2/encoding';
import { component, field, findSegment, parseMessage, repetitions } from '../v2/parser';
import { ADT_A01, ORU_R01 } from './fixtures/messages';

describe('MSH-2 encoding characters', () => {
  it('reads the five characters the IG ORU_R01 example declares', () => {
    const result = readEncodingCharacters(ORU_R01.split('\r')[0] as string);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.encoding).toEqual({
      field: '|',
      component: '^',
      repetition: '~',
      escape: '\\',
      subcomponent: '&',
      truncation: '#'
    });
  });

  it('reads four characters when no truncation character is declared', () => {
    const result = readEncodingCharacters(ADT_A01.split('\r')[0] as string);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.encoding.truncation).toBeUndefined();
  });

  it('rejects a header whose delimiters are not distinct', () => {
    // The component separator repeated: a component boundary and a repetition
    // boundary would then be the same character.
    expect(readEncodingCharacters('MSH|^^~\\&|App|Fac|').ok).toBe(false);
  });

  it('rejects a first segment that is not MSH', () => {
    expect(readEncodingCharacters('PID|1||123^^^X^MR').ok).toBe(false);
  });
});

/**
 * The IG ADT_A01 example rewritten with a delimiter set no implementation
 * hardcodes. Only the delimiter characters change; every other byte, and therefore
 * every field boundary, is the same. A field that reads differently here is being
 * read by a hardcoded `|^~\&` rather than by what MSH-2 declares.
 *
 * The four replacements are chosen because none of them occurs anywhere in the
 * IG's message text, so the substitution cannot collide with data.
 */
const EXOTIC_FIELD = '!';
const EXOTIC_COMPONENT = '$';
const EXOTIC_REPETITION = '%';
const EXOTIC_SUBCOMPONENT = '?';

const REDELIMITED = ADT_A01.replace(/\|/g, EXOTIC_FIELD)
  .replace(/\^/g, EXOTIC_COMPONENT)
  .replace(/~/g, EXOTIC_REPETITION)
  .replace(/&/g, EXOTIC_SUBCOMPONENT);

describe('a message that declares its own delimiters', () => {
  it('has no delimiter collision with the fixture text', () => {
    for (const character of [EXOTIC_FIELD, EXOTIC_COMPONENT, EXOTIC_REPETITION, EXOTIC_SUBCOMPONENT]) {
      expect(ADT_A01).not.toContain(character);
    }
  });

  it('is parsed the same way as the standard-delimiter original', () => {
    const standard = parseMessage(ADT_A01);
    const exotic = parseMessage(REDELIMITED);
    expect(standard.ok).toBe(true);
    expect(exotic.ok).toBe(true);
    if (!standard.ok || !exotic.ok) return;

    expect(exotic.message.encoding.field).toBe(EXOTIC_FIELD);
    expect(exotic.message.encoding.component).toBe(EXOTIC_COMPONENT);

    const standardPid = findSegment(standard.message, 'PID');
    const exoticPid = findSegment(exotic.message, 'PID');

    // PID-5.1 is the family name and PID-8 the administrative sex. Under a
    // hardcoded delimiter set the whole segment reads as a single field and both
    // come back undefined.
    expect(field(exoticPid, 5, 1, exotic.message.encoding)).toBe(field(standardPid, 5, 1, standard.message.encoding));
    expect(field(exoticPid, 8, 1, exotic.message.encoding)).toBe('F');
    // PID-5 repeats twice in the IG example.
    expect(repetitions(exoticPid, 5)).toHaveLength(2);
  });
});

describe('MSH field numbering', () => {
  it('places MSH-9 at MSH-9 and not one field to the left', () => {
    const parsed = parseMessage(ORU_R01);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const msh = findSegment(parsed.message, 'MSH');
    const encoding = parsed.message.encoding;

    // MSH-1 is the field separator itself and MSH-2 the encoding characters, so a
    // parser that splits and indexes naively reads MSH-10 where MSH-9 is.
    expect(field(msh, 1, 1, encoding)).toBe('|');
    expect(field(msh, 2, 1, encoding)).toBe('^~\\&#');
    expect(field(msh, 9, 1, encoding)).toBe('ORU');
    expect(field(msh, 9, 2, encoding)).toBe('R01');
    expect(field(msh, 10, 1, encoding)).toBe('20251014154001-425');
    expect(field(msh, 12, 1, encoding)).toBe('2.5.1');
  });

  it('does not split MSH-2 on the delimiters it declares', () => {
    const parsed = parseMessage(ORU_R01);
    if (!parsed.ok) throw new Error('fixture failed to parse');
    const msh = findSegment(parsed.message, 'MSH');
    // `^~\&#` contains the component and subcomponent separators. Splitting it on
    // them leaves MSH-2.1 as the empty string and the delimiters unrecoverable.
    expect(component(msh?.fields[1]?.[0], 1, parsed.message.encoding)).toBe('^~\\&#');
  });
});

describe('escape sequences', () => {
  const encoding = DEFAULT_ENCODING;

  it('restores the delimiters that could not otherwise appear in data', () => {
    expect(unescapeText('a\\F\\b', encoding)).toBe('a|b');
    expect(unescapeText('a\\S\\b', encoding)).toBe('a^b');
    expect(unescapeText('a\\T\\b', encoding)).toBe('a&b');
    expect(unescapeText('a\\R\\b', encoding)).toBe('a~b');
    expect(unescapeText('a\\E\\b', encoding)).toBe('a\\b');
  });

  it('restores the delimiters the message declared, not the usual ones', () => {
    const exotic = {
      field: EXOTIC_FIELD,
      component: EXOTIC_COMPONENT,
      repetition: EXOTIC_REPETITION,
      escape: '\\',
      subcomponent: EXOTIC_SUBCOMPONENT
    };
    expect(unescapeText('a\\F\\b', exotic)).toBe(`a${EXOTIC_FIELD}b`);
    expect(unescapeText('a\\S\\b', exotic)).toBe(`a${EXOTIC_COMPONENT}b`);
    expect(unescapeText('a\\T\\b', exotic)).toBe(`a${EXOTIC_SUBCOMPONENT}b`);
    expect(unescapeText('a\\R\\b', exotic)).toBe(`a${EXOTIC_REPETITION}b`);
  });

  it('decodes hexadecimal data and the line-break formatting command', () => {
    expect(unescapeText('A\\X0D0A\\B', encoding)).toBe('A\r\nB');
    expect(unescapeText('line one\\.br\\line two', encoding)).toBe('line one\nline two');
  });

  it('leaves an escape sequence it does not understand verbatim', () => {
    // Deleting it would silently alter a clinical text; the loss stays visible.
    expect(unescapeText('a\\Z99\\b', encoding)).toBe('a\\Z99\\b');
    expect(unescapeText('a\\H\\bold\\N\\b', encoding)).toBe('a\\H\\bold\\N\\b');
    // An odd digit count is not valid hexadecimal data.
    expect(unescapeText('a\\X0D0\\b', encoding)).toBe('a\\X0D0\\b');
  });

  it('leaves an unterminated escape character alone', () => {
    expect(unescapeText('50\\% of normal', encoding)).toBe('50\\% of normal');
  });
});
