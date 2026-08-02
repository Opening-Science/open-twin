/**
 * WHAT: Fails when a SNOMED CT identifier appears under a published-artefact path.
 * NOT:  Does not forbid SNOMED in private source; publication is the constrained act (Affiliate Licence Derivative).
 * GOVERNED BY: docs/findings/verify-baseline.md; DECISIONS.md#d14
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Only flags SCTIDs tied to a SNOMED system/marker, not bare digit strings that happen to be LOINC numerals.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CONTRACT = join(ROOT, 'docs', 'contracts', 'published-artefacts.md');

function publishedRoots(): string[] {
  const defaults = ['dist', 'public', 'exports', 'out'];
  const roots = new Set(defaults);
  if (existsSync(CONTRACT)) {
    const body = readFileSync(CONTRACT, 'utf8');
    for (const m of body.matchAll(/`([^`]+\/)`/g)) {
      const p = (m[1] ?? '').replace(/\/$/, '');
      if (p && !p.includes(' ')) roots.add(p);
    }
  }
  return [...roots].map((d) => join(ROOT, d));
}

function walkFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
}

function packageDistDirs(): string[] {
  const packagesDir = join(ROOT, 'packages');
  const out: string[] = [];
  if (!existsSync(packagesDir)) return out;
  for (const name of readdirSync(packagesDir)) {
    out.push(join(packagesDir, name, 'dist'));
  }
  return out;
}

const offenders: string[] = [];
const roots = [...publishedRoots(), ...packageDistDirs()];
const files: string[] = [];
for (const r of roots) walkFiles(r, files);

for (const file of files) {
  if (/\.(png|jpg|jpeg|gif|webp|glb|bin|wasm|gz|zip)$/i.test(file)) continue;
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const rel = relative(ROOT, file);

  // system URL / SYSTEMS.SNOMED paired with a code
  for (const m of text.matchAll(
    /(?:snomed\.info\/sct|snomed\.info\/[^'"{\s]+|SYSTEMS\.SNOMED)[^;]{0,220}?code\s*[:=]\s*['"`]?(\d{6,18})['"`]?/gi,
  )) {
    offenders.push(`${rel}: SNOMED system + SCTID ${m[1]}`);
  }
  for (const m of text.matchAll(
    /code\s*[:=]\s*['"`]?(\d{6,18})['"`]?[^;]{0,220}?(?:snomed\.info\/sct|SYSTEMS\.SNOMED)/gi,
  )) {
    offenders.push(`${rel}: SCTID ${m[1]} + SNOMED system`);
  }

  // Explicit SCTID label
  for (const m of text.matchAll(/\bSCTID\b\s*[:=]?\s*['"`]?(\d{6,18})['"`]?/gi)) {
    offenders.push(`${rel}: SCTID ${m[1]}`);
  }

  // JSON-ish "system": "...snomed..." "code": "digits"
  for (const m of text.matchAll(
    /"system"\s*:\s*"[^"]*snomed[^"]*"\s*,\s*"code"\s*:\s*"(\d{6,18})"/gi,
  )) {
    offenders.push(`${rel}: JSON SNOMED coding ${m[1]}`);
  }
}

const unique = [...new Set(offenders)].sort();

if (unique.length) {
  console.error(
    `check-snomed-boundary: ${unique.length} offender(s) — SNOMED must not appear in published artefacts\n`,
  );
  for (const o of unique) console.error(`  ${o}`);
  console.error('\nSee docs/strategy/06_ADDENDUM_SYSTEMID_AND_TERMINOLOGY.md §Finding 3');
  process.exit(1);
}

console.log(
  `check-snomed-boundary: ok (scanned ${files.length} file(s) under published paths)`,
);
