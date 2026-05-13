import { z } from 'zod';

export const IncidentCreateSchema = z.object({
  title: z.string().min(1),
  service: z.string().min(1),
  source: z.enum(['webhook', 'api', 'log', 'agent']).default('api'),
  raw_payload: z.any().optional(),
  hash_fingerprint: z.string().min(1),
});

export const IncidentUpdateSchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved']).optional(),
  priority: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
});
