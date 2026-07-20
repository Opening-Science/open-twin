export const SYSTEM_SCOPES = [
  'admin',
  'bodyloop_zero',
  'bodyloop_starter',
  'bodyloop_pro',
  'cloud_connect',
  'external_auth',
  'health_device'
];

export const SCOPES = ['angle', 'distance', 'marker', 'axis', 'cross_section', 'height', 'properties'];

export const ENDPOINTS = {
  ANGLE: (viatarId: string) => `/api/v2/viatars/${viatarId}/angles`,
  DISTANCE: (viatarId: string) => `/api/v2/viatars/${viatarId}/distances`,
  MARKER: (viatarId: string) => `/api/v2/viatars/${viatarId}/markers`,
  AXIS: (viatarId: string) => `/api/v2/viatars/${viatarId}/axes`,
  CROSS_SECTION: (viatarId: string) => `/api/v2/viatars/${viatarId}/crosssections`,
  HEIGHT: (viatarId: string) => `/api/v2/viatars/${viatarId}/heights`
};

export type SystemScope = (typeof SYSTEM_SCOPES)[number];
