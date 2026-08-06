/**
 * WHAT: Runs the deliberately-wrong canary suite; fails CI if any canary is accepted by existing gates.
 * NOT:  Does not invent new clinical gates or special-case checks to paper over gaps — gaps are FINDINGS.
 * GOVERNED BY: docs/findings/canary-suite.md; DECISIONS.md#d12; docs/findings/verify-baseline.md
 * CORRECTNESS: verify/canaries/manifest.json — every canary either rejected by its named gate or reported as FINDING:UNCAUGHT
 * GOTCHA: FINDING:UNCAUGHT exits 0 (documented baseline). Only ACCEPTED exits 1.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectPropertyMismatches } from '../packages/anchor-layer/src/index.ts';
import { validateInterpretationDocument } from '../packages/interpretation-contract/src/validate.ts';
import { AnchorIngestError } from '../packages/provider-anchor/src/errors.ts';
import { mapBiomarkerToObservation } from '../packages/provider-anchor/src/fhir/mapObservation.ts';
import { radiansToDegrees } from '../packages/provider-vitronic/src/fhir/mappers/shared.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANARIES = join(ROOT, 'verify/canaries');

interface CanaryMeta {
  id: string;
  dir: string;
  harness: string;
  expected_gate: string | null;
  expected_rejection: string;
  finding?: string;
}

interface Manifest {
  canaries: CanaryMeta[];
}

type Outcome =
  | { id: string; status: 'caught'; detail: string }
  | { id: string; status: 'accepted'; detail: string }
  | { id: string; status: 'finding'; detail: string };

/** Error code declared after `→` in expected_gate, when present. */
function expectedErrorCode(meta: CanaryMeta): string | undefined {
  const m = meta.expected_gate?.match(/→\s*([A-Z][A-Z0-9_]+)/);
  return m?.[1];
}

/** LOINC / SCTID / similar literal named in expected_rejection, when present. */
function expectedLiteral(meta: CanaryMeta, pattern: RegExp): string | undefined {
  const m = meta.expected_rejection.match(pattern);
  return m?.[1];
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function runVitronic(dir: string): Outcome {
  const input = loadJson(join(dir, 'input.json')) as {
    vendor_payload: { angles: { primary: number } };
    wrong_if_emitted: { valueQuantity: { value: number } };
  };
  const rad = input.vendor_payload.angles.primary;
  const deg = radiansToDegrees(rad);
  const wrong = input.wrong_if_emitted.valueQuantity.value;
  // Accepted = conversion missing (still ~radian magnitude under deg)
  if (Math.abs(deg - wrong) < 0.5) {
    return {
      id: '01-radians-as-degrees',
      status: 'accepted',
      detail: `radiansToDegrees(${rad}) → ${deg}; still near wrong emission ${wrong}`
    };
  }
  if (Math.abs(deg - 84.8923) > 0.001) {
    return {
      id: '01-radians-as-degrees',
      status: 'accepted',
      detail: `expected 84.8923 deg, got ${deg}`
    };
  }
  return {
    id: '01-radians-as-degrees',
    status: 'caught',
    detail: `radiansToDegrees rejected radian-as-degree emission (${rad} → ${deg} deg)`
  };
}

function runBor(dir: string): Outcome {
  const input = loadJson(join(dir, 'input.json')) as { biomarker: Record<string, unknown> };
  const layer = {
    schema_version: 'anchor-layer.v1' as const,
    compiled_at_source_sha256: 'canary',
    source_file: 'canary',
    decisions: ['D-e'],
    biomarkers: [input.biomarker as never],
    reference_intervals: [],
    interpretive_bands: [],
    counts: {
      markers_with_reference_interval: 0,
      markers_with_interpretive_band_only: 0,
      markers_with_neither: 1
    }
  };
  const hits = detectPropertyMismatches(layer);
  if (hits.some((h) => h.biomarker_id === 'BM-060')) {
    return {
      id: '02-bor-moles-mass',
      status: 'caught',
      detail: 'detectPropertyMismatches flagged BM-060 (molar LOINC + mass unit)'
    };
  }
  return {
    id: '02-bor-moles-mass',
    status: 'accepted',
    detail: 'detectPropertyMismatches did not flag BM-060'
  };
}

function runInterpretiveBandAsInterval(dir: string): Outcome {
  const input = loadJson(join(dir, 'input.json')) as {
    biomarker_id: string;
    value: number;
    unit_ucum: string;
    reference_interval_id: string;
  };
  try {
    mapBiomarkerToObservation(
      {
        biomarker_id: input.biomarker_id,
        value: input.value,
        unit_ucum: input.unit_ucum,
        reference_interval_id: input.reference_interval_id
      },
      {
        subjectKey: 'canary-band',
        sex: 'male',
        birthDate: '1980-01-01',
        effectiveDateTime: '2026-07-12T09:00:00+02:00',
        collectionEventId: 'canary-band-draw'
      }
    );
    return {
      id: '12-interpretive-band-as-interval',
      status: 'accepted',
      detail: `mapBiomarkerToObservation accepted band id ${input.reference_interval_id} as a measured interval`
    };
  } catch (err) {
    if (err instanceof AnchorIngestError && err.code === 'interpretive_band_not_reference_interval') {
      return {
        id: '12-interpretive-band-as-interval',
        status: 'caught',
        detail: `provider-anchor rejected interpretive_band ${input.reference_interval_id} (D-c)`
      };
    }
    return {
      id: '12-interpretive-band-as-interval',
      status: 'accepted',
      detail: `unexpected error: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

function runFabricatedLoinc(dir: string, expectedCode: string): Outcome {
  const plant = join(ROOT, 'packages/fhir-core/src/_canary_fabricated_loinc.ts');
  const src = readFileSync(join(dir, 'input.ts.txt'), 'utf8');
  writeFileSync(plant, src, 'utf8');
  try {
    execFileSync('pnpm', ['exec', 'tsx', 'verify/check-terminology.ts'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return {
      id: '03-fabricated-loinc',
      status: 'accepted',
      detail: `check-terminology.ts exited 0 despite LOINC ${expectedCode} plant`
    };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string };
    const text = `${e.stderr ?? ''}\n${e.stdout ?? ''}`;
    if (text.includes(expectedCode)) {
      return {
        id: '03-fabricated-loinc',
        status: 'caught',
        detail: `check-terminology.ts rejected LOINC ${expectedCode}`
      };
    }
    return {
      id: '03-fabricated-loinc',
      status: 'accepted',
      detail: `check-terminology.ts failed but did not mention ${expectedCode}: ${text.slice(0, 400)}`
    };
  } finally {
    rmSync(plant, { force: true });
  }
}

function runInterpretationValidate(id: string, dir: string, expectedCode?: string): Outcome {
  const raw = loadJson(join(dir, 'input.json'));
  const doc =
    raw && typeof raw === 'object' && raw !== null && 'document' in raw ? (raw as { document: unknown }).document : raw;
  const result = validateInterpretationDocument(doc);
  if (result.ok) {
    return {
      id,
      status: 'accepted',
      detail: 'validateInterpretationDocument accepted the canary'
    };
  }
  if (expectedCode && !result.errors.some((e) => e.code === expectedCode)) {
    return {
      id,
      status: 'accepted',
      detail: `rejected, but not with ${expectedCode}: ${result.errors.map((e) => e.code).join(',')}`
    };
  }
  return {
    id,
    status: 'caught',
    detail: `validateInterpretationDocument → ${result.errors.map((e) => e.code).join(',')}`
  };
}

function runSnomedPlant(dir: string): Outcome {
  const exportsDir = join(ROOT, 'exports');
  const plant = join(exportsDir, '_canary_09_sctid.json');
  mkdirSync(exportsDir, { recursive: true });
  copyFileSync(join(dir, 'input.json'), plant);
  try {
    execFileSync('pnpm', ['exec', 'tsx', 'verify/check-snomed-boundary.ts'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return {
      id: '09-sctid-in-published-path',
      status: 'accepted',
      detail: 'check-snomed-boundary.ts exited 0 with SCTID planted under exports/'
    };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string };
    const text = `${e.stderr ?? ''}\n${e.stdout ?? ''}`;
    if (/80891009|SNOMED|SCTID/i.test(text)) {
      return {
        id: '09-sctid-in-published-path',
        status: 'caught',
        detail: 'check-snomed-boundary.ts rejected SCTID under exports/'
      };
    }
    return {
      id: '09-sctid-in-published-path',
      status: 'accepted',
      detail: `boundary check failed without naming the canary SCTID: ${text.slice(0, 400)}`
    };
  } finally {
    rmSync(plant, { force: true });
  }
}

function runGap(meta: CanaryMeta, dir: string): Outcome {
  // Prove current gates accept the payload where applicable — then report FINDING.
  if (meta.id === '04-wrong-snomed-body-structure') {
    const wrapped = loadJson(join(dir, 'input.json')) as {
      document: { states: Array<Record<string, unknown>> };
    };
    const doc = structuredClone(wrapped.document);
    doc.states = doc.states.map(({ _internal_not_for_publication: _, ...rest }) => rest);
    const v = validateInterpretationDocument(doc);
    const detail = v.ok
      ? 'interpretation validator accepts the document; wrong SCTID only in internal annotation — no semantic body-structure gate'
      : `unexpected reject: ${v.errors.map((e) => e.code).join(',')}`;
    return { id: meta.id, status: 'finding', detail: `${meta.finding} Proof: ${detail}` };
  }
  if (meta.id === '05-range-flag-null-interval') {
    return {
      id: meta.id,
      status: 'finding',
      detail: meta.finding ?? 'no gate'
    };
  }
  if (meta.id === '06-stale-observation-interpreted') {
    const wrapped = loadJson(join(dir, 'input.json')) as { document: unknown };
    const v = validateInterpretationDocument(wrapped.document);
    if (!v.ok) {
      return {
        id: meta.id,
        status: 'caught',
        detail: `unexpected: validator rejected stale-as-present (${v.errors.map((e) => e.code).join(',')})`
      };
    }
    return {
      id: meta.id,
      status: 'finding',
      detail: `${meta.finding} Proof: validateInterpretationDocument accepted status=present at age>180d.`
    };
  }
  if (meta.id === '11-uberon-to-fma-wrong-direction') {
    const wrapped = loadJson(join(dir, 'input.json')) as {
      document: unknown;
      join_declaration: { direction: string };
    };
    const v = validateInterpretationDocument(wrapped.document);
    if (!v.ok) {
      return {
        id: meta.id,
        status: 'caught',
        detail: `unexpected: validator rejected document (${v.errors.map((e) => e.code).join(',')})`
      };
    }
    return {
      id: meta.id,
      status: 'finding',
      detail: `${meta.finding} Proof: validateInterpretationDocument accepted the document; join_declaration.direction=${wrapped.join_declaration.direction} is never passed to any production join/bridge resolver (none exists).`
    };
  }
  return { id: meta.id, status: 'finding', detail: meta.finding ?? 'no gate' };
}

function main(): void {
  const manifest = loadJson(join(CANARIES, 'manifest.json')) as Manifest;
  const outcomes: Outcome[] = [];

  for (const meta of manifest.canaries) {
    const dir = join(CANARIES, meta.dir);
    let outcome: Outcome;
    switch (meta.harness) {
      case 'vitronic-radians-degrees':
        outcome = runVitronic(dir);
        break;
      case 'anchor-property-mismatch':
        outcome = runBor(dir);
        break;
      case 'check-terminology-review-records': {
        const code = expectedLiteral(meta, /\bLOINC\s+(\d{2,5}-\d)\b/i) ?? '99999-5';
        outcome = runFabricatedLoinc(dir, code);
        break;
      }
      case 'interpretation-validate':
        outcome = runInterpretationValidate(meta.id, dir, expectedErrorCode(meta));
        break;
      case 'check-snomed-boundary-plant':
        outcome = runSnomedPlant(dir);
        break;
      case 'interpretive-band-as-interval':
        outcome = runInterpretiveBandAsInterval(dir);
        break;
      case 'none':
        outcome = runGap(meta, dir);
        break;
      default:
        outcome = {
          id: meta.id,
          status: 'finding',
          detail: `unknown harness ${meta.harness}`
        };
    }
    outcomes.push(outcome);
  }

  const caught = outcomes.filter((o) => o.status === 'caught');
  const accepted = outcomes.filter((o) => o.status === 'accepted');
  const findings = outcomes.filter((o) => o.status === 'finding');

  console.log('check-canaries: deliberately wrong inputs\n');
  for (const o of outcomes) {
    const tag = o.status === 'caught' ? 'CAUGHT' : o.status === 'accepted' ? 'ACCEPTED' : 'FINDING:UNCAUGHT';
    console.log(`  [${tag}] ${o.id}`);
    console.log(`           ${o.detail}`);
  }
  console.log(
    `\nsummary: caught=${caught.length} accepted=${accepted.length} findings=${findings.length} total=${outcomes.length}`
  );

  if (accepted.length) {
    console.error('\ncheck-canaries: FAIL — canary accepted by pipeline (see docs/findings/canary-suite.md)');
    process.exit(1);
  }
  if (findings.length) {
    // Documented gaps stay visible in the log; they do not block CI. Only an
    // ACCEPTED canary (wrong input slipped through) is merge-blocking.
    console.error(
      `\ncheck-canaries: ${findings.length} FINDING:UNCAUGHT documented in docs/findings/canary-suite.md — not blocking`
    );
    process.exit(0);
  }
  console.log('\ncheck-canaries: ok — every canary rejected by its named gate');
}

main();
