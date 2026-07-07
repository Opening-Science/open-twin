import { health } from '@googleapis/health';
import { type Auth, google, type health_v4 } from 'googleapis';
import { type AllType, type AllTypes, buildTypeFilter } from './record_types';

const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.location.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
  'https://www.googleapis.com/auth/googlehealth.settings.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.nutrition.readonly'
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

  async getTypes({
    types,
    start_date,
    end_date
  }: {
    types: AllTypes;
    start_date?: string;
    end_date?: string;
  }): Promise<health_v4.Schema$ListDataPointsResponse[]> {
    const responses: health_v4.Schema$ListDataPointsResponse[] = [];

    for (const type of types) {
      const response = await this.client.users.dataTypes.dataPoints.list({
        filter: buildTypeFilter(type as AllType, start_date, end_date),
        parent: `users/me/dataTypes/${type}`
      });
      responses.push(response.data);
    }

    return responses;
  }
}
