import { describe, expect, it } from 'vitest';
import { issueFromOperationOutcome } from '../../utils/operationOutcome';

describe('issueFromOperationOutcome', () => {
  it('turns fatal into error and keeps the diagnostics', () => {
    expect(issueFromOperationOutcome({ severity: 'fatal', code: 'not-found', diagnostics: 'gone' })).toEqual({
      severity: 'error',
      code: 'not-found',
      details: 'gone'
    });
  });

  it('explains an issue that came without diagnostics', () => {
    expect(issueFromOperationOutcome({ severity: 'warning', code: 'throttled' }).details).toMatch(/vendor/);
  });
});
