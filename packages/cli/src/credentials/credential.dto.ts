import { z } from 'zod';

export const createCredentialSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

export const updateCredentialSchema = createCredentialSchema.partial();
