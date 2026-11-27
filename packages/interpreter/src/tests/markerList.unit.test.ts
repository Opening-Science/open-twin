import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultRulePackPath, loadRulePackFile } from '../load-rule-pack';
import { type AnchorMarker, markerList, renderMarkerList } from '../markerList';
import type { RulePack } from '../types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ARTEFACT = join(ROOT, 'packages', 'anchor-layer', 'data', 'anchor-layer.v1.json');
const DOC = join(ROOT, 'docs', 'findings', 'anchor-marker-list.md');
const COMMAND = 'pnpm --filter @open-twin/interpreter marker-list';

/** Biome pads Markdown tables; compare cell text, not spacing. */
function normalise(markdown: string): string[] {
  return markdown
    .trim()
    .split('\n')
    .map((line) => {
      if (!line.startsWith('|')) return line.trim();
      const cells = line
        .slice(1, -1)
        .split(' | ')
        .map((cell) => cell.trim());
      return cells.every((cell) => /^-+$/.test(cell)) ? cells.map(() => '---').join('|') : cells.join('|');
    });
}

const marker = (id: string, system_id: AnchorMarker['system_id']): AnchorMarker => ({
  biomarker_id: id,
  name_de: id,
  loinc_code: '0-0',
  tier: 'core_tier1',
  system_id,
  region_ids: ['liver']
});

const rule = (id: string, inputs: string[], emit: 'state' | 'unrenderable'): RulePack['rules'][number] => ({
  id,
  family: id,
  clinical_basis: 'heuristic_no_guideline',
  rule_strength: 0.5,
  emit,
  ...(emit === 'state' ? { system_id: 'digestive' as const } : { unrenderable_reason: 'not_anatomical' as const }),
  inputs: inputs.map((biomarker_id) => ({ biomarker_id, role: 'required' as const })),
  severity_ladder: []
});

describe('markerList', () => {
  describe('placement', () => {
    const pack: RulePack = {
      schema_version: 'rule-pack.v0.1',
      pack_id: 'test',
      rules: [rule('painted', ['BM-1', 'BM-2'], 'state'), rule('kept-off', ['BM-3'], 'unrenderable')]
    };
    const list = markerList(
      [
        marker('BM-2', 'metabolic'),
        marker('BM-1', 'digestive'),
        marker('BM-3', 'metabolic'),
        marker('BM-4', 'endocrine')
      ],
      pack
    );
    const byId = new Map(list.rows.map((row) => [row.marker.biomarker_id, row]));

    it('lists every marker once, in id order', () => {
      expect(list.rows.map((row) => row.marker.biomarker_id)).toEqual(['BM-1', 'BM-2', 'BM-3', 'BM-4']);
    });

    it('puts a marker on the body, off it, or under no rule', () => {
      expect(byId.get('BM-1')?.placement).toBe('on-body');
      expect(byId.get('BM-3')?.placement).toBe('off-body');
      expect(byId.get('BM-4')?.placement).toBe('no-rule');
    });

    it('flags a rule that paints a marker on another system than Anchor gives it', () => {
      expect(byId.get('BM-1')?.systemDiffers).toBe(false);
      expect(byId.get('BM-2')?.systemDiffers).toBe(true);
    });
  });

  it('reports a rule input that names no marker in the artefact', () => {
    const pack: RulePack = { schema_version: 'rule-pack.v0.1', pack_id: 'test', rules: [rule('r', ['BM-9'], 'state')] };

    expect(markerList([marker('BM-1', 'digestive')], pack).unknownInputs).toEqual(['BM-9']);
  });

  describe('the committed list', () => {
    const { biomarkers } = JSON.parse(readFileSync(ARTEFACT, 'utf8')) as { biomarkers: AnchorMarker[] };
    const list = markerList(biomarkers, loadRulePackFile(defaultRulePackPath()));

    it('covers all 67 Anchor markers, and every rule input is one of them', () => {
      expect(list.rows).toHaveLength(67);
      expect(list.unknownInputs).toEqual([]);
    });

    it(`matches the artefact and the rule pack; rerun ${COMMAND} if not`, () => {
      expect(normalise(readFileSync(DOC, 'utf8'))).toEqual(normalise(renderMarkerList(list, COMMAND)));
    });
  });
});
