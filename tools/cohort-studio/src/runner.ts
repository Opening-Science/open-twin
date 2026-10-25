/**
 * WHAT: Runs one recipe through tools/synthea/generate.sh into its own folder, streams progress and records results.
 * NOT:  Does not call Java itself or choose Synthea flags; generate.sh is the single place that does, so a run here
 *       and a run from the shell are the same run.
 * GOVERNED BY: docs/synthea.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: generate.sh starts Java as a grandchild; cancelling must signal the whole process group, not just bash.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex } from './explore.ts';
import { GENERATE_SH, RUNS_DIR } from './paths.ts';
import { customModuleText, keepModuleFor, type Recipe, recipeEnv } from './recipe.ts';

export type RunStatus = 'running' | 'finished' | 'failed' | 'cancelled';

export type RunResults = {
  records: { total: number; alive: number; dead: number };
  files: number;
  bytes: number;
  fhirContentSha256: string;
  manifest: Record<string, unknown> | null;
};

export type RunRecord = {
  runId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number | null;
  recipe: Recipe;
  results: RunResults | null;
  error: string | null;
};

export type RunEvent =
  | { type: 'line'; text: string }
  | { type: 'progress'; kept: number; target: number }
  | { type: 'status'; run: RunRecord };

const RUN_ID_RE = /^\d{8}-\d{6}-[0-9a-f]{8}$/;
export const isRunId = (id: string): boolean => RUN_ID_RE.test(id);

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips terminal colour codes from Synthea's output
const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]|\u001b\]8;;[^\u0007\u001b]*(?:\u0007|\u001b\\)?/g;
const PERSON_RE = /^\d+ -- .+ \(\d+ y\/o [MF]\)/;
const RECORDS_RE = /^Records: total=(\d+), alive=(\d+), dead=(\d+)/;

export function cleanLine(line: string): string {
  return line.replace(ANSI_RE, '').replace(/\s+$/, '');
}

export function parseRecordsLine(line: string): RunResults['records'] | null {
  const m = line.match(RECORDS_RE);
  return m ? { total: Number(m[1]), alive: Number(m[2]), dead: Number(m[3]) } : null;
}

export function isPersonLine(line: string): boolean {
  return PERSON_RE.test(line);
}

/**
 * Hash over the patient files' contents, independent of the folder. The same value as generate.sh's
 * fhirContentSha256 and as `cd fhir && sha256sum *.json | sort | sha256sum`: one "<sha256>  <name>" line per file,
 * lines sorted in byte order, then hashed.
 */
export function contentChecksum(fhirDir: string): string {
  const lines = readdirSync(fhirDir)
    .filter((f) => f.endsWith('.json'))
    .map(
      (n) =>
        `${createHash('sha256')
          .update(readFileSync(join(fhirDir, n)))
          .digest('hex')}  ${n}\n`
    )
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return createHash('sha256').update(lines.join('')).digest('hex');
}

function newRunId(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${stamp}-${randomBytes(4).toString('hex')}`;
}

/** Writes the recipe, keep module and custom modules into the run folder; returns generate.sh inputs. */
export function materialise(recipe: Recipe, runDir: string): Record<string, string> {
  const inputs = join(runDir, 'inputs');
  mkdirSync(inputs, { recursive: true });
  writeFileSync(join(runDir, 'recipe.json'), `${JSON.stringify(recipe, null, 2)}\n`);
  const keepText = keepModuleFor(recipe);
  let keepModule: string | null = null;
  if (keepText) {
    keepModule = join(inputs, 'keep.json');
    writeFileSync(keepModule, keepText);
  }
  let modulesDir: string | null = null;
  if (recipe.customModules.length > 0) {
    modulesDir = join(inputs, 'modules');
    mkdirSync(modulesDir, { recursive: true });
    for (const m of recipe.customModules) writeFileSync(join(modulesDir, m.name), customModuleText(m.module));
  }
  return recipeEnv(recipe, { outDir: join(runDir, 'out'), keepModule, modulesDir });
}

export function readRun(runId: string, runsDir: string = RUNS_DIR): RunRecord | null {
  if (!isRunId(runId)) return null;
  const file = join(runsDir, runId, 'run.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as RunRecord) : null;
}

export function listRuns(): RunRecord[] {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .filter(isRunId)
    .map((id) => readRun(id))
    .filter((r): r is RunRecord => r !== null)
    .sort((a, b) => b.runId.localeCompare(a.runId));
}

export function collectResults(runDir: string, recordsLine: RunResults['records'] | null): RunResults {
  const outDir = join(runDir, 'out');
  const fhirDir = join(outDir, 'fhir');
  const files = readdirSync(fhirDir).filter((f) => f.endsWith('.json'));
  const bytes = files.reduce((sum, f) => sum + statSync(join(fhirDir, f)).size, 0);
  const manifestFile = join(outDir, 'manifest.json');
  const manifest = existsSync(manifestFile)
    ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<string, unknown>)
    : null;
  let records = recordsLine;
  if (!records) {
    const index = buildIndex(fhirDir, '2100-01-01');
    const dead = index.patients.filter((p) => p.died).length;
    records = { total: index.patients.length, alive: index.patients.length - dead, dead };
  }
  return { records, files: files.length, bytes, fhirContentSha256: contentChecksum(fhirDir), manifest };
}

type Active = { record: RunRecord; child: ChildProcess; log: string[]; listeners: Set<(e: RunEvent) => void> };

/** Runs at most one recipe at a time. */
export class Runner {
  private active: Active | null = null;
  private lastFinished: { record: RunRecord; log: string[] } | null = null;

  constructor(
    private readonly runsDir: string = RUNS_DIR,
    private readonly script: string = GENERATE_SH
  ) {}

  get current(): RunRecord | null {
    return this.active?.record ?? null;
  }

  /** Starts a run in runs/<runId>/, or in `runDir` when given (used by the reproducibility check). */
  start(recipe: Recipe, explicitDir?: string): RunRecord {
    if (this.active) throw new Error('A run is already in progress.');
    const now = new Date();
    const runId = newRunId(now);
    const runDir = explicitDir ?? join(this.runsDir, runId);
    mkdirSync(runDir, { recursive: true });
    const env = materialise(recipe, runDir);
    const record: RunRecord = {
      runId,
      status: 'running',
      startedAt: now.toISOString(),
      finishedAt: null,
      elapsedMs: null,
      recipe,
      results: null,
      error: null
    };
    this.save(runDir, record);
    const child = spawn('bash', [this.script], {
      env: { ...process.env, ...env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const active: Active = { record, child, log: [], listeners: new Set() };
    this.active = active;
    let kept = 0;
    let recordsLine: RunResults['records'] | null = null;
    let lastError = '';
    const onText = (chunkSource: NodeJS.ReadableStream, isErr: boolean): void => {
      let buffered = '';
      chunkSource.setEncoding('utf8');
      chunkSource.on('data', (chunk: string) => {
        buffered += chunk;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? '';
        for (const raw of lines) {
          const text = cleanLine(raw);
          if (text === '' || text.startsWith('Loading submodule') || text.startsWith('Loading Lookup Table')) continue;
          if (active.log.length < 20_000) active.log.push(text);
          this.emit(active, { type: 'line', text });
          if (isPersonLine(text)) {
            kept++;
            this.emit(active, { type: 'progress', kept, target: recipe.population });
          }
          recordsLine = parseRecordsLine(text) ?? recordsLine;
          if (isErr || /exception|error/i.test(text)) lastError = text;
        }
      });
    };
    if (child.stdout) onText(child.stdout, false);
    if (child.stderr) onText(child.stderr, true);
    child.on('close', (code, signal) => {
      const finished = new Date();
      record.finishedAt = finished.toISOString();
      record.elapsedMs = finished.getTime() - now.getTime();
      if (record.status === 'cancelled') {
        record.error = 'Cancelled.';
      } else if (code === 0) {
        try {
          record.results = collectResults(runDir, recordsLine);
          record.status = 'finished';
        } catch (e) {
          record.status = 'failed';
          record.error = `Synthea finished but its output could not be read: ${(e as Error).message}`;
        }
      } else {
        record.status = 'failed';
        record.error = lastError || `generate.sh stopped (${signal ?? `exit code ${code}`}).`;
      }
      writeFileSync(join(runDir, 'log.txt'), `${active.log.join('\n')}\n`);
      this.save(runDir, record);
      this.lastFinished = { record, log: active.log };
      this.active = null;
      this.emit(active, { type: 'status', run: record });
      active.listeners.clear();
    });
    return record;
  }

  cancel(runId: string): boolean {
    const a = this.active;
    if (!a || a.record.runId !== runId || a.child.pid === undefined) return false;
    a.record.status = 'cancelled';
    const pid = a.child.pid;
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      a.child.kill('SIGTERM');
    }
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }, 5000).unref();
    return true;
  }

  /** Replays the log so far, then follows the run. Returns an unsubscribe function. */
  subscribe(runId: string, listener: (e: RunEvent) => void): () => void {
    const a = this.active;
    if (a && a.record.runId === runId) {
      for (const text of a.log) listener({ type: 'line', text });
      listener({ type: 'status', run: a.record });
      a.listeners.add(listener);
      return () => a.listeners.delete(listener);
    }
    const done = this.lastFinished?.record.runId === runId ? this.lastFinished : null;
    const record = done?.record ?? readRun(runId, this.runsDir);
    if (record) {
      const log = done?.log ?? readLog(join(this.runsDir, runId));
      for (const text of log) listener({ type: 'line', text });
      listener({ type: 'status', run: record });
    }
    return () => undefined;
  }

  /** Resolves when the run stops, whatever the outcome. */
  wait(runId: string, onLine?: (text: string) => void): Promise<RunRecord> {
    return new Promise((resolve) => {
      const stop = this.subscribe(runId, (e) => {
        if (e.type === 'line') onLine?.(e.text);
        if (e.type === 'status' && e.run.status !== 'running') {
          resolve(e.run);
          queueMicrotask(() => stop());
        }
      });
    });
  }

  private emit(a: Active, e: RunEvent): void {
    for (const l of a.listeners) l(e);
  }

  private save(runDir: string, record: RunRecord): void {
    writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
  }
}

function readLog(runDir: string): string[] {
  const file = join(runDir, 'log.txt');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}
