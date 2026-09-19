// Layer 2's model call: one per session, for every classifiable item at once.
//
// The prompt is composed from codebook.tutor-moves.json and nothing else of
// ours: its codes, definitions, include and exclude lists, and its note on
// NONE (CLAUDE.md rule 10). The episode codes never reach it: this layer
// classifies a tutor turn and never labels an episode (the layer codebook's
// note_on_independence). Output that names an item twice, misses one, names
// one that was not asked about, or uses a code outside the five is rejected,
// not repaired, the way segment.ts treats a broken tiling.
import { call } from '../pipeline/client.ts';
import { promptHash } from '../pipeline/prompt.ts';
import { loadMovesCodebook, type MovesCodebook } from './codebook.ts';
import type { MoveItem } from './items.ts';
import type { CallUsage, Session } from '../contract/types.ts';

export interface MoveLabel {
  preceding_turn_id: string;
  code: string;
}

export interface ClassifyResult {
  /** One per classifiable item, in the items' order. */
  labels: MoveLabel[];
  /** Null when the session has no classifiable item, and so no call was made. */
  usage: CallUsage | null;
  prompt_hash: string | null;
  codebook_version: string;
}

/** Stable across every call: the layer codebook, and only that. */
export function movesCodebookBlock(book: MovesCodebook): string {
  const codes = book.codes.map((c) =>
    [
      `CODE ${c.code}`,
      `Definition: ${c.definition}`,
      `Include: ${c.include.join('; ')}`,
      `Exclude: ${c.exclude.join('; ')}`,
    ].join('\n'),
  );
  return [
    `TUTOR-MOVE CODEBOOK, version ${book.codebook_version}. Exactly one code applies to each tutor turn.`,
    ...codes,
    `On NONE: ${book.note_on_none}`,
  ].join('\n\n');
}

/** Varies per session: the tutor turns to classify, each with the student turn after it. */
export function movesInstruction(session: Session, items: MoveItem[]): string {
  const listed = items.map((item) =>
    [
      `ITEM ${item.preceding_turn.turn_id}`,
      `Tutor turn (${item.preceding_turn.role}): ${item.preceding_turn.content}`,
      `Next turn (${item.opening_turn.role}): ${item.opening_turn.content}`,
    ].join('\n'),
  );
  return [
    `Below are ${items.length} tutor turns from session ${session.session_id}, each followed by the student turn after it.`,
    'Classify each tutor turn with exactly one code from the tutor-move codebook. Classify only what the tutor turn itself does; the next turn is context, not the thing classified.',
    'Answer with one entry per item: preceding_turn_id is the id after ITEM, and code is one of the codebook codes.',
    ...listed,
  ].join('\n\n');
}

function movesSchema(codes: string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['preceding_turn_id', 'code'],
          properties: {
            preceding_turn_id: { type: 'string' },
            code: { type: 'string', enum: codes },
          },
        },
      },
    },
  };
}

/**
 * Checks the answer against the items asked about. Throws on the first
 * problem; returns labels in the items' order.
 */
export function checkLabels(text: string, asked: MoveItem[], codes: Set<string>): MoveLabel[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`the model returned no JSON object:\n${text.slice(0, 400)}`);
  }
  const parsed = JSON.parse(text.slice(start, end + 1)) as { items?: unknown };
  if (!Array.isArray(parsed.items)) throw new Error('the model returned no items array');

  const expected = new Set(asked.map((item) => item.preceding_turn.turn_id));
  const got = new Map<string, string>();
  parsed.items.forEach((raw: unknown, i: number) => {
    const entry = raw as { preceding_turn_id?: unknown; code?: unknown };
    const id = entry.preceding_turn_id;
    const code = entry.code;
    if (typeof id !== 'string') throw new Error(`answer ${i}: no preceding_turn_id`);
    if (!expected.has(id)) throw new Error(`answer ${i}: ${id} is not one of the turns asked about`);
    if (got.has(id)) throw new Error(`answer ${i}: ${id} is answered more than once`);
    if (typeof code !== 'string' || !codes.has(code)) {
      throw new Error(`answer ${i}: code "${String(code)}" is not a tutor-move code`);
    }
    got.set(id, code);
  });

  const missing = [...expected].filter((id) => !got.has(id));
  if (missing.length > 0) throw new Error(`no answer for ${missing.length} turn(s): ${missing.join(', ')}`);

  return asked.map((item) => ({
    preceding_turn_id: item.preceding_turn.turn_id,
    code: got.get(item.preceding_turn.turn_id) ?? '',
  }));
}

export async function classifySession(session: Session, items: MoveItem[]): Promise<ClassifyResult> {
  const book = loadMovesCodebook();
  const asked = items.filter((item) => item.classifiable);
  if (asked.length === 0) {
    return { labels: [], usage: null, prompt_hash: null, codebook_version: book.codebook_version };
  }

  const codes = book.codes.map((c) => c.code);
  const blocks = [movesCodebookBlock(book)];
  const instruction = movesInstruction(session, asked);

  const { text, usage } = await call({
    cacheablePrefix: blocks,
    instruction,
    // Well above the answer: thinking is charged against the same allowance.
    maxTokens: 16000,
    schema: movesSchema(codes),
  });

  return {
    labels: checkLabels(text, asked, new Set(codes)),
    usage,
    prompt_hash: promptHash(blocks, instruction),
    codebook_version: book.codebook_version,
  };
}
