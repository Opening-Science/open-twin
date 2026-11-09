import type { Bundle } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { withConnectorTag } from '../../utils/connectorTag';

const system = 'http://opentwin.ch/fhir/CodeSystem/connector';
const probe = { system, code: 'probe', version: '0.1.0' };

const bundle: Bundle = {
  resourceType: 'Bundle',
  type: 'collection',
  id: 'b1',
  entry: [
    { fullUrl: 'urn:uuid:a', resource: { resourceType: 'Patient', id: 'a' } },
    {
      fullUrl: 'urn:uuid:b',
      resource: { resourceType: 'Patient', id: 'b', meta: { tag: [{ system: 'urn:other', code: 'x' }] } }
    },
    {
      fullUrl: 'urn:uuid:c',
      resource: { resourceType: 'Patient', id: 'c', meta: { tag: [{ ...probe, version: '0.0.1' }] } }
    }
  ]
};

describe('withConnectorTag', () => {
  const tagged = withConnectorTag(bundle, { connector: 'probe', version: '0.1.0' });
  const tagsOf = (i: number) => tagged.entry?.[i]?.resource?.meta?.tag ?? [];

  it('tags every resource, keeps other tags and replaces a stale tag of its own', () => {
    expect(tagsOf(0)).toEqual([probe]);
    expect(tagsOf(1)).toEqual([{ system: 'urn:other', code: 'x' }, probe]);
    expect(tagsOf(2)).toEqual([probe]);
  });

  it('leaves the bundle id and the input alone', () => {
    expect(tagged.id).toBe('b1');
    expect(bundle.entry?.[0]?.resource?.meta).toBeUndefined();
  });
});
