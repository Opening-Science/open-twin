// `as const` is load-bearing: without it `SystemScope` widens to `string`, and
// `BodyLoopClientConfig.scope` — the package's public entry point — accepts any
// string and posts it straight into the OAuth token request.
export const SYSTEM_SCOPES = [
  'admin',
  'bodyloop_zero',
  'bodyloop_starter',
  'bodyloop_pro',
  'cloud_connect',
  'external_auth',
  'health_device'
] as const;

export const SCOPES = ['angle', 'distance', 'marker', 'axis', 'cross_section', 'height', 'properties'] as const;

export type Scope = (typeof SCOPES)[number];
export type Scopes = Scope[];

export const ENDPOINTS = {
  VIATAR: (viatarId: string) => `/api/v2/viatars/${viatarId}`,
  VIATARS: () => '/api/v2/viatars/',
  VIATAR_START: (viatarId: string) => `/api/v2/viatars/${viatarId}/targets/`,
  PROBANDS: () => '/api/v2/probands/',
  ANGLE: (viatarId: string) => `/api/v2/viatars/${viatarId}/angles/`,
  DISTANCE: (viatarId: string) => `/api/v2/viatars/${viatarId}/distances/`,
  MARKER: (viatarId: string) => `/api/v2/viatars/${viatarId}/markers/`,
  AXIS: (viatarId: string) => `/api/v2/viatars/${viatarId}/axes/`,
  CROSS_SECTION: (viatarId: string) => `/api/v2/viatars/${viatarId}/crosssections/`,
  HEIGHT: (viatarId: string) => `/api/v2/viatars/${viatarId}/heights/`,
  PROPERTIES: (viatarId: string) => `/api/v2/viatars/${viatarId}/properties/`,
  AUTH: () => '/api/v2/authentification/token',
  MODELS: (viatarId: string) => `/api/v2/viatars/${viatarId}/models/`,
  MODEL: (viatarId: string, modelName?: string) => `/api/v2/viatars/${viatarId}/models/${modelName}`
};

export type SystemScope = (typeof SYSTEM_SCOPES)[number];
