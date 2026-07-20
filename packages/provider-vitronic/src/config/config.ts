import type { SystemScope } from './constants';

export interface BodyLoopClientConfig {
  baseUrl: string;
  username: string;
  password: string;
  scope: SystemScope;
}
