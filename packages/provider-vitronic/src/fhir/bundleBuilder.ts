import type { Bundle, Observation } from 'fhir/r4';
import type { BodyLoopClient } from '../api/client';
import type { AngleList } from '../api/schemas/angle';
import type { AxesList } from '../api/schemas/axes';
import type { CrossSectionList } from '../api/schemas/crosssection';
import type { DistanceList } from '../api/schemas/distance';
import type { HeightList } from '../api/schemas/height';
import type { MarkerList } from '../api/schemas/marker';
import type { PropertyList } from '../api/schemas/properties';
import type { Scope } from '../config/constants';
import { mapAngleListToFHIR } from './mappers/angle';
import { mapAxesListToFHIR } from './mappers/axes';
import { mapCrossSectionListToFHIR } from './mappers/crosssection';
import { mapDistanceListToFHIR } from './mappers/distance';
import { mapHeightListToFHIR } from './mappers/height';
import { mapMarkerListToFHIR } from './mappers/marker';
import { mapPropertyListToFHIR } from './mappers/properties';

export interface VitronicMeasurementResponse {
  angle?: AngleList;
  axis?: AxesList;
  cross_section?: CrossSectionList;
  distance?: DistanceList;
  height?: HeightList;
  marker?: MarkerList;
  properties?: PropertyList;
}

export function buildBundleFromVitronicResponse(response: VitronicMeasurementResponse): Bundle {
  const observations: Observation[] = [];

  if (response.angle) {
    observations.push(...mapAngleListToFHIR(response.angle));
  }
  if (response.axis) {
    observations.push(...mapAxesListToFHIR(response.axis));
  }
  if (response.cross_section) {
    observations.push(...mapCrossSectionListToFHIR(response.cross_section));
  }
  if (response.distance) {
    observations.push(...mapDistanceListToFHIR(response.distance));
  }
  if (response.height) {
    observations.push(...mapHeightListToFHIR(response.height));
  }
  if (response.marker) {
    observations.push(...mapMarkerListToFHIR(response.marker));
  }
  if (response.properties) {
    observations.push(...mapPropertyListToFHIR(response.properties));
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: observations.map((observation) => ({ resource: observation }))
  };
}

export async function getFhirBundleFromBodyloopMeasurementData(
  client: BodyLoopClient,
  viatarId: string,
  scopes: Scope[]
): Promise<Bundle> {
  const response = await client.getMeasurementsData(viatarId, scopes);

  const measurementData = Object.fromEntries(
    response.map((data, index) => [scopes[index], data])
  ) as VitronicMeasurementResponse;

  return buildBundleFromVitronicResponse(measurementData);
}
