/**
 * WHAT: Fails when a LOINC, UCUM, SNOMED, FMA, or UBERON code literal in source lacks a complete signed review record.
 * NOT:  Does not invent codes, look them up, or treat UNVERIFIED stubs as signed; clinical lookup is a human runbook.
 * GOVERNED BY: docs/terminology/README.md; docs/findings/verify-baseline.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: UNVERIFIED Anchor stubs are intentional work-queue red. APPROVED allowlist entries satisfy the record requirement — G1 and G2 must not double-count.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const RECORD_DIR = join(ROOT, 'docs', 'terminology', 'review-records');
const ALLOWLIST_PATH = join(ROOT, 'verify', 'terminology-allowlist.json');

interface AllowlistEntry {
  status?: string;
  system?: string;
}

function loadAllowlistApproved(): Map<string, AllowlistEntry> {
  const map = new Map<string, AllowlistEntry>();
  if (!existsSync(ALLOWLIST_PATH)) return map;
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as {
    codes?: Record<string, AllowlistEntry>;
  };
  for (const [code, entry] of Object.entries(raw.codes ?? {})) {
    if ((entry.status ?? '').toLowerCase() !== 'approved') continue;
    const system = (entry.system ?? '').toLowerCase();
    // Key by vocabulary::code for LOINC / SNOMED; also bare code for lookup flexibility
    if (system.includes('loinc')) map.set(`LOINC::${code}`, entry);
    else if (system.includes('snomed')) map.set(`SNOMED::${code}`, entry);
    map.set(code, entry); // fallback
  }
  return map;
}

function allowlistCovers(approved: Map<string, AllowlistEntry>, vocabulary: Vocab, code: string): boolean {
  if (approved.has(`${vocabulary}::${code}`)) return true;
  // LOINC answer codes (LA…) and numeric codes share the allowlist keyspace
  const e = approved.get(code);
  if (!e) return false;
  const system = (e.system ?? '').toLowerCase();
  if (vocabulary === 'LOINC' && system.includes('loinc')) return true;
  if (vocabulary === 'SNOMED' && system.includes('snomed')) return true;
  return false;
}

type Vocab = 'LOINC' | 'UCUM' | 'SNOMED' | 'FMA' | 'UBERON';

interface FoundCode {
  vocabulary: Vocab;
  code: string;
  sites: string[];
}

interface ReviewRecord {
  file: string;
  vocabulary: string;
  code: string;
  binds_to: string;
  official_display_name: string;
  source_url: string;
  retrieval_date: string;
  human_reviewer_name: string;
  date_signed: string;
}

const VERIFICATION_FIELDS = [
  'official_display_name',
  'source_url',
  'retrieval_date',
  'human_reviewer_name',
  'date_signed'
] as const;

function walkSrc(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'tests') continue;
      walkSrc(full, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
}

function sourceFiles(): string[] {
  const files: string[] = [];
  const top = join(ROOT, 'src');
  if (existsSync(top)) walkSrc(top, files);
  const packagesDir = join(ROOT, 'packages');
  if (existsSync(packagesDir)) {
    for (const name of readdirSync(packagesDir)) {
      walkSrc(join(packagesDir, name, 'src'), files);
    }
  }
  return files;
}

function recordFileName(vocabulary: Vocab, code: string): string {
  const safe = code.replace(/[^A-Za-z0-9._+-]+/g, '_');
  return `${vocabulary}-${safe}.md`;
}

function parseFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    let v = (kv[2] ?? '').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[kv[1] ?? ''] = v;
  }
  return out;
}

function loadRecords(): Map<string, ReviewRecord> {
  const map = new Map<string, ReviewRecord>();
  if (!existsSync(RECORD_DIR)) return map;
  for (const name of readdirSync(RECORD_DIR)) {
    if (!name.endsWith('.md')) continue;
    const file = join(RECORD_DIR, name);
    const fm = parseFrontmatter(readFileSync(file, 'utf8'));
    const vocabulary = (fm.vocabulary ?? '').toUpperCase();
    const code = fm.code ?? '';
    if (!vocabulary || !code) continue;
    const key = `${vocabulary}::${code}`;
    map.set(key, {
      file: relative(ROOT, file),
      vocabulary,
      code,
      binds_to: fm.binds_to ?? '',
      official_display_name: fm.official_display_name ?? '',
      source_url: fm.source_url ?? '',
      retrieval_date: fm.retrieval_date ?? '',
      human_reviewer_name: fm.human_reviewer_name ?? '',
      date_signed: fm.date_signed ?? ''
    });
  }
  return map;
}

function add(found: Map<string, FoundCode>, vocabulary: Vocab, code: string, site: string): void {
  const key = `${vocabulary}::${code}`;
  const cur = found.get(key);
  if (cur) {
    if (!cur.sites.includes(site)) cur.sites.push(site);
  } else {
    found.set(key, { vocabulary, code, sites: [site] });
  }
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split(/\r?\n/).length;
}

/** Collect code-shaped literals for the five vocabularies. */
function collectCodes(files: string[]): Map<string, FoundCode> {
  const found = new Map<string, FoundCode>();

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    // FMA / UBERON CURIEs anywhere in source
    for (const m of src.matchAll(/\bFMA:(\d+)\b/gi)) {
      add(found, 'FMA', m[1] ?? '', `${rel}:${lineOf(src, m.index ?? 0)}`);
    }
    for (const m of src.matchAll(/\bUBERON:(\d+)\b/gi)) {
      add(found, 'UBERON', m[1] ?? '', `${rel}:${lineOf(src, m.index ?? 0)}`);
    }

    // LOINC: classic NNNNN-N form near LOINC system or as explicit coding
    const loincContext =
      /SYSTEMS\.LOINC|loinc\.org|vocabulary:\s*LOINC|LOINC[_-]?UNITS/i.test(src) ||
      /code:\s*['"]\d{1,5}-\d['"]/.test(src);
    if (loincContext || /loinc/i.test(rel)) {
      for (const m of src.matchAll(/['"`](\d{1,5}-\d)['"`]/g)) {
        const code = m[1] ?? '';
        // Avoid dates like 2026-07 by requiring LOINC-like nearby or map key context
        const start = Math.max(0, (m.index ?? 0) - 120);
        const window = src.slice(start, (m.index ?? 0) + code.length + 80);
        if (/LOINC|loinc\.org|LOINC_UNITS|coding/i.test(window) || /^\d{2,5}-\d$/.test(code)) {
          // Filter obvious non-LOINC: year-month 20xx-xx with month > 12 already excluded by \d single
          if (/^20\d{2}-\d{1,2}$/.test(code)) continue;
          add(found, 'LOINC', code, `${rel}:${lineOf(src, m.index ?? 0)}`);
        }
      }
    }

    // SNOMED: digit strings beside SNOMED system markers
    for (const m of src.matchAll(/SYSTEMS\.SNOMED|snomed\.info\/sct|snomed\.info/gi)) {
      const from = m.index ?? 0;
      const window = src.slice(from, from + 400);
      for (const c of window.matchAll(/code:\s*['"`](\d{6,18})['"`]/g)) {
        add(found, 'SNOMED', c[1] ?? '', `${rel}:${lineOf(src, from)}`);
      }
      for (const c of window.matchAll(/['"`](\d{6,18})['"`]/g)) {
        // only if coding-ish
        const local = window.slice(Math.max(0, (c.index ?? 0) - 40), (c.index ?? 0) + 40);
        if (/code|coding|SNOMED|sct/i.test(local)) {
          add(found, 'SNOMED', c[1] ?? '', `${rel}:${lineOf(src, from)}`);
        }
      }
    }

    // UCUM: codes beside UCUM system or UCUM table
    if (/SYSTEMS\.UCUM|unitsofmeasure\.org|\bUCUM\b/.test(src)) {
      for (const m of src.matchAll(
        /(?:SYSTEMS\.UCUM|unitsofmeasure\.org)[\s\S]{0,200}?code:\s*['"`]([^'"`]+)['"`]/gi
      )) {
        add(found, 'UCUM', m[1] ?? '', `${rel}:${lineOf(src, m.index ?? 0)}`);
      }
      // Common pattern in units.ts: code: 'mg/dL' within UCUM const objects
      for (const m of src.matchAll(/code:\s*['"`]([^'"`]+)['"`][\s\S]{0,80}?system:\s*SYSTEMS\.UCUM/g)) {
        add(found, 'UCUM', m[1] ?? '', `${rel}:${lineOf(src, m.index ?? 0)}`);
      }
      for (const m of src.matchAll(/system:\s*SYSTEMS\.UCUM[\s\S]{0,80}?code:\s*['"`]([^'"`]+)['"`]/g)) {
        add(found, 'UCUM', m[1] ?? '', `${rel}:${lineOf(src, m.index ?? 0)}`);
      }
    }
  }

  return found;
}

function isUnverified(record: ReviewRecord): boolean {
  return VERIFICATION_FIELDS.some((f) => record[f].trim() === 'UNVERIFIED');
}

function missingFields(record: ReviewRecord): string[] {
  const required = [
    'code',
    'binds_to',
    'official_display_name',
    'source_url',
    'retrieval_date',
    'human_reviewer_name',
    'date_signed'
  ] as const;
  return required.filter((f) => !record[f] || !String(record[f]).trim());
}

const files = sourceFiles();
const found = collectCodes(files);
const records = loadRecords();
const allowlistApproved = loadAllowlistApproved();

const missingRecord: FoundCode[] = [];
const coveredByAllowlist: FoundCode[] = [];
const unverified: { found: FoundCode; record: ReviewRecord }[] = [];
const incomplete: { found: FoundCode; record: ReviewRecord; fields: string[] }[] = [];

for (const [, item] of [...found.entries()].sort()) {
  const key = `${item.vocabulary}::${item.code}`;
  const rec = records.get(key);
  if (!rec) {
    // G1 APPROVED satisfies the G2 record requirement for that code — not a gap.
    if (allowlistCovers(allowlistApproved, item.vocabulary, item.code)) {
      coveredByAllowlist.push(item);
      continue;
    }
    missingRecord.push(item);
    continue;
  }
  const miss = missingFields(rec);
  if (miss.length) {
    incomplete.push({ found: item, record: rec, fields: miss });
    continue;
  }
  if (isUnverified(rec)) {
    unverified.push({ found: item, record: rec });
  }
}

// Also count stub records that are UNVERIFIED even if not yet referenced in source
let unverifiedRecordCount = 0;
for (const rec of records.values()) {
  if (isUnverified(rec)) unverifiedRecordCount += 1;
}

const missingLoinc = missingRecord.filter((m) => m.vocabulary === 'LOINC');
const missingOther = missingRecord.filter((m) => m.vocabulary !== 'LOINC');

console.log(
  `check-terminology (G2): ${found.size} distinct code(s) in source; ${records.size} review record(s) on disk`
);
console.log(`UNVERIFIED review records on disk (G2a Anchor stubs / work queue): ${unverifiedRecordCount}`);
console.log(`COVERED BY G1 ALLOWLIST (approved, no markdown record needed): ${coveredByAllowlist.length}`);
console.log(`MISSING review record (not on allowlist as approved): ${missingRecord.length}`);
console.log(`  of which LOINC: ${missingLoinc.length}; other vocabs: ${missingOther.length}`);

let failed = false;

if (coveredByAllowlist.length) {
  console.log(`\nCOVERED BY ALLOWLIST (${coveredByAllowlist.length}) — not counted as MISSING:`);
  for (const item of coveredByAllowlist) {
    console.log(
      `  ${item.vocabulary} ${item.code}  ${item.sites[0]}${item.sites.length > 1 ? ` (+${item.sites.length - 1})` : ''}`
    );
  }
}

if (missingRecord.length) {
  failed = true;
  console.error(`\nMISSING REVIEW RECORD (${missingRecord.length}):`);
  for (const item of missingRecord) {
    console.error(
      `  ${item.vocabulary} ${item.code}  ${item.sites[0]}${item.sites.length > 1 ? ` (+${item.sites.length - 1})` : ''}`
    );
    console.error(`      expected file: docs/terminology/review-records/${recordFileName(item.vocabulary, item.code)}`);
  }
}

if (incomplete.length) {
  failed = true;
  console.error(`\nINCOMPLETE REVIEW RECORD (${incomplete.length}):`);
  for (const row of incomplete) {
    console.error(
      `  ${row.found.vocabulary} ${row.found.code}  missing fields: ${row.fields.join(', ')}  (${row.record.file})`
    );
  }
}

if (unverified.length) {
  failed = true;
  console.error(`\nUNVERIFIED (signed fields still UNVERIFIED) (${unverified.length} in source):`);
  for (const row of unverified) {
    console.error(`  ${row.found.vocabulary} ${row.found.code}  binds_to=${row.record.binds_to}  (${row.record.file})`);
  }
}

const unverifiedNotInSource = [...records.values()].filter(
  (r) => isUnverified(r) && !found.has(`${r.vocabulary}::${r.code}`)
);
if (unverifiedNotInSource.length) {
  failed = true;
  console.error(`\nUNVERIFIED RECORDS NOT YET REFERENCED IN SOURCE (${unverifiedNotInSource.length}):`);
  for (const r of unverifiedNotInSource) {
    console.error(`  ${r.vocabulary} ${r.code}  binds_to=${r.binds_to}  (${r.file})`);
  }
}

if (failed) {
  console.error(
    `\nFAIL: terminology review gate (G2). UNVERIFIED on disk: ${unverifiedRecordCount}; true MISSING: ${missingRecord.length}. See docs/runbooks/verify-a-code.md`
  );
  console.error('Note: this gate is registered as ADVISORY in verify/run-verify.ts until Anchor stubs are signed.');
  process.exit(1);
}

console.log('PASS: every in-source code has a signed review record or G1 APPROVED allowlist entry.');
