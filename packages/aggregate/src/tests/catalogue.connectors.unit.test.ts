import { FHIR_R4_MEASUREMENTS } from '@open-twin/fhir-r4';
import { GENOMICS_VCF_MEASUREMENTS } from '@open-twin/genomics-vcf';
import { HL7V2_MEASUREMENTS } from '@open-twin/hl7v2';
import { OPEN_WEARABLES_MEASUREMENTS } from '@open-twin/open-wearables';
import { GOOGLE_HEALTH_MEASUREMENTS } from '@open-twin/provider-google-health';
import { OURA_MEASUREMENTS } from '@open-twin/provider-oura';
import { VITRONIC_MEASUREMENTS } from '@open-twin/provider-vitronic';
import { WHOOP_MEASUREMENTS } from '@open-twin/provider-whoop';
import { describe, expect, it } from 'vitest';
import { catalogueEntry, createMeasurementCatalogue, registrationProblems, sharedCatalogueEntries } from '../catalogue';

// The declaration sets the connectors actually export, not hand-built stand-ins.
const CONNECTORS = [
  OURA_MEASUREMENTS,
  WHOOP_MEASUREMENTS,
  GOOGLE_HEALTH_MEASUREMENTS,
  VITRONIC_MEASUREMENTS,
  OPEN_WEARABLES_MEASUREMENTS,
  FHIR_R4_MEASUREMENTS,
  HL7V2_MEASUREMENTS,
  GENOMICS_VCF_MEASUREMENTS
];

function sourcesOf(key: string): string[] | undefined {
  return catalogueEntry(createMeasurementCatalogue(CONNECTORS), key)?.sources.map((source) => source.connector);
}

describe('the catalogue built from every connector', () => {
  it('registers every connector without a problem', () => {
    expect(registrationProblems(CONNECTORS)).toEqual([]);
  });

  it('pins which keys are shared and by whom', () => {
    // Re-keying a declaration onto or off a shared key changes which sources a
    // preference can choose between; any such change must be made here on purpose.
    const shared = Object.fromEntries(
      sharedCatalogueEntries(createMeasurementCatalogue(CONNECTORS)).map((entry) => [
        entry.key,
        entry.sources.map((source) => source.connector)
      ])
    );
    expect(shared).toEqual({
      'body-fat-percentage': ['google-health', 'open-wearables'],
      'body-height': ['google-health', 'open-wearables'],
      'body-temperature': ['google-health', 'open-wearables'],
      'body-weight': ['google-health', 'open-wearables'],
      'daily-step-count': ['oura', 'open-wearables'],
      'deep-sleep-duration': ['oura', 'google-health', 'open-wearables'],
      'heart-rate': ['oura', 'google-health', 'open-wearables'],
      'light-sleep-duration': ['oura', 'google-health', 'open-wearables'],
      'oxygen-saturation': ['google-health', 'open-wearables'],
      'rem-sleep-duration': ['oura', 'google-health', 'open-wearables'],
      'session-energy-expenditure': ['oura', 'google-health', 'open-wearables'],
      'sleep-latency': ['oura', 'google-health'],
      'sleep-mean-respiratory-rate': ['oura', 'google-health'],
      'step-count': ['google-health', 'open-wearables'],
      'time-in-bed': ['oura', 'whoop', 'google-health'],
      'total-sleep-time': ['oura', 'google-health', 'open-wearables'],
      vo2max: ['oura', 'google-health', 'open-wearables']
    });
  });

  it("keeps WHOOP's sleep-measured resting heart rate off the shared daily key", () => {
    expect(sourcesOf('resting-heart-rate')).toEqual(['google-health']);
    expect(sourcesOf('whoop:recovery.resting-heart-rate')).toEqual(['whoop']);
  });

  it('keeps time in bed and time asleep apart across real sources', () => {
    expect(sourcesOf('time-in-bed')).toContain('whoop');
    expect(sourcesOf('total-sleep-time')).not.toContain('whoop');
  });

  it('keeps Google glucose, which may be interstitial, off the shared blood glucose key', () => {
    expect(sourcesOf('blood-glucose-mass-concentration')).toBeUndefined();
    expect(sourcesOf('google-health:blood-glucose')).toEqual(['google-health']);
  });
});
