import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('rule-pack schema sync', () => {
  it('package schema matches docs/strategy source', () => {
    const docs = readFileSync(
      join(ROOT, 'docs/strategy/contracts/rules/rule-pack.v0.1.schema.json'),
      'utf8',
    );
    const pkg = readFileSync(
      join(ROOT, 'packages/interpreter/schema/rule-pack.v0.1.schema.json'),
      'utf8',
    );
    expect(pkg).toBe(docs);
  });
});
