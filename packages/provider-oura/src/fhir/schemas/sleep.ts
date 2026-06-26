import { OuraSleep, OuraSleepList } from "../../api/schemas/sleep";
import { FhirObservation } from "./shared";

// Standard FHIR Systems
const SYSTEMS = {
  LOINC: "http://loinc.org",
  SNOMED: "http://snomed.info/sct",
  OURA_CUSTOM: "https://ouraring.com/custom-system",
  OURA_EXT: "https://ouraring.com/fhir/StructureDefinition",
};

export function mapOuraSleepToFHIR(ouraData: OuraSleepList): FhirObservation[] {
  if (!ouraData || !ouraData.data || ouraData.data.length === 0) {
    throw new Error("No sleep data available to map to FHIR.");
  }
  const fhirObservations: FhirObservation[] = [];

  for (const sleep of ouraData.data) {
    console.log("Mapping Oura sleep data to FHIR Observation:", sleep);
    const components: any[] = [];
    const extensions: any[] = [];

    const addComponent = (
      value: number | undefined,
      code: string,
      system: string,
      display?: string,
    ) => {
      if (value !== undefined) {
        components.push({
          code: {
            coding: [{ system, code, ...(display && { display }) }],
          },
          valueQuantity: { value },
        });
      }
    };

    const addExtension = (urlFragment: string, value: string | undefined) => {
      if (value !== undefined) {
        extensions.push({
          url: `${SYSTEMS.OURA_EXT}/${urlFragment}`,
          valueString: value,
        });
      }
    };

    // 1. Map Top-Level Components
    addComponent(
      sleep.readiness_score_delta,
      "readiness_score_delta",
      SYSTEMS.OURA_CUSTOM,
    );
    addComponent(
      sleep.rem_sleep_duration,
      "93829-0",
      SYSTEMS.LOINC,
      "REM sleep duration",
    );
    addComponent(
      sleep.restless_periods,
      "restless_periods",
      SYSTEMS.OURA_CUSTOM,
    );
    addComponent(
      sleep.sleep_score_delta,
      "sleep_score_delta",
      SYSTEMS.OURA_CUSTOM,
    );
    addComponent(sleep.time_in_bed, "103214-3", SYSTEMS.LOINC, "Time in bed");
    addComponent(
      sleep.total_sleep_duration,
      "93832-4",
      SYSTEMS.LOINC,
      "Total sleep duration",
    );
    addComponent(
      sleep.temperature_deviation,
      "temperature_deviation",
      SYSTEMS.OURA_CUSTOM,
    );
    addComponent(
      sleep.temperature_trend_deviation,
      "temperature_trend_deviation",
      SYSTEMS.OURA_CUSTOM,
    );

    // 2. Map Flattened Metrics to Components (Replaces legacy 'contributors')
    addComponent(
      sleep.deep_sleep_duration,
      "93831-6",
      SYSTEMS.LOINC,
      "Deep sleep duration",
    );
    addComponent(
      sleep.efficiency,
      "248263006",
      SYSTEMS.SNOMED,
      "Sleep efficiency",
    );
    addComponent(sleep.latency, "103212-7", SYSTEMS.LOINC, "Sleep latency");
    addComponent(
      sleep.lowest_heart_rate,
      "40443-4",
      SYSTEMS.LOINC,
      "Resting heart rate",
    );
    addComponent(
      sleep.average_heart_rate,
      "average_heart_rate",
      SYSTEMS.OURA_CUSTOM,
    );
    addComponent(sleep.average_breath, "average_breath", SYSTEMS.OURA_CUSTOM);
    addComponent(sleep.average_hrv, "average_hrv", SYSTEMS.OURA_CUSTOM);
    addComponent(sleep.awake_time, "awake_time", SYSTEMS.OURA_CUSTOM);
    addComponent(
      sleep.light_sleep_duration,
      "light_sleep_duration",
      SYSTEMS.OURA_CUSTOM,
    );

    // 3. Map Extensions
    addExtension("day", sleep.day);
    addExtension("sleep_phase_30_sec", sleep.sleep_phase_30_sec);
    addExtension("sleep_phase_5_min", sleep.sleep_phase_5_min);
    addExtension("app_sleep_phase_5_min", sleep.app_sleep_phase_5_min);

    // 4. Construct the base Observation resource
    const observation: FhirObservation = {
      resourceType: "Observation",
      status: "final",
      code: {
        coding: [
          {
            system: SYSTEMS.OURA_CUSTOM,
            code: "sleep",
            display: "Oura Sleep Observation",
          },
        ],
      },
      subject: {
        reference: "Patient/example",
      },
      identifier: [
        {
          system: "https://ouraring.com/sleep/id",
          value: sleep.id,
        },
      ],
      effectivePeriod: {
        start: sleep.bedtime_start,
        end: sleep.bedtime_end,
      },
    };

    // 5. Map remaining properties
    if (sleep.score !== undefined) {
      observation.valueQuantity = {
        value: sleep.score,
        system: SYSTEMS.OURA_CUSTOM,
        code: "sleep_score",
      };
    }

    if (sleep.type) {
      observation.category = [
        {
          coding: [{ system: SYSTEMS.OURA_CUSTOM, code: sleep.type }],
        },
      ];
    }

    if (sleep.sleep_algorithm_version) {
      observation.method = { text: sleep.sleep_algorithm_version };
    }

    if (sleep.sleep_analysis_reason) {
      observation.note = [{ text: sleep.sleep_analysis_reason }];
    }

    if (sleep.ring_id) {
      observation.device = { reference: `Device/${sleep.ring_id}` };
    }

    if (extensions.length > 0) {
      observation.extension = extensions;
    }

    if (components.length > 0) {
      observation.component = components;
    }

    fhirObservations.push(observation);
  }
  return fhirObservations;
}
