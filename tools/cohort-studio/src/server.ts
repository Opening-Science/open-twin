/**
 * WHAT: Local HTTP server for Cohort Studio: serves the page and the JSON/SSE endpoints for recipes, runs and exploring.
 * NOT:  Not for network exposure; it binds to 127.0.0.1, accepts only local Host headers and has no accounts.
 * GOVERNED BY: docs/synthea.md; docs/INTENDED-USE.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: The page is TypeScript served with types stripped at request time (node:module stripTypeScriptTypes), so
 *         the client may only use erasable syntax: no enums, namespaces or parameter properties.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type Catalog, loadCatalog } from './catalog.ts';
import { GROUPS } from './conditions.ts';
import { loadIndex, personDetail } from './explore.ts';
import { CLIENT_DIR, JAR_PATH, RUNS_DIR, readSyntheaPin, STUDIO_DIR } from './paths.ts';
import {
  checkRecipe,
  cohortCommand,
  DEFAULT_DATE,
  defaultRecipeInput,
  generateCommand,
  keepModuleFor,
  LIMITS,
  recipeFileName,
  US_STATES
} from './recipe.ts';
import { isRunId, listRuns, type RunEvent, Runner, readRun } from './runner.ts';
import { estimateSeconds, timingSamples } from './timing.ts';

const PORT = Number(process.env.COHORT_STUDIO_PORT ?? process.argv[2] ?? 4400);
const HOST = '127.0.0.1';
const MAX_BODY = 25_000_000;

const pin = readSyntheaPin();
const runner = new Runner();
let catalog: Catalog | null = null;
let catalogError: string | null = null;
let download: { state: 'idle' | 'downloading' | 'failed'; received: number; total: number; error: string | null } = {
  state: 'idle',
  received: 0,
  total: 0,
  error: null
};

function jarReady(): boolean {
  return existsSync(JAR_PATH);
}

function refreshCatalog(): void {
  if (!jarReady()) return;
  try {
    catalog = loadCatalog(JAR_PATH);
    catalogError = null;
  } catch (e) {
    catalogError = `Could not read the Synthea JAR: ${(e as Error).message}`;
  }
}

async function downloadJar(): Promise<void> {
  download = { state: 'downloading', received: 0, total: 0, error: null };
  const partial = `${JAR_PATH}.partial`;
  try {
    const res = await fetch(pin.jarUrl);
    if (!(res.ok && res.body)) throw new Error(`download failed with HTTP ${res.status}`);
    download.total = Number(res.headers.get('content-length') ?? 0);
    const hash = createHash('sha256');
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      download.received += chunk.length;
    });
    await pipeline(body, createWriteStream(partial));
    const actual = hash.digest('hex');
    if (actual !== pin.jarSha256) throw new Error(`checksum mismatch (expected ${pin.jarSha256}, got ${actual})`);
    renameSync(partial, JAR_PATH);
    download.state = 'idle';
    refreshCatalog();
  } catch (e) {
    if (existsSync(partial)) unlinkSync(partial);
    download = { ...download, state: 'failed', error: (e as Error).message };
  }
}

// ---------- helpers ----------

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('The request is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

const allowedHosts = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);

/** Blocks DNS rebinding (foreign Host) and cross-site writes (foreign Origin or non-JSON POST). */
function refuse(req: IncomingMessage): string | null {
  if (!allowedHosts.has(req.headers.host ?? '')) return 'Unknown host.';
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && !allowedHosts.has(origin.replace(/^https?:\/\//, ''))) return 'Cross-site request refused.';
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return 'Send JSON.';
  }
  return null;
}

let clientCache: { mtimeMs: number; js: string } | null = null;
function clientScript(): string {
  const file = join(CLIENT_DIR, 'app.ts');
  const mtimeMs = statSync(file).mtimeMs;
  if (clientCache?.mtimeMs !== mtimeMs) {
    clientCache = { mtimeMs, js: stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'strip' }) };
  }
  return clientCache.js;
}

function meta() {
  const runs = listRuns();
  return {
    synthea: { version: pin.version, jarSha256: pin.jarSha256, configSha256: pin.configSha256 },
    jarReady: jarReady(),
    download,
    catalogError,
    groups: GROUPS,
    conditions: catalog?.conditions ?? [],
    moduleFiles: catalog?.moduleFiles ?? 0,
    cities: catalog?.cities ?? {},
    states: US_STATES,
    limits: LIMITS,
    defaultDate: DEFAULT_DATE,
    defaults: defaultRecipeInput(),
    timing: timingSamples(runs),
    current: runner.current
  };
}

function checked(input: unknown) {
  const c = checkRecipe(input, pin);
  if (c.recipe && catalog) {
    const known = new Set(catalog.conditions.map((x) => x.code));
    const unknown = c.recipe.conditions.chosen.filter((x) => !known.has(x.code));
    if (unknown.length > 0) {
      c.warnings.push(
        `${unknown.length} chosen condition(s) are not started by any built-in module (${unknown.map((u) => u.code).join(', ')}); only a custom module could produce them.`
      );
    }
    const cities = catalog.cities[c.recipe.state] ?? [];
    if (c.recipe.city && !cities.some((x) => x.toLowerCase() === c.recipe?.city?.toLowerCase())) {
      c.warnings.push(`Synthea has no city called "${c.recipe.city}" in ${c.recipe.state}; the run would fail.`);
    }
  }
  if (!c.recipe)
    return { ...c, keepModule: null, command: null, generateCommand: null, fileName: null, estimate: null };
  return {
    ...c,
    keepModule: keepModuleFor(c.recipe),
    fileName: recipeFileName(c.recipe),
    command: cohortCommand(recipeFileName(c.recipe)),
    generateCommand: generateCommand(c.recipe),
    estimate: estimateSeconds(c.recipe, timingSamples(listRuns()))
  };
}

function sse(req: IncomingMessage, res: ServerResponse, runId: string): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive'
  });
  const write = (e: RunEvent): void => {
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  };
  const stop = runner.subscribe(runId, write);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    stop();
  });
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(readFileSync(join(CLIENT_DIR, 'index.html')));
    return;
  }
  if (method === 'GET' && path === '/app.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    res.end(clientScript());
    return;
  }
  if (method === 'GET' && path === '/api/meta') return send(res, 200, meta());
  if (method === 'POST' && path === '/api/prepare') {
    if (jarReady()) return send(res, 200, { ok: true });
    if (download.state !== 'downloading') void downloadJar();
    return send(res, 202, { ok: true });
  }
  if (method === 'POST' && path === '/api/recipe') return send(res, 200, checked(await readBody(req)));
  if (method === 'GET' && path === '/api/runs') return send(res, 200, { runs: listRuns(), current: runner.current });
  if (method === 'POST' && path === '/api/runs') {
    if (runner.current) return send(res, 409, { error: 'A run is already in progress. Wait for it or cancel it.' });
    if (!jarReady()) return send(res, 409, { error: 'Synthea is not downloaded yet.' });
    const c = checkRecipe(await readBody(req), pin);
    if (!c.recipe) return send(res, 400, { error: c.errors.join(' ') });
    return send(res, 201, { run: runner.start(c.recipe) });
  }

  const m = path.match(/^\/api\/runs\/([^/]+)(?:\/([a-z]+))?$/);
  if (m?.[1]) {
    const runId = m[1];
    const action = m[2];
    if (!isRunId(runId)) return send(res, 404, { error: 'No such run.' });
    if (method === 'GET' && action === 'events') return sse(req, res, runId);
    if (method === 'POST' && action === 'cancel') {
      return runner.cancel(runId)
        ? send(res, 200, { ok: true })
        : send(res, 409, { error: 'That run is not running.' });
    }
    const run = runner.current?.runId === runId ? runner.current : readRun(runId);
    if (!run) return send(res, 404, { error: 'No such run.' });
    if (method === 'GET' && action === undefined) return send(res, 200, { run });
    if (run.status !== 'finished') return send(res, 409, { error: 'This run has no finished output.' });
    const runDir = join(RUNS_DIR, runId);
    if (method === 'GET' && action === 'index') return send(res, 200, loadIndex(runDir, run.recipe.endDate));
    if (method === 'GET' && action === 'person') {
      const index = loadIndex(runDir, run.recipe.endDate);
      const d = personDetail(runDir, index, url.searchParams.get('f') ?? '');
      return d ? send(res, 200, d) : send(res, 404, { error: 'No such person in this run.' });
    }
  }
  send(res, 404, { error: 'Not found.' });
}

refreshCatalog();
const server = createServer((req, res) => {
  const problem = refuse(req);
  if (problem) return send(res, 403, { error: problem });
  route(req, res).catch((e: unknown) => {
    if (!res.headersSent) send(res, 400, { error: (e as Error).message });
    else res.end();
  });
});
server.on('error', (e: NodeJS.ErrnoException) => {
  process.stderr.write(
    e.code === 'EADDRINUSE'
      ? `Port ${PORT} is in use. Is Cohort Studio already running? Start on another port with: COHORT_STUDIO_PORT=4401 pnpm studio\n`
      : `Cohort Studio could not start: ${e.message}\n`
  );
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  process.stdout.write(
    `Cohort Studio: http://${HOST}:${PORT}\n` +
      `  Synthea ${pin.version} ${jarReady() ? `(${catalog?.conditions.length ?? 0} conditions from ${catalog?.moduleFiles ?? 0} module files)` : '(JAR not downloaded yet; the page offers to fetch it)'}\n` +
      `  Runs are written to ${join(STUDIO_DIR, 'runs')}\n` +
      '  Every person generated here is synthetic. Press Ctrl+C to stop.\n'
  );
});
