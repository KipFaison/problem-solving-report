// A separate call writes the summary (D10). It receives the aggregates computed
// in code and the episode list, and counts nothing itself (CLAUDE.md rule 11).
//
// Every sentence carries the episodes it rests on, and a sentence that fails
// the wording lint is dropped, not rewritten silently (docs/SPEC-gate0.md §6).
import { call } from './client.ts';
import { checkText } from '../lint/wording.ts';
import type { ReportAggregate } from './aggregates.ts';
import type { CallUsage, Claim } from '../contract/types.ts';

export interface SummaryResult {
  summary: string;
  claims: Claim[];
  dropped: Array<{ text: string; reason: string }>;
  usage: CallUsage;
}

interface ProposedClaim {
  text: string;
  evidence_episode_ids: string[];
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'claims'],
  properties: {
    summary: { type: 'string' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'evidence_episode_ids'],
        properties: {
          text: { type: 'string' },
          evidence_episode_ids: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const RULES = [
  'You are writing two or three short paragraphs for a student and a parent to',
  'read together, in about two minutes.',
  '',
  'Hard rules. Breaking any one of them means the sentence is dropped:',
  '- The subject of every sentence is the session or the work. Never the student.',
  '  Write "the work moved from exploring to planning twice", never "she planned',
  '  twice" and never "the student planned twice".',
  '- Never say what anyone knows, understands, has learned or has improved at.',
  '- Never compare to other students, including implicitly: no "typical",',
  '  "average", "on track", "ahead", "behind".',
  '- Never name a kind of thinker or learner.',
  '- Use only the numbers you are given. Do not count anything yourself, and do',
  '  not round or restate a figure you were not handed.',
  '- Describe what changed across sessions, in session order.',
].join('\n');

export async function summarise(
  aggregate: ReportAggregate,
  episodeIndex: Array<{ episode_id: string; code: string; session_index: number; turns: number }>,
): Promise<SummaryResult> {
  const facts = JSON.stringify({ aggregate, episodes: episodeIndex }, null, 2);

  const instruction = [
    RULES,
    '',
    'Answer with JSON only, no prose, in this shape:',
    '{"summary":"<the paragraphs>","claims":[{"text":"<one sentence>",',
    '"evidence_episode_ids":["<episode_id>"]}]}',
    '',
    'Every claim must be a sentence that appears in the summary, with the ids of',
    'the episodes it rests on. A sentence with no episode behind it does not',
    'belong in the summary.',
  ].join('\n');

  const { text, usage } = await call({
    cacheablePrefix: ['FACTS. These are computed. Use them; do not recompute them.\n\n' + facts],
    instruction,
    maxTokens: 12000,
    schema: SUMMARY_SCHEMA,
  });

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`the summary call returned no JSON:\n${text.slice(0, 400)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as { summary?: string; claims?: ProposedClaim[] };

  const known = new Set(episodeIndex.map((e) => e.episode_id));
  const dropped: SummaryResult['dropped'] = [];
  const claims: Claim[] = [];

  (parsed.claims ?? []).forEach((c, i) => {
    const findings = checkText(c.text, `claim ${i + 1}`);
    if (findings.length > 0) {
      dropped.push({ text: c.text, reason: findings.map((f) => `${f.rule}: "${f.phrase}"`).join('; ') });
      return;
    }
    const evidence = (c.evidence_episode_ids ?? []).filter((id) => known.has(id));
    if (evidence.length === 0) {
      dropped.push({ text: c.text, reason: 'no evidence resolves to an episode of this run' });
      return;
    }
    claims.push({
      claim_id: `claim-${String(claims.length + 1).padStart(3, '0')}`,
      text: c.text,
      evidence_episode_ids: evidence,
      provenance: 'DERIVED: episodes of the source run, counted in code; phrasing by a separate model call (D10)',
    });
  });

  // The prose is filtered sentence by sentence, on the same rule: a sentence
  // that fails the lint is dropped, not rewritten (§6). Rewriting it here would
  // put this project in the business of quietly fixing up what a model said
  // about a child's sessions, which is the thing the lint exists to prevent.
  const sentences = (parsed.summary ?? '').split(/(?<=[.!?])\s+/).filter((t) => t.trim().length > 0);
  const kept: string[] = [];
  for (const sentence of sentences) {
    const findings = checkText(sentence, 'summary');
    if (findings.length > 0) {
      dropped.push({ text: sentence, reason: findings.map((f) => `${f.rule}: "${f.phrase}"`).join('; ') });
      continue;
    }
    kept.push(sentence.trim());
  }

  const summary = kept.join(' ');
  if (summary.length === 0 && sentences.length > 0) {
    throw new Error(
      `every sentence of the summary failed the wording lint: ` +
        dropped.map((d) => d.reason).join(' | '),
    );
  }

  return { summary, claims, dropped, usage };
}
