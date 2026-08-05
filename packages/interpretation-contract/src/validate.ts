/**
 * WHAT: Conformance validator for interpretation-contract.v0.2 documents (schema + D-f…D-m rules).
 * NOT:  Does not interpret biomarkers, invent SystemId values, or accept loinc_system_axis anatomy.
 * GOVERNED BY: DECISIONS.md#d12; DECISIONS.md#d13; docs/contracts/interpretation-contract.v0.2.schema.json
 * CORRECTNESS: Reject fixtures under fixtures/reject/ must fail; fixtures/accept/ must pass
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { OpenTwinInterpretationDocumentV02 } from './generated/interpretation-contract.v0.2.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, '../schema/interpretation-contract.v0.2.schema.json');

export type ConformanceErrorCode =
  | 'SCHEMA'
  | 'UNKNOWN_SYSTEM_ID'
  | 'CONFIDENCE_OUT_OF_RANGE'
  | 'EMPTY_CONTRIBUTING'
  | 'INSUFFICIENT_EMPTY_CONTRIBUTING'
  | 'LOINC_SYSTEM_AXIS_ANATOMY'
  | 'SCTID_IN_PUBLISHED'
  | 'UNRENDERABLE_REROUTED'
  | 'MISSING_INSUFFICIENT_REASON'
  | 'INTENDED_USE';

export interface ConformanceError {
  code: ConformanceErrorCode;
  message: string;
  path?: string;
}

export interface ConformanceResult {
  ok: boolean;
  errors: ConformanceError[];
  document?: OpenTwinInterpretationDocumentV02;
}

const SYSTEM_IDS = new Set([
  'musculoskeletal',
  'cardiovascular',
  'nervous',
  'respiratory',
  'metabolic',
  'digestive',
  'endocrine',
  'integumentary',
  'reproductive'
]);

const SCTID_RE =
  /(?:snomed\.info\/sct|body_structure_snomed|"system"\s*:\s*"https?:\/\/snomed\.info\/[^"]+")[^0-9]{0,80}(\d{6,18})|\bbody_structure_snomed\b/i;

let ajvValidate: ((data: unknown) => boolean) | null = null;

function getAjvValidate(): (data: unknown) => boolean {
  if (ajvValidate) return ajvValidate;
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajvValidate = ajv.compile(schema);
  return ajvValidate;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function walkRejectLoincAxis(node: unknown, path: string, out: ConformanceError[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkRejectLoincAxis(item, `${path}/${i}`, out));
    return;
  }
  if (!isRecord(node)) return;
  if (node.interpretive_anatomy_source === 'loinc_system_axis') {
    out.push({
      code: 'LOINC_SYSTEM_AXIS_ANATOMY',
      message:
        'interpretive_anatomy_source "loinc_system_axis" is rejected (D-h): LOINC System is a specimen, not a site of pathology',
      path: `${path}/interpretive_anatomy_source`
    });
  }
  for (const [k, v] of Object.entries(node)) {
    walkRejectLoincAxis(v, `${path}/${k}`, out);
  }
}

function collectContributing(items: unknown, path: string, out: ConformanceError[]): string[] {
  if (!Array.isArray(items) || items.length === 0) {
    out.push({
      code: 'EMPTY_CONTRIBUTING',
      message: 'contributing[] must list every marker the rule read (D-k); empty is non-conformant',
      path
    });
    return [];
  }
  const ids: string[] = [];
  for (const c of items) {
    if (isRecord(c) && typeof c.biomarker_id === 'string') ids.push(c.biomarker_id);
  }
  return ids;
}

/**
 * Validate an interpretation document for publication to open-twin-openXR.
 * Applies JSON Schema plus D-f…D-m semantic rules (including SNOMED publication boundary).
 */
export function validateInterpretationDocument(input: unknown): ConformanceResult {
  const errors: ConformanceError[] = [];

  // Raw-text SNOMED / internal-only field check on the published JSON shape
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  if (SCTID_RE.test(raw) || raw.includes('body_structure_snomed')) {
    errors.push({
      code: 'SCTID_IN_PUBLISHED',
      message:
        'SNOMED CT identifiers / body_structure_snomed must not appear in a published interpretation document (D-l; Addendum 06 Finding 3)'
    });
  }

  walkRejectLoincAxis(input, '', errors);

  if (!isRecord(input)) {
    errors.push({ code: 'SCHEMA', message: 'document must be a JSON object' });
    return { ok: false, errors };
  }

  if (input.intended_use !== 'research_hypothesis_generation_n_of_1' || input.not_for_diagnostic_use !== true) {
    errors.push({
      code: 'INTENDED_USE',
      message:
        'intended_use must be research_hypothesis_generation_n_of_1 and not_for_diagnostic_use must be true (D-m)'
    });
  }

  const validate = getAjvValidate();
  const schemaOk = validate(input);
  if (!schemaOk) {
    const ajvErrors = ((validate as { errors?: ErrorObject[] | null }).errors ?? []) as ErrorObject[];
    for (const e of ajvErrors) {
      const path = e.instancePath || '/';
      const msg = `${e.instancePath || '/'} ${e.message ?? 'schema violation'}`;
      if (e.keyword === 'enum' && path.endsWith('system_id')) {
        errors.push({ code: 'UNKNOWN_SYSTEM_ID', message: msg, path });
      } else if (e.keyword === 'maximum' && path.endsWith('confidence')) {
        errors.push({ code: 'CONFIDENCE_OUT_OF_RANGE', message: msg, path });
      } else if (e.keyword === 'minItems' && path.endsWith('contributing')) {
        errors.push({ code: 'EMPTY_CONTRIBUTING', message: msg, path });
      } else if (e.keyword === 'enum' && String(e.message ?? '').includes('loinc_system_axis')) {
        errors.push({ code: 'LOINC_SYSTEM_AXIS_ANATOMY', message: msg, path });
      } else {
        errors.push({ code: 'SCHEMA', message: msg, path });
      }
    }
  }

  const states = Array.isArray(input.states) ? input.states : [];
  const unrenderable = Array.isArray(input.unrenderable) ? input.unrenderable : [];
  const stateMarkerIds = new Set<string>();
  const unrenderableMarkerIds = new Set<string>();

  states.forEach((state, i) => {
    if (!isRecord(state)) return;
    const sid = state.system_id;
    if (typeof sid === 'string' && !SYSTEM_IDS.has(sid)) {
      errors.push({
        code: 'UNKNOWN_SYSTEM_ID',
        message: `unknown system_id "${sid}" — not in the nine-value openXR enum (D-f)`,
        path: `/states/${i}/system_id`
      });
    }
    if (typeof state.confidence === 'number' && state.confidence > 1) {
      errors.push({
        code: 'CONFIDENCE_OUT_OF_RANGE',
        message: `confidence ${state.confidence} > 1 (D-j)`,
        path: `/states/${i}/confidence`
      });
    }
    const ids = collectContributing(state.contributing, `/states/${i}/contributing`, errors);
    for (const id of ids) stateMarkerIds.add(id);
    if (state.sufficient_data === false) {
      if (!Array.isArray(state.contributing) || state.contributing.length === 0) {
        errors.push({
          code: 'INSUFFICIENT_EMPTY_CONTRIBUTING',
          message:
            'sufficient_data=false still requires contributing[] listing every marker the rule read, including absences (D-k)',
          path: `/states/${i}/contributing`
        });
      }
      if (typeof state.insufficient_reason !== 'string' || !state.insufficient_reason) {
        errors.push({
          code: 'MISSING_INSUFFICIENT_REASON',
          message: 'sufficient_data=false requires insufficient_reason',
          path: `/states/${i}/insufficient_reason`
        });
      }
    }
  });

  unrenderable.forEach((u, i) => {
    if (!isRecord(u)) return;
    if (typeof u.confidence === 'number' && u.confidence > 1) {
      errors.push({
        code: 'CONFIDENCE_OUT_OF_RANGE',
        message: `confidence ${u.confidence} > 1 (D-j)`,
        path: `/unrenderable/${i}/confidence`
      });
    }
    const ids = collectContributing(u.contributing, `/unrenderable/${i}/contributing`, errors);
    for (const id of ids) unrenderableMarkerIds.add(id);
  });

  for (const id of unrenderableMarkerIds) {
    if (stateMarkerIds.has(id)) {
      errors.push({
        code: 'UNRENDERABLE_REROUTED',
        message: `biomarker ${id} appears in unrenderable[] and states[] — never reroute into a neighbouring system (D-g)`,
        path: '/states'
      });
    }
  }

  // Deduplicate by code+path+message
  const seen = new Set<string>();
  const deduped = errors.filter((e) => {
    const k = `${e.code}|${e.path ?? ''}|${e.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (deduped.length) return { ok: false, errors: deduped };
  return {
    ok: true,
    errors: [],
    document: input as unknown as OpenTwinInterpretationDocumentV02
  };
}
