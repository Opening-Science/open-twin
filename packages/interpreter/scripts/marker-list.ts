/**
 * WHAT: Writes docs/findings/anchor-marker-list.md from the Anchor artefact and the rule pack.
 * NOT:  Changes no rule and no artefact; it only renders what both say today.
 * GOVERNED BY: DECISIONS.md#d12
 * CORRECTNESS: NONE — see docs/findings/no-external-authority.md
 *
 * Usage: pnpm --filter @open-twin/interpreter marker-list, then pnpm format.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRulePackPath, loadRulePackFile } from '../src/load-rule-pack.js';
import { type AnchorMarker, markerList, renderMarkerList } from '../src/markerList.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MARKER_LIST_PATH = join(ROOT, 'docs', 'findings', 'anchor-marker-list.md');
export const MARKER_LIST_COMMAND = 'pnpm --filter @open-twin/interpreter marker-list';
const ARTEFACT = join(ROOT, 'packages', 'anchor-layer', 'data', 'anchor-layer.v1.json');

const { biomarkers } = JSON.parse(readFileSync(ARTEFACT, 'utf8')) as { biomarkers: AnchorMarker[] };
const list = markerList(biomarkers, loadRulePackFile(defaultRulePackPath()));
writeFileSync(MARKER_LIST_PATH, renderMarkerList(list, MARKER_LIST_COMMAND));
console.log(`wrote ${MARKER_LIST_PATH}`);
