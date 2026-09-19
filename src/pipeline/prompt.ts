// The prompt, built only from the composed codebook, the transcript turns and
// fixed instructions about tiling and output shape (docs/SPEC-gate0.md §6).
//
// Nothing here restates a code definition: every word about what a code means
// comes from the loader, which reads codebook.v2.json (CLAUDE.md rule 10).
import { createHash } from 'node:crypto';
import { loadCodebookForSession, promptView } from '../codebook/load.ts';
import type { Session } from '../contract/types.ts';

/** Stable across every call: what a code means. Cached (client.ts). */
export function codebookBlock(hasTimestamps: boolean, domain?: string): string {
  const composed = loadCodebookForSession(hasTimestamps, domain);
  const view = promptView(composed);
  return [
    'CODEBOOK. These are the only labels you may use. Use the code values exactly as written.',
    JSON.stringify(view, null, 2),
  ].join('\n\n');
}

/** Stable across every call about one session. Cached (client.ts). */
export function transcriptBlock(session: Session): string {
  const turns = session.turns
    .map((t) => `${t.turn_id}\t${t.role}\t${t.content}`)
    .join('\n');
  return [
    `TRANSCRIPT of session ${session.session_id}. One turn per line: turn_id, speaker, text.`,
    turns,
  ].join('\n\n');
}

/** Varies per call. Everything the model must do, and the shape it answers in. */
export function segmentInstruction(session: Session): string {
  const first = session.turns[0]?.turn_id ?? '';
  const last = session.turns[session.turns.length - 1]?.turn_id ?? '';
  return [
    'Divide this session into episodes.',
    '',
    'An episode is a contiguous span of turns during which the participants are',
    'doing one kind of work, as the codebook defines it. Episodes span both',
    'speakers: a question and the answer it prompts are usually one episode, not',
    'two.',
    '',
    'Rules you must satisfy:',
    `1. The episodes must tile the session. Every turn from ${first} to ${last}`,
    '   belongs to exactly one episode. No gaps, no overlaps, in turn order.',
    '2. Use only the codes in the codebook above.',
    '3. Do not merge two kinds of work to avoid a short episode. A one-turn',
    '   episode is correct when one turn is what it took.',
    '4. One stretch of one kind of work is ONE episode. Never split it into',
    '   touching pieces with the same code.',
    '',
    'Answer with JSON only, no prose, in this shape:',
    '{"episodes":[{"code":"<code>","start_turn_id":"<id>","end_turn_id":"<id>"}]}',
  ].join('\n');
}

export function promptHash(blocks: string[], instruction: string): string {
  return createHash('sha256').update([...blocks, instruction].join('\n---\n')).digest('hex').slice(0, 16);
}
