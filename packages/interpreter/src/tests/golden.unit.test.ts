import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateInterpretationDocument } from '@open-twin/interpretation-contract';
import { evaluate, serializeDocument } from '../evaluate.js';
import { defaultRulePackPath, loadRulePackFile } from '../load-rule-pack.js';
import type { EvaluateInput } from '../types.js';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'golden');

const families = readdirSync(GOLDEN, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

describe('golden fixtures (byte-identical)', () => {
  const pack = loadRulePackFile(defaultRulePackPath());

  it('has one fixture directory per rule family in the pack', () => {
    const packFamilies = [...new Set(pack.rules.map((r) => r.family))].sort();
    expect(families).toEqual(packFamilies);
  });

  for (const fam of families) {
    it(`${fam}: matches expected.json`, () => {
      const inputPath = join(GOLDEN, fam, 'input.json');
      const expectedPath = join(GOLDEN, fam, 'expected.json');
      expect(existsSync(expectedPath)).toBe(true);

      const input = JSON.parse(readFileSync(inputPath, 'utf8')) as EvaluateInput;
      input.families = [fam];
      const doc = evaluate(pack, input);
      const actual = serializeDocument(doc);
      const expected = readFileSync(expectedPath, 'utf8');

      if (actual !== expected) {
        throw new Error(
          [
            `Golden drift for family "${fam}".`,
            'If intentional, regenerate with a written reason:',
            `  pnpm --filter @open-twin/interpreter regen-golden -- --family ${fam} --reason "..."`,
            'See fixtures/golden/README.md and REASONS.md.',
          ].join('\n'),
        );
      }

      const conformance = validateInterpretationDocument(doc);
      expect(conformance.ok, JSON.stringify(conformance.errors)).toBe(true);
    });
  }

  it('is deterministic across repeated evaluation', () => {
    const fam = 'glycemic';
    const input = JSON.parse(readFileSync(join(GOLDEN, fam, 'input.json'), 'utf8')) as EvaluateInput;
    input.families = [fam];
    const a = serializeDocument(evaluate(pack, input));
    const b = serializeDocument(evaluate(pack, input));
    expect(a).toBe(b);
  });
});
