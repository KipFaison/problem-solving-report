// Layer 2's own agreement figure (docs/SPEC-layer2.md): the model's label for
// each tutor turn against a tutor's mark for the same turn, matched on
// preceding_turn_id. One figure per session and one pooled over them.
//
// It is never combined with the episode agreement (src/agreement/gate.ts): no
// shared pool, no shared threshold decision, no index across the two. It uses
// the same kappa wrapper, with this layer's own floors, because a refusal
// should mean the same thing wherever it is issued.
//
// Only items with both a model label and a tutor mark are compared. An item
// the tutor has not marked yet is left out rather than counted as a class of
// its own. [OURS: unlike the episode layer, where an unmarked turn is a
// statement that it is not problem solving, an unmarked item here is only
// unfinished work.]
import type { Agreement, Episode, MovesMarks } from '../contract/types.ts';
import { config } from '../config.ts';
import { agreementKappa } from '../agreement/kappa.ts';
import { perCodeAgreement } from '../agreement/gate.ts';
import { listSessions, loadMovesMarks, loadRun } from '../server/workspace.ts';

export interface MovesAgreementInput {
  session_id: string;
  session_index: number;
  /** The model run's episodes; the model's labels are read from their tutor_prompting. */
  modelEpisodes: Episode[];
  marks: MovesMarks | null;
}

type Pair = { annotation: string; llm: string };
type PerSession = NonNullable<Agreement['per_session']>[number];

/** The model's classified items, in the run's episode order. */
function modelLabels(episodes: Episode[]): Array<{ id: string; code: string; version: string }> {
  const labels: Array<{ id: string; code: string; version: string }> = [];
  for (const episode of episodes) {
    const tp = episode.tutor_prompting;
    if (!tp || tp.tutor_move === null) continue;
    labels.push({ id: tp.preceding_turn_id, code: tp.tutor_move, version: tp.codebook_version });
  }
  return labels;
}

function pairsFor(input: MovesAgreementInput, marks: MovesMarks): Pair[] {
  const pairs: Pair[] = [];
  for (const label of modelLabels(input.modelEpisodes)) {
    const mark = marks.marks[label.id];
    if (mark !== undefined) pairs.push({ annotation: mark, llm: label.code });
  }
  return pairs;
}

/** A version the model's labels were made under that the marks were not, or null. */
function versionMismatch(input: MovesAgreementInput, marks: MovesMarks): string | null {
  const versions = new Set(modelLabels(input.modelEpisodes).map((l) => l.version));
  const other = [...versions].find((v) => v !== marks.codebook_version);
  return other ?? null;
}

export function movesAgreement(inputs: MovesAgreementInput[]): Agreement {
  const threshold = config.agreement.threshold;
  const base = {
    threshold,
    statistic: "Cohen's kappa" as const,
    // Each item is one tutor turn, so the unit is still the turn.
    unit: 'turn' as const,
    statement: '',
  };
  const ordered = [...inputs].sort((x, y) => x.session_index - y.session_index);
  const marked = ordered.filter((i): i is MovesAgreementInput & { marks: MovesMarks } => i.marks !== null);
  const simulated = marked.some((i) => i.marks.simulated);

  // Sessions with both model labels and tutor marks.
  const both = marked.filter((i) => modelLabels(i.modelEpisodes).length > 0);

  const perSession: PerSession[] = both.map((input) => {
    const entry = { session_id: input.session_id, session_index: input.session_index };
    const other = versionMismatch(input, input.marks);
    if (other !== null) {
      return {
        ...entry,
        value: null,
        band: null,
        n_turns: null,
        state: 'suppressed' as const,
        refusal: {
          reason: 'codebook_version_mismatch' as const,
          detail: `tutor marks under tutor-move codebook ${input.marks.codebook_version}, model labels under ${other}; mark or classify again under one version`,
        },
      };
    }
    const pairs = pairsFor(input, input.marks);
    const result = agreementKappa(
      pairs.map((p) => p.annotation),
      pairs.map((p) => p.llm),
      'session',
      config.moves.minItemsForSessionAgreement,
    );
    if (!result.measured) {
      return {
        ...entry,
        value: null,
        band: null,
        n_turns: result.n_turns,
        state: 'suppressed' as const,
        refusal: { reason: result.reason, detail: result.detail },
      };
    }
    return {
      ...entry,
      value: result.value,
      band: result.band,
      n_turns: result.n_turns,
      state: result.value >= threshold ? ('shown' as const) : ('suppressed' as const),
      refusal: null,
    };
  });

  if (marked.length === 0) {
    return {
      ...base,
      compared_runs: null,
      n_turns: null,
      value: null,
      band: null,
      measured: false,
      state: 'unmeasured',
      simulated: false,
      refusal: {
        reason: 'no_annotation_run',
        detail: 'no tutor has marked the tutor turns of any session, so nothing was compared',
      },
      per_session: perSession,
    };
  }

  const pooled: Pair[] = both
    .filter((input) => versionMismatch(input, input.marks) === null)
    .flatMap((input) => pairsFor(input, input.marks));
  const result = agreementKappa(
    pooled.map((p) => p.annotation),
    pooled.map((p) => p.llm),
    'pooled',
    config.moves.minItemsForAgreement,
  );
  const compared_runs: [string, string] = ['tutor-moves-marks', 'model-runs'];

  if (!result.measured) {
    return {
      ...base,
      compared_runs,
      n_turns: result.n_turns,
      value: null,
      band: null,
      measured: false,
      state: 'suppressed',
      simulated,
      refusal: { reason: result.reason, detail: result.detail },
      per_session: perSession,
    };
  }

  return {
    ...base,
    compared_runs,
    n_turns: result.n_turns,
    value: result.value,
    band: result.band,
    measured: true,
    state: result.value >= threshold ? 'shown' : 'suppressed',
    simulated,
    refusal: null,
    per_code: perCodeAgreement(pooled),
    per_session: perSession,
  };
}

/** The layer's agreement over the live workspace. */
export function computeMovesAgreement(): Agreement {
  return movesAgreement(
    listSessions().map((session) => ({
      session_id: session.session_id,
      session_index: session.session_index,
      modelEpisodes: loadRun(session.session_id, 'llm')?.episodes ?? [],
      marks: loadMovesMarks(session.session_id),
    })),
  );
}
