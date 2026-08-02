/**
 * WHAT: Fails the build when any exporting module under src/ or packages/ lacks a complete convention header.
 * NOT:  Does not judge clinical correctness of CORRECTNESS claims — only shape and non-emptiness; clinical gates live under verify/.
 * GOVERNED BY: docs/CONVENTIONS.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Parses only the first block comment; a second narrative comment may follow.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

const MANDATORY = ['WHAT', 'NOT', 'GOVERNED BY', 'CORRECTNESS'] as const;

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === 'generated') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
}

/** Only production source trees: repo `src/` and each package's `src/`. */
function collectSourceRoots(): string[] {
  const roots: string[] = [];
  const topSrc = join(ROOT, 'src');
  try {
    if (statSync(topSrc).isDirectory()) roots.push(topSrc);
  } catch {
    /* no repo-level src */
  }
  const packagesDir = join(ROOT, 'packages');
  try {
    for (const name of readdirSync(packagesDir)) {
      const src = join(packagesDir, name, 'src');
      try {
        if (statSync(src).isDirectory()) roots.push(src);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no packages */
  }
  return roots;
}

function collectsExports(src: string): boolean {
  return /^export\s/m.test(src);
}

function firstBlockComment(src: string): string | null {
  const stripped = src.replace(/^\uFEFF/, '').replace(/^#![^\n]*\n/, '');
  const m = stripped.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  return m ? m[1] : null;
}

function fieldValue(block: string, label: string): string | null {
  const re = new RegExp(
    String.raw`^\s*\*?\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\s*(.*)$`,
    'im',
  );
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = line.match(re);
    if (!m) continue;
    let value = (m[1] ?? '').trim();
    for (let j = i + 1; j < lines.length; j++) {
      const cont = lines[j] ?? '';
      if (/^\s*\*?\s*[A-Z][A-Z\s]*:\s*/.test(cont.replace(/^\s*\*/, ''))) break;
      const body = cont.replace(/^\s*\*?\s?/, '').trim();
      if (!body) continue;
      // Continuation lines for CORRECTNESS etc. (no new FIELD:)
      if (/^[A-Z][A-Z\s]*:/.test(body)) break;
      value = `${value} ${body}`.trim();
    }
    return value;
  }
  return null;
}

const roots = collectSourceRoots();
const files: string[] = [];
for (const r of roots) walk(r, files);

const offenders: string[] = [];

for (const file of files.sort()) {
  const src = readFileSync(file, 'utf8');
  if (!collectsExports(src)) continue;
  const rel = relative(ROOT, file);
  // Skip pure test directories even if named without .test.ts suffix
  if (rel.includes(`${join('tests', '')}`) || /[/\\]tests[/\\]/.test(rel)) continue;

  const block = firstBlockComment(src);
  if (!block) {
    offenders.push(`${rel}: missing module header block`);
    continue;
  }

  for (const label of MANDATORY) {
    const v = fieldValue(block, label);
    if (v === null) offenders.push(`${rel}: missing field ${label}`);
    else if (!v.trim()) offenders.push(`${rel}: empty field ${label}`);
  }

  const correctness = fieldValue(block, 'CORRECTNESS');
  if (correctness && /\bunit tests?\b/i.test(correctness) && !/^NONE\b/i.test(correctness)) {
    offenders.push(`${rel}: CORRECTNESS must not cite unit tests`);
  }

  const gotcha = fieldValue(block, 'GOTCHA');
  if (gotcha !== null && !gotcha.trim()) {
    offenders.push(`${rel}: empty GOTCHA (omit the field instead)`);
  }
}

if (offenders.length) {
  console.error(`check-headers: ${offenders.length} offender(s)\n`);
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}

console.log(`check-headers: ok (${files.length} files scanned)`);
