import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregate,
  createMeasurementCatalogue,
  generateReconciliationConfiguration,
  type SourceBundle,
  validateReconciliationConfiguration
} from '@open-twin/aggregate';
import { buildBundleFromResponses, GOOGLE_HEALTH_MEASUREMENTS } from '@open-twin/provider-google-health';
import { OURA_MEASUREMENTS } from '@open-twin/provider-oura';
import { buildOuraBundle } from '../../provider-oura/src/fhir/bundleBuilder';

const SUBJECT_KEY = 'synthetic-aggregate-example';
const SUBJECT = { reference: 'https://example.test/Patient/synthetic-aggregate-example' };
const TIMESTAMP = '2026-11-18T10:00:00Z';

function syntheticSources(): [SourceBundle, SourceBundle] {
  // The map-only Oura builder is internal, so this part is a checkout-only example.
  const oura = buildOuraBundle(
    [
      {
        type: 'sleep',
        data: {
          data: [
            {
              id: 'synthetic-night-one',
              day: '2026-11-17',
              bedtime_start: '2026-11-16T23:00:00+01:00',
              bedtime_end: '2026-11-17T07:00:00+01:00',
              total_sleep_duration: 25200,
              deep_sleep_duration: 3600,
              rem_sleep_duration: 5400,
              light_sleep_duration: 16200,
              time_in_bed: 28800,
              latency: 600,
              average_breath: 14,
              score: 85
            }
          ],
          next_token: null
        }
      }
    ],
    { types: ['sleep'], start_date: '2026-11-16', end_date: '2026-11-18' },
    { subjectKey: SUBJECT_KEY, subject: SUBJECT, timestamp: TIMESTAMP }
  );
  const google = buildBundleFromResponses(
    [
      {
        dataPoints: [
          {
            name: 'users/synthetic/dataTypes/sleep/dataPoints/night-one',
            sleep: {
              interval: {
                startTime: '2026-11-16T22:00:00Z',
                startUtcOffset: '3600s',
                endTime: '2026-11-17T06:00:00Z',
                endUtcOffset: '3600s'
              },
              summary: {
                minutesAsleep: '405',
                minutesInSleepPeriod: '480',
                minutesToFallAsleep: '12',
                stagesSummary: [
                  { type: 'DEEP', minutes: '70' },
                  { type: 'REM', minutes: '85' },
                  { type: 'LIGHT', minutes: '250' }
                ]
              }
            }
          },
          {
            name: 'users/synthetic/dataTypes/sleep/dataPoints/night-two',
            sleep: {
              interval: {
                startTime: '2026-11-17T22:00:00Z',
                startUtcOffset: '3600s',
                endTime: '2026-11-18T06:00:00Z',
                endUtcOffset: '3600s'
              },
              summary: {
                minutesAsleep: '410',
                minutesInSleepPeriod: '480',
                minutesToFallAsleep: '8',
                stagesSummary: [
                  { type: 'DEEP', minutes: '80' },
                  { type: 'REM', minutes: '90' },
                  { type: 'LIGHT', minutes: '240' }
                ]
              }
            }
          }
        ]
      }
    ],
    { subjectKey: SUBJECT_KEY, subject: SUBJECT, timestamp: TIMESTAMP, bundleKey: 'synthetic-sleep-example' }
  );
  if (google.unmapped.length) throw new Error('Synthetic Google Health input contains unmapped data types.');
  return [
    { connector: 'oura', bundle: oura },
    { connector: 'google-health', bundle: google.bundle }
  ];
}

export function runOuraGoogleExample(outputDirectory: string) {
  const catalogue = createMeasurementCatalogue([OURA_MEASUREMENTS, GOOGLE_HEALTH_MEASUREMENTS]);
  const configurationPath = join(outputDirectory, 'reconciliation-configuration.json');
  const hasSavedConfiguration = existsSync(configurationPath);
  const generated = hasSavedConfiguration
    ? undefined
    : generateReconciliationConfiguration(catalogue, {
        save: { directory: join(outputDirectory, 'configuration-history') }
      });
  const candidate: unknown = generated ? generated.configuration : JSON.parse(readFileSync(configurationPath, 'utf8'));
  const validated = validateReconciliationConfiguration(candidate, catalogue);
  if (!validated.ok) {
    throw new Error(
      `Invalid reconciliation configuration: ${validated.problems.map(({ path, message }) => `${path}: ${message}`).join('; ')}`
    );
  }
  const configuration = validated.configuration;
  const sources = syntheticSources();
  const options = { sources, subjectKey: SUBJECT_KEY, timestamp: TIMESTAMP };
  const basic = aggregate(options);
  const reconciled = aggregate({
    ...options,
    reconciliation: { enabled: true, catalogue, configuration }
  });
  const artifacts = {
    'catalogue.json': catalogue,
    'oura-bundle.json': sources[0].bundle,
    'google-health-bundle.json': sources[1].bundle,
    'basic-result.json': basic,
    'reconciled-result.json': reconciled
  };
  mkdirSync(outputDirectory, { recursive: true });
  if (!hasSavedConfiguration) {
    writeFileSync(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`, { flag: 'wx' });
  }
  for (const [name, value] of Object.entries(artifacts)) {
    writeFileSync(join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
  }
  return { catalogue, configuration, sources, basic, reconciled, savedConfigurationPath: generated?.filePath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('Usage: oura-google-catalogue.ts [output-directory]');
  const outputDirectory = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../../../out/oura-google-aggregation')
  );
  const result = runOuraGoogleExample(outputDirectory);
  if (result.savedConfigurationPath) {
    process.stdout.write(`Generated configuration snapshot: ${result.savedConfigurationPath}\n`);
  }
  process.stdout.write(
    `Workflow files written to ${outputDirectory}\nEdit reconciliation-configuration.json and rerun to apply your preferences.\nSaved configuration is validated and never overwritten; other example outputs are regenerated.\n`
  );
}
