import { describe, expect, it } from 'vitest';
import { failedFieldPaths } from '../../utils/parser';

describe('failedFieldPaths', () => {
  it('joins nested paths and names the root', () => {
    expect(failedFieldPaths({ issues: [{ path: ['config', 'url'] }, { path: [] }] })).toBe('config.url, (root)');
  });
});
