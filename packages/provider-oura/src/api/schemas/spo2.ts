import { z } from 'zod';
import { ResponseParams } from './client';

export const Spo2Schema = z.object({
  id: z.string().nonempty(),
  breathing_disturbance_index: z.number().min(0).max(100).nullable(),
  spo2_percentage: z.object({ average: z.number().min(0).max(100) }).nullable(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // Format: YYYY-MM-DD
});

export const Spo2ListSchema = ResponseParams.extend({
  data: z.array(Spo2Schema)
});

export type OuraSpo2 = z.infer<typeof Spo2Schema>;
export type OuraSpo2List = z.infer<typeof Spo2ListSchema>;

// npx tsx -e 'import { getFhirSpo2FromOuraData } from "./src/index.ts"; (async () => { try { const data = await getFhirSpo2FromOuraData({ type: "daily_spo2" }, "_0XBPWQQ_691a42e2-282d-4ebc-bbbb-98b3c18102d3"); console.log(JSON.stringify(data, null, 2)); } catch(err) { console.error(err); } })();'
