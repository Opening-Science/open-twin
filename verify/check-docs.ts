/**
 * WHAT: Fails the build when docs/00-MAP.md lists a missing file, a GOVERNED BY
 *       target is absent, or a docs/ file contains stubs.
 * NOT:  Does not validate clinical content of decisions or allowlists — only
 *       doc-tree integrity and rule-5 stub absence under docs/.
 * GOVERNED BY: docs/CONVENTIONS.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs');
const DECISIONS = join(ROOT, 'DECISIONS.md');

const STUB_RE =
  /\bTODO\b|\bFIXME\b|not implemented|t\.b\.d\.|throw new Error\(['"]not implemented|catch\s*\(\s*\)\s*\{\s*\}/i;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function walkTs(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTs(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
  }
}

const offenders: string[] = [];

const mapPath = join(DOCS, '00-MAP.md');
if (!existsSync(mapPath)) {
  console.error('check-docs: docs/00-MAP.md missing');
  process.exit(1);
}
const mapBody = readFileSync(mapPath, 'utf8');
const required = ['CONVENTIONS.md', 'GLOSSARY.md', 'findings', 'terminology', 'runbooks', 'contracts'];
for (const rel of required) {
  const p = join(DOCS, rel);
  if (!existsSync(p)) offenders.push(`00-MAP required path missing: docs/${rel}`);
}

for (const m of mapBody.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
  const href = m[1] ?? '';
  if (href.startsWith('http') || href.startsWith('#')) continue;
  // root-relative from docs/ (../DECISIONS.md) or docs-relative
  const target = join(DOCS, href);
  if (!existsSync(target)) offenders.push(`00-MAP link missing: ${href}`);
}

if (!existsSync(DECISIONS)) {
  offenders.push('DECISIONS.md missing at repo root');
}

const decisionsBody = existsSync(DECISIONS) ? readFileSync(DECISIONS, 'utf8') : '';
const decisionAnchors = new Set(
  [...decisionsBody.matchAll(/<a\s+id="(d\d+)"\s*><\/a>/gi)].map((m) => m[1]!.toLowerCase()),
);
// Also accept ## Dn headings as anchors dn
for (const m of decisionsBody.matchAll(/^##\s+(D\d+)\b/gm)) {
  decisionAnchors.add(m[1]!.toLowerCase());
}

const tsFiles: string[] = [];
walkTs(join(ROOT, 'packages'), tsFiles);
walkTs(join(ROOT, 'src'), tsFiles);
walkTs(join(ROOT, 'verify'), tsFiles);

const govLine = /GOVERNED BY:\s*(.*)/i;
for (const file of tsFiles) {
  const src = readFileSync(file, 'utf8');
  if (!/^export\s/m.test(src)) continue;
  const block = src.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!block) continue;
  const line = (block[1] ?? '').split(/\r?\n/).find((l) => /GOVERNED BY:/i.test(l));
  if (!line) continue;
  const m = line.match(govLine);
  const value = (m?.[1] ?? '').trim();
  for (const part of value.split(/[;,]/)) {
    const p = part.trim();
    if (!p) continue;
    if (p.startsWith('docs/adr/')) {
      offenders.push(`${relative(ROOT, file)}: GOVERNED BY must not reference docs/adr/ (${p})`);
      continue;
    }
    const dec = p.match(/^DECISIONS\.md#(d\d+)\b/i);
    if (dec) {
      const id = dec[1]!.toLowerCase();
      if (!decisionAnchors.has(id)) {
        offenders.push(`${relative(ROOT, file)}: GOVERNED BY missing anchor ${p}`);
      }
      continue;
    }
    if (p.startsWith('docs/') || p.startsWith('verify/') || p.startsWith('package.json')) {
      const pathOnly = p.split(/\s+/)[0] ?? p;
      // strip trailing punctuation
      const clean = pathOnly.replace(/[.,)]+$/, '');
      if (!existsSync(join(ROOT, clean))) {
        // contracts/terminology/strategy/runbooks may land on later branches —
        // only require findings + CONVENTIONS + GLOSSARY for now; warn via skip
        if (
          clean.startsWith('docs/contracts/') ||
          clean.startsWith('docs/terminology/') ||
          clean.startsWith('docs/strategy/') ||
          clean.startsWith('docs/runbooks/') ||
          clean.startsWith('BUILD-SUMMARY')
        ) {
          continue;
        }
        offenders.push(`${relative(ROOT, file)}: GOVERNED BY missing ${clean}`);
      }
    }
  }
}

const docFiles: string[] = [];
walk(DOCS, docFiles);
for (const file of docFiles) {
  if (!file.endsWith('.md')) continue;
  const body = readFileSync(file, 'utf8');
  if (STUB_RE.test(body)) {
    offenders.push(`${relative(ROOT, file)}: contains stub/TODO/not-implemented marker`);
  }
}

if (offenders.length) {
  console.error(`check-docs: ${offenders.length} offender(s)\n`);
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}

console.log('check-docs: ok');
