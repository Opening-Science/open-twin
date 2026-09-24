/**
 * WHAT: Validates or normalises foreign FHIR R4 Bundles structurally.
 * NOT:  Must not rewrite clinical codes or units to pass gates.
GOVERNED BY: DECISIONS.md#d1; DECISIONS.md#d2; DECISIONS.md#d6
 * CORRECTNESS: HL7 FHIR R4 structure rules (local checks); CI also runs official validator on emitted exemplars.
 */
export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export interface Visited {
  node: JsonObject;
  /** FHIRPath-style location, e.g. `Bundle.entry[2].resource.component[0]`. */
  path: string;
}

/** Only static element names reach diagnostic paths; unknown keys may be identifiers. */
const DIAGNOSTIC_ELEMENTS = new Set([
  'resourceType',
  'id',
  'meta',
  'tag',
  'security',
  'profile',
  'versionId',
  'lastUpdated',
  'entry',
  'resource',
  'fullUrl',
  'request',
  'response',
  'search',
  'link',
  'contained',
  'extension',
  'modifierExtension',
  'url',
  'identifier',
  'system',
  'value',
  'code',
  'coding',
  'text',
  'status',
  'subject',
  'patient',
  'encounter',
  'reference',
  'type',
  'display',
  'component',
  'referenceRange',
  'low',
  'high',
  'numerator',
  'denominator',
  'valueQuantity',
  'valueCodeableConcept',
  'valueString',
  'valueBoolean',
  'valueInteger',
  'valueRange',
  'valueRatio',
  'valueSampledData',
  'valueTime',
  'valueDateTime',
  'valuePeriod',
  'valueReference',
  'valueDecimal',
  'valueCode',
  'valueUri',
  'unit',
  'comparator',
  'effectiveDateTime',
  'effectivePeriod',
  'start',
  'end',
  'issued',
  'dataAbsentReason',
  'performer',
  'result',
  'basedOn',
  'partOf',
  'specimen',
  'device',
  'focus',
  'derivedFrom',
  'hasMember',
  'method',
  'bodySite',
  'name',
  'telecom',
  'address'
]);

export function diagnosticElement(key: string, index: number): string {
  return DIAGNOSTIC_ELEMENTS.has(key) ? key : `<redacted>[${index}]`;
}

/** Iterative walk. Public validation bounds and checks the JSON graph before walking. */
export function* walkObjects(root: unknown, path: string): Generator<Visited> {
  const stack: Array<{ node: unknown; path: string }> = [{ node: root, path }];
  const seen = new WeakSet<object>();
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item.node !== 'object' || item.node === null) continue;
    if (seen.has(item.node)) continue;
    seen.add(item.node);
    if (Array.isArray(item.node)) {
      for (let i = item.node.length - 1; i >= 0; i--) {
        stack.push({ node: item.node[i], path: `${item.path}[${i}]` });
      }
    } else if (isObject(item.node)) {
      yield { node: item.node, path: item.path };
      const entries = Object.entries(item.node);
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (entry) stack.push({ node: entry[1], path: `${item.path}.${diagnosticElement(entry[0], i)}` });
      }
    }
  }
}

/** Reject cycles, accessors and oversized graphs before parsing, cloning or traversing. */
export function isBoundedJson(input: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number; leave?: boolean }> = [{ value: input, depth: 0 }];
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  let characters = 0;
  while (stack.length) {
    const item = stack.pop();
    if (!item) break;
    const { value, depth } = item;
    if (item.leave) {
      ancestors.delete(value as object);
      continue;
    }
    if (++nodes > 50_000 || depth > 64) return false;
    if (typeof value === 'string') characters += value.length;
    if (characters > 10_000_000) return false;
    if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return false;
      continue;
    }
    if (typeof value !== 'object' || ancestors.has(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
    if (Array.isArray(value) && value.length > 50_000) return false;
    const keys = Object.keys(value);
    if (nodes + stack.length + keys.length > 50_000) return false;
    ancestors.add(value);
    stack.push({ value, depth, leave: true });
    for (const key of keys) {
      characters += key.length;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return false;
      stack.push({ value: descriptor.value, depth: depth + 1 });
    }
  }
  return characters <= 10_000_000;
}

/**
 * The `value[x]` element names FHIR R4 defines on Observation and on
 * Observation.component. Both share the same choice list, which is why obs-6 and
 * the component check can be expressed against one table.
 */
export const OBSERVATION_VALUE_ELEMENTS = [
  'valueQuantity',
  'valueCodeableConcept',
  'valueString',
  'valueBoolean',
  'valueInteger',
  'valueRange',
  'valueRatio',
  'valueSampledData',
  'valueTime',
  'valueDateTime',
  'valuePeriod'
] as const;

export function presentValueElements(node: JsonObject): string[] {
  return OBSERVATION_VALUE_ELEMENTS.filter((name) => node[name] !== undefined);
}
