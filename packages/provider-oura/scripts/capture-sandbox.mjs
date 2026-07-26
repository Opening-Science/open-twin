#!/usr/bin/env node
/**
 * Re-records the Oura sandbox fixture.
 *
 * The sandbox accepts any non-empty bearer token and serves synthetic data Oura
 * generates itself, so this needs no credentials and runs on a fork pull request.
 *
 * Run it deliberately, review the diff, and commit. It is not wired into CI: a
 * fixture that silently rewrites itself would hide exactly the vendor change it
 * exists to surface. If Oura alters a field, the right outcome is a red test that
 * names the field, not a fixture that quietly agrees with the new shape.
 *
 * Usage:  pnpm --filter @open-twin/provider-oura capture:sandbox
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'tests', 'fixtures', 'sandbox-capture.json');
const BASE = 'https://api.ouraring.com/v2/sandbox/usercollection';

/** A week is enough to exercise every mapper without committing thousands of rows. */
const START = '2024-01-01';
const END = '2024-01-07';

/**
 * `personal_info` is deliberately absent: the sandbox returns 404 for it, and the
 * OpenAPI document declares no sandbox route. Requesting it here would record a
 * failure as though it were data.
 */
const SCOPES = [
  'daily_activity',
  'daily_cardiovascular_age',
  'daily_readiness',
  'daily_resilience',
  'daily_spo2',
  'daily_stress',
  'heartrate',
  'rest_mode_period',
  'ring_configuration',
  'session',
  'sleep',
  'vO2_max',
  'workout'
];

/** heartrate takes start_datetime/end_datetime; given start_date it returns 200 and ignores the window. */
const query = (scope) =>
  scope === 'heartrate'
    ? `?start_datetime=${START}T00:00:00%2B00:00&end_datetime=${END}T23:59:59%2B00:00`
    : `?start_date=${START}&end_date=${END}`;

const captured = {};
for (const scope of SCOPES) {
  const response = await fetch(`${BASE}/${scope}${query(scope)}`, {
    headers: { Authorization: 'Bearer sandbox' }
  });
  if (!response.ok) {
    console.error(`FAIL: ${scope} returned HTTP ${response.status}. Refusing to write a partial capture.`);
    process.exit(1);
  }
  captured[scope] = await response.json();
  const rows = captured[scope]?.data?.length ?? 1;
  console.log(`  ${scope.padEnd(26)} ${String(rows).padStart(4)} records`);
}

// The sandbox is synthetic, but check rather than trust. Patterns are written so a
// date cannot satisfy them: a looser one once reported 266 "phone numbers" that
// were all ISO dates.
const blob = JSON.stringify(captured);
const PII = {
  email: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  phone: /(?<![\d-])(?:\+\d{1,3}[ -]?)?\(?\d{3}\)?[ -]\d{3}[ -]\d{4}(?![\d-])/,
  nationalId: /\b\d{3}-\d{2}-\d{4}\b/
};
for (const [name, pattern] of Object.entries(PII)) {
  if (pattern.test(blob)) {
    console.error(`FAIL: the capture matches a ${name} pattern. Not writing it.`);
    process.exit(1);
  }
}

/**
 * Keys are sorted so a re-capture diff shows what Oura changed, not what
 * JSON.stringify felt like ordering differently. Without this the two capture paths
 * produced byte-different files with identical content, which looks exactly like
 * vendor drift and is not.
 */
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted(value[key])])
        )
      : value;

writeFileSync(OUT, `${JSON.stringify(sorted(captured), null, 2)}\n`);
console.log(`\nWrote ${OUT}`);
console.log('Review the diff before committing — a change here is a vendor change.');
