// One call per session, returning episodes as structured output. Output that
// fails the tiling check is rejected, not repaired silently
// (docs/SPEC-gate0.md §6 step 3).
import { call } from './client.ts';
import { codebookBlock, transcriptBlock, segmentInstruction, promptHash } from './prompt.ts';
import type { Episode, Session, CallUsage } from '../contract/types.ts';

interface ProposedEpisode {
  code: string;
  start_turn_id: string;
  end_turn_id: string;
}

/** The shape the segmentation answer must take (SPEC §6 step 3). */
const EPISODES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['episodes'],
  properties: {
    episodes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'start_turn_id', 'end_turn_id'],
        properties: {
          code: { type: 'string' },
          start_turn_id: { type: 'string' },
          end_turn_id: { type: 'string' },
        },
      },
    },
  },
};

export interface SegmentResult {
  episodes: Episode[];
  usage: CallUsage;
  prompt_hash: string;
  /** Touching pieces with the same code that were joined into one episode. */
  merged_adjacent: number;
}

function parseEpisodes(text: string): ProposedEpisode[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`the model returned no JSON object:\n${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as { episodes?: ProposedEpisode[] };
  if (!Array.isArray(parsed.episodes) || parsed.episodes.length === 0) {
    throw new Error('the model returned no episodes');
  }
  return parsed.episodes;
}

/**
 * Rejects rather than repairs. A tiling this project patched up would be a
 * tiling nobody could check the model on, and the tiling is the claim.
 */
function checkTiling(session: Session, proposed: ProposedEpisode[], codes: Set<string>): void {
  const order = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  let expected = 0;

  proposed.forEach((e, i) => {
    const start = order.get(e.start_turn_id);
    const end = order.get(e.end_turn_id);
    if (start === undefined) throw new Error(`episode ${i}: start_turn_id ${e.start_turn_id} is not in ${session.session_id}`);
    if (end === undefined) throw new Error(`episode ${i}: end_turn_id ${e.end_turn_id} is not in ${session.session_id}`);
    if (end < start) throw new Error(`episode ${i}: ends (${e.end_turn_id}) before it starts (${e.start_turn_id})`);
    if (!codes.has(e.code)) throw new Error(`episode ${i}: code "${e.code}" is not in the codebook for this session`);
    if (start !== expected) {
      const what = start > expected ? 'gap' : 'overlap';
      throw new Error(`episode ${i}: ${what} at turn index ${expected} — tiling violated (D4)`);
    }
    expected = end + 1;
  });

  if (expected !== session.turns.length) {
    throw new Error(`the episodes cover ${expected} of ${session.turns.length} turns — tiling violated (D4)`);
  }
}

/**
 * The same join as segmentSession applies, for episodes already built: touching
 * episodes with the same code become one, with ids renumbered in order.
 */
export function joinTouching(session: Session, episodes: Episode[]): { episodes: Episode[]; merged: number } {
  const order = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  const sorted = [...episodes].sort(
    (a, b) => (order.get(a.start_turn_id) ?? 0) - (order.get(b.start_turn_id) ?? 0),
  );
  const joined: Episode[] = [];
  let merged = 0;
  for (const e of sorted) {
    const previous = joined[joined.length - 1];
    if (previous && previous.EPISODE === e.EPISODE) {
      previous.end_turn_id = e.end_turn_id;
      previous.evidence = [...previous.evidence, ...e.evidence];
      merged += 1;
    } else {
      joined.push({ ...e, evidence: [...e.evidence] });
    }
  }
  const renumbered = joined.map((e, i) => ({
    ...e,
    _id: String(i),
    episode_id: `ep-${e.run_id}-${session.session_id}-${String(i + 1).padStart(3, '0')}`,
  }));
  return { episodes: renumbered, merged };
}

export async function segmentSession(
  session: Session,
  runId: string,
  codebookVersion: string,
  domain: string,
  allowedCodes: Set<string>,
): Promise<SegmentResult> {
  const blocks = [codebookBlock(session.has_timestamps, domain), transcriptBlock(session)];
  const instruction = segmentInstruction(session);

  const { text, usage } = await call({
    cacheablePrefix: blocks,
    instruction,
    // Well above the answer: thinking is charged against the same allowance.
    maxTokens: 16000,
    schema: EPISODES_SCHEMA,
  });
  const proposed = parseEpisodes(text);
  checkTiling(session, proposed, allowedCodes);

  // An episode is one contiguous stretch of one kind of work (codebook), so two
  // touching pieces with the same code are one episode. Joining them changes
  // no turn's label, so no agreement figure moves; it does change how many
  // steps the report draws. It is not silent: the count is kept on the run.
  const joined: ProposedEpisode[] = [];
  let merged_adjacent = 0;
  for (const e of proposed) {
    const previous = joined[joined.length - 1];
    if (previous && previous.code === e.code) {
      previous.end_turn_id = e.end_turn_id;
      merged_adjacent += 1;
    } else {
      joined.push({ ...e });
    }
  }

  const order = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  const episodes: Episode[] = joined.map((e, i) => {
    const start = order.get(e.start_turn_id) ?? 0;
    const end = order.get(e.end_turn_id) ?? start;
    const ordinal = String(i + 1).padStart(3, '0');
    return {
      _id: String(i),
      // Stable and addressable: run, session, ordinal (§5.3).
      episode_id: `ep-${runId}-${session.session_id}-${ordinal}`,
      run_id: runId,
      identifiedBy: 'AI',
      layer_id: 'episodes',
      codebook_version: codebookVersion,
      domain,
      EPISODE: e.code,
      start_turn_id: e.start_turn_id,
      end_turn_id: e.end_turn_id,
      evidence: session.turns.slice(start, end + 1).map((t) => t.turn_id),
      reviewer_id: null,
      reviewed_at: null,
    };
  });

  return { episodes, usage, prompt_hash: promptHash(blocks, instruction), merged_adjacent };
}
