#!/usr/bin/env node
/**
 * Terminology gate for open-twin.
 *
 * Every LOINC and SNOMED code emitted under packages/-star-/src/fhir must have an entry
 * in terminology-allowlist.json carrying its OFFICIAL name and a review status.
 * Unknown codes and codes marked `rejected` fail the build.
 *
 * The point is not that this script knows medicine. It is that a code cannot enter
 * the codebase without a human recording, once, what the code officially means and
 * that it matches what the mapper sends. That recording is the step that was missing
 * when five wrong codes shipped — including a vascular age of 45 published as a
 * cardio-ankle vascular index, where anything above 9 indicates arteriosclerosis.
 *
 * Codes are found by looking at the `system` a `code` sits next to, rather than by
 * pattern-matching numerals. The previous version matched any single-quoted 6-to-18
 * digit number as a SNOMED code, so an unrelated numeric literal could be reported
 * as unreviewed terminology, and a code written with double quotes was invisible.
 *
 * Usage:  node verify/check-terminology.mjs [repoRoot]
 * Exit:   0 all codes approved · 1 rejected or unreviewed codes found
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectSources,
  enclosingObjectStart,
  lineAt,
  maskLiterals,
  objectEnd,
  stringLiteral,
  topLevelProps
} from './lib/scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
/**
 * `--allow-unreviewed` separates a code that is known to mean the wrong thing from
 * one that nobody has checked yet. Both still fail by default; see the same flag in
 * check-units.mjs for why CI runs this gate twice.
 *
 * The distinction matters here more than anywhere: clearing the unreviewed list
 * requires a clinical terminology reviewer, which is weeks of a person's attention,
 * not a code change. Blocking every merge on it until then would guarantee the red
 * cross gets ignored — and a `rejected` code is exactly what must not be ignored.
 */
const ALLOW_UNREVIEWED = args.includes('--allow-unreviewed');
const ROOT = args.find((arg) => !arg.startsWith('--')) ?? join(HERE, '..');
const ALLOWLIST = JSON.parse(readFileSync(join(HERE, 'terminology-allowlist.json'), 'utf8'));

/** system URI (or the SYSTEMS.* constant naming it) -> code system label */
const CODE_SYSTEMS = [
  { match: /SYSTEMS\.LOINC|loinc\.org/, name: 'LOINC' },
  { match: /SYSTEMS\.SNOMED|snomed\.info/, name: 'SNOMED CT' }
];

let sources;
try {
  sources = collectSources(ROOT);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}

const found = new Map(); // code -> { system, sites: [] }

for (const { rel, text } of sources) {
  const masked = maskLiterals(text);

  for (const match of masked.matchAll(/SYSTEMS\.(?:LOINC|SNOMED)|loinc\.org|snomed\.info/g)) {
    const start = enclosingObjectStart(masked, match.index);
    if (start === -1) continue;
    const end = objectEnd(masked, start);
    if (end === -1) continue;

    const props = topLevelProps(text, masked, start, end);
    const rawSystem = props.get('system');
    if (!rawSystem) continue;
    const systemName = CODE_SYSTEMS.find((candidate) => candidate.match.test(rawSystem))?.name;
    if (!systemName) continue;

    const code = stringLiteral(props.get('code'));
    if (code === null) continue; // dynamically built code; cannot be reviewed statically

    if (!found.has(code)) found.set(code, { system: systemName, sites: [] });
    found.get(code).sites.push({ rel, line: lineAt(text, start) });
  }
}

/**
 * The positional helper used throughout provider-oura passes the code and the
 * system as separate arguments, so the code never sits in an object with a system:
 *   addComponent(sleep.efficiency, '248263006', SYSTEMS.SNOMED, 'Sleep efficiency')
 */
for (const { rel, text } of sources) {
  const masked = maskLiterals(text);
  for (const match of masked.matchAll(/\(([^()]*)\)/g)) {
    const inner = text.slice(match.index + 1, match.index + match[0].length - 1);
    const systemName = CODE_SYSTEMS.find((candidate) => candidate.match.test(inner))?.name;
    if (!systemName) continue;
    for (const literal of inner.matchAll(/'(\d{4,6}-\d|\d{6,18})'/g)) {
      const code = literal[1];
      if (!found.has(code)) found.set(code, { system: systemName, sites: [] });
      const sites = found.get(code).sites;
      const line = lineAt(text, match.index);
      if (!sites.some((site) => site.rel === rel && site.line === line)) sites.push({ rel, line });
    }
  }
}

const rejected = [];
const unreviewed = [];
const approved = [];

for (const [code, { system, sites }] of [...found.entries()].sort()) {
  const entry = ALLOWLIST.codes[code];
  if (!entry) unreviewed.push({ code, system, sites, entry: null });
  else if (entry.status === 'rejected') rejected.push({ code, system, sites, entry });
  else if (entry.status === 'approved') approved.push({ code, system, sites, entry });
  else unreviewed.push({ code, system, sites, entry });
}

const site = (sites) => `${sites[0].rel}:${sites[0].line}${sites.length > 1 ? ` (+${sites.length - 1} more)` : ''}`;

console.log(`Terminology gate: ${found.size} distinct codes across ${sources.length} files\n`);

if (rejected.length) {
  console.log(`REJECTED (${rejected.length}) — these codes do not mean what the mapper sends:\n`);
  for (const item of rejected) {
    console.log(`  ${item.code} (${item.system})  ${site(item.sites)}`);
    console.log(`      official: ${item.entry.official_name}`);
    console.log(`      problem:  ${item.entry.reason}`);
    if (item.entry.suggested) console.log(`      suggested: ${item.entry.suggested}`);
    console.log('');
  }
}

if (unreviewed.length) {
  console.log(`UNREVIEWED (${unreviewed.length}) — no recorded clinical sign-off:\n`);
  for (const item of unreviewed) console.log(`  ${item.code} (${item.system})  ${site(item.sites)}`);
  console.log('\n  Look each one up, confirm the official name matches what the mapper actually');
  console.log('  sends, and record the reviewer and date in verify/terminology-allowlist.json');
  console.log('  with status "approved". Do not bulk-approve: the value of this gate is that');
  console.log('  approving costs a lookup, which is exactly the step that was skipped.\n');
}

if (approved.length) console.log(`APPROVED (${approved.length}) — reviewed and recorded.\n`);

// A rejected code is always fatal: someone has established that it means something
// other than what the mapper sends.
if (rejected.length || (unreviewed.length && !ALLOW_UNREVIEWED)) {
  console.log(`FAIL: ${rejected.length} rejected, ${unreviewed.length} unreviewed.`);
  process.exit(1);
}
if (unreviewed.length) {
  console.log(`PASS with ${unreviewed.length} unreviewed (--allow-unreviewed): no code is known to be wrong.`);
  console.log('Run without the flag for the outstanding review list.');
  process.exit(0);
}
console.log('PASS: every terminology code in use has a recorded review.');
