// The broken fixtures of §9.1: one deliberate defect per rule, each derived
// from test/fixtures/report.valid.json so that the only difference between a
// fixture and a valid report is the defect being tested.
//
// Deriving rather than hand-writing is the point. A hand-written broken file
// drifts from the baseline over time and ends up failing for a reason nobody
// intended, which reads as a passing test.
//
// `target` says what the defect is injected into: the whole report (the
// default, and the only one the cross-cutting rules run over), or the run or
// session object on its own, which is how the run and transcript schemas are
// exercised as standalone files.
import { loadCodebook } from '../../src/codebook/load.ts';

export const BASELINE_PATH = 'test/fixtures/report.valid.json';

const HUMAN_RUN = 'run-human-001';
const LLM_RUN = 'run-llm-001';

export interface FixtureEpisode {
  episode_id: string;
  run_id: string;
  EPISODE: string;
  start_turn_id: string;
  end_turn_id: string;
  evidence: string[];
  reviewer_id?: string | null;
  reviewed_at?: string | null;
}

export interface FixtureTurn {
  turn_id: string;
  sequence_id: number;
  role?: string;
  start_time?: string;
  end_time?: string;
}

export interface FixtureSession {
  session_id: string;
  session_index: number;
  turns: FixtureTurn[];
  annotations: FixtureEpisode[];
}

export interface FixtureRun {
  run_id: string;
  kind: string;
  simulated: boolean;
  codebook_version: string;
  domain: string;
  created_at?: string;
  episodes?: FixtureEpisode[];
  shown?: {
    mode: 'sample' | 'whole_session';
    turn_ids: string[];
    problem_ids: string[];
    sampling: { problems_per_session: number; seed: number } | null;
  } | null;
}

export interface FixtureReport {
  sessions: FixtureSession[];
  runs: FixtureRun[];
  agreement: {
    threshold: number;
    compared_runs: [string, string] | null;
    value: number | null;
    band: string | null;
    measured: boolean;
    state: string;
    simulated: boolean;
    refusal: { reason: string; detail: string } | null;
  };
  session_gate: { min_turns: number; sessions: Array<{ session_id: string; turn_count: number; reportable: boolean }> };
  claims: Array<{ claim_id: string; text: string; evidence_episode_ids: string[] }>;
  summary: string;
  provenance_card: string[];
}

interface MutationBase {
  id: string;
  rule: string;
  why: string;
  /**
   * Why the defect cannot be built against the codebook the repo carries, or
   * null when it can. The self-check prints a skip rather than dropping the
   * fixture, so a rule nothing exercises is visible.
   */
  skip?: () => string | null;
}

export type Mutation =
  | (MutationBase & { target?: 'report'; mutate: (report: FixtureReport) => void })
  | (MutationBase & { target: 'run'; mutate: (run: FixtureRun) => void })
  | (MutationBase & { target: 'transcript'; mutate: (session: FixtureSession) => void });

/** A change to the baseline that leaves it valid: the validator must accept it. */
export interface Accepted {
  id: string;
  why: string;
  mutate: (report: FixtureReport) => void;
}

// A fixture that cannot find the thing it breaks is a fixture that passes for
// the wrong reason, so every accessor throws rather than returning undefined.
function session(report: FixtureReport, sessionId: string): FixtureSession {
  const found = report.sessions.find((candidate) => candidate.session_id === sessionId);
  if (!found) throw new Error(`${BASELINE_PATH} has no session ${sessionId}`);
  return found;
}

function episodes(report: FixtureReport, sessionId: string, runId: string): FixtureEpisode[] {
  const found = session(report, sessionId).annotations.filter((episode) => episode.run_id === runId);
  if (found.length === 0) throw new Error(`${BASELINE_PATH}: no episodes for ${runId} in ${sessionId}`);
  return found;
}

function episodeAt(report: FixtureReport, sessionId: string, runId: string, ordinal: number): FixtureEpisode {
  const list = episodes(report, sessionId, runId);
  const found = ordinal < 0 ? list[list.length + ordinal] : list[ordinal];
  if (!found) throw new Error(`${BASELINE_PATH}: ${runId} has no episode ${ordinal} in ${sessionId}`);
  return found;
}

function run(report: FixtureReport, runId: string): FixtureRun {
  const found = report.runs.find((candidate) => candidate.run_id === runId);
  if (!found) throw new Error(`${BASELINE_PATH} has no run ${runId}`);
  return found;
}

/** Every turn of the report, in session order: the whole of every session shown. */
function everyTurn(report: FixtureReport): string[] {
  return report.sessions.flatMap((item) => item.turns.map((turn) => turn.turn_id));
}

function last<T>(values: T[]): T {
  const found = values[values.length - 1];
  if (found === undefined) throw new Error('empty list');
  return found;
}

/** The code the codebook flags as needing timestamps, read rather than named. */
function timestampOnlyCode(): string | undefined {
  return loadCodebook().codes.find((entry) => entry.requires_timestamps === true)?.code;
}

/**
 * A code outside the problem-solving process, read rather than named. A tutor
 * is no longer asked for these, but an older annotation file may carry them,
 * and the gate compares them as "not problem solving".
 */
function nonProcessCode(): string {
  const found = loadCodebook().codes.find((entry) => entry.in_problem_process !== true);
  if (!found) throw new Error('every code in the codebook is a problem-solving code');
  return found.code;
}

/** The stretches of a session a run leaves unmarked, each as its turn ids in order. */
function gaps(item: FixtureSession, runId: string): string[][] {
  const marked = new Set(
    item.annotations.filter((episode) => episode.run_id === runId).flatMap((episode) => episode.evidence),
  );
  const stretches: string[][] = [];
  let current: string[] = [];
  for (const turn of item.turns) {
    if (marked.has(turn.turn_id)) {
      if (current.length > 0) stretches.push(current);
      current = [];
    } else {
      current.push(turn.turn_id);
    }
  }
  if (current.length > 0) stretches.push(current);
  return stretches;
}

/**
 * The baseline as a comparison the gate refuses while an annotation run
 * exists: every annotation episode carries a non-process code, so every
 * compared turn falls in the one "not problem solving" class, and the stored
 * figure is the refusal. The state is left for the fixture to set.
 */
function refuseComparison(report: FixtureReport): void {
  const code = nonProcessCode();
  for (const item of report.sessions) {
    for (const episode of item.annotations) {
      if (episode.run_id === HUMAN_RUN) episode.EPISODE = code;
    }
  }
  report.agreement.value = null;
  report.agreement.band = null;
  report.agreement.measured = false;
  report.agreement.refusal = {
    reason: 'degenerate_single_code',
    detail: 'a single code across all 132 turns (first sequence): no disagreement was possible',
  };
}

export const accepted: Accepted[] = [
  {
    id: 'agreement-refused-comparison-suppressed',
    why:
      'a comparison refused while an annotation run exists is suppressed, with a null value and the refusal ' +
      'recorded; unmeasured is reserved for no annotation run (INTENT.md, "Three states")',
    mutate: (report) => {
      refuseComparison(report);
      report.agreement.state = 'suppressed';
    },
  },
  {
    id: 'annotation-run-in-the-older-nine-code-shape',
    why:
      'every turn the annotation run leaves unmarked filled with a non-process code, as a file from before ' +
      'the five-code decision carries them; the six classes compared, and so the kappa, do not change',
    mutate: (report) => {
      const code = nonProcessCode();
      for (const item of report.sessions) {
        const template = item.annotations.find((episode) => episode.run_id === HUMAN_RUN);
        if (!template) throw new Error(`${BASELINE_PATH}: no ${HUMAN_RUN} episode in ${item.session_id}`);
        gaps(item, HUMAN_RUN).forEach((stretch, n) => {
          const first = stretch[0];
          if (!first) throw new Error('empty stretch');
          item.annotations.push({
            ...template,
            episode_id: `ep-${HUMAN_RUN}-${item.session_id}-unmarked-${String(n + 1).padStart(3, '0')}`,
            EPISODE: code,
            start_turn_id: first,
            end_turn_id: last(stretch),
            evidence: stretch,
          });
        });
      }
    },
  },
  {
    id: 'annotation-run-records-every-turn-shown',
    why:
      'an annotation run that records the whole of every session as shown compares the same turns as one ' +
      'that records nothing, so the stored figure is unchanged (SPEC D18)',
    mutate: (report) => {
      run(report, HUMAN_RUN).shown = { mode: 'whole_session', turn_ids: everyTurn(report), problem_ids: [], sampling: null };
    },
  },
];

export const mutations: Mutation[] = [
  // --- schema --------------------------------------------------------------
  {
    id: 'report-missing-summary',
    rule: 'schema.report',
    why: 'a required field of §5.6 removed',
    mutate: (report) => {
      delete (report as { summary?: string }).summary;
    },
  },
  {
    id: 'run-missing-created-at',
    rule: 'schema.run',
    target: 'run',
    why: 'a run file missing a required field of §5.3',
    mutate: (run) => {
      delete run.created_at;
    },
  },
  {
    id: 'transcript-turn-missing-role',
    rule: 'schema.transcript',
    target: 'transcript',
    why: 'a transcript whose turn drops one of Sandpiper’s turn-level fields',
    mutate: (transcript) => {
      const turn = transcript.turns[0];
      if (!turn) throw new Error('the fixture session has no turns');
      delete turn.role;
    },
  },

  // --- duplicate ids -------------------------------------------------------
  {
    id: 'duplicate-session-id',
    rule: 'dup.session_id',
    why: 'two sessions claiming one id',
    mutate: (report) => {
      session(report, 's02').session_id = 's01';
    },
  },
  {
    id: 'duplicate-session-index',
    rule: 'dup.session_index',
    why: 'two sessions claiming one position in the order',
    mutate: (report) => {
      session(report, 's02').session_index = session(report, 's01').session_index;
    },
  },
  {
    id: 'duplicate-turn-id',
    rule: 'dup.turn_id',
    why: 'a turn id reused in another session, which evidence would then resolve to twice',
    mutate: (report) => {
      const turn = session(report, 's02').turns[0];
      if (!turn) throw new Error('the fixture session has no turns');
      turn.turn_id = session(report, 's01').turns[0]?.turn_id ?? 's01-t001';
    },
  },
  {
    id: 'duplicate-run-id',
    rule: 'dup.run_id',
    why: 'a second run stamped with an existing run id',
    mutate: (report) => {
      const run = report.runs[0];
      if (!run) throw new Error('the fixture has no runs');
      report.runs.push({ ...run });
    },
  },
  {
    id: 'duplicate-episode-id',
    rule: 'dup.episode_id',
    why: 'two episodes sharing the id a later record would point at',
    mutate: (report) => {
      episodeAt(report, 's01', LLM_RUN, 1).episode_id = episodeAt(report, 's01', LLM_RUN, 0).episode_id;
    },
  },
  {
    id: 'duplicate-claim-id',
    rule: 'dup.claim_id',
    why: 'two claims sharing an id',
    mutate: (report) => {
      const [first, second] = report.claims;
      if (!first || !second) throw new Error('the fixture needs two claims');
      second.claim_id = first.claim_id;
    },
  },

  // --- episodes ------------------------------------------------------------
  {
    id: 'episode-unknown-run',
    rule: 'episode.unknown_run',
    why: 'an episode attributed to a run the report does not carry',
    mutate: (report) => {
      episodeAt(report, 's04', LLM_RUN, 0).run_id = 'run-not-here';
    },
  },
  {
    id: 'episode-start-turn-in-another-session',
    rule: 'episode.start_turn_not_in_session',
    why: 'an episode starting at a turn of a different session',
    mutate: (report) => {
      episodeAt(report, 's01', LLM_RUN, 0).start_turn_id = 's03-t001';
    },
  },
  {
    id: 'episode-end-turn-missing',
    rule: 'episode.end_turn_not_in_session',
    why: 'an episode ending at a turn that does not exist',
    mutate: (report) => {
      episodeAt(report, 's01', LLM_RUN, 0).end_turn_id = 's01-t999';
    },
  },
  {
    id: 'episode-start-after-end',
    rule: 'episode.start_after_end',
    why: 'a span running backwards',
    mutate: (report) => {
      const episode = episodeAt(report, 's01', LLM_RUN, 1);
      const { start_turn_id, end_turn_id } = episode;
      episode.start_turn_id = end_turn_id;
      episode.end_turn_id = start_turn_id;
    },
  },
  {
    id: 'episode-evidence-short',
    rule: 'episode.evidence_mismatch',
    why: 'evidence that is not exactly the span, so a reader following it sees fewer turns than were coded',
    mutate: (report) => {
      episodeAt(report, 's01', LLM_RUN, 1).evidence.pop();
    },
  },
  {
    id: 'episode-tiling-gap',
    rule: 'episode.tiling_gap',
    why:
      'a turn left in no episode of the model run, with evidence kept consistent so only the tiling is wrong; ' +
      'only an annotation run may leave turns unmarked',
    mutate: (report) => {
      const episode = last(episodes(report, 's04', LLM_RUN));
      episode.evidence.pop();
      episode.end_turn_id = last(episode.evidence);
    },
  },
  {
    id: 'episode-tiling-overlap',
    rule: 'episode.tiling_overlap',
    why: 'one turn in two episodes of the same run',
    mutate: (report) => {
      const first = episodeAt(report, 's04', LLM_RUN, 0);
      const second = episodeAt(report, 's04', LLM_RUN, 1);
      const stolen = second.evidence[0];
      if (!stolen) throw new Error('the second episode has no turns');
      first.evidence.push(stolen);
      first.end_turn_id = stolen;
    },
  },
  {
    id: 'annotation-run-overlap',
    rule: 'episode.tiling_overlap',
    why:
      'an annotation run may leave turns unmarked but may not mark one turn twice: its first episode ' +
      'stretched across the gap and onto the first turn of its second',
    mutate: (report) => {
      const turnIds = session(report, 's01').turns.map((turn) => turn.turn_id);
      const first = episodeAt(report, 's01', HUMAN_RUN, 0);
      const second = episodeAt(report, 's01', HUMAN_RUN, 1);
      first.evidence = turnIds.slice(turnIds.indexOf(first.start_turn_id), turnIds.indexOf(second.start_turn_id) + 1);
      first.end_turn_id = second.start_turn_id;
    },
  },
  {
    id: 'annotation-run-episode-leaves-its-session',
    rule: 'episode.end_turn_not_in_session',
    why: 'an annotation run may leave turns unmarked, but what it marks lies inside the session it is filed under',
    mutate: (report) => {
      episodeAt(report, 's01', HUMAN_RUN, 0).end_turn_id = 's02-t001';
    },
  },
  {
    id: 'annotation-episode-outside-shown-turns',
    rule: 'episode.outside_shown_turns',
    why:
      'an annotation run whose shown turns leave out the last turn of one of its own episodes: a tutor marks ' +
      'only what they were shown (SPEC D18)',
    mutate: (report) => {
      const left = episodeAt(report, 's01', HUMAN_RUN, 0).end_turn_id;
      run(report, HUMAN_RUN).shown = {
        mode: 'sample',
        turn_ids: everyTurn(report).filter((turnId) => turnId !== left),
        problem_ids: [],
        sampling: { problems_per_session: 1, seed: 1 },
      };
    },
  },
  {
    id: 'annotation-run-shown-turn-missing',
    rule: 'run.shown_turn_not_in_session',
    why: 'an annotation run that records a shown turn no session of the report has',
    mutate: (report) => {
      run(report, HUMAN_RUN).shown = {
        mode: 'whole_session',
        turn_ids: [...everyTurn(report), 's01-t999'],
        problem_ids: [],
        sampling: null,
      };
    },
  },
  {
    id: 'episode-unknown-code',
    rule: 'episode.unknown_code',
    why: 'a code that is not in the codebook the run was produced under',
    mutate: (report) => {
      episodeAt(report, 's04', LLM_RUN, 0).EPISODE = 'not-a-code';
    },
  },
  {
    id: 'episode-timestamp-only-code',
    rule: 'episode.writing_without_timestamps',
    why: 'a code the codebook flags requires_timestamps, in a session that has none',
    skip: () =>
      timestampOnlyCode() === undefined
        ? `codebook ${loadCodebook().codebook_version} flags no code requires_timestamps, so there is no such ` +
          'code to misplace'
        : null,
    mutate: (report) => {
      const code = timestampOnlyCode();
      if (code === undefined) throw new Error('no code in the codebook is flagged requires_timestamps');
      episodeAt(report, 's04', LLM_RUN, 0).EPISODE = code;
    },
  },
  {
    id: 'episode-review-field-missing',
    rule: 'episode.review_field_missing',
    why: 'the unwritten review fields of §5.3 dropped rather than left null',
    mutate: (report) => {
      delete episodeAt(report, 's04', LLM_RUN, 0).reviewer_id;
    },
  },
  {
    id: 'episode-review-field-written',
    rule: 'episode.review_field_not_null',
    why: 'a review field written, which Gate 0 has no surface to write from',
    mutate: (report) => {
      episodeAt(report, 's04', LLM_RUN, 0).reviewed_at = '2026-09-17T12:00:00Z';
    },
  },

  // --- versions and timestamps --------------------------------------------
  {
    id: 'episodes-on-a-run-inside-the-report',
    rule: 'report.episodes_outside_sessions',
    why: 'the tiling set left on the run inside a report, where no rule would reach it',
    mutate: (report) => {
      const run = report.runs[0];
      if (!run) throw new Error('the fixture has no runs');
      run.episodes = [episodeAt(report, 's04', LLM_RUN, 0)];
    },
  },

  {
    id: 'run-codebook-version-differs',
    rule: 'run.codebook_version_mismatch',
    why: 'a run stamped under a different codebook version, which does not import',
    mutate: (report) => {
      const run = report.runs[0];
      if (!run) throw new Error('the fixture has no runs');
      run.codebook_version = '1.0.0';
    },
  },
  {
    id: 'run-domain-differs',
    rule: 'run.domain_mismatch',
    why: 'a run produced under another domain composition',
    mutate: (report) => {
      const run = report.runs[0];
      if (!run) throw new Error('the fixture has no runs');
      run.domain = 'physics';
    },
  },
  {
    id: 'session-timestamps-claimed-not-carried',
    rule: 'session.timestamps_missing',
    why: 'has_timestamps true with a turn that has no timing, which is what makes a timestamp-only code unsafe',
    mutate: (report) => {
      const turn = session(report, 's01').turns[3];
      if (!turn) throw new Error('the fixture session is too short');
      delete turn.start_time;
    },
  },

  // --- the session gate ----------------------------------------------------
  {
    id: 'session-gate-turn-count',
    rule: 'session_gate.turn_count_mismatch',
    why: 'a turn count that does not match the transcript it is counted from',
    mutate: (report) => {
      const entry = report.session_gate.sessions[0];
      if (!entry) throw new Error('the fixture has no session_gate entries');
      entry.turn_count -= 1;
    },
  },
  {
    id: 'session-gate-reportable',
    rule: 'session_gate.reportable_inconsistent',
    why: 'a short excerpt marked reportable',
    mutate: (report) => {
      const entry = report.session_gate.sessions.find((candidate) => candidate.session_id === 's04');
      if (!entry) throw new Error('the fixture has no s04 gate entry');
      entry.reportable = true;
    },
  },
  {
    id: 'session-gate-missing-entry',
    rule: 'session_gate.missing_session',
    why: 'a session with no gate decision recorded for it',
    mutate: (report) => {
      report.session_gate.sessions = report.session_gate.sessions.filter((entry) => entry.session_id !== 's04');
    },
  },

  // --- the agreement gate --------------------------------------------------
  {
    id: 'agreement-threshold-differs',
    rule: 'agreement.threshold_mismatch',
    why: 'a report carrying a gate other than the one in config',
    mutate: (report) => {
      report.agreement.threshold = 0.5;
    },
  },
  {
    id: 'agreement-measured-without-value',
    rule: 'agreement.measured_without_value',
    why: 'measured true with nothing measured',
    mutate: (report) => {
      report.agreement.value = null;
      report.agreement.band = null;
      report.agreement.state = 'unmeasured';
    },
  },
  {
    id: 'agreement-measured-false-with-value',
    rule: 'agreement.measured_false_with_value',
    why: 'a value carried by a report that says it measured nothing',
    mutate: (report) => {
      report.agreement.measured = false;
    },
  },
  {
    id: 'agreement-unmeasured-with-value',
    rule: 'agreement.unmeasured_with_value',
    why: 'the state that means "nothing was compared", carrying a number',
    mutate: (report) => {
      report.agreement.state = 'unmeasured';
    },
  },
  {
    id: 'agreement-shown-below-threshold',
    rule: 'agreement.shown_below_threshold',
    why: 'the layer surfacing under a value that should suppress it',
    mutate: (report) => {
      report.agreement.value = 0.3;
    },
  },
  {
    id: 'agreement-state-inconsistent',
    rule: 'agreement.state_inconsistent',
    why: 'suppression claimed over a value above the gate',
    mutate: (report) => {
      report.agreement.state = 'suppressed';
    },
  },
  {
    id: 'agreement-refusal-reported-as-unmeasured',
    rule: 'agreement.state_inconsistent',
    why:
      'a comparison refused while an annotation run exists, reported as unmeasured, which the report renders ' +
      'as no annotation run existing',
    mutate: (report) => {
      refuseComparison(report);
      report.agreement.state = 'unmeasured';
    },
  },
  {
    id: 'agreement-suppressed-without-refusal',
    rule: 'agreement.state_inconsistent',
    why: 'suppressed with a null value and no refusal recorded, so nothing says why there is no value',
    mutate: (report) => {
      refuseComparison(report);
      report.agreement.refusal = null;
      report.agreement.state = 'suppressed';
    },
  },
  {
    id: 'agreement-refusal-relabelled-no-annotation-run',
    rule: 'agreement.state_inconsistent',
    why: 'a refused comparison relabelled as no annotation run, while compared_runs still names the annotation run',
    mutate: (report) => {
      refuseComparison(report);
      report.agreement.refusal = { reason: 'no_annotation_run', detail: 'no annotation run exists for this student' };
      report.agreement.state = 'unmeasured';
    },
  },
  {
    id: 'agreement-band-differs',
    rule: 'agreement.band_mismatch',
    why: 'a band that is not the one the vendored interpreter gives for the value',
    mutate: (report) => {
      report.agreement.band = 'Moderate';
    },
  },
  {
    id: 'agreement-value-differs',
    rule: 'agreement.value_mismatch',
    why: 'a stored value that is not the kappa over the two runs it names',
    mutate: (report) => {
      report.agreement.value = 0.5;
      report.agreement.state = 'suppressed';
    },
  },
  {
    id: 'agreement-value-without-compared-runs',
    rule: 'agreement.value_mismatch',
    why: 'a value with nothing recorded to have produced it',
    mutate: (report) => {
      report.agreement.compared_runs = null;
    },
  },
  {
    id: 'agreement-refused-input-scored',
    rule: 'agreement.refused_input_scored',
    why:
      'an annotation run whose every episode carries a non-process code, so every compared turn falls in the ' +
      'one "not problem solving" class: a single class, which §5.4 refuses rather than scoring',
    mutate: (report) => {
      const code = nonProcessCode();
      for (const item of report.sessions) {
        for (const episode of item.annotations) {
          if (episode.run_id === HUMAN_RUN) episode.EPISODE = code;
        }
      }
    },
  },
  {
    id: 'agreement-simulated-not-declared',
    rule: 'agreement.simulated_mismatch',
    why: 'a generated annotation run compared against without the figure being labelled simulated',
    mutate: (report) => {
      report.agreement.simulated = false;
    },
  },
  {
    id: 'agreement-run-missing-labels',
    rule: 'agreement.run_missing_labels',
    why:
      'a compared model run that labels only part of the pooled turns: it has no episode in a reportable ' +
      'session, which no per-session tiling check sees',
    mutate: (report) => {
      const item = session(report, 's03');
      item.annotations = item.annotations.filter((episode) => episode.run_id !== LLM_RUN);
    },
  },
  {
    id: 'agreement-compared-runs-kinds',
    rule: 'agreement.compared_runs_kinds',
    why:
      'a model run compared against itself: the six classes are read differently from each side, so a ' +
      'comparison needs one annotation run and one model run',
    mutate: (report) => {
      report.agreement.compared_runs = [LLM_RUN, LLM_RUN];
    },
  },
  {
    id: 'agreement-not-recomputable',
    rule: 'agreement.not_recomputable',
    why:
      'two turns whose sequence ids are swapped against their order in the file: every span checks out in ' +
      'file order, but the gate reads turns in sequence order and refuses the model run there',
    mutate: (report) => {
      const [first, second] = session(report, 's01').turns;
      if (!first || !second) throw new Error('the fixture session is too short');
      [first.sequence_id, second.sequence_id] = [second.sequence_id, first.sequence_id];
    },
  },

  // --- claims --------------------------------------------------------------
  {
    id: 'claim-evidence-unresolved',
    rule: 'claim.evidence_unresolved',
    why: 'a claim whose evidence link goes nowhere',
    mutate: (report) => {
      const claim = report.claims[0];
      if (!claim) throw new Error('the fixture has no claims');
      claim.evidence_episode_ids = ['ep-not-here'];
    },
  },
  {
    id: 'claim-evidence-non-reportable',
    rule: 'claim.evidence_non_reportable_session',
    why: 'a claim resting on a session the session gate held back',
    mutate: (report) => {
      const claim = report.claims[0];
      if (!claim) throw new Error('the fixture has no claims');
      claim.evidence_episode_ids = [episodeAt(report, 's04', LLM_RUN, 0).episode_id];
    },
  },

  // --- D11 -----------------------------------------------------------------
  {
    id: 'd11-value-in-claim',
    rule: 'd11.learner_facing_number',
    why: 'the agreement value in a claim a parent reads',
    mutate: (report) => {
      const claim = report.claims[0];
      if (!claim) throw new Error('the fixture has no claims');
      claim.text = `${claim.text} The two readings of these sessions matched at ${String(report.agreement.value)}.`;
    },
  },
  {
    id: 'd11-band-in-summary',
    rule: 'd11.learner_facing_number',
    why: 'the band, which names the value, in the summary',
    mutate: (report) => {
      report.summary = `${report.summary} Agreement between the two readings was ${String(report.agreement.band)}.`;
    },
  },
  {
    id: 'd11-value-beside-threshold-on-card',
    rule: 'd11.learner_facing_number',
    why:
      'the value printed on the provenance card beside the threshold: the card states the threshold (INTENT.md, ' +
      '"Agreement: apparatus, not evidence"), and stating it must not let the value through',
    mutate: (report) => {
      report.provenance_card.push(
        `The layer surfaces when the two readings match at ${String(report.agreement.threshold)} or above; ` +
          `these matched at ${String(report.agreement.value)}.`,
      );
    },
  },

  // --- tags ----------------------------------------------------------------
  {
    id: 'cross-study-without-deviation',
    rule: 'tags.cross_study_without_deviation',
    why: 'a CROSS-STUDY tag with no entry in the audit trail behind it',
    mutate: (report) => {
      report.provenance_card.push(
        '[CROSS-STUDY: Li et al. (2025) and Rott et al. (2021) -> one combined index across both codebooks]',
      );
    },
  },
];
