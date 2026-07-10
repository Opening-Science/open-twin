import type { SupportedScope } from './constants';

export interface GoogleHealthAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: SupportedScope[];
}
