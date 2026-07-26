#!/usr/bin/env node

/**
 * UCUM unit gate for open-twin.
 *
 * Finds every Quantity emitted under packages/-star-/src/fhir and checks four things:
 *
 *   1. the Quantity declares the UCUM system at all
 *   2. the Quantity declares a unit code at all
 *   3. the code is real UCUM, validated against the published grammar
 *   4. `Quantity.unit` is UCUM's own name for `Quantity.code`, so the readable and
 *      machine-readable halves cannot say different things
 *
 * Checks 1 and 2 exist because the previous version of this gate could not see the
 * defect it was written for. It anchored its scan on `SYSTEMS.UCUM`, so a Quantity
 * emitted as bare `{ value }` — no unit, no system, no code — was invisible to it.
 * That is exactly how six Oura sleep durations shipped as raw seconds under LOINC
 * codes whose example unit is minutes.
 *
 * Check 4 is the one that matters most. `unit: 'MET-min'` with `code: 'min'`
 * type-checks, validates structurally, and is wrong: a conformant parser discards
 * annotations, so a receiver reads 300 MET-minutes as 300 minutes of activity. It
 * was a per-pair allowlist until 2026-07-26, which recorded that somebody once
 * agreed a pair was sound — only as good as the care taken that day, and silent
 * about the next unit anyone adds. Asking UCUM directly cannot go stale and covers
 * pairs nobody has looked at yet. Codes UCUM leaves unnamed are named exceptions.
 *
 * What it still cannot do is tell you the VALUE is in the unit claimed. `1.48 deg`
 * is structurally perfect whether or not the source sent radians, so pairs whose
 * real risk is a data defect carry a `guarded_by` note naming the numeric tests
 * that protect them.
 *
 * Usage:  node verify/check-units.mjs [repoRoot]
 * Exit:   0 every Quantity is well-formed, valid and correctly named · 1 otherwise
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectSources,
  enclosingObjectStart,
  lineAt,
  maskLiterals,
  objectEnd,
  readSharedUnits,
  stringLiteral,
  topLevelProps
} from './lib/scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
// `--allow-unreviewed` is gone with the backlog it existed for. It waived pairs nobody
// had signed off, which was a standing exemption with no expiry; the rule is now a
// lookup against UCUM rather than a signature, so there is no backlog to waive. The
// flag is still accepted and ignored, so an old invocation does not fail on an
// unrecognised argument.
const ROOT = args.find((arg) => !arg.startsWith('--')) ?? join(HERE, '..');
const ALLOW = JSON.parse(readFileSync(join(HERE, 'units-allowlist.json'), 'utf8'));
const UCUM_SYSTEM = 'http://unitsofmeasure.org';

/**
 * Validate against the published UCUM grammar rather than a hand-maintained list.
 * A hand-maintained list is the same class of artefact as the defects it is meant to
 * catch: it encodes what someone believed, not what UCUM defines.
 */
const require = createRequire(import.meta.url);
let validateUcum;
let ucumName;
try {
  const utils = require('@lhncbc/ucum-lhc').UcumLhcUtils.getInstance();
  validateUcum = (code) => utils.validateUnitString(code, false).status === 'valid';
  // UCUM's published name for a code, used to check `Quantity.unit` says the same
  // thing as `Quantity.code`. Returns whatever the specification carries — including
  // nothing, for codes like `%` that UCUM leaves unnamed.
  ucumName = (code) => utils.validateUnitString(code, true).unit?.name;
} catch {
  console.error('FAIL: @lhncbc/ucum-lhc is not installed. Run `pnpm install` before the gate.');
  process.exit(1);
}

let sources;
try {
  sources = collectSources(ROOT);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}

const pairs = new Map(); // "unit|code" -> [{rel, line}]
const malformed = []; // Quantities that cannot be reviewed because they are broken

const record = (map, key, site) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(site);
};

/** Pass 1: object literals that are, or contain, a Quantity. */
for (const { rel, text } of sources) {
  const masked = maskLiterals(text);

  // Anchor on `valueQuantity:` and on any object mentioning the UCUM system, so a
  // Quantity is found whether or not it remembered to declare a system.
  const anchors = [];
  for (const match of masked.matchAll(/\bvalueQuantity\s*:\s*\{/g))
    anchors.push({ index: match.index + match[0].length - 1, kind: 'value' });
  for (const match of masked.matchAll(/SYSTEMS\.UCUM|unitsofmeasure\.org/g))
    anchors.push({ index: match.index, kind: 'system' });

  const seen = new Set();
  for (const anchor of anchors) {
    const start = anchor.kind === 'value' ? anchor.index : enclosingObjectStart(masked, anchor.index);
    if (start === -1 || seen.has(start)) continue;
    seen.add(start);
    const end = objectEnd(masked, start);
    if (end === -1) continue;

    const props = topLevelProps(text, masked, start, end);
    // A Quantity is an object with a `value` and/or a `code` under a unit system.
    const hasValue = props.has('value');
    const rawSystem = props.get('system');
    const system =
      stringLiteral(rawSystem) ?? (rawSystem?.includes('SYSTEMS.UCUM') ? UCUM_SYSTEM : (rawSystem ?? null));
    const unit = stringLiteral(props.get('unit'));
    const code = stringLiteral(props.get('code'));
    const site = { rel, line: lineAt(text, start) };

    if (!hasValue && code === null && unit === null) continue; // not a Quantity

    if (props.has('coding') || props.has('resourceType')) continue; // a CodeableConcept, not a Quantity

    if (!props.has('code') && !props.has('unit')) {
      malformed.push({
        ...site,
        problem: 'Quantity has a value but no unit and no code',
        detail: 'A bare number is uninterpretable. Attach a UCUM unit.'
      });
      continue;
    }
    if (!props.has('system')) {
      malformed.push({
        ...site,
        problem: 'Quantity declares a unit but no system',
        detail: `Set system to ${UCUM_SYSTEM} so the code is machine-interpretable.`
      });
      continue;
    }
    if (system !== UCUM_SYSTEM) {
      malformed.push({
        ...site,
        problem: `Quantity.system is '${system}', not UCUM`,
        detail: 'Quantity.system must be the code system that defines the unit.'
      });
      continue;
    }
    if (code === null) continue; // dynamic code, cannot be reviewed statically

    record(pairs, `${unit ?? '(none)'}|${code}`, site);
  }
}

/**
 * Pass 2: the positional helper form used throughout provider-oura,
 *   const addComponent = (value, coding, unit, code) => ... { value, unit, system: SYSTEMS.UCUM, code }
 * where the UCUM system never appears at the call site.
 */
const HELPER = /const\s+(\w+)\s*=\s*\(([\s\S]{0,400}?)\)\s*(?::[^=]*)?=>\s*\{([\s\S]{0,600}?)\n\s{0,6}\};/g;

for (const { rel, text } of sources) {
  const masked = maskLiterals(text);
  HELPER.lastIndex = 0;
  let helper;
  while ((helper = HELPER.exec(text)) !== null) {
    const [whole, name, params, body] = helper;
    if (!/SYSTEMS\.UCUM|unitsofmeasure\.org/.test(body)) continue;
    const names = params
      .split(',')
      .map((p) => p.trim().split(/[:\s]/)[0])
      .filter(Boolean);
    const quantity = /valueQuantity:\s*\{([^}]*)\}/.exec(body);
    if (!quantity) continue;
    const unitBind = /unit:\s*(\w+)/.exec(quantity[1])?.[1] ?? (/\bunit\b/.test(quantity[1]) ? 'unit' : null);
    const codeBind = /\bcode:\s*(\w+)/.exec(quantity[1])?.[1] ?? (/\bcode\b/.test(quantity[1]) ? 'code' : null);
    const unitIndex = names.indexOf(unitBind);
    const codeIndex = names.indexOf(codeBind);
    if (unitIndex < 0 || codeIndex < 0) continue;

    const callRe = new RegExp(`\\b${name}\\(`, 'g');
    let call;
    while ((call = callRe.exec(masked)) !== null) {
      if (call.index <= helper.index + whole.length) continue;
      let depth = 0;
      let end = -1;
      for (let i = call.index + name.length; i < masked.length; i++) {
        if (masked[i] === '(') depth++;
        else if (masked[i] === ')') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) continue;

      const argsStart = call.index + name.length + 1;
      const args = [];
      let buffer = '';
      let depth2 = 0;
      for (let i = argsStart; i < end; i++) {
        const ch = masked[i];
        if ('([{'.includes(ch)) depth2++;
        else if (')]}'.includes(ch)) depth2--;
        if (ch === ',' && depth2 === 0) {
          args.push({ raw: text.slice(i - buffer.length, i).trim() });
          buffer = '';
          continue;
        }
        buffer += ch;
      }
      if (buffer.trim()) args.push({ raw: text.slice(end - buffer.length, end).trim() });

      const site = { rel, line: lineAt(text, call.index) };
      const codeArg = args[codeIndex] ? stringLiteral(args[codeIndex].raw) : null;
      if (codeArg === null) {
        if (args.length <= codeIndex) {
          malformed.push({
            ...site,
            problem: `${name}() called without a unit code`,
            detail: 'The helper emits a UCUM Quantity, so every call site must supply one.'
          });
        }
        continue;
      }
      const unitArg = args[unitIndex] ? stringLiteral(args[unitIndex].raw) : null;
      record(pairs, `${unitArg ?? '(none)'}|${codeArg}`, site);
    }
  }
}

/**
 * Pass 3: the shared UCUM table in @open-twin/fhir-core.
 *
 * This is where the (unit, code) choice actually lives now. Reviewing it here is
 * strictly better than reviewing thirty scattered call sites — one table, one
 * sign-off, and `numericComponent` requiring a unit means the compiler enforces
 * that nothing bypasses it.
 */
/**
 * Harvest every table of unit constants, wherever it is declared.
 *
 * This used to read one table at one hardcoded path. That was blind by construction:
 * provider-google-health declares GH_UCUM in the same shape for units the shared table
 * does not carry yet, and its eight entries — including `Hz`, `{floors}` and a second
 * `mg/dL` — were emitted into real bundles without ever reaching this gate. A rule that
 * only inspects the table it already knows about cannot report on the one somebody adds.
 *
 * An entry counts only when `unit` is a string literal. That is what separates a unit
 * table from a lookup that merely happens to use the key `code`: GLUCOSE_CODES maps
 * LOINC codes to units and writes `unit: UCUM.MG_PER_DL`, so harvesting it treated
 * '2339-0' as a UCUM code and advised the annotation '{2339-0}'.
 */
const TABLE = /export const ([A-Z][A-Z0-9_]*)\s*(?::[^=]*)?=\s*\{/g;
const ENTRY = /^\s{2}([A-Z][A-Z0-9_]*)\s*:\s*\{/gm;

function harvestUnitTables(rel, text) {
  const masked = maskLiterals(text);
  const spans = [];
  TABLE.lastIndex = 0;
  for (const table of masked.matchAll(TABLE)) {
    const start = table.index + table[0].length - 1;
    const end = objectEnd(masked, start);
    if (end !== -1) spans.push([start, end, table[1]]);
  }
  if (spans.length === 0) return [];

  const names = new Set();
  ENTRY.lastIndex = 0;
  for (const match of masked.matchAll(ENTRY)) {
    const start = match.index + match[0].length - 1;
    const span = spans.find(([from, to]) => start > from && start < to);
    if (!span) continue;
    const end = objectEnd(masked, start);
    if (end === -1) continue;
    const props = topLevelProps(text, masked, start, end);
    const unit = stringLiteral(props.get('unit'));
    const code = stringLiteral(props.get('code'));
    if (code === null || unit === null) continue; // a lookup table, not a unit table
    record(pairs, `${unit}|${code}`, { rel, line: lineAt(text, start) });
    names.add(span[2]);
  }
  return [...names];
}

const shared = readSharedUnits(ROOT);
if (shared) {
  const tables = harvestUnitTables(shared.rel, shared.text);
  if (!tables.includes('UCUM')) {
    console.error(
      'FAIL: could not read the `export const UCUM` table in fhir-core/src/units.ts.\n' +
        'The shared unit table has moved, been renamed, or changed shape. Refusing to\n' +
        'report on a file this gate no longer understands.'
    );
    process.exit(1);
  }
}
for (const { rel, text } of sources) harvestUnitTables(rel, text);

/**
 * A scan that finds nothing is a broken scan, not a clean bill of health. This is
 * the same failure the file-level guard in collectSources exists to prevent, one
 * level down — and it fired for real once the units were centralised.
 */
if (pairs.size === 0) {
  console.error(
    'FAIL: found no reviewable (unit, code) pairs.\n' +
      'Either the shared unit table has moved, or the scan no longer matches how units\n' +
      'are expressed. Refusing to report success on an empty scan.'
  );
  process.exit(1);
}

/**
 * The (unit, code) rule, reviewed 2026-07-26: `Quantity.unit` carries UCUM's own name
 * for the code, so the check is a lookup rather than a judgement.
 *
 * This replaces a per-pair allowlist. An allowlist records that somebody once agreed
 * a pair was sound, which is only as good as the care taken that day and says nothing
 * about the next unit somebody adds. Asking UCUM directly cannot go stale, cannot be
 * bulk-approved, and covers pairs nobody has thought about yet.
 *
 * An annotation names itself, so `{steps}` would demand the unit "{steps}". The
 * annotation text is already the human-readable form, so braces come off and the
 * solidus in a compound like `{steps}/day` is spelled out.
 */
const annotated = (name) => name.replace(/[{}]/g, '').replace(/\//g, ' per ');
const officialName = (code) => {
  const name = ucumName(code);
  if (typeof name !== 'string' || name.length === 0) return null;
  return name.includes('{') ? annotated(name) : name;
};

const invalid = [];
const mismatched = [];
const approved = [];

for (const [key, sites] of [...pairs.entries()].sort()) {
  const separator = key.lastIndexOf('|');
  const unit = key.slice(0, separator);
  const code = key.slice(separator + 1);
  const entry = ALLOW.pairs[key];
  if (!validateUcum(code)) {
    invalid.push({
      unit,
      code,
      sites,
      entry,
      reason: `'${code}' is not a valid UCUM code. Annotations must be braced, e.g. {${code}}.`
    });
    continue;
  }
  if (entry?.status === 'rejected') {
    invalid.push({ unit, code, sites, entry, reason: entry.reason });
    continue;
  }

  const official = officialName(code);
  if (official !== null && unit === official) {
    approved.push({ unit, code, sites, why: 'UCUM name' });
  } else if (entry?.status === 'exception') {
    // UCUM publishes no usable name for this code. Named, reasoned, and narrow —
    // an exception is per-code and must say why, not waive the rule wholesale.
    approved.push({ unit, code, sites, why: 'recorded exception' });
  } else {
    mismatched.push({ unit, code, sites, official });
  }
}

const site = (sites) => `${sites[0].rel}:${sites[0].line}${sites.length > 1 ? ` (+${sites.length - 1})` : ''}`;

console.log(`UCUM gate: ${pairs.size} distinct (unit, code) pairs across ${sources.length} files\n`);

/**
 * A Quantity can be incomplete on purpose.
 *
 * VITRONIC states no unit for scan properties anywhere in its payload, so the mapper
 * emits the number with none — asserting an unverified UCUM unit would break the first
 * ground rule, and the HL7 validator accepts the result. That is a reviewed decision,
 * but the gate had no way to hold one: malformed was unconditionally fatal, so the only
 * way to a green run was to weaken the gate for everything.
 *
 * A waiver is keyed by file and by how many incomplete Quantities that file is expected
 * to contain — never by line, which drifts under any edit above it and would silently
 * come to cover a different Quantity than the one that was reviewed. If the count moves
 * in either direction the waiver stops applying and the file returns for review, so a
 * newly added bare number cannot hide behind an older one's sign-off.
 */
const UNITLESS = ALLOW.unitless ?? {};
const malformedByFile = new Map();
for (const item of malformed) record(malformedByFile, item.rel, item);

const waived = [];
const fatalMalformed = [];
for (const [rel, items] of malformedByFile) {
  const entry = UNITLESS[rel];
  if (entry?.status === 'approved' && entry.occurrences === items.length) {
    waived.push({ rel, items, entry });
  } else {
    for (const item of items) {
      fatalMalformed.push({
        ...item,
        countChanged:
          entry?.status === 'approved' && entry.occurrences !== items.length
            ? `Reviewed for ${entry.occurrences}, found ${items.length}.`
            : null
      });
    }
  }
}

// A waiver matching nothing is stale. Say so: the list emptying is the goal, and an
// entry nobody removed reads as an outstanding exemption that no longer exists.
const stale = Object.keys(UNITLESS).filter((rel) => !malformedByFile.has(rel));

if (fatalMalformed.length) {
  console.log(
    `MALFORMED (${fatalMalformed.length}) — these Quantities cannot be reviewed because they are incomplete:\n`
  );
  for (const item of fatalMalformed) {
    console.log(`  ${item.rel}:${item.line}`);
    console.log(`      ${item.problem}`);
    console.log(`      ${item.detail}`);
    if (item.countChanged) {
      console.log(`      ${item.countChanged} The waiver in verify/units-allowlist.json no longer applies.`);
    }
    console.log('');
  }
  console.log('  If a missing unit is deliberate, record it under "unitless" in');
  console.log('  verify/units-allowlist.json with a reason and an occurrence count.\n');
}

if (waived.length) {
  console.log(`UNITLESS BY REVIEW (${waived.length}) — deliberate, recorded, and still outstanding:\n`);
  for (const { rel, items, entry } of waived) {
    console.log(
      `  ${rel}  (${items.length} site${items.length === 1 ? '' : 's'}: ${items.map((i) => i.line).join(', ')})`
    );
    console.log(`      ${entry.reason}`);
    console.log(`      reviewed: ${entry.reviewed}\n`);
  }
}

if (stale.length) {
  console.log(`STALE WAIVER (${stale.length}) — recorded under "unitless" but no longer found:\n`);
  for (const rel of stale) console.log(`  ${rel}\n      Remove it from verify/units-allowlist.json.`);
  console.log('');
}

if (invalid.length) {
  console.log(`INVALID (${invalid.length}):\n`);
  for (const item of invalid) {
    console.log(`  unit '${item.unit}' / code '${item.code}'   ${site(item.sites)}`);
    console.log(`      ${item.reason}`);
    if (item.entry?.suggested) console.log(`      suggested: ${item.entry.suggested}`);
    console.log('');
  }
}

if (mismatched.length) {
  console.log(`NAME MISMATCH (${mismatched.length}) — Quantity.unit is not UCUM's name for Quantity.code:\n`);
  for (const item of mismatched) {
    console.log(`  unit '${item.unit}' / code '${item.code}'   ${site(item.sites)}`);
    if (item.official === null) {
      console.log(`      UCUM publishes no name for '${item.code}'.`);
      console.log('      Record it under "pairs" with status "exception" and a reason.');
    } else {
      console.log(`      UCUM says: '${item.official}'`);
    }
    console.log('');
  }
  console.log("  Quantity.unit carries UCUM's own name for the code, so the readable and");
  console.log('  machine-readable halves cannot drift. Use the name above verbatim.\n');
}

if (approved.length) {
  const byName = approved.filter((a) => a.why === 'UCUM name').length;
  const byException = approved.length - byName;
  console.log(
    `APPROVED (${approved.length}) — ${byName} carry UCUM's own name` +
      (byException ? `, ${byException} by recorded exception.\n` : '.\n')
  );
}

// Every category here is fatal, and there is no longer anything to waive: a name is
// either UCUM's or it is not, so the gate no longer depends on how much review is
// outstanding. A stale waiver is fatal too — an exemption nobody withdrew would let a
// future bare Quantity inherit a sign-off written for something else.
const known = fatalMalformed.length + invalid.length + mismatched.length + stale.length;
const summary =
  `${fatalMalformed.length} malformed, ${invalid.length} invalid, ${mismatched.length} name mismatch` +
  (waived.length ? `, ${waived.length} unitless by review` : '') +
  (stale.length ? `, ${stale.length} stale waiver` : '');

if (known) {
  console.log(`FAIL: ${summary}.`);
  process.exit(1);
}
console.log('PASS: every UCUM Quantity is well-formed, valid, and named as UCUM names it.');
