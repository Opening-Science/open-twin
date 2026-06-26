import { OuraDailyActivityResponseList } from "../../api/schemas/daily";

import { FhirObservation } from "./shared";

const SYSTEMS = {
  LOINC: "http://loinc.org",
  SNOMED: "http://snomed.info/sct",
  OURA_CUSTOM: "https://cloud.ouraring.com/v2/docs",
  UCUM: "http://unitsofmeasure.org",
};

export function mapOuraDailyActivityToFHIR(
  dailyActivity: OuraDailyActivityResponseList,
  patientId: string = "unknown",
): FhirObservation[] {
  return dailyActivity.data.map((activity) => {
    const components: FhirObservation["component"] = [];

    const addComponent = (
      value: number | undefined,
      coding: { system: string; code: string; display: string },
      unit: string,
      code: string,
    ) => {
      if (value === undefined) return;
      components.push({
        code: { coding: [coding] },
        valueQuantity: { value, unit, system: SYSTEMS.UCUM, code },
      });
    };

    addComponent(
      activity.total_calories,
      {
        system: SYSTEMS.LOINC,
        code: "41979-6",
        display: "Calories burned in 24 hours",
      },
      "kcal",
      "kcal",
    );
    addComponent(
      activity.active_calories,
      {
        system: SYSTEMS.LOINC,
        code: "41981-2",
        display:
          "Calories burned in 24 hours with moderate to vigorous activity",
      },
      "kcal",
      "kcal",
    );
    addComponent(
      activity.target_calories,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "target-calories",
        display: "Target Calories",
      },
      "kcal",
      "kcal",
    );

    addComponent(
      activity.score,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "activity-score",
        display: "Oura Activity Score",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.meet_daily_targets,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "meet-daily-targets",
        display: "Meet Daily Targets",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.move_every_hour,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "move-every-hour",
        display: "Move Every Hour",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.recovery_time,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "recovery-time",
        display: "Recovery Time",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.stay_active,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "stay-active",
        display: "Stay Active",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.training_frequency,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "training-frequency",
        display: "Training Frequency",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.training_volume,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "training-volume",
        display: "Training Volume",
      },
      "score",
      "{score}",
    );

    addComponent(
      activity.average_met_minutes,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "average-met",
        display: "Average MET",
      },
      "MET",
      "{MET}",
    );
    addComponent(
      activity.high_activity_met_minutes,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "high-activity-met-minutes",
        display: "High Activity MET Minutes",
      },
      "MET-min",
      "min",
    );
    addComponent(
      activity.medium_activity_met_minutes,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "medium-activity-met-minutes",
        display: "Medium Activity MET Minutes",
      },
      "MET-min",
      "min",
    );
    addComponent(
      activity.low_activity_met_minutes,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "low-activity-met-minutes",
        display: "Low Activity MET Minutes",
      },
      "MET-min",
      "min",
    );
    addComponent(
      activity.sedentary_met_minutes,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "sedentary-met-minutes",
        display: "Sedentary MET Minutes",
      },
      "MET-min",
      "min",
    );

    addComponent(
      activity.high_activity_time,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "high-activity-time",
        display: "High Activity Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.medium_activity_time,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "medium-activity-time",
        display: "Medium Activity Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.low_activity_time,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "low-activity-time",
        display: "Low Activity Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.sedentary_time,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "sedentary-time",
        display: "Sedentary Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.resting_time,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "resting-time",
        display: "Resting Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.non_wear_time,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "non-wear-time",
        display: "Non-wear Time",
      },
      "s",
      "s",
    );

    addComponent(
      activity.equivalent_walking_distance,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "equivalent-walking-distance",
        display: "Equivalent Walking Distance",
      },
      "m",
      "m",
    );
    addComponent(
      activity.meters_to_target,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "meters-to-target",
        display: "Meters to Target",
      },
      "m",
      "m",
    );
    addComponent(
      activity.target_meters,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "target-meters",
        display: "Target Meters",
      },
      "m",
      "m",
    );

    addComponent(
      activity.inactivity_alerts,
      {
        system: SYSTEMS.OURA_CUSTOM,
        code: "inactivity-alerts",
        display: "Inactivity Alerts",
      },
      "count",
      "{count}",
    );
    addComponent(
      activity.steps,
      {
        system: SYSTEMS.LOINC,
        code: "41950-7",
        display: "Number of steps in 24 hours",
      },
      "steps",
      "steps",
    );

    const observation: FhirObservation = {
      resourceType: "Observation",
      identifier: [
        {
          system: SYSTEMS.OURA_CUSTOM,
          value: `oura-activity-${activity.id}`,
        },
      ],
      status: "final",
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "activity",
              display: "Activity",
            },
          ],
        },
      ],
      // Root code set to Activity Score
      code: {
        coding: [
          {
            system: SYSTEMS.OURA_CUSTOM,
            code: "activity-score",
            display: "Oura Activity Score",
          },
        ],
      },
      subject: {
        reference: `Patient/${patientId}`,
      },
      effectiveDateTime: new Date(activity.timestamp).toISOString(),
      valueQuantity: {
        value: activity.score ?? 0,
        unit: "score",
        system: SYSTEMS.UCUM,
        code: "{score}",
      },
      component: components.length > 0 ? components : undefined,
    };

    return observation;
  });
}
