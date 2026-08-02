# Finding: modules with no external correctness authority

These exporting modules declare

`CORRECTNESS: NONE — see docs/findings/no-external-authority.md`

because no UCUM grammar check, HL7 validator target, signed terminology
review, recorded API oracle, or golden fixture currently backs them.
This is an inventory, not a licence to invent authority.

Count: **68**

- `packages/aggregate/src/aggregate.ts`
- `packages/aggregate/src/index.ts`
- `packages/aggregate/src/measure.ts`
- `packages/aggregate/src/select.ts`
- `packages/fhir-core/src/errors.ts`
- `packages/fhir-core/src/index.ts`
- `packages/fhir-core/src/provenance.ts`
- `packages/fhir-core/src/referenceRange.ts`
- `packages/fhir-core/src/reliability.ts`
- `packages/fhir-r4/src/index.ts`
- `packages/fhir-r4/src/issues.ts`
- `packages/genomics-vcf/src/index.ts`
- `packages/genomics-vcf/src/issues.ts`
- `packages/hl7v2/src/index.ts`
- `packages/hl7v2/src/issues.ts`
- `packages/provider-google-health/src/api/client.ts`
- `packages/provider-google-health/src/api/record_types.ts`
- `packages/provider-google-health/src/config/config.ts`
- `packages/provider-google-health/src/config/constants.ts`
- `packages/provider-google-health/src/index.ts`
- `packages/provider-open-wearables/src/api/parse.ts`
- `packages/provider-open-wearables/src/api/schemas/common.ts`
- `packages/provider-open-wearables/src/api/schemas/events.ts`
- `packages/provider-open-wearables/src/api/schemas/timeseries.ts`
- `packages/provider-open-wearables/src/config/constants.ts`
- `packages/provider-open-wearables/src/fixtures/openWearablesSync.ts`
- `packages/provider-open-wearables/src/index.ts`
- `packages/provider-oura/src/api/client.ts`
- `packages/provider-oura/src/api/endpoints.ts`
- `packages/provider-oura/src/api/schemas/auth.ts`
- `packages/provider-oura/src/api/schemas/cardiovascular.ts`
- `packages/provider-oura/src/api/schemas/client.ts`
- `packages/provider-oura/src/api/schemas/daily.ts`
- `packages/provider-oura/src/api/schemas/heartrate.ts`
- `packages/provider-oura/src/api/schemas/personal.ts`
- `packages/provider-oura/src/api/schemas/readiness.ts`
- `packages/provider-oura/src/api/schemas/resilience.ts`
- `packages/provider-oura/src/api/schemas/restmode.ts`
- `packages/provider-oura/src/api/schemas/ringconfig.ts`
- `packages/provider-oura/src/api/schemas/session.ts`
- `packages/provider-oura/src/api/schemas/sleep.ts`
- `packages/provider-oura/src/api/schemas/spo2.ts`
- `packages/provider-oura/src/api/schemas/stress.ts`
- `packages/provider-oura/src/api/schemas/vo2max.ts`
- `packages/provider-oura/src/api/schemas/workout.ts`
- `packages/provider-oura/src/config/config.ts`
- `packages/provider-oura/src/config/constants.ts`
- `packages/provider-oura/src/index.ts`
- `packages/provider-oura/src/utils/clientUtils.ts`
- `packages/provider-oura/src/utils/errorMessageHandler.ts`
- `packages/provider-oura/src/utils/objectUtils.ts`
- `packages/provider-oura/src/utils/tokenUtils.ts`
- `packages/provider-oura/src/utils/typeUtils.ts`
- `packages/provider-vitronic/src/api/client.ts`
- `packages/provider-vitronic/src/api/schemas/angle.ts`
- `packages/provider-vitronic/src/api/schemas/axes.ts`
- `packages/provider-vitronic/src/api/schemas/common.ts`
- `packages/provider-vitronic/src/api/schemas/crosssection.ts`
- `packages/provider-vitronic/src/api/schemas/distance.ts`
- `packages/provider-vitronic/src/api/schemas/height.ts`
- `packages/provider-vitronic/src/api/schemas/marker.ts`
- `packages/provider-vitronic/src/api/schemas/proband.ts`
- `packages/provider-vitronic/src/api/schemas/properties.ts`
- `packages/provider-vitronic/src/api/schemas/shared.ts`
- `packages/provider-vitronic/src/api/schemas/viatars.ts`
- `packages/provider-vitronic/src/config/config.ts`
- `packages/provider-vitronic/src/config/constants.ts`
- `packages/provider-vitronic/src/index.ts`
