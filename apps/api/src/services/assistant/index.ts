import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config';
import { claudeAnswer } from './claude';
import { localAnswer } from './local';
import type { AssistantReply, AssistantRequest } from './types';

export { assistantRequestSchema } from './types';

/** Claude cuando está configurado; si no, o si la API falla, el motor integrado. */
export function assistantProvider(): 'claude' | 'local' {
  if (config.ASSISTANT_PROVIDER === 'local') return 'local';
  if (config.ASSISTANT_PROVIDER === 'claude') return 'claude';
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'claude' : 'local';
}

export async function answer(req: AssistantRequest, customerId: string | null, log?: { warn: (o: object, msg: string) => void }): Promise<AssistantReply> {
  if (assistantProvider() === 'claude') {
    try {
      return await claudeAnswer(req, customerId);
    } catch (err) {
      // Error de la API (credenciales, límite, red): se responde igual con el motor integrado.
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      log?.warn({ status, err: err instanceof Error ? err.message : String(err) }, 'Asistente: Claude no disponible, se usa el motor integrado');
    }
  }
  return localAnswer(req, customerId);
}
