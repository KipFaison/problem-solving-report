// One plain line per student-opened step, describing what was done in that
// exchange, for the report to show beside the quoted turn. One batched model
// call per report build.
//
// [OURS: a model's paraphrase of one exchange. It is not a code, not a count
// and not evidence about a learner; its evidence link is the turn it is keyed
// by. It is shown only as a description of the words quoted beside it.]
//
// The model is given, per item, the student turn that opens a model-run episode
// carrying tutor_prompting, the turn immediately before it and the turn after
// it, and nothing else: no codes, no aggregates, no other sessions.
//
// Every returned line is checked with the wording lint, and a line that fails
// is dropped, not rewritten, the way summarise.ts treats a failing sentence
// (docs/SPEC-gate0.md §6). A missing or rejected answer leaves that turn with
// no description; it never fails the report build.
import { call } from './client.ts';
import { checkText } from '../lint/wording.ts';
import type { CallUsage, Episode, Session, Turn } from '../contract/types.ts';

export interface DescribeItem {
  before: Turn;
  turn: Turn;
  after: Turn | null;
}

export interface DescribeResult {
  /** Keyed by the student turn's turn_id. */
  descriptions: Record<string, string>;
  dropped: Array<{ turn_id: string; text: string | null; reason: string }>;
  usage: CallUsage | null;
}

/**
 * The items of one session: the opening turn of every model-run episode that
 * carries tutor_prompting, with the turn before it and the turn after it.
 */
export function describeItems(session: Session, modelEpisodes: Episode[]): DescribeItem[] {
  const turns = [...session.turns].sort((x, y) => x.sequence_id - y.sequence_id);
  const positionOf = new Map(turns.map((turn, i) => [turn.turn_id, i]));
  const items: DescribeItem[] = [];
  for (const episode of modelEpisodes) {
    if (!episode.tutor_prompting) continue;
    const i = positionOf.get(episode.start_turn_id);
    if (i === undefined) continue;
    const turn = turns[i];
    const before = turns[i - 1];
    if (turn === undefined || before === undefined) continue;
    items.push({ before, turn, after: turns[i + 1] ?? null });
  }
  return items;
}

const RULES = [
  'You are writing one plain line for each exchange below, describing the action',
  'in the turn marked TURN. A student and a parent will read each line beside',
  'the quoted words of that turn.',
  '',
  'Hard rules. A line that breaks any one of them is dropped:',
  '- A verb phrase with no subject, or with the work as subject. Write "Worked',
  '  out that one part is 4 cups, by dividing 12 by 3." Never make "the',
  '  student", "they", "he", "she" or a name the subject.',
  '- Describe only what the words of TURN show was done. BEFORE and AFTER are',
  '  there only to make sense of TURN; do not describe them.',
  '- No judgement of quality: no "great", "smart", "strong", "good", "nice".',
  '- Never say what anyone knows, understands, realises or has learned.',
  '- Never use "unprompted", "initiated", "on their own", "decided", "chose"',
  '  or "led".',
  '- Never compare to anyone else.',
  '- One sentence, under 20 words.',
  '- If TURN shows no action to describe, answer with an empty description.',
].join('\n');

// [OURS: the words the owner ruled out for this field that the shared phrase
// list (lint/banned-phrases.json) does not cover. Checked here as well as by
// checkText, and a hit drops the line the same way.]
const FIELD_BANNED = ['unprompted', 'initiated', 'on their own', 'decided', 'chose', 'led', 'great', 'smart', 'strong'];
const FIELD_BANNED_RE = new RegExp(`\\b(${FIELD_BANNED.join('|').replace(/ /g, '\\s+')})\\b`, 'i');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['turn_id', 'description'],
        properties: {
          turn_id: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  },
};

function instructionFor(items: DescribeItem[]): string {
  const listed = items.map((item) =>
    [
      `ITEM ${item.turn.turn_id}`,
      `BEFORE (${item.before.role}): ${item.before.content}`,
      `TURN (${item.turn.role}): ${item.turn.content}`,
      item.after ? `AFTER (${item.after.role}): ${item.after.content}` : 'AFTER: none; the session ends here.',
    ].join('\n'),
  );
  return [
    `Below are ${items.length} exchanges. Write one line for each, following the rules.`,
    'Answer with one entry per item: turn_id is the id after ITEM, and description is the line.',
    ...listed,
  ].join('\n\n');
}

export async function describeQuotes(items: DescribeItem[]): Promise<DescribeResult> {
  if (items.length === 0) return { descriptions: {}, dropped: [], usage: null };

  const { text, usage } = await call({
    cacheablePrefix: [RULES],
    instruction: instructionFor(items),
    // Well above the answer: thinking is charged against the same allowance.
    maxTokens: 16000,
    schema: SCHEMA,
  });

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`the describe call returned no JSON:\n${text.slice(0, 400)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as { items?: Array<{ turn_id?: unknown; description?: unknown }> };

  const asked = new Set(items.map((item) => item.turn.turn_id));
  const answers = new Map<string, string[]>();
  const dropped: DescribeResult['dropped'] = [];
  for (const entry of parsed.items ?? []) {
    const id = typeof entry.turn_id === 'string' ? entry.turn_id : '';
    const line = typeof entry.description === 'string' ? entry.description.trim() : '';
    if (!asked.has(id)) {
      dropped.push({ turn_id: id, text: line, reason: 'not one of the turns asked about' });
      continue;
    }
    answers.set(id, [...(answers.get(id) ?? []), line]);
  }

  const descriptions: Record<string, string> = {};
  for (const id of asked) {
    const lines = answers.get(id) ?? [];
    if (lines.length === 0) {
      dropped.push({ turn_id: id, text: null, reason: 'no answer' });
      continue;
    }
    if (lines.length > 1) {
      dropped.push({ turn_id: id, text: lines.join(' | '), reason: 'answered more than once' });
      continue;
    }
    const line = lines[0] ?? '';
    if (line.length === 0) {
      dropped.push({ turn_id: id, text: line, reason: 'empty description' });
      continue;
    }
    const findings = checkText(line, `quote_descriptions.${id}`);
    if (findings.length > 0) {
      dropped.push({ turn_id: id, text: line, reason: findings.map((f) => `${f.rule}: "${f.phrase}"`).join('; ') });
      continue;
    }
    const banned = FIELD_BANNED_RE.exec(line);
    if (banned) {
      dropped.push({ turn_id: id, text: line, reason: `field-banned: "${banned[0]}"` });
      continue;
    }
    descriptions[id] = line;
  }

  return { descriptions, dropped, usage };
}
