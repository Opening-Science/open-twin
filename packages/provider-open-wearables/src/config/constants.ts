/**
 * Identity and namespaces for the Open Wearables connector.
 *
 * Open Wearables (https://github.com/the-momentum/open-wearables) is a self-hosted
 * MIT-licensed platform that ingests Apple Health, Fitbit, Garmin, Google Health
 * Connect, Oura, Polar, Samsung Health, Sensorbio, Strava, Suunto, Ultrahuman and
 * Whoop and normalises them onto one schema. This connector maps that one schema —
 * not any individual vendor — so a single mapper covers every provider the platform
 * supports, including the two on-device sources a server-side Node connector cannot
 * reach on its own.
 */
export const CONNECTOR = {
  connector: 'open-wearables',
  /** Asserted equal to package.json by `bundleBuilder.integration.test.ts`. */
  version: '0.1.0'
} as const;

/**
 * Foundation-controlled code system for Open Wearables concepts that have no
 * verified LOINC or SNOMED CT concept (D3).
 *
 * This belongs in `SYSTEMS` in `@open-twin/fhir-core` alongside `SYSTEMS.OURA` and
 * friends, and in `verify/conformance/declarations.json`. Both files are shared and
 * this connector may not edit them, so the URI is declared here and the two
 * additions are reported as required shared changes. An unresolvable CodeSystem is
 * a validator *warning*, not an error — unlike an unresolvable extension — which is
 * why this connector invents no extension at all.
 */
export const OPEN_WEARABLES_SYSTEM = 'http://opentwin.ch/fhir/CodeSystem/open-wearables';

/** Foundation-controlled identifier namespace, used as `Identifier.system` (D2). */
export const OPEN_WEARABLES_IDENTIFIER_SYSTEM = 'http://opentwin.ch/fhir/sid/open-wearables';

/**
 * The endpoints whose response shapes this package parses.
 *
 * Recorded as documentation only: this package ships no HTTP client, because no
 * running Open Wearables instance was available to verify one against. See README.
 *
 * Source: backend/app/api/routes/v1/timeseries.py and .../events.py, plus
 * `docs/architecture/data-types.mdx`, which documents the API key header.
 */
export const ENDPOINTS = {
  TIMESERIES: (userId: string) => `/api/v1/users/${userId}/timeseries`,
  SLEEP_SESSIONS: (userId: string) => `/api/v1/users/${userId}/events/sleep`,
  WORKOUTS: (userId: string) => `/api/v1/users/${userId}/events/workouts`
} as const;

/** Documented in `docs/architecture/data-types.mdx`. Unverified against a server. */
export const API_KEY_HEADER = 'X-Open-Wearables-API-Key';
