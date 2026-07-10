import type { SupportedScope } from './constants';

export interface OuraRingAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: SupportedScope[];
}
