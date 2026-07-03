import { health } from '@googleapis/health';
import { type Auth, google, type health_v4 } from 'googleapis';

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

  async initialize(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
  }

  authenticate(): void {
    this.client = health({
      version: 'v4',
      auth: this.oauth2Client
    });
  }

  getClient(): health_v4.Health {
    return this.client;
  }

  getHealthDataSources() {
    return this.client.users.dataTypes;
  }

  async getSleepData(): Promise<health_v4.Schema$Sleep> {
    const response = await this.client.users.dataTypes.dataPoints.list({
      parent: 'users/me/dataTypes/com.google.sleep.segment'
    });
    return response;
  }
}
