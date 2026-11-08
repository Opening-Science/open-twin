import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replayFetch } from '@open-twin/reader-core/testing';

export const GOOGLE_HEALTH_FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'google-health-sync.json');

const DATA_POINTS_PATH = /^\/v4\/users\/me\/dataTypes\/([a-z0-9-]+)\/dataPoints$/;

/** One page per type from the fixture, an empty page for a type it lacks, a 404 for any other URL. */
export function replayGoogleHealth(): typeof fetch {
  const sync = JSON.parse(readFileSync(GOOGLE_HEALTH_FIXTURE, 'utf8')) as Record<string, unknown>;

  return replayFetch((url) => {
    const type = DATA_POINTS_PATH.exec(url.pathname)?.[1];

    if (type === undefined) return undefined;

    return sync[type] ?? { dataPoints: [] };
  });
}
