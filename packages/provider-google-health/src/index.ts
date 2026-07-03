import type { health_v4 } from 'googleapis';
import { GoogleHealthClient } from './api/client';

export async function initializeGoogleHealthClient(code: string): Promise<void> {
  const googleHealthClient = new GoogleHealthClient();
  return await googleHealthClient.initialize(code);
}

export async function getHealthTypes(): Promise<health_v4.Resource$Users$Datatypes> {
  const googleHealthClient = new GoogleHealthClient();
  await googleHealthClient.authenticate();
  return googleHealthClient.getHealthDataSources();
}
