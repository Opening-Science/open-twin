/**
 * WHAT: Browser side of Cohort Studio: the Build form and recipe panel, the Run view and the Explore view.
 * NOT:  Holds no recipe rules of its own; every change is sent to /api/recipe, which validates and hashes it.
 * GOVERNED BY: docs/synthea.md; docs/INTENDED-USE.md
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 * GOTCHA: Served with types stripped, not compiled: erasable TypeScript only, and no imports.
 */

// ---------- types (mirroring the server's JSON) ----------

type Group = string;
type CatalogCondition = { code: string; display: string; group: Group; modules: string[]; mayResolve: boolean };
type Chosen = { code: string; display: string };
type CustomModuleInput = { name: string; module: Record<string, unknown>; sha256?: string };
type FormState = {
  population: string;
  seed: string;
  clinicianSeed: string;
  state: string;
  city: string;
  ageMin: string;
  ageMax: string;
  sex: string;
  referenceDate: string;
  endDate: string;
  match: 'any' | 'all';
  chosen: Chosen[];
  customModules: CustomModuleInput[];
};
type Recipe = {
  recipeSha256: string;
  population: number;
  state: string;
  city: string | null;
  age: { min: number; max: number } | null;
  sex: string;
  seed: number;
  clinicianSeed: number;
  referenceDate: string;
  endDate: string;
  conditions: { match: 'any' | 'all'; chosen: Chosen[] };
  keepModuleSha256: string | null;
  customModules: Array<{ name: string; sha256: string; module: Record<string, unknown> }>;
  synthea: { version: string; jarSha256: string; configSha256: string };
};
type Estimate = { seconds: number | null; basis: string };
type Checked = {
  recipe: Recipe | null;
  errors: string[];
  warnings: string[];
  keepModule: string | null;
  command: string | null;
  generateCommand: string | null;
  fileName: string | null;
  estimate: Estimate | null;
};
type RunResults = {
  records: { total: number; alive: number; dead: number };
  files: number;
  bytes: number;
  fhirContentSha256: string;
  manifest: Record<string, unknown> | null;
};
type RunRecord = {
  runId: string;
  status: 'running' | 'finished' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt: string | null;
  elapsedMs: number | null;
  recipe: Recipe;
  results: RunResults | null;
  error: string | null;
};
type Meta = {
  synthea: { version: string; jarSha256: string; configSha256: string };
  jarReady: boolean;
  download: { state: string; received: number; total: number; error: string | null };
  catalogError: string | null;
  groups: Group[];
  conditions: CatalogCondition[];
  moduleFiles: number;
  cities: Record<string, string[]>;
  states: string[];
  defaults: Record<string, unknown>;
  current: RunRecord | null;
};
type Person = {
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
type ExploreIndex = {
  files: number;
  endDate: string;
  conditions: string[];
  patients: Person[];
  resourceTotals: Record<string, number>;
  encounterClasses: Record<string, number>;
  medsByPatients: Array<[string, number]>;
  obsByPatients: Array<[string, number]>;
  encountersByYear: Record<string, number>;
};
type Series = { name: string; unit: string; points: Array<[string, number]> };
type Detail = {
  summary: Person;
  conditions: Array<{ name: string; onset: string | null; ended: string | null }>;
  medications: Array<{ name: string; date: string | null }>;
  encounters: Array<{ date: string | null; type: string; reason: string | null }>;
  immunizations: Array<{ name: string; date: string | null }>;
  procedures: Array<{ name: string; date: string | null }>;
  series: Series[];
};

// ---------- small helpers ----------

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}
const input = (id: string): HTMLInputElement => el<HTMLInputElement>(id);
const fmt = (n: number): string => n.toLocaleString('en-US');
const pct = (n: number): string => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );
const plural = (n: number, one: string, many: string): string => `${fmt(n)} ${n === 1 ? one : many}`;

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function download(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function msgBox(kind: 'err' | 'warn' | 'ok', items: string[]): string {
  if (items.length === 0) return '';
  const body = items.length === 1 ? esc(items[0]) : `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  return `<div class="msg ${kind}" ${kind === 'err' ? 'role="alert"' : ''}>${body}</div>`;
}

// ---------- theme ----------

const themeSelect = el<HTMLSelectElement>('theme');
function applyTheme(v: string): void {
  if (v) document.documentElement.dataset.theme = v;
  else delete document.documentElement.dataset.theme;
}
try {
  const saved = localStorage.getItem('cohort-studio-theme') ?? '';
  themeSelect.value = saved;
  applyTheme(saved);
} catch {
  // Storage can be unavailable; the system theme applies.
}
themeSelect.addEventListener('change', () => {
  applyTheme(themeSelect.value);
  try {
    localStorage.setItem('cohort-studio-theme', themeSelect.value);
  } catch {
    // Not remembered; still applied for this visit.
  }
});

// ---------- tabs ----------

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
function selectTab(name: string, focus = false): void {
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    el(`panel-${t.dataset.tab ?? ''}`).hidden = !on;
    if (on && focus) t.focus();
  }
  if (name === 'explore') void refreshExploreList();
  if (name === 'run') void refreshRuns();
}
for (const t of tabs) {
  t.addEventListener('click', () => selectTab(t.dataset.tab ?? 'build'));
  t.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(t);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      selectTab(tabs[next]?.dataset.tab ?? 'build', true);
    }
  });
}

// ---------- state ----------

let META: Meta | null = null;
let CHECK: Checked | null = null;
const form: FormState = {
  population: '20',
  seed: '42',
  clinicianSeed: '43',
  state: 'Massachusetts',
  city: '',
  ageMin: '',
  ageMax: '',
  sex: 'any',
  referenceDate: '2026-01-01',
  endDate: '2026-01-01',
  match: 'any',
  chosen: [],
  customModules: []
};

function recipeInput(): Record<string, unknown> {
  const age = form.ageMin.trim() === '' && form.ageMax.trim() === '' ? null : { min: form.ageMin, max: form.ageMax };
  return {
    population: form.population,
    seed: form.seed,
    clinicianSeed: form.clinicianSeed,
    state: form.state,
    city: form.city.trim() === '' ? null : form.city,
    age,
    sex: form.sex,
    referenceDate: form.referenceDate,
    endDate: form.endDate,
    conditions: { match: form.match, chosen: form.chosen },
    customModules: form.customModules
  };
}

function writeFormToInputs(): void {
  input('population').value = form.population;
  input('seed').value = form.seed;
  input('clinicianSeed').value = form.clinicianSeed;
  el<HTMLSelectElement>('state').value = form.state;
  input('city').value = form.city;
  input('ageMin').value = form.ageMin;
  input('ageMax').value = form.ageMax;
  input('referenceDate').value = form.referenceDate;
  input('endDate').value = form.endDate;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="sex"]')) r.checked = r.value === form.sex;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="match"]'))
    r.checked = r.value === form.match;
  fillCities();
  renderConditions();
  renderModules();
}

function readInputsToForm(): void {
  form.population = input('population').value;
  form.seed = input('seed').value;
  form.clinicianSeed = input('clinicianSeed').value;
  form.state = el<HTMLSelectElement>('state').value;
  form.city = input('city').value;
  form.ageMin = input('ageMin').value;
  form.ageMax = input('ageMax').value;
  form.referenceDate = input('referenceDate').value;
  form.endDate = input('endDate').value;
  form.sex = document.querySelector<HTMLInputElement>('input[name="sex"]:checked')?.value ?? 'any';
  form.match = document.querySelector<HTMLInputElement>('input[name="match"]:checked')?.value === 'all' ? 'all' : 'any';
}

function fillCities(): void {
  const cities = META?.cities[form.state] ?? [];
  el('cityList').innerHTML = cities.map((c) => `<option value="${esc(c)}"></option>`).join('');
}

// ---------- recipe check (debounced) ----------

let checkTimer = 0;
let checkSeq = 0;
function scheduleCheck(): void {
  window.clearTimeout(checkTimer);
  checkTimer = window.setTimeout(() => void runCheck(), 150);
}
async function runCheck(): Promise<void> {
  const seq = ++checkSeq;
  try {
    const c = await api<Checked>('/api/recipe', recipeInput());
    if (seq !== checkSeq) return;
    CHECK = c;
    renderRecipe();
  } catch (e) {
    el('recipeMsgs').innerHTML = msgBox('err', [(e as Error).message]);
  }
}

function recipeForDisplay(r: Recipe): Record<string, unknown> {
  return {
    ...r,
    customModules: r.customModules.map((m) => ({
      name: m.name,
      sha256: m.sha256,
      module: `(${Object.keys((m.module.states as Record<string, unknown>) ?? {}).length} states; full content in the downloaded file)`
    }))
  };
}

function renderRecipe(): void {
  const c = CHECK;
  if (!c) return;
  el('recipeMsgs').innerHTML = msgBox('err', c.errors) + msgBox('warn', c.warnings);
  const r = c.recipe;
  const running = META?.current?.status === 'running';
  el<HTMLButtonElement>('startRun').disabled = !r || running || !META?.jarReady;
  el<HTMLButtonElement>('downloadRecipe').disabled = !r;
  el<HTMLButtonElement>('copyCommand').disabled = !r;
  if (!r) {
    el('recipeFacts').innerHTML = '';
    el('recipeJson').textContent = '';
    el('keepJson').textContent = '';
    el('generateCmd').textContent = '';
    return;
  }
  const est = c.estimate;
  const estimate =
    est?.seconds != null
      ? `about ${duration(est.seconds * 1000)} <span class="muted">(${esc(est.basis)})</span>`
      : esc(est?.basis ?? '');
  const who = [
    plural(r.population, 'living person', 'living people'),
    r.sex === 'F' ? 'female' : r.sex === 'M' ? 'male' : 'any sex',
    r.age ? `aged ${r.age.min} to ${r.age.max}` : 'all ages'
  ].join(', ');
  const conds = r.conditions.chosen.length
    ? `${r.conditions.match === 'all' ? 'all of' : 'any of'} ${plural(r.conditions.chosen.length, 'condition', 'conditions')}`
    : 'none (everyone is kept)';
  el('recipeFacts').innerHTML = [
    ['Who', esc(who)],
    ['Where', esc(r.city ? `${r.city}, ${r.state}` : r.state)],
    ['Dates', esc(r.referenceDate === r.endDate ? r.referenceDate : `${r.referenceDate} to ${r.endDate}`)],
    ['Conditions', esc(conds)],
    ['Custom modules', String(r.customModules.length)],
    ['Synthea', `${esc(r.synthea.version)} <span class="mono">${esc(r.synthea.jarSha256.slice(0, 12))}…</span>`],
    ['Recipe hash', `<span class="mono">${esc(r.recipeSha256)}</span>`],
    ['Estimated time', estimate]
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');
  el('recipeJson').textContent = JSON.stringify(recipeForDisplay(r), null, 2);
  el('keepJson').textContent = c.keepModule ?? 'No conditions chosen, so no keep module: everyone is kept.';
  el('generateCmd').textContent = c.generateCommand ?? '';
  el('commandHelp').textContent = c.command ? `"Copy command" gives: ${c.command}` : '';
}

// ---------- conditions picker ----------

const GROUP_LABELS: Record<string, string> = {
  'cardio-metabolic': 'Heart, blood pressure and metabolism',
  respiratory: 'Lungs and breathing',
  cancer: 'Cancer',
  neuro: 'Brain and nerves',
  musculoskeletal: 'Bones, joints and muscles',
  kidney: 'Kidneys',
  'mental health': 'Mental health and substance use',
  infection: 'Infections',
  other: 'Other (dental, pregnancy, injuries, social situation, symptoms)'
};
const openGroups = new Set<string>();

function chosenSet(): Set<string> {
  return new Set(form.chosen.map((c) => c.code));
}

function renderConditions(): void {
  const meta = META;
  if (!meta) return;
  const q = input('condSearch').value.trim().toLowerCase();
  const chosen = chosenSet();
  const n = form.chosen.length;
  el('condCount').textContent =
    n === 0
      ? 'No conditions chosen: everyone Synthea simulates is kept.'
      : `${plural(n, 'condition', 'conditions')} chosen. People are kept if they have ${form.match === 'all' ? 'all of them' : 'at least one of them'}.`;
  el('chosenChips').innerHTML = form.chosen
    .map(
      (c) =>
        `<span class="chip"><span title="${esc(c.display)}">${esc(c.display)}</span><button type="button" data-remove="${esc(c.code)}" aria-label="Remove ${esc(c.display)}">×</button></span>`
    )
    .join('');
  const warns: string[] = [];
  if (n > 0) {
    warns.push(
      `"People to keep" counts people who have ${form.match === 'all' ? 'all chosen conditions' : 'a chosen condition'}. Synthea simulates and discards everyone else, so the run takes longer than a plain run of the same size; rare conditions take much longer, and Synthea gives up after 1,000 tries per person.`
    );
  }
  if (n > 1 && form.match === 'all') {
    warns.push('"All of them" needs one person to have every chosen condition at once, which can be very rare.');
  }
  const resolving = form.chosen.filter((c) => meta.conditions.find((x) => x.code === c.code)?.mayResolve);
  if (resolving.length > 0) {
    warns.push(
      `${resolving.map((c) => c.display).join(', ')}: Synthea can end ${resolving.length === 1 ? 'this condition' : 'these conditions'} (healed, or moved on to another stage). Only people who still have it at the end are kept.`
    );
  }
  el('condWarn').innerHTML = msgBox('warn', warns);

  const matches = (c: CatalogCondition): boolean =>
    q === '' || c.display.toLowerCase().includes(q) || c.code.includes(q) || c.modules.some((m) => m.includes(q));
  const html: string[] = [];
  for (const g of meta.groups) {
    const items = meta.conditions.filter((c) => c.group === g && matches(c));
    if (items.length === 0) continue;
    const picked = items.filter((c) => chosen.has(c.code)).length;
    const open = q !== '' || openGroups.has(g);
    html.push(
      `<details class="group" data-group="${esc(g)}" ${open ? 'open' : ''}><summary>${esc(GROUP_LABELS[g] ?? g)} <span class="muted">(${items.length}${picked ? `, ${picked} chosen` : ''})</span></summary><ul class="conds">${items
        .map((c) => {
          const id = `c-${c.code}`;
          const from =
            c.modules.length > 2
              ? `${c.modules.slice(0, 2).join(', ')} +${c.modules.length - 2}`
              : c.modules.join(', ');
          return `<li><label for="${id}"><input type="checkbox" id="${id}" data-code="${esc(c.code)}" ${chosen.has(c.code) ? 'checked' : ''}/><span>${esc(c.display)}<br><span class="muted">SNOMED ${esc(c.code)} · module ${esc(from)}</span>${c.mayResolve ? ' <span class="pill" title="Synthea can end this condition">can end</span>' : ''}</span></label></li>`;
        })
        .join('')}</ul></details>`
    );
  }
  el('condGroups').innerHTML =
    html.join('') ||
    (meta.conditions.length === 0
      ? '<p class="muted">The condition list appears once Synthea is downloaded.</p>'
      : '<p class="muted">No condition matches that search.</p>');
}

el('condGroups').addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  const code = t.dataset.code;
  if (!code || !META) return;
  const c = META.conditions.find((x) => x.code === code);
  if (!c) return;
  if (t.checked) form.chosen = [...form.chosen.filter((x) => x.code !== code), { code, display: c.display }];
  else form.chosen = form.chosen.filter((x) => x.code !== code);
  renderConditions();
  document.getElementById(`c-${code}`)?.focus();
  scheduleCheck();
});
el('condGroups').addEventListener(
  'toggle',
  (e) => {
    const d = e.target as HTMLDetailsElement;
    const g = d.dataset.group;
    if (g && input('condSearch').value.trim() === '') {
      if (d.open) openGroups.add(g);
      else openGroups.delete(g);
    }
  },
  true
);
el('chosenChips').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-remove]');
  if (!b) return;
  form.chosen = form.chosen.filter((x) => x.code !== b.dataset.remove);
  renderConditions();
  input('condSearch').focus();
  scheduleCheck();
});
input('condSearch').addEventListener('input', renderConditions);

// ---------- form events ----------

el('form').addEventListener('input', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'condSearch' || t.id === 'moduleFiles' || (t as HTMLInputElement).dataset.code) return;
  readInputsToForm();
  if (t.id === 'state') fillCities();
  if (t.getAttribute('name') === 'match') renderConditions();
  scheduleCheck();
});
el('form').addEventListener('submit', (e) => e.preventDefault());

// ---------- custom modules ----------

function renderModules(): void {
  el('moduleList').innerHTML = form.customModules
    .map(
      (m, i) =>
        `<li><span class="mono">${esc(m.name)}</span> <span class="muted">(${Object.keys((m.module.states as Record<string, unknown>) ?? {}).length} states)</span> <button type="button" class="link" data-drop="${i}">Remove</button></li>`
    )
    .join('');
}
input('moduleFiles').addEventListener('change', async () => {
  const files = Array.from(input('moduleFiles').files ?? []);
  const errors: string[] = [];
  for (const f of files) {
    try {
      const json = JSON.parse(await f.text()) as unknown;
      const states = (json as { states?: unknown })?.states;
      if (typeof json !== 'object' || json === null || typeof states !== 'object' || states === null) {
        errors.push(`${f.name}: not a Synthea module (no "states").`);
        continue;
      }
      const name = f.name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[^A-Za-z0-9]+/, '');
      form.customModules = [
        ...form.customModules.filter((m) => m.name !== name),
        { name: name.endsWith('.json') ? name : `${name}.json`, module: json as Record<string, unknown> }
      ];
    } catch {
      errors.push(`${f.name}: not valid JSON.`);
    }
  }
  input('moduleFiles').value = '';
  el('moduleErr').innerHTML = msgBox('err', errors);
  renderModules();
  scheduleCheck();
});
el('moduleList').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-drop]');
  if (!b) return;
  form.customModules = form.customModules.filter((_, i) => String(i) !== b.dataset.drop);
  renderModules();
  scheduleCheck();
});

// ---------- recipe buttons ----------

el('downloadRecipe').addEventListener('click', () => {
  const r = CHECK?.recipe;
  if (r && CHECK?.fileName) download(CHECK.fileName, `${JSON.stringify(r, null, 2)}\n`);
});
el('copyCommand').addEventListener('click', async () => {
  const cmd = CHECK?.command;
  if (!cmd) return;
  const status = el('copyStatus');
  try {
    await navigator.clipboard.writeText(cmd);
    status.textContent = `Copied: ${cmd} (run it from the repository root next to the downloaded recipe).`;
  } catch {
    status.textContent = `Copy this: ${cmd}`;
  }
});

function loadRecipeObject(obj: unknown): void {
  const errs: string[] = [];
  if (typeof obj !== 'object' || obj === null) {
    el('recipeMsgs').innerHTML = msgBox('err', ['That is not a recipe (not a JSON object).']);
    return;
  }
  const r = obj as Partial<Recipe> & { customModules?: CustomModuleInput[] };
  const s = (v: unknown, fallback: string): string => (v === undefined || v === null ? fallback : String(v));
  form.population = s(r.population, form.population);
  form.seed = s(r.seed, form.seed);
  form.clinicianSeed = s(r.clinicianSeed, form.clinicianSeed);
  form.state = s(r.state, form.state);
  form.city = s(r.city, '');
  form.ageMin = r.age ? String(r.age.min) : '';
  form.ageMax = r.age ? String(r.age.max) : '';
  form.sex = s(r.sex, 'any');
  form.referenceDate = s(r.referenceDate, form.referenceDate);
  form.endDate = s(r.endDate, form.endDate);
  form.match = r.conditions?.match === 'all' ? 'all' : 'any';
  form.chosen = Array.isArray(r.conditions?.chosen) ? r.conditions.chosen : [];
  form.customModules = Array.isArray(r.customModules) ? r.customModules : [];
  writeFormToInputs();
  void (async () => {
    // Check the recipe exactly as loaded so hash mismatches surface, then keep editing from the form.
    try {
      const c = await api<Checked>('/api/recipe', obj);
      CHECK = c;
      renderRecipe();
      if (c.recipe) el('copyStatus').textContent = `Loaded recipe ${c.recipe.recipeSha256.slice(0, 12)}….`;
    } catch (e) {
      errs.push((e as Error).message);
      el('recipeMsgs').innerHTML = msgBox('err', errs);
    }
  })();
}
el('loadRecipe').addEventListener('click', () => input('loadFile').click());
input('loadFile').addEventListener('change', async () => {
  const f = input('loadFile').files?.[0];
  if (!f) return;
  try {
    loadRecipeObject(JSON.parse(await f.text()));
  } catch {
    el('recipeMsgs').innerHTML = msgBox('err', [`${f.name} is not valid JSON.`]);
  }
  input('loadFile').value = '';
});
el('pasteToggle').addEventListener('click', () => {
  const box = el('pasteBox');
  box.hidden = !box.hidden;
  el('pasteToggle').setAttribute('aria-expanded', String(!box.hidden));
  if (!box.hidden) el('pasteText').focus();
});
el('pasteApply').addEventListener('click', () => {
  try {
    loadRecipeObject(JSON.parse(el<HTMLTextAreaElement>('pasteText').value));
  } catch {
    el('recipeMsgs').innerHTML = msgBox('err', ['The pasted text is not valid JSON.']);
  }
});

// ---------- run ----------

let source: EventSource | null = null;
let shownRunId: string | null = null;
let tick = 0;
let logLines: string[] = [];

el('startRun').addEventListener('click', async () => {
  if (!CHECK?.recipe) return;
  try {
    const { run } = await api<{ run: RunRecord }>('/api/runs', recipeInput());
    if (META) META.current = run;
    renderRecipe();
    selectTab('run', true);
    followRun(run.runId);
  } catch (e) {
    el('recipeMsgs').innerHTML = msgBox('err', [(e as Error).message]);
  }
});
el('cancelRun').addEventListener('click', async () => {
  if (!shownRunId) return;
  el<HTMLButtonElement>('cancelRun').disabled = true;
  try {
    await api(`/api/runs/${shownRunId}/cancel`, {});
  } catch (e) {
    el('runStatus').textContent = (e as Error).message;
  }
});

function followRun(runId: string): void {
  source?.close();
  shownRunId = runId;
  logLines = [];
  el('runLog').textContent = '';
  el('runResults').innerHTML = '';
  el('manifestDetails').hidden = true;
  const es = new EventSource(`/api/runs/${runId}/events`);
  source = es;
  let pending = false;
  es.addEventListener('line', (ev) => {
    const { text } = JSON.parse((ev as MessageEvent<string>).data) as { text: string };
    logLines.push(text);
    if (logLines.length > 400) logLines = logLines.slice(-300);
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const log = el('runLog');
        const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
        log.textContent = logLines.join('\n');
        if (atBottom) log.scrollTop = log.scrollHeight;
      });
    }
  });
  es.addEventListener('progress', (ev) => {
    const p = JSON.parse((ev as MessageEvent<string>).data) as { kept: number; target: number };
    const bar = el<HTMLProgressElement>('runProgress');
    bar.max = p.target;
    bar.value = Math.min(p.kept, p.target);
    el('runProgressLabel').textContent =
      `Records written so far: ${fmt(p.kept)} (target: ${fmt(p.target)} living people, plus those who died)`;
  });
  es.addEventListener('status', (ev) => {
    const { run } = JSON.parse((ev as MessageEvent<string>).data) as { run: RunRecord };
    renderRun(run);
    if (run.status !== 'running') {
      es.close();
      if (META) META.current = null;
      renderRecipe();
      void refreshRuns();
    }
  });
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) return;
    el('runStatus').textContent = 'Lost the connection to the studio; retrying…';
  };
}

function renderRun(run: RunRecord): void {
  const r = run.recipe;
  el('runTitle').textContent = `Run ${run.runId}`;
  const running = run.status === 'running';
  el('cancelRun').hidden = !running;
  el<HTMLButtonElement>('cancelRun').disabled = false;
  el('runProgressWrap').hidden = !running;
  window.clearInterval(tick);
  const what = `${plural(r.population, 'person', 'people')}${r.conditions.chosen.length ? ` with ${r.conditions.match === 'all' ? 'all of' : 'any of'} ${r.conditions.chosen.map((c) => c.display).join(', ')}` : ''}`;
  if (running) {
    const started = new Date(run.startedAt).getTime();
    const show = (): void => {
      el('runStatus').textContent = `Running: ${what}. Elapsed ${duration(Date.now() - started)}.`;
    };
    show();
    tick = window.setInterval(show, 1000);
    return;
  }
  const took = run.elapsedMs != null ? duration(run.elapsedMs) : '?';
  if (run.status === 'finished' && run.results) {
    const res = run.results;
    el('runStatus').textContent = `Finished in ${took}: ${what}.`;
    el('runResults').innerHTML = `${msgBox('ok', ['Done. Every person in this output is synthetic.'])}
      <div class="tiles">
        <div class="tile"><b>${fmt(res.records.total)}</b><span>records in total</span></div>
        <div class="tile"><b>${fmt(res.records.alive)}</b><span>alive at the end</span></div>
        <div class="tile"><b>${fmt(res.records.dead)}</b><span>died during the simulation</span></div>
        <div class="tile"><b>${fmt(res.files)}</b><span>FHIR files</span></div>
        <div class="tile"><b>${bytes(res.bytes)}</b><span>on disk</span></div>
        <div class="tile"><b>${took}</b><span>run time</span></div>
      </div>
      <dl class="kv"><dt>Content checksum</dt><dd class="mono">${esc(res.fhirContentSha256)}</dd>
      <dt>Recipe hash</dt><dd class="mono">${esc(r.recipeSha256)}</dd>
      <dt>Folder</dt><dd class="mono">tools/cohort-studio/runs/${esc(run.runId)}/out/fhir</dd></dl>
      <p class="muted">Run the same recipe again and the content checksum is the same.</p>
      <div class="buttons"><button type="button" class="primary" id="exploreThis">Explore this cohort</button>
      <button type="button" id="downloadManifest">Download manifest</button></div>`;
    el('manifestDetails').hidden = false;
    el('manifestJson').textContent = JSON.stringify(manifestOf(run), null, 2);
    el('exploreThis').addEventListener('click', () => {
      selectTab('explore', true);
      void openExplore(run.runId);
    });
    el('downloadManifest').addEventListener('click', () =>
      download(`cohort-run-${run.runId}.json`, `${JSON.stringify(manifestOf(run), null, 2)}\n`)
    );
  } else {
    el('runStatus').textContent = `${run.status === 'cancelled' ? 'Cancelled' : 'Failed'} after ${took}.`;
    el('runResults').innerHTML = msgBox(run.status === 'cancelled' ? 'warn' : 'err', [run.error ?? 'No details.']);
  }
}

function manifestOf(run: RunRecord): Record<string, unknown> {
  return {
    runId: run.runId,
    status: run.status,
    startedAt: run.startedAt,
    elapsedMs: run.elapsedMs,
    recipe: recipeForDisplay(run.recipe),
    results: run.results
  };
}

async function refreshRuns(): Promise<void> {
  const { runs, current } = await api<{ runs: RunRecord[]; current: RunRecord | null }>('/api/runs');
  if (META) META.current = current;
  if (current && shownRunId !== current.runId) followRun(current.runId);
  else if (!current && !shownRunId && runs[0]) {
    shownRunId = runs[0].runId;
    followRun(runs[0].runId);
  }
  const table = el('pastRuns');
  if (runs.length === 0) {
    table.innerHTML = '<tbody><tr><td class="muted">No runs yet.</td></tr></tbody>';
    return;
  }
  table.innerHTML = `<caption class="sr-only">Earlier runs</caption><thead><tr><th scope="col">Started</th><th scope="col" class="n">Records</th><th scope="col">Conditions</th><th scope="col">Status</th><th scope="col" class="n">Time</th><th scope="col">Checksum</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${runs
    .map((r) => {
      const conds = r.recipe.conditions.chosen.length
        ? `${r.recipe.conditions.match} of ${r.recipe.conditions.chosen.length}`
        : 'none';
      const actions = `<button type="button" class="link" data-show="${esc(r.runId)}">Details</button>${r.status === 'finished' ? ` · <button type="button" class="link" data-explore="${esc(r.runId)}">Explore</button>` : ''}`;
      return `<tr><td>${esc(new Date(r.startedAt).toLocaleString())}</td><td class="n">${fmt(r.results?.records.total ?? r.recipe.population)}</td><td>${esc(conds)}</td><td>${esc(r.status)}</td><td class="n">${r.elapsedMs != null ? duration(r.elapsedMs) : ''}</td><td class="mono">${esc(r.results?.fhirContentSha256.slice(0, 12) ?? '')}</td><td>${actions}</td></tr>`;
    })
    .join('')}</tbody>`;
}
el('pastRuns').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const show = t.closest<HTMLButtonElement>('button[data-show]')?.dataset.show;
  const exp = t.closest<HTMLButtonElement>('button[data-explore]')?.dataset.explore;
  if (show) {
    followRun(show);
    el('runTitle').scrollIntoView({ behavior: 'smooth' });
  }
  if (exp) {
    selectTab('explore', true);
    void openExplore(exp);
  }
});

// ---------- explore: charts (ported from the Synthea viewer prototype) ----------

const tip = el('tip');
function showTip(e: MouseEvent, html: string): void {
  tip.innerHTML = html;
  tip.style.opacity = '1';
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${e.clientY + 14}px`;
}
const hideTip = (): void => {
  tip.style.opacity = '0';
};
function bindTips(root: HTMLElement): void {
  for (const g of root.querySelectorAll<SVGElement>('[data-tip]')) {
    g.addEventListener('mousemove', (e) => showTip(e, g.dataset.tip ?? ''));
    g.addEventListener('mouseleave', hideTip);
  }
}
const stripTags = (s: string): string => s.replace(/<br>/g, ', ').replace(/<[^>]+>/g, '');

type Bar = { k: string; v: number };
function hbars(
  host: HTMLElement,
  items: Bar[],
  text: (d: Bar) => string,
  tipText: (d: Bar) => string,
  label: string
): void {
  const W = Math.max(280, host.clientWidth || 600);
  const rowH = 26;
  const L = Math.min(260, W * 0.45);
  const R = 56;
  const max = Math.max(...items.map((d) => d.v), 1);
  const H = items.length * rowH;
  let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  items.forEach((d, i) => {
    const y = i * rowH;
    const w = Math.max(2, (d.v / max) * (W - L - R));
    const maxChars = Math.max(12, Math.floor(L / 7));
    const short = d.k.length > maxChars ? `${d.k.slice(0, maxChars - 1)}…` : d.k;
    const t = tipText(d);
    s += `<g data-tip="${esc(t)}"><title>${esc(stripTags(t))}</title>
      <rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent"/>
      <text x="${L - 8}" y="${y + 17}" text-anchor="end">${esc(short)}</text>
      <rect x="${L}" y="${y + 6}" width="${w}" height="${rowH - 12}" rx="4" fill="var(--s1)"/>
      <text class="val" x="${L + w + 6}" y="${y + 17}">${esc(text(d))}</text></g>`;
  });
  host.innerHTML = `${s}</svg>`;
  bindTips(host);
}

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? mag * 10;
}

function ageHist(host: HTMLElement, people: Person[]): void {
  const bins = Array.from({ length: 11 }, (_, i) => ({ lo: i * 10, a: 0, d: 0 }));
  for (const p of people) {
    const b = bins[Math.min(10, Math.floor(p.age / 10))];
    if (!b) continue;
    if (p.died) b.d++;
    else b.a++;
  }
  const W = Math.max(300, host.clientWidth || 500);
  const H = 220;
  const B = 24;
  const T = 8;
  const Lft = 40;
  const max = Math.max(1, ...bins.map((b) => b.a + b.d));
  const step = Math.max(1, niceStep(max));
  const top = Math.ceil(max / step) * step;
  const bw = (W - Lft) / bins.length;
  const y = (v: number): number => T + (H - B - T) * (1 - v / top);
  const summary = bins
    .filter((b) => b.a + b.d > 0)
    .map((b) => `${b.lo} to ${b.lo + 9}: ${b.a} alive, ${b.d} died`)
    .join('; ');
  let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Ages: ${summary}`)}">`;
  for (let v = 0; v <= top; v += step) {
    s += `<line x1="${Lft}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${Lft - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  bins.forEach((b, i) => {
    const x = Lft + i * bw + 2;
    const w = bw - 4;
    const label = i === 10 ? '100+' : `${b.lo} to ${b.lo + 9}`;
    const ya = y(b.a);
    const yd = y(b.a + b.d);
    const t = `<b>Age ${label}</b><br>Alive: ${fmt(b.a)}<br>Died: ${fmt(b.d)}`;
    s += `<g data-tip="${esc(t)}"><title>${esc(stripTags(t))}</title>
      <rect x="${x - 2}" y="${T}" width="${bw}" height="${H - B - T}" fill="transparent"/>
      <rect x="${x}" y="${ya}" width="${w}" height="${H - B - ya}" fill="var(--s1)"/>
      ${b.d ? `<rect x="${x}" y="${yd}" width="${w}" height="${Math.max(0, ya - yd - 2)}" rx="3" fill="var(--s2)"/>` : ''}
      <text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${i === 10 ? '100+' : b.lo}</text></g>`;
  });
  host.innerHTML = `${s}</svg>`;
  bindTips(host);
}

function line(host: HTMLElement, pts: Array<[string, number]>, unit: string, dates: boolean, label: string): void {
  const W = Math.max(280, host.clientWidth || 600);
  const H = 200;
  const B = 24;
  const T = 10;
  const L = 52;
  const R = 12;
  const xs = pts.map((p) => (dates ? new Date(p[0]).getTime() : Number(p[0])));
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1;
  // Counts and most measurements cannot go below zero; do not draw an axis that suggests they can.
  const y0 = lo >= 0 ? Math.max(0, lo - pad) : lo - pad;
  const y1 = hi + pad;
  const X = (v: number): number => L + (W - L - R) * ((v - x0) / (x1 - x0 || 1));
  const Y = (v: number): number => T + (H - B - T) * (1 - (v - y0) / (y1 - y0));
  const desc = `${label}: ${pts.length} points from ${fmt(+lo.toPrecision(4))} to ${fmt(+hi.toPrecision(4))} ${unit}`;
  let s = `<svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}">`;
  for (let i = 0; i <= 3; i++) {
    const v = y0 + ((y1 - y0) * i) / 3;
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${+v.toPrecision(3)}</text>`;
  }
  const yrs = dates ? [new Date(x0).getFullYear(), new Date(x1).getFullYear()] : [x0, x1];
  s += `<text x="${L}" y="${H - 6}">${yrs[0]}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${yrs[1]}</text>`;
  s += `<path d="${xs.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(ys[i] ?? 0).toFixed(1)}`).join('')}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<line class="xh" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3" opacity="0"/><circle class="dot" r="4.5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" opacity="0"/>`;
  s += `<rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/></svg>`;
  host.innerHTML = s;
  const svg = host.querySelector('svg');
  const xh = svg?.querySelector('.xh');
  const dot = svg?.querySelector('.dot');
  const hit = svg?.querySelector('.hit');
  if (!(svg && xh && dot && hit)) return;
  hit.addEventListener('mousemove', (ev) => {
    const e = ev as MouseEvent;
    const r = svg.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    let bi = 0;
    xs.forEach((x, i) => {
      if (Math.abs(X(x) - mx) < Math.abs(X(xs[bi] ?? 0) - mx)) bi = i;
    });
    const px = String(X(xs[bi] ?? 0));
    xh.setAttribute('x1', px);
    xh.setAttribute('x2', px);
    xh.setAttribute('opacity', '1');
    dot.setAttribute('cx', px);
    dot.setAttribute('cy', String(Y(ys[bi] ?? 0)));
    dot.setAttribute('opacity', '1');
    const p = pts[bi];
    if (p) showTip(e, `<b>${esc(dates ? p[0].slice(0, 10) : p[0])}</b><br>${fmt(+p[1].toFixed(2))} ${esc(unit)}`);
  });
  hit.addEventListener('mouseleave', () => {
    hideTip();
    xh.setAttribute('opacity', '0');
    dot.setAttribute('opacity', '0');
  });
}

// ---------- explore: data ----------

let IDX: ExploreIndex | null = null;
let exploreRun: RunRecord | null = null;
let finishedRuns: RunRecord[] = [];
let topKind = 'cond';

async function refreshExploreList(): Promise<void> {
  const { runs } = await api<{ runs: RunRecord[] }>('/api/runs');
  finishedRuns = runs.filter((r) => r.status === 'finished');
  const sel = el<HTMLSelectElement>('exploreRun');
  sel.innerHTML = finishedRuns
    .map((r) => {
      const c = r.recipe.conditions.chosen;
      const what = c.length
        ? ` with ${c.length === 1 ? c[0]?.display : `${r.recipe.conditions.match} of ${c.length} conditions`}`
        : '';
      return `<option value="${esc(r.runId)}">${esc(new Date(r.startedAt).toLocaleString())}: ${fmt(r.results?.records.total ?? 0)} records${esc(what)}</option>`;
    })
    .join('');
  el('exploreEmpty').hidden = finishedRuns.length > 0;
  if (finishedRuns.length === 0) {
    el('explore').hidden = true;
    return;
  }
  const want = exploreRun?.runId ?? finishedRuns[0]?.runId;
  if (want) {
    sel.value = want;
    if (exploreRun?.runId !== want || !IDX) await openExplore(want);
  }
}
el('exploreRun').addEventListener('change', () => void openExplore(el<HTMLSelectElement>('exploreRun').value));

async function openExplore(runId: string): Promise<void> {
  el('exploreLine').textContent = 'Reading the records…';
  const { run } = await api<{ run: RunRecord }>(`/api/runs/${runId}`);
  exploreRun = run;
  IDX = await api<ExploreIndex>(`/api/runs/${runId}/index`);
  const sel = el<HTMLSelectElement>('exploreRun');
  if (sel.value !== runId) sel.value = runId;
  el('explore').hidden = false;
  el('exploreEmpty').hidden = true;
  el('detail').hidden = true;
  page = 0;
  renderExplore();
}

function renderExplore(): void {
  const idx = IDX;
  const run = exploreRun;
  if (!(idx && run)) return;
  const r = run.recipe;
  const P = idx.patients;
  const n = P.length || 1;
  const died = P.filter((p) => p.died).length;
  el('exploreLine').textContent =
    `Synthea ${r.synthea.version} · ${r.city ? `${r.city}, ` : ''}${r.state} · seed ${r.seed} · ${fmt(P.length)} records · recipe ${r.recipeSha256.slice(0, 12)}…`;
  const conds = r.conditions.chosen.map((c) => c.display);
  el('whatRecipe').innerHTML =
    `This cohort: Synthea kept simulating until <b>${fmt(r.population)}</b> ${r.age ? `people aged ${r.age.min} to ${r.age.max}` : 'people'} ${conds.length ? `with ${r.conditions.match === 'all' ? 'all of' : 'at least one of'} <b>${esc(conds.join(', '))}</b> ` : ''}were alive on ${esc(r.endDate)}. People who died along the way ${conds.length ? 'and had the condition ' : ''}are kept too, which is why there are more records than living people. Each record runs from birth to ${esc(r.endDate)} (or death).`;
  const t = idx.resourceTotals;
  const avg = (k: string): number => (t[k] ?? 0) / n;
  const tiles: Array<[string, string]> = [
    [fmt(P.length), 'people (records)'],
    [fmt(P.length - died), 'alive at the end'],
    [fmt(died), 'died during the simulation'],
    [fmt(Math.round(avg('Encounter'))), 'visits per person, on average'],
    [fmt(Math.round(avg('Condition'))), 'diagnoses per person'],
    [fmt(Math.round(avg('Observation'))), 'measurements per person'],
    [pct(P.filter((p) => p.sex === 'female').length / n), 'female']
  ];
  el('tiles').innerHTML = tiles.map(([b, s]) => `<div class="tile"><b>${b}</b><span>${s}</span></div>`).join('');
  ageHist(el('ageChart'), P);
  const encNames: Record<string, string> = {
    AMB: 'Outpatient (clinic)',
    WELLNESS: 'Check-up',
    EMER: 'Emergency',
    IMP: 'Hospital stay',
    VR: 'Virtual / phone',
    HH: 'Home health',
    OBSENC: 'Observation stay',
    SS: 'Short stay',
    other: 'Other'
  };
  hbars(
    el('encChart'),
    Object.entries(idx.encounterClasses)
      .map(([k, v]) => ({ k: encNames[k] ?? k, v }))
      .sort((a, b) => b.v - a.v),
    (d) => fmt(d.v),
    (d) => `<b>${esc(d.k)}</b><br>${fmt(d.v)} visits`,
    'Visits by setting'
  );
  drawTop();
  const yrs = Object.entries(idx.encountersByYear)
    .filter(([y]) => Number(y) >= 1920)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (yrs.length >= 2) line(el('yearChart'), yrs, 'visits', false, 'Visits per year');
  else el('yearChart').innerHTML = '<p class="muted">Not enough years to draw.</p>';
  if (!el('view-people').hidden) drawRows();
}

function drawTop(): void {
  const idx = IDX;
  if (!idx) return;
  const n = idx.patients.length || 1;
  let items: Bar[];
  if (topKind === 'cond') {
    const c = new Array<number>(idx.conditions.length).fill(0);
    for (const p of idx.patients) for (const i of p.cond) c[i] = (c[i] ?? 0) + 1;
    items = c
      .map((v, i) => ({ k: idx.conditions[i] ?? '', v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 20);
  } else {
    items = (topKind === 'meds' ? idx.medsByPatients : idx.obsByPatients).slice(0, 20).map(([k, v]) => ({ k, v }));
  }
  el('topNote').textContent =
    {
      cond: 'Share of all people diagnosed with this at least once. Many are short illnesses or social situations that Synthea records as diagnoses.',
      meds: 'Share of all people prescribed this at least once.',
      obs: 'Share of all people who had this measured at least once.'
    }[topKind] ?? '';
  hbars(
    el('topChart'),
    items,
    (d) => pct(d.v / n),
    (d) => `<b>${esc(d.k)}</b><br>${fmt(d.v)} people (${pct(d.v / n)})`,
    'Most common, as share of people'
  );
}
el('topSeg').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  for (const x of el('topSeg').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  topKind = b.dataset.k ?? 'cond';
  drawTop();
});
el('exploreSeg').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  for (const x of el('exploreSeg').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  el('view-overview').hidden = b.dataset.view !== 'overview';
  el('view-people').hidden = b.dataset.view !== 'people';
  if (b.dataset.view === 'people') drawRows();
  else renderExplore();
});

// ---------- explore: people table ----------

let page = 0;
let sortKey = 'name';
let sortDir = 1;
const PER = 50;

function filtered(): Person[] {
  const idx = IDX;
  if (!idx) return [];
  const q = input('q').value.trim().toLowerCase();
  const sx = el<HTMLSelectElement>('fSex').value;
  const al = el<HTMLSelectElement>('fAlive').value;
  const condMatch = new Set<number>();
  if (q) idx.conditions.forEach((c, i) => c.toLowerCase().includes(q) && condMatch.add(i));
  return idx.patients.filter(
    (p) =>
      (!sx || p.sex === sx) &&
      (!al || (al === 'died') === Boolean(p.died)) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.cond.some((i) => condMatch.has(i)))
  );
}
function sortValue(p: Person): string | number {
  if (sortKey === 'cond') return p.cond.length;
  if (sortKey === 'died') return p.died ? 1 : 0;
  const v = (p as unknown as Record<string, unknown>)[sortKey];
  return typeof v === 'number' ? v : String(v ?? '');
}
function drawRows(): void {
  const rows = filtered().sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
  });
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  page = Math.min(page, pages - 1);
  el('count').textContent =
    `${plural(rows.length, 'person matches', 'people match')}. Choose a name to open that synthetic record.`;
  el('rows').innerHTML = rows
    .slice(page * PER, page * PER + PER)
    .map(
      (
        p
      ) => `<tr><td><button type="button" class="link" data-f="${esc(p.f)}">${esc(p.name)}</button></td><td>${esc(p.sex)}</td><td class="n">${p.age}</td><td>${esc(p.city)}</td>
      <td class="n">${p.cond.length}</td><td class="n">${p.enc}</td><td>${p.died ? `<span class="pill">Died ${esc(p.died.slice(0, 4))}</span>` : 'Alive'}</td></tr>`
    )
    .join('');
  el('page').textContent = `Page ${page + 1} of ${pages}`;
  el<HTMLButtonElement>('prev').disabled = page === 0;
  el<HTMLButtonElement>('next').disabled = page >= pages - 1;
  for (const th of document.querySelectorAll<HTMLButtonElement>('th button.sort')) {
    const on = th.dataset.s === sortKey;
    th.closest('th')?.setAttribute('aria-sort', on ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
  }
}
for (const id of ['q', 'fSex', 'fAlive']) {
  el(id).addEventListener('input', () => {
    page = 0;
    drawRows();
  });
}
el('prev').addEventListener('click', () => {
  page--;
  drawRows();
});
el('next').addEventListener('click', () => {
  page++;
  drawRows();
});
for (const b of document.querySelectorAll<HTMLButtonElement>('th button.sort')) {
  b.addEventListener('click', () => {
    sortDir = sortKey === b.dataset.s ? -sortDir : 1;
    sortKey = b.dataset.s ?? 'name';
    drawRows();
  });
}
el('rows').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-f]');
  if (b?.dataset.f) void openPerson(b.dataset.f);
});

// ---------- explore: one person ----------

async function openPerson(f: string): Promise<void> {
  const run = exploreRun;
  if (!run) return;
  const d = el('detail');
  d.hidden = false;
  d.innerHTML = '<p class="muted">Opening record…</p>';
  const r = await api<Detail>(`/api/runs/${run.runId}/person?f=${encodeURIComponent(f)}`);
  const s = r.summary;
  const he = s.sex === 'female' ? 'She' : s.sex === 'male' ? 'He' : 'They';
  const active = r.conditions.filter((c) => !c.ended);
  const story =
    `${esc(s.name)} is a synthetic person "born" in ${esc(s.born.slice(0, 4))}${s.city ? ` in ${esc(s.city)}` : ''}. ` +
    (s.died
      ? `${he} died in ${esc(s.died.slice(0, 4))}, aged ${s.age}. `
      : `${he} is ${s.age} on ${esc(run.recipe.endDate)}. `) +
    `The record holds ${plural(s.enc, 'healthcare visit', 'healthcare visits')}, ${plural(r.conditions.length, 'diagnosis', 'diagnoses')} (${fmt(active.length)} never marked as resolved), ` +
    `${plural(r.medications.length, 'prescription', 'prescriptions')} and ${plural(s.obs, 'measurement', 'measurements')}.`;
  const list = <T>(items: T[], a: (x: T) => string, b: (x: T) => string): string =>
    items.length
      ? items.map((x) => `<div><span>${esc(a(x))}</span><span>${esc(b(x))}</span></div>`).join('')
      : '<p class="muted">None.</p>';
  const day = (t: string | null): string => (t ? t.slice(0, 10) : '');
  d.innerHTML = `
    <div class="row"><div><h2 id="detailName">${esc(s.name)} <span class="synthetic">synthetic person</span></h2>
      <p class="muted">${esc(s.sex)}${s.race ? ` · ${esc(s.race)}` : ''} · file ${esc(s.f)}</p></div>
      <button type="button" id="closeDetail">Close</button></div>
    <p>${story}</p>
    <p class="muted">Made up by Synthea. Not a real patient; do not read it as medical information about anyone.</p>
    <div class="grid g2" style="margin-top:12px">
      <div><h3>Measurements over time</h3>
        ${r.series.length ? `<label for="seriesSel" class="sr-only">Measurement</label><select id="seriesSel">${r.series.map((x, i) => `<option value="${i}">${esc(x.name)} (${x.points.length}×)</option>`).join('')}</select>` : ''}
        <div id="seriesChart" style="margin-top:8px"></div></div>
      <div><h3>Diagnoses, oldest first</h3><div class="list" tabindex="0" aria-label="Diagnoses">${list(
        r.conditions,
        (c) => `${c.name}${c.ended ? '' : ' •'}`,
        (c) => day(c.onset)
      )}</div>
        <p class="muted">• = never marked as resolved</p></div>
      <div><h3>Most recent visits</h3><div class="list" tabindex="0" aria-label="Visits">${list(
        r.encounters.slice(0, 80),
        (e) => e.type + (e.reason ? ` (${e.reason})` : ''),
        (e) => day(e.date)
      )}</div></div>
      <div><h3>Prescriptions</h3><div class="list" tabindex="0" aria-label="Prescriptions">${list(
        r.medications,
        (m) => m.name,
        (m) => day(m.date)
      )}</div></div>
      <div><h3>Vaccinations</h3><div class="list" tabindex="0" aria-label="Vaccinations">${list(
        r.immunizations,
        (m) => m.name,
        (m) => day(m.date)
      )}</div></div>
      <div><h3>Procedures</h3><div class="list" tabindex="0" aria-label="Procedures">${list(
        r.procedures,
        (m) => m.name,
        (m) => day(m.date)
      )}</div></div>
    </div>`;
  const drawSeries = (): void => {
    const sel = document.getElementById('seriesSel') as HTMLSelectElement | null;
    const x = r.series[Number(sel?.value ?? 0)];
    if (x) line(el('seriesChart'), x.points, x.unit, true, x.name);
    else el('seriesChart').innerHTML = '<p class="muted">No repeated measurements.</p>';
  };
  document.getElementById('seriesSel')?.addEventListener('change', drawSeries);
  drawSeries();
  el('closeDetail').addEventListener('click', () => {
    d.hidden = true;
    el('rows')
      .querySelector<HTMLButtonElement>(`button[data-f="${CSS.escape(f)}"]`)
      ?.focus();
  });
  d.focus();
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let resizeTimer = 0;
addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!el('panel-explore').hidden && !el('view-overview').hidden) renderExplore();
  }, 150);
});

// ---------- start ----------

async function loadMeta(): Promise<void> {
  const meta = await api<Meta>('/api/meta');
  META = meta;
  el('pinLine').textContent =
    `Synthea ${meta.synthea.version} · JAR sha256 ${meta.synthea.jarSha256.slice(0, 12)}… · settings ${meta.synthea.configSha256.slice(0, 12)}…`;
  el('jarCard').hidden = meta.jarReady;
  el('moduleCount').textContent = meta.jarReady
    ? `${fmt(meta.conditions.length)} conditions from ${fmt(meta.moduleFiles)} module files`
    : 'not downloaded yet';
  if (meta.catalogError) el('condWarn').innerHTML = msgBox('err', [meta.catalogError]);
  const stateSel = el<HTMLSelectElement>('state');
  if (stateSel.options.length === 0) {
    stateSel.innerHTML = meta.states.map((s) => `<option>${esc(s)}</option>`).join('');
  }
}

el('prepare').addEventListener('click', async () => {
  el<HTMLButtonElement>('prepare').disabled = true;
  await api('/api/prepare', {});
  const poll = async (): Promise<void> => {
    const meta = await api<Meta>('/api/meta');
    const d = meta.download;
    if (meta.jarReady) {
      el('prepareStatus').textContent = 'Downloaded and verified.';
      await loadMeta();
      renderConditions();
      scheduleCheck();
      return;
    }
    if (d.state === 'failed') {
      el('prepareStatus').textContent = `Download failed: ${d.error ?? ''}`;
      el<HTMLButtonElement>('prepare').disabled = false;
      return;
    }
    el('prepareStatus').textContent = d.total
      ? `Downloading… ${bytes(d.received)} of ${bytes(d.total)}`
      : `Downloading… ${bytes(d.received)}`;
    setTimeout(() => void poll(), 1000);
  };
  void poll();
});

async function start(): Promise<void> {
  await loadMeta();
  const d = META?.defaults ?? {};
  form.referenceDate = String(d.referenceDate ?? form.referenceDate);
  form.endDate = String(d.endDate ?? form.endDate);
  writeFormToInputs();
  await runCheck();
  if (META?.current) followRun(META.current.runId);
}
void start();
