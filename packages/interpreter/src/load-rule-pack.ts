/**
 * WHAT: Loads and validates a declarative YAML rule pack against rule-pack.v0.1 schema.
 * NOT:  Does not evaluate observations; clinical content is accepted only via YAML + schema.
 * GOVERNED BY: docs/strategy/contracts/rules/rule-pack.v0.1.schema.json
 * CORRECTNESS: Ajv validation against the committed schema; guideline:<id> requires a file under docs/evidence/guidelines/
 * GOTCHA: heuristic_no_guideline is allowed; inventing a guideline citation is not.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';
import type { RulePack } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');
const DEFAULT_SCHEMA_PATH = join(PACKAGE_ROOT, 'schema', 'rule-pack.v0.1.schema.json');
const DEFAULT_GUIDELINES_DIR = join(PACKAGE_ROOT, '..', '..', 'docs', 'evidence', 'guidelines');

export class RulePackValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Rule pack invalid:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'RulePackValidationError';
    this.issues = issues;
  }
}

function loadSchema(schemaPath: string): object {
  return JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
}

function guidelineFileExists(id: string, guidelinesDir: string): boolean {
  const candidates = [
    join(guidelinesDir, `${id}.md`),
    join(guidelinesDir, id, 'README.md'),
    join(guidelinesDir, `${id}.yaml`),
    join(guidelinesDir, `${id}.yml`)
  ];
  return candidates.some((p) => existsSync(p));
}

export interface LoadRulePackOptions {
  schemaPath?: string;
  guidelinesDir?: string;
}

export function validateRulePack(pack: unknown, options: LoadRulePackOptions = {}): RulePack {
  const schemaPath = options.schemaPath ?? DEFAULT_SCHEMA_PATH;
  const guidelinesDir = options.guidelinesDir ?? DEFAULT_GUIDELINES_DIR;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(loadSchema(schemaPath));
  const issues: string[] = [];

  if (!validate(pack)) {
    for (const err of validate.errors ?? []) {
      issues.push(`${err.instancePath || '/'} ${err.message ?? 'invalid'}`);
    }
  }

  if (pack && typeof pack === 'object') {
    const rules = (pack as { rules?: unknown }).rules;
    if (Array.isArray(rules)) {
      const ids = new Set<string>();
      for (const [i, rule] of rules.entries()) {
        if (!rule || typeof rule !== 'object') continue;
        const r = rule as {
          id?: string;
          clinical_basis?: string;
          emit?: string;
          system_id?: string;
        };
        if (r.id) {
          if (ids.has(r.id)) issues.push(`/rules/${i}/id duplicate rule id ${r.id}`);
          ids.add(r.id);
        }
        const basis = r.clinical_basis;
        if (typeof basis === 'string' && basis.startsWith('guideline:')) {
          const gid = basis.slice('guideline:'.length);
          if (!guidelineFileExists(gid, guidelinesDir)) {
            issues.push(`/rules/${i}/clinical_basis guideline:${gid} — no file under docs/evidence/guidelines/`);
          }
        } else if (basis !== undefined && basis !== 'heuristic_no_guideline') {
          if (typeof basis === 'string' && !basis.startsWith('guideline:')) {
            issues.push(`/rules/${i}/clinical_basis must be heuristic_no_guideline or guideline:<id>`);
          }
        }
        if (r.emit === 'state' && r.system_id === undefined) {
          issues.push(`/rules/${i}/system_id required when emit=state`);
        }
      }
    }
  }

  if (issues.length > 0) throw new RulePackValidationError(issues);
  return pack as RulePack;
}

export function loadRulePackFromYaml(yamlText: string, options: LoadRulePackOptions = {}): RulePack {
  const parsed: unknown = parseYaml(yamlText);
  return validateRulePack(parsed, options);
}

export function loadRulePackFile(path: string, options: LoadRulePackOptions = {}): RulePack {
  return loadRulePackFromYaml(readFileSync(path, 'utf8'), options);
}

export function defaultRulePackPath(): string {
  return join(PACKAGE_ROOT, 'rules', 'open-twin.v0.1.yaml');
}
