import { OuraDailyActivityResponseList } from "../api/schemas/daily";
import { DailyActivityFhir, dailyActivityFhirSchema } from "./schemas/daily";

const LOINC_SYSTEM = "http://loinc.org";
const UCUM_SYSTEM = "http://unitsofmeasure.org";
// Custom system for Oura-specific metrics that have no standard LOINC code.
const OURA_SYSTEM = "https://cloud.ouraring.com";

export function convertDailyActivityToFhir(
  dailyActivity: OuraDailyActivityResponseList,
  patientId: string = "unknown",
): DailyActivityFhir[] {
  return dailyActivity.data.map((activity) => {
    const components: DailyActivityFhir["component"] = [];

    const addComponent = (
      value: number | undefined,
      coding: { system: string; code: string; display: string },
      unit: string,
      code: string,
    ) => {
      if (value === undefined) return;
      components.push({
        code: { coding: [coding] },
        valueQuantity: { value, unit, system: UCUM_SYSTEM, code },
      });
    };

    addComponent(
      activity.total_calories,
      {
        system: LOINC_SYSTEM,
        code: "41979-6",
        display: "Calories burned in 24 hours",
      },
      "kcal",
      "kcal",
    );
    addComponent(
      activity.active_calories,
      {
        system: LOINC_SYSTEM,
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
        system: OURA_SYSTEM,
        code: "target-calories",
        display: "Target Calories",
      },
      "kcal",
      "kcal",
    );

    addComponent(
      activity.score,
      {
        system: OURA_SYSTEM,
        code: "activity-score",
        display: "Oura Activity Score",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.meet_daily_targets,
      {
        system: OURA_SYSTEM,
        code: "meet-daily-targets",
        display: "Meet Daily Targets",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.move_every_hour,
      {
        system: OURA_SYSTEM,
        code: "move-every-hour",
        display: "Move Every Hour",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.recovery_time,
      {
        system: OURA_SYSTEM,
        code: "recovery-time",
        display: "Recovery Time",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.stay_active,
      {
        system: OURA_SYSTEM,
        code: "stay-active",
        display: "Stay Active",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.training_frequency,
      {
        system: OURA_SYSTEM,
        code: "training-frequency",
        display: "Training Frequency",
      },
      "score",
      "{score}",
    );
    addComponent(
      activity.contributors.training_volume,
      {
        system: OURA_SYSTEM,
        code: "training-volume",
        display: "Training Volume",
      },
      "score",
      "{score}",
    );

    addComponent(
      activity.average_met_minutes,
      { system: OURA_SYSTEM, code: "average-met", display: "Average MET" },
      "MET",
      "{MET}",
    );
    addComponent(
      activity.high_activity_met_minutes,
      {
        system: OURA_SYSTEM,
        code: "high-activity-met-minutes",
        display: "High Activity MET Minutes",
      },
      "MET-min",
      "min",
    );
    addComponent(
      activity.medium_activity_met_minutes,
      {
        system: OURA_SYSTEM,
        code: "medium-activity-met-minutes",
        display: "Medium Activity MET Minutes",
      },
      "MET-min",
      "min",
    );
    addComponent(
      activity.low_activity_met_minutes,
      {
        system: OURA_SYSTEM,
        code: "low-activity-met-minutes",
        display: "Low Activity MET Minutes",
      },
      "MET-min",
      "min",
    );
    addComponent(
      activity.sedentary_met_minutes,
      {
        system: OURA_SYSTEM,
        code: "sedentary-met-minutes",
        display: "Sedentary MET Minutes",
      },
      "MET-min",
      "min",
    );

    addComponent(
      activity.high_activity_time,
      {
        system: OURA_SYSTEM,
        code: "high-activity-time",
        display: "High Activity Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.medium_activity_time,
      {
        system: OURA_SYSTEM,
        code: "medium-activity-time",
        display: "Medium Activity Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.low_activity_time,
      {
        system: OURA_SYSTEM,
        code: "low-activity-time",
        display: "Low Activity Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.sedentary_time,
      {
        system: OURA_SYSTEM,
        code: "sedentary-time",
        display: "Sedentary Time",
      },
      "s",
      "s",
    );
    addComponent(
      activity.resting_time,
      { system: OURA_SYSTEM, code: "resting-time", display: "Resting Time" },
      "s",
      "s",
    );
    addComponent(
      activity.non_wear_time,
      { system: OURA_SYSTEM, code: "non-wear-time", display: "Non-wear Time" },
      "s",
      "s",
    );

    addComponent(
      activity.equivalent_walking_distance,
      {
        system: OURA_SYSTEM,
        code: "equivalent-walking-distance",
        display: "Equivalent Walking Distance",
      },
      "m",
      "m",
    );
    addComponent(
      activity.meters_to_target,
      {
        system: OURA_SYSTEM,
        code: "meters-to-target",
        display: "Meters to Target",
      },
      "m",
      "m",
    );
    addComponent(
      activity.target_meters,
      {
        system: OURA_SYSTEM,
        code: "target-meters",
        display: "Target Meters",
      },
      "m",
      "m",
    );

    addComponent(
      activity.inactivity_alerts,
      {
        system: OURA_SYSTEM,
        code: "inactivity-alerts",
        display: "Inactivity Alerts",
      },
      "count",
      "{count}",
    );

    const observation: DailyActivityFhir = {
      resourceType: "Observation",
      id: `oura-activity-${activity.id}`,
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

      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "55423-8",
            display: "Number of steps in 24 hour Measured",
          },
        ],
      },
      subject: {
        reference: `Patient/${patientId}`,
      },
      effectiveDateTime: new Date(activity.timestamp).toISOString(),

      valueQuantity: {
        value: activity.steps ?? 0,
        unit: "steps",
        system: "http://unitsofmeasure.org",
        code: "{steps}",
      },
      component: components,
    };

    return dailyActivityFhirSchema.parse(observation);
  });
}
