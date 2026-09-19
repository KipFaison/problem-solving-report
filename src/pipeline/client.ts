// The one place this project talks to a model.
//
// Prompt caching: a session is coded once per problem, and the codebook and the
// transcript are identical across those calls. The cacheable prefix is marked
// so the provider serves it from cache rather than re-reading it every time,
// and the saving is recorded in the usage log rather than assumed
// (README next steps 4 and 5).
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { fromApi, type ApiUsage } from './usage.ts';
import type { CallUsage } from '../contract/types.ts';

export interface ModelCall {
  /** Stable across calls and therefore cacheable: the composed codebook, then the transcript. */
  cacheablePrefix: string[];
  /** Varies per call: the instruction for this particular request. */
  instruction: string;
  maxTokens: number;
  /** The shape the answer must take. The API enforces it, so nothing downstream parses prose. */
  schema?: Record<string, unknown>;
}

export interface ModelResult {
  text: string;
  usage: CallUsage;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. It lives in .env, which is gitignored, and is never written into a file by this project.',
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

export async function call({ cacheablePrefix, instruction, maxTokens, schema }: ModelCall): Promise<ModelResult> {
  // A breakpoint on every prefix block, not only the last. The codebook block is
  // identical across every call this project makes; the transcript block is
  // identical across every call about one session. Two breakpoints mean a call
  // about a different session still hits the codebook, and a second pass over
  // the same session hits both (README next steps 4 and 5). The API allows four.
  const system = cacheablePrefix.slice(0, 4).map((text) => ({
    type: 'text' as const,
    text,
    cache_control: { type: 'ephemeral' as const },
  }));

  // This model thinks adaptively, and thinking is charged against the same
  // output allowance as the answer. Left to itself it can spend the whole
  // allowance thinking and return no text, which is how the first run failed:
  // one empty thinking block and stop_reason max_tokens. So max_tokens is set
  // well above what the answer needs, and the effort is explicit.
  const response = await getClient().messages.create({
    model: config.model.id,
    max_tokens: maxTokens,
    ...(config.model.thinking === 'adaptive' ? { thinking: { type: 'adaptive' as const } } : {}),
    output_config: {
      effort: config.model.effort,
      ...(schema ? { format: { type: 'json_schema' as const, schema } } : {}),
    },
    system,
    messages: [{ role: 'user', content: instruction }],
  });

  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      `the model hit max_tokens (${maxTokens}) and returned no complete answer. Raise it, or lower model.effort in config/gate0.json.`,
    );
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return { text, usage: fromApi(response.usage as ApiUsage) };
}
