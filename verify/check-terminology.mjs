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
import { collectCodings } from './lib/codings.mjs';

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

let codings;
try {
  codings = collectCodings(ROOT);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}

const found = new Map();
for (const [code, info] of codings) found.set(code, { system: info.system, sites: info.sites });

/**
 * A display must be the code system's own name for the concept, or absent.
 *
 * This is checked offline against `verified_display`, recorded by
 * refresh-terminology.mjs from tx.fhir.org. Nine paraphrased displays shipped
 * before this existed — 'Oxygen saturation by pulse oximetry' for 59408-5, which
 * drops "in Arterial blood", and 'Number of steps, unspecified time' for 55423-8,
 * which drops "Pedometer". Both lose the distinction a receiver would rely on the
 * display for, and neither is visible to the offline FHIR validator.
 */
const wrongDisplays = [];
for (const [code, info] of codings) {
  const verified = ALLOWLIST.codes?.[code]?.verified_display;
  if (!verified) continue;
  for (const display of info.displays) {
    if (display !== verified) {
      wrongDisplays.push({ code, system: info.system, ours: display, official: verified, sites: info.sites });
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

console.log(`Terminology gate: ${found.size} distinct codes across the workspace\n`);

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

if (wrongDisplays.length) {
  console.log(`WRONG DISPLAY (${wrongDisplays.length}) — the code is right, the name is not:\n`);
  for (const item of wrongDisplays) {
    console.log(`  ${item.code} (${item.system})  ${item.sites[0].rel}:${item.sites[0].line}`);
    console.log(`      we send:  '${item.ours}'`);
    console.log(`      ${item.system} says: '${item.official}'`);
    console.log('');
  }
  console.log("  Use the code system's own name, or omit the display entirely.\n");
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
// A wrong display is always fatal: it is known-wrong, not merely unaudited.
if (rejected.length || wrongDisplays.length || (unreviewed.length && !ALLOW_UNREVIEWED)) {
  console.log(
    `FAIL: ${rejected.length} rejected, ${wrongDisplays.length} wrong display, ${unreviewed.length} unreviewed.`
  );
  process.exit(1);
}
if (unreviewed.length) {
  console.log(`PASS with ${unreviewed.length} unreviewed (--allow-unreviewed): no code is known to be wrong.`);
  console.log('Run without the flag for the outstanding review list.');
  process.exit(0);
}
console.log('PASS: every terminology code in use has a recorded review.');
