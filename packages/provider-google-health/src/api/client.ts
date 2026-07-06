import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { health } from '@googleapis/health';
import { type Auth, google, type health_v4 } from 'googleapis';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.location.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
  'https://www.googleapis.com/auth/googlehealth.settings.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
];

export class GoogleHealthClient {
  private client: health_v4.Health;
  private oauth2Client: Auth.OAuth2Client;

  constructor() {
    this.client = health('v4');

    this.oauth2Client = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      process.env.REDIRECT_URI
    );
  }

  /**
   * Build the consent URL the user must visit to authorize access.
   * The `code` returned by this flow only carries the scopes requested here,
   * so this must be regenerated (and re-consented) whenever SCOPES change.
   */
  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES
    });
  }

  async initialize(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);

    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  authenticate(credentials?: Auth.Credentials): void {
    if (credentials) {
      this.oauth2Client.setCredentials(credentials);
    }

    const healthOptions: health_v4.Options = {
      version: 'v4',
      auth: this.oauth2Client
    };
    this.client = health(healthOptions);
  }

  getClient(): health_v4.Health {
    return this.client;
  }

  getHealthDataSources() {
    return this.client.users.dataTypes;
  }

  async getActivityData(): Promise<health_v4.Schema$Exercise[]> {
    const response = await this.client.users.dataTypes.dataPoints.list({
      parent: 'users/me/dataTypes/exercise'
    });

    const dataPoints = response.data.dataPoints ?? [];

    return dataPoints
      .map((point) => point.exercise as health_v4.Schema$Exercise)
      .filter((exercise) => exercise !== undefined);
  }

  async getSleepData(): Promise<health_v4.Schema$Sleep[]> {
    const response = await this.client.users.dataTypes.dataPoints.list({
      parent: 'users/me/dataTypes/sleep'
    });

    const dataPoints = response.data.dataPoints ?? [];

    return dataPoints.map((point) => point.sleep as health_v4.Schema$Sleep).filter((sleep) => sleep !== undefined);
  }
}
