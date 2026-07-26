#!/usr/bin/env node
/**
 * Asks the terminology server what each code is actually called, and records the
 * answer in terminology-allowlist.json as `verified_display`.
 *
 * This exists because "validated against the implementation guide" turned out to be
 * far weaker evidence than it sounded. The genomics connector declared 38 LOINC
 * answer codes; only 5 of them appear in the emitted sample bundle, so the HL7
 * validator — even pointed at a live terminology server — had ever checked 5. The
 * other 33 were unguarded, and nobody could have known without counting.
 *
 * The general form of that problem: **a validator only checks what you emit.**
 * Fixtures bound coverage. This script is bounded by the *source* instead, so a
 * code that is declared and never exercised is still checked.
 *
 * Network access is deliberate and manual. tx.fhir.org carries no SLA — HL7's own
 * words are that it "is not supported for production usage" — so the recorded
 * answers are committed and `check-terminology.mjs` asserts against them offline.
 * Refreshing is an act someone performs and reviews in a diff, not something CI
 * does silently on every run.
 *
 * Usage:  node verify/refresh-terminology.mjs [repoRoot]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCodings } from './lib/codings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ?? join(HERE, '..');
const ALLOWLIST_PATH = join(HERE, 'terminology-allowlist.json');
const TX = 'https://tx.fhir.org/r4/CodeSystem/$validate-code';

const SYSTEM_URI = { LOINC: 'http://loinc.org', 'SNOMED CT': 'http://snomed.info/sct' };

async function lookup(system, code) {
  const url = new URL(TX);
  url.searchParams.set('url', system);
  url.searchParams.set('code', code);
  const response = await fetch(url, { headers: { accept: 'application/fhir+json' } });
  if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
  const body = await response.json();
  const params = Object.fromEntries((body.parameter ?? []).map((p) => [p.name, p]));
  if (params.result?.valueBoolean !== true) {
    return { ok: false, reason: params.message?.valueString?.slice(0, 120) ?? 'not found' };
  }
  return { ok: true, display: params.display?.valueString };
}

const codings = collectCodings(ROOT);
const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));

let checked = 0;
let changed = 0;
let failed = 0;

for (const [code, info] of [...codings.entries()].sort()) {
  const system = SYSTEM_URI[info.system];
  if (!system) continue;

  const result = await lookup(system, code);
  checked++;

  if (!result.ok) {
    failed++;
    console.log(`  UNRESOLVED  ${code} (${info.system}) — ${result.reason}`);
    continue;
  }

  const entry = (allowlist.codes[code] ??= {});
  if (entry.verified_display !== result.display) {
    entry.verified_display = result.display;
    entry.verified_on = new Date().toISOString().slice(0, 10);
    changed++;
  }
  // Flag, but do not silently rewrite, a display the code does not carry.
  const mismatched = [...info.displays].filter((d) => d && d !== result.display);
  if (mismatched.length > 0) {
    console.log(
      `  MISMATCH    ${code} — source says ${mismatched.map((d) => `'${d}'`).join(', ')}, ${info.system} says '${result.display}'`
    );
  }
}

writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(allowlist, null, 2)}\n`);
console.log(`\nChecked ${checked} codes against tx.fhir.org. ${changed} recording(s) updated, ${failed} unresolved.`);
console.log('Review the diff before committing — this is the record the offline gate trusts.');
if (failed > 0) process.exit(1);
