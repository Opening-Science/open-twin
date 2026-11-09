import {
  buildBundle,
  CATEGORY,
  connectorMeta,
  createObservation,
  dataAbsentReason,
  deterministicId,
  quantity,
  UCUM
} from '@open-twin/fhir-core';
import type { Observation } from 'fhir/r4';
import { z } from 'zod';
import { HealthDataReader } from '../base';
import type { Issue, ReaderDescriptor, ReaderInput, ReaderMetadata, ReadRequest, ReadResult } from '../types';
import { fileJson, fileText } from '../utils/fileInput';

/** A code system that exists only in these tests. Never a LOINC or SNOMED code. */
export const FAKE_STEPS_SYSTEM = 'urn:open-twin:test:fake-steps';

/** One deliberate defect per conformance rule, so each rule is shown to catch something. */
export type Defect =
  | 'wrong-version'
  | 'network-in-is-this-type'
  | 'accepts-any-input'
  | 'fetches-in-open'
  | 'no-status'
  | 'drops-meta-tag'
  | 'wrong-subject'
  | 'non-uuid-id'
  | 'no-ucum'
  | 'zero-for-missing'
  | 'random-id'
  | 'window-ignored'
  | 'leaks-payload'
  | 'extra-observation';

const Day = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().nonnegative().nullable()
});
const StepsFile = z.object({ format: z.literal('fake-steps'), user: z.string().min(1), days: z.array(Day).min(1) });
type StepsFile = z.infer<typeof StepsFile>;

export const FAKE_STEPS_DESCRIPTOR: ReaderDescriptor = {
  id: 'fake-steps',
  name: 'Fake step counter (tests only)',
  version: '0.1.0',
  kind: 'file',
  domains: ['synthetic'],
  dataTypes: ['daily-steps'],
  auth: 'none',
  suffixes: ['.steps.json'],
  mediaTypes: ['application/json']
};

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

export class FakeStepsReader extends HealthDataReader {
  readonly descriptor: ReaderDescriptor;
  private file: StepsFile | undefined;

  constructor(private readonly defect?: Defect) {
    super();
    this.descriptor = {
      ...FAKE_STEPS_DESCRIPTOR,
      version: defect === 'wrong-version' ? '9.9.9' : FAKE_STEPS_DESCRIPTOR.version
    };
  }

  override async isThisType(input: ReaderInput): Promise<boolean> {
    if (this.defect === 'network-in-is-this-type')
      await (this.host.fetch ?? globalThis.fetch)('https://example.invalid/');

    const text = fileText(input);
    return text !== undefined && /"format"\s*:\s*"fake-steps"/.test(text);
  }

  protected async onOpen(input: ReaderInput): Promise<void> {
    if (this.defect === 'fetches-in-open') await (this.host.fetch ?? globalThis.fetch)('https://example.invalid/');

    const parsed = StepsFile.safeParse(fileJson(input));

    if (parsed.success) {
      this.file = parsed.data;
      return;
    }

    if (this.defect === 'accepts-any-input') {
      this.file = { format: 'fake-steps', user: 'nobody', days: [] };
      return;
    }

    throw this.fail('The input is not a fake-steps file', 'validation', 'open');
  }

  protected onClose(): Promise<void> {
    return Promise.resolve();
  }

  describe(): Promise<ReaderMetadata> {
    return Promise.resolve({
      source: { id: this.descriptor.id },
      dataTypes: this.descriptor.dataTypes,
      capabilities: { incremental: false, sandbox: false, write: false }
    });
  }

  /** Nothing to await: the file was parsed in onOpen. A real reader awaits the vendor here. */
  read(request: ReadRequest): Promise<ReadResult> {
    return Promise.resolve().then(() => this.mapDays(request));
  }

  private mapDays(request: ReadRequest): ReadResult {
    const { file, input } = this;

    if (!file || !input) throw this.fail('read called before open', 'validation', 'read');

    const { id, version } = this.descriptor;
    const subject = this.subjectFor(request);
    const subjectReference = this.defect === 'wrong-subject' ? { reference: 'Patient/example' } : subject.reference;
    const issues: Issue[] = [];
    const observations: Observation[] = [];

    for (const [index, day] of file.days.entries()) {
      if (request.window && (day.date < dayOf(request.window.start) || day.date > dayOf(request.window.end))) continue;

      const missing = day.steps === null;
      const value = missing && this.defect === 'zero-for-missing' ? 0 : day.steps;
      const measured = quantity(value, UCUM.STEPS);
      const valueQuantity =
        measured && this.defect === 'no-ucum' ? { value: measured.value, unit: measured.unit } : measured;
      const observation = createObservation({
        id: deterministicId({
          connector: id,
          subjectKey: request.subjectKey,
          recordId: day.date,
          measure: 'daily-steps'
        }),
        code: { system: FAKE_STEPS_SYSTEM, code: 'daily-steps', display: 'Daily step count (synthetic)' },
        category: CATEGORY.ACTIVITY,
        subject: subjectReference,
        effectiveDateTime: day.date,
        valueQuantity,
        dataAbsentReason: valueQuantity ? undefined : dataAbsentReason('unknown'),
        meta: this.defect === 'drops-meta-tag' ? undefined : connectorMeta({ connector: id, version })
      });
      observations.push(
        this.defect === 'no-status' ? ({ ...observation, status: undefined } as unknown as Observation) : observation
      );

      if (missing) {
        const details =
          this.defect === 'leaks-payload'
            ? `no steps for ${file.user} on ${day.date}: ${JSON.stringify(day)}`
            : 'A day in the window has no step count; recorded as dataAbsentReason';
        issues.push(this.issue('information', 'missing-value', details, `days[${index}]`));
      }
    }

    const first = observations[0];

    if (this.defect === 'extra-observation' && first) {
      observations.push({
        ...first,
        id: deterministicId({
          connector: id,
          subjectKey: request.subjectKey,
          recordId: 'extra',
          measure: 'daily-steps'
        })
      });
    }

    if (this.defect === 'leaks-payload') this.host.logger?.debug('read', { user: file.user });

    const bundleKey =
      this.defect === 'random-id'
        ? `${this.bundleKeyFor(request)}|${Math.random()}`
        : this.defect === 'window-ignored'
          ? `${id}|${request.subjectKey}`
          : this.bundleKeyFor(request);
    const bundle = buildBundle({
      connector: this.connector,
      resources: [...(subject.patient ? [subject.patient] : []), ...observations],
      timestamp: this.now(),
      bundleKey
    });

    if (this.defect === 'non-uuid-id') {
      for (const [index, entry] of (bundle.entry ?? []).entries()) {
        if (entry.resource?.resourceType === 'Observation') entry.resource.id = `steps-${index}`;
      }
    }

    const fixture =
      input.kind === 'file' && input.path
        ? { path: input.path, provenance: 'packages/reader-core/src/tests/fixtures/PROVENANCE.md' }
        : undefined;
    return { bundle, issues, provenance: this.provenanceFor(bundle, { id }, fixture) };
  }
}
