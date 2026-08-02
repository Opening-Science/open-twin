/**
 * WHAT: Maps one vendor record type into FHIR Observation(s).
 * NOT:  Must not call vendor HTTP; must not invent LOINC/SNOMED — use allowlisted codes or vendor-local SYSTEMS.*.
GOVERNED BY: DECISIONS.md#d4
 * CORRECTNESS: signed review record (verify/terminology-allowlist.json) for LOINC/SNOMED emitted here; UCUM gate for quantities.
 */
import { deterministicId } from '@open-twin/fhir-core';
import type { Device, Reference } from 'fhir/r4';
import type { SourceMetadata } from '../../api/schemas/common';
import { CONNECTOR, OPEN_WEARABLES_IDENTIFIER_SYSTEM } from '../../config/constants';

/**
 * Provenance without inventing an extension.
 *
 * Every Open Wearables record carries `source: {provider, device}` — which vendor
 * the platform got it from and which hardware produced it. That is the single most
 * valuable field in the payload for this project: it is what lets a consumer decide
 * whether an Oura heart rate and a Garmin heart rate are comparable at all.
 *
 * FHIR already has somewhere to put it. `Observation.device` referencing a `Device`
 * resource is standard R4, so no extension is declared and nothing has to be added
 * to the shared conformance declarations. An unresolvable extension is a validator
 * *error*; not needing one at all is better than declaring one well.
 *
 * `Device.manufacturer` carries the provider string verbatim. It is the platform's
 * own free-text `data_source.source` (backend/app/services/timeseries_service.py:192),
 * not a controlled code, so it is not coerced into one.
 */
export interface DeviceEntry {
  device: Device;
  reference: Reference;
}

/** Stable across syncs, so re-mapping the same window reuses the same Device. */
function deviceKey(source: SourceMetadata): string {
  return `device|${source.provider}|${source.device ?? ''}`;
}

/**
 * Collects one `Device` per distinct (provider, model) pair seen in a sync.
 *
 * Deduplication matters: a week of heart-rate samples is thousands of records from
 * one watch, and one Device resource per sample would make the bundle unreadable
 * and its references meaningless.
 */
export class DeviceRegistry {
  private readonly entries = new Map<string, DeviceEntry>();

  constructor(private readonly subjectKey: string) {}

  /** Returns undefined when the record carried no source at all — never a placeholder. */
  reference(source: SourceMetadata | null | undefined): Reference | undefined {
    if (!source) return undefined;
    const key = deviceKey(source);
    const existing = this.entries.get(key);
    if (existing) return existing.reference;

    const id = deterministicId({
      connector: CONNECTOR.connector,
      subjectKey: this.subjectKey,
      recordId: key
    });

    const device: Device = {
      resourceType: 'Device',
      id,
      identifier: [{ system: OPEN_WEARABLES_IDENTIFIER_SYSTEM, value: key }],
      manufacturer: source.provider
    };
    if (source.device) {
      // `model-name` from the R4 device-nametype value set: this is the hardware
      // model the platform reported, not a user-chosen nickname.
      device.deviceName = [{ name: source.device, type: 'model-name' }];
    }

    const entry: DeviceEntry = { device, reference: { reference: `urn:uuid:${id}` } };
    this.entries.set(key, entry);
    return entry.reference;
  }

  devices(): Device[] {
    return [...this.entries.values()].map((entry) => entry.device);
  }
}
