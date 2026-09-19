// The agreement gate (SPEC-gate0 §5.4, docs/DEVIATIONS.md D-024).
//
// One annotation run against one LLM run over the same sessions, at the turn
// level, pooled into one figure per report. It produces the `Agreement` object
// of src/contract/types.ts: a state and the facts behind it, and no words.
//
// The value gates whether the episode layer surfaces and never reaches a
// learner- or parent-facing surface (INTENT.md, "Agreement: apparatus, not
// evidence"), so nothing here composes a sentence: `statement` is left to the
// view that renders the state (§5.6, §7.1).
import type { Agreement, Episode, Run, Session } from '../contract/types.ts';
import { config } from '../config.ts';
import { problemProcessCodes } from '../codebook/load.ts';
import { agreementKappa } from './kappa.ts';

/** A run and the episodes it tiles the sessions with. */
export interface RunTiling {
  run: Run;
  episodes: Episode[];
}

export interface AgreementInput {
  /** Which floor applies (src/agreement/kappa.ts). Pooled unless told otherwise. */
  scope?: 'pooled' | 'session';
  /**
   * The sessions to pool over. The caller filters to the reportable ones
   * (§5.5): the session gate is independent of this one and is never merged
   * with it. Pooled in `session_index` order, then in the session's turn
   * order (D-024).
   */
  sessions: Session[];
  /** Null when the student has no annotation run: the `unmeasured` state. */
  annotationRun: RunTiling | null;
  llmRun: RunTiling;
}

/** Index of each covered turn position to the code covering it. */
function coverage(session: Session, positionOf: Map<string, number>, episodes: Episode[]): Map<number, string> {
  const codes = new Map<number, string>();
  for (const episode of episodes) {
    const start = positionOf.get(episode.start_turn_id);
    const end = positionOf.get(episode.end_turn_id);
    if (start === undefined || end === undefined) {
      throw new Error(
        `${episode.episode_id}: span ${episode.start_turn_id}..${episode.end_turn_id} is not inside ${session.session_id}`,
      );
    }
    if (start > end) {
      throw new Error(`${episode.episode_id}: starts at turn ${start + 1} and ends at turn ${end + 1}`);
    }
    for (let i = start; i <= end; i++) {
      if (codes.has(i)) {
        throw new Error(
          `${episode.episode_id}: turn ${i + 1} of ${session.session_id} is covered by more than one episode of ${episode.run_id}`,
        );
      }
      codes.set(i, episode.EPISODE);
    }
  }
  return codes;
}

/**
 * The two runs' codes for each turn of one session, in the session's turn
 * order.
 *
 * Throws rather than returning when a run leaves a turn uncovered. Tiling is a
 * contract rule the validator enforces before a report is built (§9.1, D4), so
 * reaching this means the data is broken; a placeholder label or a shortened
 * sequence would turn that into a number.
 */
function pairedLabels(
  session: Session,
  annotation: RunTiling,
  llm: RunTiling,
  process: Set<string>,
): Array<{ annotation: string; llm: string }> {
  const turns = [...session.turns].sort((x, y) => x.sequence_id - y.sequence_id);
  const positionOf = new Map(turns.map((turn, i) => [turn.turn_id, i]));
  const byAnnotation = coverage(session, positionOf, episodesIn(session, annotation));
  const byLlm = coverage(session, positionOf, episodesIn(session, llm));

  // What a tutor is asked to mark is the problem-solving work, and nothing
  // else: reading, monitoring, logistics and off-topic talk exist for the
  // model to segment with, and a tutor does not label them (INTENT.md). So the
  // comparison is over six categories, not nine: the five problem-solving
  // codes, and one class for everything else. A turn the tutor left unmarked
  // falls in that class, and so does any turn the model gave a code outside
  // the five. [OURS: the tutor marks less than the model does, so the two can
  // only be compared on what both of them mark.]
  const comparable = (code: string): string => (process.has(code) ? code : NOT_PROBLEM_SOLVING);

  // Only the turns the tutor was shown are compared: a turn never shown is
  // neither an agreement nor a disagreement (INTENT.md, "What a tutor is
  // shown"; SPEC D18). No `shown` record means the whole session was shown,
  // which is how every run saved before D18 reads. A pooled run carries the
  // shown turns of every session it pools; turn ids are unique across
  // sessions (the intake prefixes them with the session id), which
  // `episodesIn` already relies on.
  const shownIds = annotation.run.shown?.turn_ids;
  const shown = shownIds ? new Set(shownIds) : null;

  const pairs: Array<{ annotation: string; llm: string }> = [];
  for (const [i, turn] of turns.entries()) {
    const a = byAnnotation.get(i);
    const l = byLlm.get(i);
    // The model still has to tile the session, shown or not: its output is
    // checked for that before it is kept (§6), so a gap here means the data is
    // broken.
    if (l === undefined) {
      throw new Error(`${llm.run.run_id} does not tile ${session.session_id}: turn ${turn.turn_id} is in no episode`);
    }
    if (shown !== null && !shown.has(turn.turn_id)) {
      // A marking on a turn the tutor was not shown is broken data, not a
      // label to drop. [OURS: the server refuses such a marking before it is
      // saved (src/server/api.ts), so reaching this means the file was
      // changed; dropping the turn would clip the marking silently.]
      if (a !== undefined) {
        throw new Error(
          `${annotation.run.run_id} marks turn ${turn.turn_id} of ${session.session_id}, which its shown turns do not include`,
        );
      }
      continue;
    }
    // Inside what was shown, an unmarked turn still reads as not problem
    // solving (D17, D18).
    pairs.push({
      annotation: a === undefined ? NOT_PROBLEM_SOLVING : comparable(a),
      llm: comparable(l),
    });
  }
  return pairs;
}

/**
 * The comparison's one non-process class: every turn that is not part of the
 * problem-solving process, whether the tutor left it unmarked or the model
 * called it reading, monitoring, logistics or off-topic talk.
 */
export const NOT_PROBLEM_SOLVING = 'not_problem_solving';

/** A run's episodes for one session, found through the turns they start on. */
function episodesIn(session: Session, tiling: RunTiling): Episode[] {
  const turnIds = new Set(session.turns.map((turn) => turn.turn_id));
  return tiling.episodes.filter((episode) => turnIds.has(episode.start_turn_id));
}

/**
 * Per-code turn counts for the internal view (§7.3), including the non-content
 * codes so what the model infers for them can be tracked (D4).
 *
 * `n_turns` counts the turns either run gave the code, `agreed` the turns both
 * did. [OURS: the union rather than one run's total, because neither run is
 * gold (D-024) and counting from one side would make it one.]
 */
export function perCodeAgreement(
  pairs: Array<{ annotation: string; llm: string }>,
): Record<string, { n_turns: number; agreed: number }> {
  const perCode: Record<string, { n_turns: number; agreed: number }> = {};
  const entry = (code: string): { n_turns: number; agreed: number } => {
    const existing = perCode[code];
    if (existing !== undefined) return existing;
    const fresh = { n_turns: 0, agreed: 0 };
    perCode[code] = fresh;
    return fresh;
  };

  for (const pair of pairs) {
    if (pair.annotation === pair.llm) {
      const both = entry(pair.annotation);
      both.n_turns++;
      both.agreed++;
      continue;
    }
    entry(pair.annotation).n_turns++;
    entry(pair.llm).n_turns++;
  }
  return perCode;
}

/**
 * The two label sequences the gate computes kappa over: every compared turn,
 * pooled in `session_index` order, in the six classes of `pairedLabels`. A
 * compared turn is one the tutor was shown: all of them where the annotation
 * run carries no `shown` record, and those listed where it does.
 * Exported so the validator recomputes a stored figure over exactly these
 * sequences instead of restating the rule (scripts/validate.ts).
 */
export function comparedLabels(
  sessions: Session[],
  annotationRun: RunTiling,
  llmRun: RunTiling,
): Array<{ annotation: string; llm: string }> {
  const process = problemProcessCodes();
  const pairs: Array<{ annotation: string; llm: string }> = [];
  for (const session of [...sessions].sort((x, y) => x.session_index - y.session_index)) {
    // A session only one of the runs tiles is out of the pool (D-024).
    // Annotating some of a student's sessions is ordinary, and it is a
    // different thing from a run that tiles a session incompletely.
    if (episodesIn(session, annotationRun).length === 0) continue;
    if (episodesIn(session, llmRun).length === 0) continue;
    pairs.push(...pairedLabels(session, annotationRun, llmRun, process));
  }
  return pairs;
}

export function computeAgreement(input: AgreementInput): Agreement {
  const { sessions, annotationRun, llmRun } = input;
  const base = {
    threshold: config.agreement.threshold,
    statistic: "Cohen's kappa" as const,
    unit: 'turn' as const,
    // The words belong to the view that renders the state, not to the gate
    // [OURS: the value must not reach a learner-facing string, and the surest
    // way to keep it out of one is for this module to write none].
    statement: '',
  };

  if (annotationRun === null) {
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
        detail: 'no annotation run exists for this student, so nothing was compared',
      },
    };
  }

  const pairs = comparedLabels(sessions, annotationRun, llmRun);

  const result = agreementKappa(
    pairs.map((pair) => pair.annotation),
    pairs.map((pair) => pair.llm),
    input.scope ?? 'pooled',
  );
  const compared_runs: [string, string] = [annotationRun.run.run_id, llmRun.run.run_id];
  const simulated = annotationRun.run.simulated;

  // A refused comparison is suppressed, not unmeasured: an annotation run
  // exists, and `unmeasured` is defined by the absence of one (INTENT.md,
  // "Three states", where none substitutes for another). The reason goes with
  // it, so the view can say why the layer is held back without a number.
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
    };
  }

  return {
    ...base,
    compared_runs,
    n_turns: result.n_turns,
    value: result.value,
    band: result.band,
    measured: true,
    state: result.value >= base.threshold ? 'shown' : 'suppressed',
    simulated,
    refusal: null,
    per_code: perCodeAgreement(pairs),
  };
}
