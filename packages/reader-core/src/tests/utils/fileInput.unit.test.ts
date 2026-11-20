import { describe, expect, it } from 'vitest';
import { fileJson, fileText } from '../../utils/fileInput';

describe('fileText', () => {
  it('reads inline text, bytes or a path, and gives undefined otherwise', () => {
    expect(fileText({ kind: 'file', text: 'x' })).toBe('x');
    expect(fileText({ kind: 'file', bytes: new TextEncoder().encode('y') })).toBe('y');
    expect(fileText({ kind: 'file', path: '/nowhere/none.json' })).toBeUndefined();
    expect(fileText({ kind: 'api', sourceId: 'probe', config: {} })).toBeUndefined();
  });
});

describe('fileJson', () => {
  it('parses the text, or gives undefined when it is not JSON', () => {
    expect(fileJson({ kind: 'file', text: '{"a":1}' })).toEqual({ a: 1 });
    expect(fileJson({ kind: 'file', text: '{' })).toBeUndefined();
  });
});
