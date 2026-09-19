// Builds one demo set: sessions, the planted plan beside each, and — for the
// sets that have one — a simulated annotation run. SPEC-gate0 §8.
//
// What a set does not contain: a report, an LLM run, or an agreement figure.
// Those are the pipeline's, and a set is what the pipeline is demonstrated on.
import { agreementKappa, type KappaResult } from '../agreement/kappa.ts';
import { codebookVersion, loadCodebookForSession, problemProcessCodes } from '../codebook/load.ts';
import { AGREEMENT_THRESHOLD, config } from '../config.ts';
import type { Episode, Run, Session, SessionProblem, Turn } from '../contract/types.ts';
import { writeJson } from '../storage/index.ts';
import { assertLinesExist, makeSpeaker, PROBLEMS, type Cue, type Problem, type Role } from './dialogue.ts';
import { fixtureLines, fixturePath, scheduleHash, type ScheduleEntry } from './fixture.ts';
import { perturb, type NoiseParams } from './perturb.ts';
import { plantPlan, totalTurns, turnLabels, type Tiling } from './plan.ts';
import { Prng } from './prng.ts';

export interface DemoSessionSpec {
  turns: number;
  hasTimestamps: boolean;
  /** How many problems the session is spent on. Default 1. */
  problems?: number;
}

export interface DemoSetSpec {
  setId: string;
  seed: number;
  /** Which state of SPEC §5.4 this set exists to render. */
  intendedState: 'shown' | 'suppressed' | 'unmeasured';
  sessions: DemoSessionSpec[];
  /** null means no annotation run at all, which is how `unmeasured` is reached. */
  noise: NoiseParams | null;
  /**
   * Sessions built from the pool lines of dialogue.ts although a stored
   * model-written file exists for them. A choice made for the set, not the
   * fallback taken when no stored file exists.
   */
  poolLineSessions?: string[];
}

export interface BuiltSet {
  setId: string;
  seed: number;
  intendedState: DemoSetSpec['intendedState'];
  sessionCount: number;
  turnCount: number;
  sessionTurnCounts: number[];
  sessionsWithoutTimestamps: number;
  runId: string | null;
  noise: NoiseParams | null;
  noiseCheck: KappaResult | null;
  fileCount: number;
  /** Per session: the per-turn schedule written into its plan file, and where its lines came from. */
  sessionSchedules: SessionSchedule[];
}

export interface SessionSchedule {
  sessionId: string;
  schedule: ScheduleEntry[];
  scheduleHash: string;
  lines: LineSource;
  /** Pool lines because the set spec names this session in poolLineSessions. */
  poolChosen: boolean;
}

export interface BuildOptions {
  /** Use the pool lines of dialogue.ts even where a stored file exists. */
  poolLines: boolean;
}

const LEAD_ROLE: Role = 'TUTOR';
const OTHER_ROLE: Role = 'STUDENT_1';

// The two speakers alternate, starting with the lead role. Episodes span both
// of them, which is the point of the unit (codebook.v2.json).
const roleAt = (index: number): Role => (index % 2 === 0 ? LEAD_ROLE : OTHER_ROLE);

// [OURS: of the problem-solving stretches that would open on the lead role's
// turn, the share moved to open on the other role's turn instead. Planted at
// random, about half of all stretches open on a student turn; this raises that
// so Layer 2, whose items are the tutor turns just before such stretches
// (docs/SPEC-layer2.md), has enough items in the demo to reach its own pooled
// floor (config/gate0.json moves.minItemsForAgreement). A demo-data setting
// chosen by running the generator, not a rate taken from any tutoring corpus.]
const STUDENT_OPENED_SHARE = 0.8;

// Fixed so a regenerated set is byte-identical. Nothing here reads the clock.
const FIRST_SESSION_DATE = Date.UTC(2026, 0, 13);
const DAYS_BETWEEN_SESSIONS = 7;
const SESSION_START_HOUR = 16;
const DAY_MS = 86_400_000;

const UI_LABEL = 'Simulated session data, generated for this demo. Not a real tutoring session.';

function sessionDateOf(index: number): string {
  return new Date(FIRST_SESSION_DATE + index * DAYS_BETWEEN_SESSIONS * DAY_MS).toISOString().slice(0, 10);
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

interface Segment {
  tiling: Tiling;
  problem: Problem;
}

/**
 * For a share of the problem-solving stretches that open on the lead role's
 * turn, moves the boundary in front of it by one turn so the stretch opens on
 * the other role's turn. Codes, their order and the segment's length are
 * unchanged, and so is every other boundary. `firstTurn` is the session index
 * of the segment's first turn, which is what fixes whose turn a boundary is.
 */
function openOnOtherRole(tiling: Tiling, firstTurn: number, process: ReadonlySet<string>, rng: Prng): Tiling {
  const shifted = tiling.map((episode) => ({ ...episode }));
  let start = firstTurn + shifted[0]!.turns;
  for (let i = 1; i < shifted.length; i += 1) {
    const previous = shifted[i - 1]!;
    const episode = shifted[i]!;
    if (process.has(episode.code) && roleAt(start) === LEAD_ROLE && rng.chance(STUDENT_OPENED_SHARE)) {
      // One turn earlier where the stretch before can spare it, later if not.
      // Neither is left shorter than an exchange: two turns before, three here
      // (an opening, a follow, and the work itself).
      if (previous.turns > 2) {
        previous.turns -= 1;
        episode.turns += 1;
        start -= 1;
      } else if (episode.turns > 3) {
        previous.turns += 1;
        episode.turns -= 1;
        start += 1;
      }
    }
    start += episode.turns;
  }
  return shifted;
}

/**
 * Which turns sit at a boundary the student's turn opens: that turn, the
 * tutor turn before it and the tutor turn after it, so the lines there read as
 * one stretch closing and the next opening (src/generator/dialogue.ts).
 */
function boundaryCues(segments: Segment[], process: ReadonlySet<string>): Array<Cue | undefined> {
  const cues: Array<Cue | undefined> = [];
  let start = 0;
  for (const segment of segments) {
    segment.tiling.forEach((episode, i) => {
      if (i > 0 && process.has(episode.code) && roleAt(start) === OTHER_ROLE) {
        // A one-turn stretch before it has only the turn that opened it.
        if (segment.tiling[i - 1]!.turns > 1) cues[start - 1] = 'handoff';
        // An opening line says what comes next without doing it, so it needs
        // room after it; a shorter stretch opens on an ordinary line of its
        // kind. The follow is overwritten with 'handoff' when the next stretch
        // opens right after it.
        if (episode.turns >= 3) {
          cues[start] = 'opening';
          cues[start + 1] = 'follow';
        }
      }
      start += episode.turns;
    });
  }
  return cues;
}

/** Where a session's lines came from: a stored model-written file, or the pool in dialogue.ts. */
export type LineSource = 'model' | 'pool';

interface BuiltTurns {
  turns: Turn[];
  schedule: ScheduleEntry[];
  lines: LineSource;
}

function buildTurns(
  sessionId: string,
  segments: Segment[],
  hasTimestamps: boolean,
  date: string,
  rng: Prng,
  poolLines: boolean,
): BuiltTurns {
  // One speaker function per problem, so the lines of a segment are about the
  // problem that segment is spent on.
  const labels: string[] = [];
  const topics: string[] = [];
  const speakers: Array<(code: string, role: Role, cue?: Cue) => string> = [];
  for (const segment of segments) {
    const segmentLabels = turnLabels(segment.tiling);
    const speak = makeSpeaker(segment.problem, rng);
    for (const label of segmentLabels) {
      labels.push(label);
      topics.push(segment.problem.topic);
      speakers.push(speak);
    }
  }
  const cues = boundaryCues(segments, problemProcessCodes());
  const schedule: ScheduleEntry[] = labels.map((code, index) => ({
    index,
    turn_id: `${sessionId}-t${pad(index + 1, 3)}`,
    role: roleAt(index),
    code,
    cue: cues[index] ?? null,
    problem_topic: topics[index]!,
  }));
  const written = poolLines ? null : fixtureLines(sessionId, schedule);
  let clock = Date.parse(`${date}T${pad(SESSION_START_HOUR, 2)}:00:00Z`);

  const turns = labels.map((code, index) => {
    const role = roleAt(index);
    // The speaker is called even when a stored line replaces what it says, so
    // the draws after it — timestamps, the next session, the simulated
    // annotation run — are the same whichever lines are used.
    const spoken = speakers[index]!(code, role, cues[index]);
    const turn: Turn = {
      _id: String(index),
      session_id: sessionId,
      sequence_id: index + 1,
      role,
      content: written === null ? spoken : written[index]!,
      turn_id: schedule[index]!.turn_id,
    };
    if (hasTimestamps) {
      const duration = rng.int(12, 70) * 1000;
      turn.start_time = new Date(clock).toISOString();
      turn.end_time = new Date(clock + duration).toISOString();
      clock += duration + rng.int(0, 8) * 1000;
    }
    return turn;
  });
  return { turns, schedule, lines: written === null ? 'pool' : 'model' };
}

function buildEpisodes(tiling: Tiling, session: Session, run: Run, codebookVersion: string): Episode[] {
  const shortId = session.session_id.slice(session.session_id.lastIndexOf('-') + 1);
  const episodes: Episode[] = [];
  let cursor = 0;

  tiling.forEach((planned, index) => {
    const span = session.turns.slice(cursor, cursor + planned.turns);
    const first = span[0];
    const last = span[span.length - 1];
    if (first === undefined || last === undefined) throw new Error('Episode with no turns');
    episodes.push({
      _id: String(index),
      episode_id: `ep-${run.run_id}-${shortId}-${pad(index + 1, 3)}`,
      run_id: run.run_id,
      // Follows the run's kind, never set per episode (SPEC §5.3).
      identifiedBy: run.kind === 'human' ? 'HUMAN' : 'AI',
      layer_id: 'episodes',
      codebook_version: codebookVersion,
      domain: run.domain,
      EPISODE: planned.code,
      start_turn_id: first.turn_id,
      end_turn_id: last.turn_id,
      evidence: span.map((turn) => turn.turn_id),
      // Present and null. Nothing in Gate 0 writes these (SPEC §5.3).
      reviewer_id: null,
      reviewed_at: null,
    });
    cursor += planned.turns;
  });

  return episodes;
}

export function buildSet(spec: DemoSetSpec, options: BuildOptions): BuiltSet {
  const rng = new Prng(spec.seed);
  // A stream of its own, so moving boundaries leaves every other draw — and so
  // the planted codes the seeds were chosen for — as it was.
  const boundaryRng = new Prng(spec.seed + 1);
  const process = problemProcessCodes();
  const version = codebookVersion();
  const setDir = `${config.paths.demoDir}/${spec.setId}`;
  const studentId = `stu-${spec.setId}`;
  let fileCount = 0;

  const sessions: Session[] = [];
  const plans: Tiling[] = [];
  const annotationTilings: Tiling[] = [];
  const sessionSchedules: SessionSchedule[] = [];

  spec.sessions.forEach((sessionSpec, index) => {
    const sessionId = `${spec.setId}-s${pad(index + 1, 2)}`;
    const date = sessionDateOf(index);
    const available = loadCodebookForSession(sessionSpec.hasTimestamps).codes;
    assertLinesExist(available.map((entry) => entry.code), process);

    // A session is spent on one problem, or on more than one. Each problem gets
    // its own plan over its own share of the turns, so no episode straddles a
    // boundary: a new problem is new work, whatever kind of work it is.
    const problemCount = Math.max(1, sessionSpec.problems ?? 1);
    const share = Math.floor(sessionSpec.turns / problemCount);
    const segments: Segment[] = [];
    for (let p = 0; p < problemCount; p += 1) {
      const budget = p === problemCount - 1 ? sessionSpec.turns - share * (problemCount - 1) : share;
      segments.push({
        tiling: openOnOtherRole(plantPlan(available, budget, rng), share * p, process, boundaryRng),
        problem: PROBLEMS[rng.int(0, PROBLEMS.length - 1)]!,
      });
    }

    const plan = segments.flatMap((segment) => segment.tiling);
    const poolChosen = spec.poolLineSessions?.includes(sessionId) ?? false;
    const built = buildTurns(sessionId, segments, sessionSpec.hasTimestamps, date, rng, options.poolLines || poolChosen);
    const turns = built.turns;
    sessionSchedules.push({
      sessionId,
      schedule: built.schedule,
      scheduleHash: scheduleHash(built.schedule),
      lines: built.lines,
      poolChosen,
    });

    const problems: SessionProblem[] = [];
    let at = 0;
    segments.forEach((segment, p) => {
      const length = totalTurns(segment.tiling);
      const first = turns[at];
      const last = turns[at + length - 1];
      if (!first || !last) throw new Error(`${sessionId}: problem ${p + 1} has no turns`);
      problems.push({
        problem_id: `${sessionId}-p${pad(p + 1, 2)}`,
        topic: segment.problem.topic,
        start_turn_id: first.turn_id,
        end_turn_id: last.turn_id,
      });
      at += length;
    });

    const session: Session = {
      session_id: sessionId,
      student_id: studentId,
      session_index: index + 1,
      session_date: date,
      session_topic: problems.map((entry) => entry.topic).join(' · '),
      has_timestamps: sessionSpec.hasTimestamps,
      transcript_scope: 'full',
      problems,
      turns,
    };

    sessions.push(session);
    plans.push(plan);
    if (spec.noise !== null) annotationTilings.push(perturb(plan, available, spec.noise, rng));
  });

  let run: Run | null = null;
  let episodes: Episode[] = [];
  if (spec.noise !== null) {
    run = {
      run_id: `run-human-${spec.setId}-001`,
      kind: 'human',
      simulated: true,
      model: null,
      prompt_hash: null,
      annotator_id: 'sim-annotator-01',
      codebook_version: version,
      domain: config.codebook.domain,
      // Derived from the last session's date, not from the clock, so the file
      // does not change when it is regenerated.
      created_at: `${sessionDateOf(spec.sessions.length - 1)}T18:00:00.000Z`,
    };
    const currentRun = run;
    // The simulated annotator marks what a tutor marks: the problem-solving
    // work only. Its other stretches are left unmarked, which the comparison
    // reads as not problem solving (src/agreement/gate.ts).
    episodes = sessions
      .flatMap((session, index) => buildEpisodes(annotationTilings[index]!, session, currentRun, version))
      .filter((episode) => process.has(episode.EPISODE));
  }

  // How much noise actually went in: the simulated annotation run against the
  // planted plan it was perturbed from. A set cannot be tuned to a side of the
  // threshold without measuring where it lands, and this is that measurement.
  // It is NOT SPEC §5.4's figure, which compares an annotation run with an LLM
  // run, and it is not §8's generator fidelity, which is about transcripts and
  // is not measured in Gate 0. Nothing downstream consumes it.
  // [OURS: the readout, and recording it in the set manifest.]
  let noiseCheck: KappaResult | null = null;
  if (spec.noise !== null) {
    noiseCheck = agreementKappa(
      plans.flatMap((plan) => turnLabels(plan)),
      annotationTilings.flatMap((tiling) => turnLabels(tiling)),
    );
  }

  for (const [index, session] of sessions.entries()) {
    // lead_role is supplied with the data and never inferred (SPEC §5.8).
    // src/contract/types.ts Session has no field for it; schema/transcript.schema.json
    // has an optional one, so it is written to the file and not to the type.
    writeJson(`${setDir}/sessions/${session.session_id}.json`, { ...session, lead_role: LEAD_ROLE });
    writeJson(`${setDir}/plans/${session.session_id}.plan.json`, {
      $comment:
        'The planted episode plan this session was generated from. It is not a labelling run, ' +
        'nothing is scored against it, and no report reads it (SPEC-gate0 §8). It is here so a ' +
        'reader can see what the transcript was built to contain.',
      set_id: spec.setId,
      session_id: session.session_id,
      seed: spec.seed,
      turn_count: session.turns.length,
      episodes: plans[index]!.map((planned, ordinal) => ({ ordinal: ordinal + 1, ...planned })),
      $comment_schedule:
        '[OURS] The same plan turn by turn: speaker, planted code, boundary cue and problem. ' +
        'scripts/write-dialogue.ts writes the session\'s lines from it, and schedule_hash (sha256 of its ' +
        `canonical JSON) ties the stored lines at ${fixturePath(session.session_id)} to it.`,
      schedule_hash: sessionSchedules[index]!.scheduleHash,
      schedule: sessionSchedules[index]!.schedule,
    });
    fileCount += 2;
  }

  if (run !== null) {
    // The run's own fields with its episodes beside them, which is the shape
    // schema/run.schema.json defines for a standalone run file.
    writeJson(`${setDir}/runs/${run.run_id}.json`, { ...run, episodes });
    fileCount += 1;
  }

  writeJson(`${setDir}/set.json`, {
    set_id: spec.setId,
    student_id: studentId,
    data_provenance: { status: 'synthetic', ui_label: UI_LABEL },
    intended_state: spec.intendedState,
    $comment_intended_state:
      'Which state of SPEC-gate0 §5.4 this set exists to render. It is what the set was tuned ' +
      'for, not a result: the state a report shows is computed from the kappa between this ' +
      "set's annotation run and the LLM run, and nothing reads this field to decide it.",
    generator: {
      seed: spec.seed,
      lead_role: LEAD_ROLE,
      $comment_lead_role:
        'SPEC-gate0 §5.8: the lead role is supplied with the data and never inferred. ' +
        'src/contract/types.ts Session has no field for it, so it is recorded here.',
      noise: spec.noise,
    },
    dialogue: {
      $comment:
        '[OURS] Where each session\'s lines came from. model_written: a stored file under ' +
        'src/generator/dialogue/, written by a model from the planted schedule (scripts/write-dialogue.ts); ' +
        'nothing checks that a line fits its planted code (docs/DEVIATIONS.md D-034). pool: the fallback ' +
        'lines in src/generator/dialogue.ts, which can repeat within a session. pool_chosen: the sessions ' +
        'in pool that use pool lines by choice although a stored file exists for them, because pool lines ' +
        'follow the planted plan a simulated annotation run is built from [OURS: owner decision 2026-09-18, ' +
        'SPEC D19].',
      model_written: sessionSchedules.filter((entry) => entry.lines === 'model').map((entry) => entry.sessionId),
      pool: sessionSchedules.filter((entry) => entry.lines === 'pool').map((entry) => entry.sessionId),
      pool_chosen: sessionSchedules.filter((entry) => entry.poolChosen).map((entry) => entry.sessionId),
    },
    sessions: sessions.map((session, index) => ({
      session_id: session.session_id,
      session_index: session.session_index,
      session_date: session.session_date,
      turn_count: session.turns.length,
      has_timestamps: session.has_timestamps,
      transcript_scope: session.transcript_scope,
      file: `sessions/${session.session_id}.json`,
      plan_file: `plans/${session.session_id}.plan.json`,
      planted_episode_count: plans[index]!.length,
    })),
    runs:
      run === null
        ? []
        : [
            {
              run_id: run.run_id,
              kind: run.kind,
              simulated: run.simulated,
              file: `runs/${run.run_id}.json`,
              episode_count: episodes.length,
            },
          ],
    noise_check:
      noiseCheck === null
        ? null
        : {
            $comment:
              '[OURS] A readout of the noise injected into the simulated annotation run: ' +
              "turn-level Cohen's kappa between that run and the planted plan, through " +
              'src/agreement/kappa.ts. A generator tuning knob, not an agreement figure. It is ' +
              'not SPEC-gate0 §5.4 (which compares the annotation run with the LLM run) and not ' +
              '§8 generator fidelity (which is about transcripts and is not measured in Gate 0). ' +
              'Nothing consumes it.',
            statistic: "Cohen's kappa",
            unit: 'turn',
            compared: 'simulated annotation run against the planted plan',
            threshold: AGREEMENT_THRESHOLD,
            ...noiseCheck,
          },
  });
  fileCount += 1;

  return {
    setId: spec.setId,
    seed: spec.seed,
    intendedState: spec.intendedState,
    sessionCount: sessions.length,
    turnCount: sessions.reduce((sum, session) => sum + session.turns.length, 0),
    sessionTurnCounts: sessions.map((session) => session.turns.length),
    sessionsWithoutTimestamps: sessions.filter((session) => !session.has_timestamps).length,
    runId: run?.run_id ?? null,
    noise: spec.noise,
    noiseCheck,
    fileCount,
    sessionSchedules,
  };
}
