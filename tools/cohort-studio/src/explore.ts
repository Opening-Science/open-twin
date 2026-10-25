/**
 * WHAT: Summarises a finished run's Synthea FHIR bundles into an overview index and one-person detail views.
 * NOT:  Does not interpret, score or validate the records clinically; it counts what Synthea wrote.
 * GOVERNED BY: docs/synthea.md; docs/INTENDED-USE.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Ages are measured at the recipe's end date, never at today's date, so the view does not drift over time.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Res = Record<string, unknown>;
type Coding = { display?: string; code?: string };
type Concept = { text?: string; coding?: Coding[] } | undefined;

const INDEX_VERSION = 2;

export type PersonSummary = {
  f: string;
  name: string;
  sex: string;
  born: string;
  died: string | null;
  age: number;
  city: string;
  race: string;
  enc: number;
  cond: number[];
  meds: number;
  obs: number;
};

export type ExploreIndex = {
  version: number;
  files: number;
  endDate: string;
  conditions: string[];
  patients: PersonSummary[];
  resourceTotals: Record<string, number>;
  encounterClasses: Record<string, number>;
  medsByPatients: Array<[string, number]>;
  obsByPatients: Array<[string, number]>;
  encountersByYear: Record<string, number>;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const obj = (v: unknown): Res | undefined => (typeof v === 'object' && v !== null ? (v as Res) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function display(cc: unknown): string {
  const c = obj(cc) as Concept;
  const first = c?.coding?.[0];
  return c?.text ?? first?.display ?? first?.code ?? 'Unknown';
}

export function yearsBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (365.25 * 864e5);
}

export function patientFiles(fhirDir: string): string[] {
  if (!existsSync(fhirDir)) return [];
  return readdirSync(fhirDir)
    .filter((f) => f.endsWith('.json') && !/^(hospital|practitioner)Information/.test(f))
    .sort();
}

function readBundle(fhirDir: string, file: string): Res[] {
  const b = JSON.parse(readFileSync(join(fhirDir, file), 'utf8')) as Res;
  return arr(b.entry)
    .map((e) => obj(obj(e)?.resource))
    .filter((r): r is Res => r !== undefined);
}

/**
 * Synthea writes a prescription either with medicationCodeableConcept or as a medicationReference to a
 * Medication resource in the same bundle (urn:uuid:<id>); both resolve to the medicine's name here.
 */
export function medicationNamer(rs: Res[]): (r: Res) => string {
  const byRef = new Map<string, unknown>();
  for (const m of rs) {
    if (m.resourceType !== 'Medication' || typeof m.id !== 'string') continue;
    byRef.set(`urn:uuid:${m.id}`, m.code);
    byRef.set(`Medication/${m.id}`, m.code);
  }
  return (r) => {
    if (r.medicationCodeableConcept) return display(r.medicationCodeableConcept);
    const ref = str(obj(r.medicationReference)?.reference);
    return ref && byRef.has(ref) ? display(byRef.get(ref)) : 'Unknown';
  };
}

export function personName(p: Res): string {
  const n = obj(arr(p.name)[0]);
  const given = arr(n?.given).filter((g): g is string => typeof g === 'string');
  return [given.join(' '), str(n?.family)].filter(Boolean).join(' ').replace(/\d+/g, '');
}

function count<K extends string>(m: Record<K, number>, k: K): void {
  m[k] = (m[k] ?? 0) + 1;
}

/** `endDate` is the recipe's end date (YYYY-MM-DD): ages of living people are taken on that day. */
export function buildIndex(fhirDir: string, endDate: string): ExploreIndex {
  const files = patientFiles(fhirDir);
  const condIds = new Map<string, number>();
  const meds = new Map<string, number>();
  const obs = new Map<string, number>();
  const resourceTotals: Record<string, number> = {};
  const encounterClasses: Record<string, number> = {};
  const encountersByYear: Record<string, number> = {};
  const patients: PersonSummary[] = [];

  for (const f of files) {
    const rs = readBundle(fhirDir, f);
    const medName = medicationNamer(rs);
    const p = rs.find((r) => r.resourceType === 'Patient');
    if (!p) continue;
    const cond = new Set<number>();
    const pm = new Set<string>();
    const po = new Set<string>();
    let enc = 0;
    let nm = 0;
    let no = 0;
    for (const r of rs) {
      const type = str(r.resourceType) ?? 'Unknown';
      count(resourceTotals, type);
      if (type === 'Encounter') {
        enc++;
        count(encounterClasses, str(obj(r.class)?.code) ?? 'other');
        const y = str(obj(r.period)?.start)?.slice(0, 4);
        if (y) count(encountersByYear, y);
      } else if (type === 'Condition') {
        const d = display(r.code);
        if (!condIds.has(d)) condIds.set(d, condIds.size);
        cond.add(condIds.get(d) ?? 0);
      } else if (type === 'MedicationRequest') {
        nm++;
        pm.add(medName(r));
      } else if (type === 'Observation') {
        no++;
        po.add(display(r.code));
      }
    }
    for (const m of pm) meds.set(m, (meds.get(m) ?? 0) + 1);
    for (const o of po) obs.set(o, (obs.get(o) ?? 0) + 1);
    const born = str(p.birthDate) ?? endDate;
    const died = str(p.deceasedDateTime) ?? null;
    const race = arr(p.extension)
      .map(obj)
      .find((e) => str(e?.url)?.endsWith('us-core-race'));
    patients.push({
      f,
      name: personName(p),
      sex: str(p.gender) ?? 'unknown',
      born,
      died,
      age: Math.max(0, Math.floor(yearsBetween(born, died ?? endDate))),
      city: str(obj(arr(p.address)[0])?.city) ?? '',
      race: str(obj(obj(arr(race?.extension)[0])?.valueCoding)?.display) ?? '',
      enc,
      cond: [...cond],
      meds: nm,
      obs: no
    });
  }
  const top = (m: Map<string, number>): Array<[string, number]> =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);
  return {
    version: INDEX_VERSION,
    files: files.length,
    endDate,
    conditions: [...condIds.keys()],
    patients,
    resourceTotals,
    encounterClasses,
    medsByPatients: top(meds),
    obsByPatients: top(obs),
    encountersByYear
  };
}

/** Builds the index once per run and keeps it next to the output. */
export function loadIndex(runDir: string, endDate: string): ExploreIndex {
  const cache = join(runDir, 'explore-index.json');
  if (existsSync(cache)) {
    const cached = JSON.parse(readFileSync(cache, 'utf8')) as ExploreIndex;
    if (cached.version === INDEX_VERSION) return cached;
  }
  const index = buildIndex(join(runDir, 'out', 'fhir'), endDate);
  writeFileSync(cache, JSON.stringify(index));
  return index;
}

export type Series = { name: string; unit: string; points: Array<[string, number]> };

export function personDetail(runDir: string, index: ExploreIndex, file: string) {
  const summary = index.patients.find((x) => x.f === file);
  if (!summary) return null;
  const rs = readBundle(join(runDir, 'out', 'fhir'), file);
  const medName = medicationNamer(rs);
  const series: Record<string, Series> = {};
  const add = (name: string, unit: string, t: string, v: number): void => {
    series[name] ??= { name, unit, points: [] };
    series[name].points.push([t, v]);
  };
  for (const r of rs) {
    const t = str(r.effectiveDateTime);
    if (r.resourceType !== 'Observation' || !t) continue;
    const q = obj(r.valueQuantity);
    if (typeof q?.value === 'number') add(display(r.code), str(q.unit) ?? '', t, q.value);
    for (const c of arr(r.component).map(obj)) {
      const cq = obj(c?.valueQuantity);
      if (typeof cq?.value === 'number') add(display(c?.code), str(cq.unit) ?? '', t, cq.value);
    }
  }
  for (const s of Object.values(series)) s.points.sort((a, b) => a[0].localeCompare(b[0]));
  const pick = <T>(type: string, f: (r: Res) => T): T[] => rs.filter((r) => r.resourceType === type).map(f);
  const byDate = (a: string | undefined, b: string | undefined): number => (a ?? '').localeCompare(b ?? '');
  return {
    summary,
    conditions: pick('Condition', (r) => ({
      name: display(r.code),
      onset: str(r.onsetDateTime) ?? null,
      ended: str(r.abatementDateTime) ?? null
    })).sort((a, b) => byDate(a.onset ?? undefined, b.onset ?? undefined)),
    medications: pick('MedicationRequest', (r) => ({
      name: medName(r),
      date: str(r.authoredOn) ?? null
    })).sort((a, b) => byDate(b.date ?? undefined, a.date ?? undefined)),
    encounters: pick('Encounter', (r) => ({
      date: str(obj(r.period)?.start) ?? null,
      type: display(arr(r.type)[0]),
      reason: r.reasonCode ? display(arr(r.reasonCode)[0]) : null
    })).sort((a, b) => byDate(b.date ?? undefined, a.date ?? undefined)),
    immunizations: pick('Immunization', (r) => ({
      name: display(r.vaccineCode),
      date: str(r.occurrenceDateTime) ?? null
    })).sort((a, b) => byDate(b.date ?? undefined, a.date ?? undefined)),
    procedures: pick('Procedure', (r) => ({
      name: display(r.code),
      date: str(obj(r.performedPeriod)?.start) ?? str(r.performedDateTime) ?? null
    })).sort((a, b) => byDate(b.date ?? undefined, a.date ?? undefined)),
    series: Object.values(series)
      .filter((s) => s.points.length >= 2)
      .sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name))
  };
}
