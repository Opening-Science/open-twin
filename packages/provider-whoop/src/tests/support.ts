import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replayFetch } from '@open-twin/reader-core/testing';

export const WHOOP_FIXTURE = join(import.meta.dirname, 'fixtures', 'whoop-sync.json');

export function whoopSync(): Record<string, unknown[]> {
  return JSON.parse(readFileSync(WHOOP_FIXTURE, 'utf8')) as Record<string, unknown[]>;
}

/** The recorded sync as one page per collection, for any window. */
export function replayWhoop(fixture: Record<string, unknown[]> = whoopSync()): typeof fetch {
  const page = (records: unknown[] | undefined) => ({ records: records ?? [], next_token: null });
  return replayFetch((url) => {
    if (url.pathname.endsWith('/recovery')) return page(fixture.recovery);
    if (url.pathname.endsWith('/cycle')) return page(fixture.cycles);
    if (url.pathname.endsWith('/activity/sleep')) return page(fixture.sleep);
    return undefined;
  });
}
