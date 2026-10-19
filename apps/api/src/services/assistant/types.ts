import { z } from 'zod';
import type { ProductSummary } from './tools';

export const assistantRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1500) }))
    .min(1)
    .max(30)
    .refine((m) => m.at(-1)?.role === 'user', 'El último mensaje debe ser del cliente'),
  /** Producto que el cliente está viendo (o el último que mostró el asistente). */
  context: z.object({ sku: z.string().trim().max(60).optional() }).optional(),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export interface AssistantAction {
  label: string;
  url: string;
}

export interface AssistantReply {
  reply: string;
  provider: 'claude' | 'local';
  products?: ProductSummary[];
  actions?: AssistantAction[];
  suggestions?: string[];
}
