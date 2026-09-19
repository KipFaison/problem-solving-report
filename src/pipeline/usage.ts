// Token accounting for every model call (README next steps 4 and 5).
//
// Kept per call rather than only in total, so a re-run can be compared call by
// call and a prompt change that doubles the bill is visible at the call that
// caused it. [OURS: no source; it is bookkeeping, not a measurement.]
import type { CallUsage, RunUsage } from '../contract/types.ts';

export const zeroUsage = (): CallUsage => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
});

/** What the Anthropic SDK returns on a message. Fields are optional there. */
export interface ApiUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function fromApi(u: ApiUsage | undefined): CallUsage {
  return {
    input_tokens: u?.input_tokens ?? 0,
    output_tokens: u?.output_tokens ?? 0,
    cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
  };
}

export class UsageLog {
  private readonly calls: RunUsage['per_call'] = [];

  /** Continue a run's log, so a later call on the same run is added, not substituted. */
  constructor(existing?: RunUsage) {
    if (existing) this.calls.push(...existing.per_call);
  }

  record(purpose: RunUsage['per_call'][number]['purpose'], usage: CallUsage, session_id?: string): void {
    this.calls.push(session_id ? { ...usage, purpose, session_id } : { ...usage, purpose });
  }

  totals(): CallUsage {
    return this.calls.reduce<CallUsage>((acc, c) => ({
      input_tokens: acc.input_tokens + c.input_tokens,
      output_tokens: acc.output_tokens + c.output_tokens,
      cache_creation_input_tokens: acc.cache_creation_input_tokens + c.cache_creation_input_tokens,
      cache_read_input_tokens: acc.cache_read_input_tokens + c.cache_read_input_tokens,
    }), zeroUsage());
  }

  toRunUsage(): RunUsage {
    return { calls: this.calls.length, totals: this.totals(), per_call: [...this.calls] };
  }

  /** One line for the console, so a run says what it cost while it runs. */
  summarise(): string {
    const t = this.totals();
    const cached = t.cache_read_input_tokens;
    const fresh = t.input_tokens;
    const pct = cached + fresh > 0 ? Math.round((cached / (cached + fresh)) * 100) : 0;
    return `${this.calls.length} calls · in ${fresh} · out ${t.output_tokens} · cache write ${t.cache_creation_input_tokens} · cache read ${cached} (${pct}% of input served from cache)`;
  }
}
