/**
 * Finds every LOINC / SNOMED CT coding in the workspace source, with the display
 * string the connector emits alongside it.
 *
 * Shared by check-terminology.mjs (which asserts offline) and
 * refresh-terminology.mjs (which asks the terminology server). They must agree on
 * what counts as a coding, or the gate would check a different set than the one
 * that was verified.
 *
 * Scanning *source* rather than emitted bundles is the point: a code that is
 * declared and never exercised by a fixture is invisible to any validator, and that
 * is exactly how 33 of 38 genomic answer codes went unchecked while appearing to be
 * covered by an implementation guide.
 */

import {
  collectSources,
  enclosingObjectStart,
  lineAt,
  maskLiterals,
  objectEnd,
  stringLiteral,
  topLevelProps
} from './scan.mjs';

const CODE_SYSTEMS = [
  { match: /SYSTEMS\.LOINC|loinc\.org/, name: 'LOINC' },
  { match: /SYSTEMS\.SNOMED|snomed\.info/, name: 'SNOMED CT' }
];

/** @returns Map<code, { system, displays: Set<string>, sites: Array<{rel, line}> }> */
export function collectCodings(root) {
  const found = new Map();
  const record = (code, system, display, site) => {
    if (!found.has(code)) found.set(code, { system, displays: new Set(), sites: [] });
    const entry = found.get(code);
    if (display) entry.displays.add(display);
    entry.sites.push(site);
  };

  for (const { rel, text } of collectSources(root)) {
    const masked = maskLiterals(text);

    // Object form: { system: SYSTEMS.LOINC, code: '8867-4', display: 'Heart rate' }
    for (const match of masked.matchAll(/SYSTEMS\.(?:LOINC|SNOMED)|loinc\.org|snomed\.info/g)) {
      const start = enclosingObjectStart(masked, match.index);
      if (start === -1) continue;
      const end = objectEnd(masked, start);
      if (end === -1) continue;

      const props = topLevelProps(text, masked, start, end);
      const rawSystem = props.get('system');
      if (!rawSystem) continue;
      const system = CODE_SYSTEMS.find((c) => c.match.test(rawSystem))?.name;
      if (!system) continue;

      const code = stringLiteral(props.get('code'));
      if (code === null) continue; // built at runtime; not reviewable statically
      record(code, system, stringLiteral(props.get('display')), { rel, line: lineAt(text, start) });
    }

    // Positional helper form, where the code and system are separate arguments:
    //   addComponent(value, '248263006', SYSTEMS.SNOMED, 'Sleep efficiency')
    for (const match of masked.matchAll(/\(([^()]*)\)/g)) {
      const inner = text.slice(match.index + 1, match.index + match[0].length - 1);
      const system = CODE_SYSTEMS.find((c) => c.match.test(inner))?.name;
      if (!system) continue;
      for (const literal of inner.matchAll(/'(\d{4,6}-\d|LA\d+-\d|\d{6,18})'/g)) {
        // The display, if present, is the string literal after the system argument.
        const after = inner.slice(literal.index + literal[0].length);
        const display = /,\s*SYSTEMS\.\w+\s*,\s*'([^']+)'/.exec(after)?.[1] ?? null;
        record(literal[1], system, display, { rel, line: lineAt(text, match.index) });
      }
    }
  }
  return found;
}
