/**
 * WHAT: Fails when a SNOMED CT identifier appears under a published-artefact path.
 * NOT:  Does not forbid SNOMED in private source; publication is the constrained act (Affiliate Licence Derivative).
 * GOVERNED BY: docs/findings/verify-baseline.md; DECISIONS.md#d14
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Only flags SCTIDs tied to a SNOMED system/marker, not bare digit strings that happen to be LOINC numerals.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) throw new Error(`Publication scan refuses symbolic links: ${full}`);
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

/** Fail closed on missing/empty inputs or unreadable files, including packed contents. */
export function scanPublication(roots: readonly string[]): { scanned: number; offenders: string[] } {
  const offenders: string[] = [];
  const files: string[] = [];
  for (const root of roots) walkFiles(root, files);
  let scanned = 0;
  for (const file of new Set(files)) {
    if (/\.(png|jpg|jpeg|gif|webp|glb|bin|wasm|gz|zip|tgz|pdf)$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    scanned++;
    const rel = relative(ROOT, file);
    for (const m of text.matchAll(
      /(?:snomed\.info\/sct|snomed\.info\/[^'"{\s]+|SYSTEMS\.SNOMED)[^;]{0,220}?["']?code["']?\s*[:=]\s*['"`]?(\d{6,18})['"`]?/gi
    ))
      offenders.push(`${rel}: SNOMED system + SCTID ${m[1]}`);
    for (const m of text.matchAll(
      /["']?code["']?\s*[:=]\s*['"`]?(\d{6,18})['"`]?[^;]{0,220}?(?:snomed\.info\/sct|SYSTEMS\.SNOMED)/gi
    ))
      offenders.push(`${rel}: SCTID ${m[1]} + SNOMED system`);
    for (const m of text.matchAll(/\bSCTID\b\s*[:=]?\s*['"`]?(\d{6,18})['"`]?/gi)) {
      offenders.push(`${rel}: SCTID ${m[1]}`);
    }
  }
  if (scanned === 0) throw new Error('Publication scan found no text artifacts; build and pack before checking.');
  return { scanned, offenders: [...new Set(offenders)].sort() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Every workspace package must be built. A stray file must not green-wash a
  // partially built workspace or the original empty-checkout failure.
  for (const dir of packageDistDirs()) {
    if (!existsSync(join(dir, 'index.js'))) throw new Error(`Missing build: ${relative(ROOT, dir)}/index.js`);
  }
  const result = scanPublication([...publishedRoots(), ...packageDistDirs()]);
  if (result.offenders.length) {
    console.error(`check-snomed-boundary: ${result.offenders.length} offender(s)\n${result.offenders.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`check-snomed-boundary: ok (scanned ${result.scanned} text file(s) under published paths)`);
  }
}
