import { health } from '@googleapis/health';
import { type Auth, google, type health_v4 } from 'googleapis';
import type { GoogleHealthAppConfig } from '../config/config';
import { SUPPORTED_SCOPES } from '../config/constants';
import { type AllType, type AllTypes, buildTypeFilter } from './record_types';

export class GoogleHealthClient {
  private client: health_v4.Health;
  private oauth2Client: Auth.OAuth2Client;
  private config: GoogleHealthAppConfig;

  constructor(config: GoogleHealthAppConfig) {
    this.config = config;
    this.client = health('v4');

    this.oauth2Client = new google.auth.OAuth2(this.config.clientId, this.config.clientSecret, this.config.redirectUri);
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: this.config.scopes ?? SUPPORTED_SCOPES
    });
  }

  async initialize(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);

    this.oauth2Client.setCredentials(tokens);

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
