// Builds test/fixtures/report.valid.json, the baseline every broken fixture of
// §9.1 is derived from. Run it when the contract or the codebook changes:
//
//   node --experimental-strip-types test/fixtures/build-baseline.ts
//
// The baseline is checked in, so the self-check does not depend on this script
// having been run. It is here because the numbers in the file have to be
// consistent to be a baseline at all: the kappa is the one the gate computes
// over the two runs below, in its six classes (src/agreement/gate.ts), and the
// codes are read from the codebook rather than typed in, so a codebook edit
// cannot leave a fixture quietly labelling turns with a code that no longer
// exists.
//
// The content of the turns is placeholder text. Nothing here came from a real
// session, and the file says so in `data_provenance` (CLAUDE.md rule 5).
import { computeAgreement } from '../../src/agreement/gate.ts';
import { loadCodebookForSession, problemProcessCodes } from '../../src/codebook/load.ts';
import type { Episode, Run, Session } from '../../src/contract/types.ts';
import { AGREEMENT_THRESHOLD, config } from '../../src/config.ts';
import { writeJson } from '../../src/storage/index.ts';

const DOMAIN = config.codebook.domain;
const PROCESS = problemProcessCodes(DOMAIN);
const HUMAN_RUN = 'run-human-001';
const LLM_RUN = 'run-llm-001';

interface Segment {
  code: string;
  length: number;
}

interface Plan {
  id: string;
  index: number;
  turnCount: number;
  scope: 'full' | 'excerpt';
  timestamps: boolean;
}

// Three reportable sessions and one that is not: 132 pooled turns, which clears
// MIN_TURNS_AGREEMENT, and a fourth session the claim rules can be tested
// against without disturbing the pool.
const PLANS: Plan[] = [
  { id: 's01', index: 1, turnCount: 44, scope: 'full', timestamps: true },
  { id: 's02', index: 2, turnCount: 44, scope: 'full', timestamps: false },
  { id: 's03', index: 3, turnCount: 44, scope: 'full', timestamps: false },
  { id: 's04', index: 4, turnCount: 20, scope: 'excerpt', timestamps: false },
];

const LENGTHS = [4, 6, 5, 7, 4, 3, 3, 3, 5, 2, 2];

function turnId(sessionId: string, at: number): string {
  return `${sessionId}-t${String(at + 1).padStart(3, '0')}`;
}

function buildTurns(plan: Plan): Array<Record<string, unknown>> {
  return Array.from({ length: plan.turnCount }, (_, at) => {
    const turn: Record<string, unknown> = {
      _id: String(at),
      session_id: plan.id,
      sequence_id: at + 1,
      role: at % 2 === 0 ? 'tutor' : 'student',
      content: `[fixture] session ${plan.id}, turn ${at + 1}.`,
      turn_id: turnId(plan.id, at),
    };
    if (plan.timestamps) {
      const minute = String(at).padStart(2, '0');
      turn.start_time = `00:${minute}:00`;
      turn.end_time = `00:${minute}:45`;
    }
    return turn;
  });
}

/** Segments cycling the codes this session may carry, filling it exactly. */
function segmentsFor(palette: string[], turnCount: number): Segment[] {
  const out: Segment[] = [];
  let used = 0;
  let at = 0;
  while (used < turnCount) {
    const code = palette[at % palette.length];
    const length = Math.min(LENGTHS[at % LENGTHS.length] ?? 3, turnCount - used);
    if (!code) throw new Error('empty palette');
    out.push({ code, length });
    used += length;
    at++;
  }
  return out;
}

/**
 * The annotation run as the same session carved slightly differently: one
 * boundary moved, and every fourth segment labelled with the next code along.
 * This is fixture noise, not the generator of §8 — it exists so the baseline's
 * kappa is a real number over two genuinely different tilings. Like a tutor's
 * marking, the run then keeps only the problem-solving stretches and leaves the
 * rest unmarked (see `sessions` below). [OURS: every fourth, not every third
 * as under the nine-class comparison: every third put the six-class kappa at
 * 0.613, which prints as the threshold's own "0.61" and so blurs the D11
 * fixtures that tell the value and the threshold apart.]
 */
function withNoise(segments: Segment[], palette: string[], offset: number): Segment[] {
  const out = segments.map((segment) => ({ ...segment }));
  const second = out[1];
  const third = out[2];
  if (second && third && third.length > 3) {
    second.length += 2;
    third.length -= 2;
  }
  for (let at = 2; at < out.length; at += 4) {
    const segment = out[at];
    if (!segment) continue;
    const from = palette.indexOf(segment.code);
    const next = palette[(from + 1 + offset) % palette.length];
    if (next) segment.code = next;
  }
  return out;
}

function tiling(runId: string, plan: Plan, segments: Segment[]): Array<Record<string, unknown>> {
  const episodes: Array<Record<string, unknown>> = [];
  let at = 0;
  segments.forEach((segment, ordinal) => {
    const evidence = Array.from({ length: segment.length }, (_, step) => turnId(plan.id, at + step));
    const first = evidence[0];
    const last = evidence[evidence.length - 1];
    if (!first || !last) throw new Error('empty segment');
    episodes.push({
      _id: String(ordinal),
      episode_id: `ep-${runId}-${plan.id}-${String(ordinal + 1).padStart(3, '0')}`,
      run_id: runId,
      identifiedBy: runId === LLM_RUN ? 'AI' : 'HUMAN',
      layer_id: 'episodes',
      codebook_version: codebookVersionFor(plan),
      domain: DOMAIN,
      EPISODE: segment.code,
      start_turn_id: first,
      end_turn_id: last,
      evidence,
      reviewer_id: null,
      reviewed_at: null,
    });
    at += segment.length;
  });
  return episodes;
}

function codebookVersionFor(plan: Plan): string {
  return loadCodebookForSession(plan.timestamps, DOMAIN).codebook_version;
}

// --- build ------------------------------------------------------------------

const sessions = PLANS.map((plan) => {
  const palette = loadCodebookForSession(plan.timestamps, DOMAIN).codes.map((entry) => entry.code);
  const llmSegments = segmentsFor(palette, plan.turnCount);
  const humanSegments = withNoise(llmSegments, palette, plan.index);
  return {
    session_id: plan.id,
    student_id: 'stu-001',
    session_index: plan.index,
    session_date: `2026-0${plan.index}-14`,
    session_topic: 'fixture',
    has_timestamps: plan.timestamps,
    transcript_scope: plan.scope,
    turns: buildTurns(plan),
    annotations: [
      ...tiling(HUMAN_RUN, plan, humanSegments).filter((episode) => PROCESS.has(episode.EPISODE as string)),
      ...tiling(LLM_RUN, plan, llmSegments),
    ],
    plan,
  };
});

const gate = sessions.map((session) => ({
  session_id: session.session_id,
  turn_count: session.turns.length,
  reportable:
    session.turns.length >= config.session.minTurnsReportable &&
    session.transcript_scope === config.session.requiredTranscriptScope,
}));

const reportableIds = new Set(gate.filter((entry) => entry.reportable).map((entry) => entry.session_id));

// The contract types are narrower than what is built here; the gate reads only
// turn ids, sequence ids, session_index and the episodes' spans and codes.
const tilingOf = (runId: string) => ({
  run: { run_id: runId, simulated: runId === HUMAN_RUN } as unknown as Run,
  episodes: sessions.flatMap((session) => session.annotations.filter((e) => e.run_id === runId)) as unknown as Episode[],
});
const result = computeAgreement({
  sessions: sessions.filter((session) => reportableIds.has(session.session_id)) as unknown as Session[],
  annotationRun: tilingOf(HUMAN_RUN),
  llmRun: tilingOf(LLM_RUN),
});
if (result.value === null || result.band === null) {
  throw new Error(`the baseline must carry a computed kappa: ${result.refusal?.detail ?? 'no value'}`);
}
if (result.value < AGREEMENT_THRESHOLD) {
  throw new Error(`the baseline is meant to clear the gate; kappa is ${result.value}`);
}

const report = {
  report_version: '0.2.0',
  data_provenance: {
    status: 'synthetic',
    ui_label: 'Illustrative fixture data. No real session produced it.',
  },
  student_id: 'stu-001',
  source_run_id: LLM_RUN,
  codebook_version: sessions[0]?.annotations[0]?.codebook_version,
  domain: DOMAIN,
  sessions: sessions.map(({ plan: _plan, ...session }) => session),
  runs: [
    {
      run_id: HUMAN_RUN,
      kind: 'human',
      simulated: true,
      model: null,
      prompt_hash: null,
      annotator_id: 'annotator-001',
      codebook_version: sessions[0]?.annotations[0]?.codebook_version,
      domain: DOMAIN,
      created_at: '2026-09-17T09:00:00Z',
    },
    {
      run_id: LLM_RUN,
      kind: 'llm',
      simulated: false,
      model: config.model.id,
      prompt_hash: 'sha256:fixture',
      annotator_id: null,
      codebook_version: sessions[0]?.annotations[0]?.codebook_version,
      domain: DOMAIN,
      created_at: '2026-09-17T10:00:00Z',
    },
  ],
  agreement: {
    threshold: AGREEMENT_THRESHOLD,
    statistic: "Cohen's kappa",
    unit: 'turn',
    compared_runs: [HUMAN_RUN, LLM_RUN],
    n_turns: result.n_turns,
    value: result.value,
    band: result.band,
    measured: true,
    state: 'shown',
    simulated: true,
    refusal: null,
    statement:
      'The episode layer surfaced. An annotation run and an LLM run were compared over the reportable ' +
      'sessions; that comparison is internal and is not shown here.',
  },
  session_gate: {
    min_turns: config.session.minTurnsReportable,
    sessions: gate,
  },
  claims: [
    {
      claim_id: 'claim-001',
      text: 'In the first session the work returned to planning after a stretch of implementation.',
      evidence_episode_ids: [`ep-${LLM_RUN}-s01-003`, `ep-${LLM_RUN}-s01-004`],
      provenance: '[DERIVED: run-llm-001 episodes -> the ordering of two adjacent episodes]',
    },
    {
      claim_id: 'claim-002',
      text: 'Verification appears in the closing turns of each session that is long enough to report on.',
      evidence_episode_ids: [`ep-${LLM_RUN}-s01-005`],
      provenance: '[DERIVED: run-llm-001 episodes -> position within the session turn order]',
    },
  ],
  summary:
    'Across the three sessions long enough to report on, the work moved between reading, analysis and ' +
    'planning early in each session, and verification episodes sit near the end of all three.',
  provenance_card: [
    'Episode codes: Schoenfeld episodes, with operational definitions from Li et al. (2025) Appendix E, plus ' +
      'organization, writing and digression from Rott et al. (2021). [SOURCE: codebook.v2.json origin fields]',
    '[EXTRAPOLATION: Li et al. annotated sentences of a reasoning model chain of thought, not two-speaker ' +
      'tutoring turns. See docs/DEVIATIONS.md D-022.]',
    'Illustrative fixture data. No real session produced it.',
    'This report was generated from the LLM run run-llm-001.',
    'The episode layer surfaced: an annotation run and the LLM run were compared, and the comparison cleared ' +
      'the gate this project sets. The comparison is internal and is not shown here.',
    'No inter-rater reliability has been established for this layer in this project, and Li et al. (2025) ' +
      'report no agreement figure of their own.',
    // The threshold is stated on every card (INTENT.md); the value and its band
    // never are (D11). The baseline carries it so the self-check shows it passes.
    `The episode layer does not surface unless agreement between the two runs reaches ${AGREEMENT_THRESHOLD}.`,
    'These definitions have been used on mathematics only. Nothing here is evidence that they carry to ' +
      'another subject.',
  ],
};

writeJson('test/fixtures/report.valid.json', report);
console.log(`test/fixtures/report.valid.json written`);
console.log(`  kappa ${result.value} (${result.band}) over ${result.n_turns} turns, threshold ${AGREEMENT_THRESHOLD}`);
