/**
 * WHAT: fileText and fileJson: the content of a `file` reader input, whichever of text, bytes or path carries it.
 * NOT:  Does not sniff a format; each file reader decides what the content is.
 * GOVERNED BY: DECISIONS.md#d16
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: an unreadable path gives undefined, not an error, so isThisType stays side-effect free.
 */
import { readFileSync } from 'node:fs';
import type { ReaderInput } from '../types';

export function fileText(input: ReaderInput): string | undefined {
  if (input.kind !== 'file') return undefined;

  if (input.text !== undefined) return input.text;

  if (input.bytes) return new TextDecoder().decode(input.bytes);

  if (!input.path) return undefined;

  try {
    return readFileSync(input.path, 'utf8');
  } catch {
    return undefined;
  }
}

export function fileJson(input: ReaderInput): unknown {
  const text = fileText(input);

  if (text === undefined) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
