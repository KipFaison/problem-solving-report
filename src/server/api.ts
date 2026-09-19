// The endpoints the page calls. The API key lives here, on the server side of
// this boundary, and never reaches the browser.
//
// What each one does maps to the loop the demo has to support: annotate a
// session, save it, run the model on that same transcript, see the agreement
// between the two, and read a report built from that run.
import { codebookVersion, loadCodebookForSession, problemProcessCodes } from '../codebook/load.ts';
import { config } from '../config.ts';
import { segmentSession } from '../pipeline/segment.ts';
import { summarise } from '../pipeline/summarise.ts';
import { describeItems, describeQuotes, type DescribeItem, type DescribeResult } from '../pipeline/describe.ts';
import { assembleReport, aggregatesFor, sessionGate } from '../pipeline/report.ts';
import { UsageLog } from '../pipeline/usage.ts';
import { parseTranscript, type IntakeMeta } from './intake.ts';
import {
  assertSessionId,
  computeWorkspaceAgreement,
  hasRuns,
  isLocked,
  sessionExists,
  listSessions,
  loadMovesMarks,
  loadReport,
  loadRun,
  loadSession,
  loadWorkspace,
  pooledShown,
  saveMovesMarks,
  saveReport,
  saveRun,
  saveSession,
  saveWorkspace,
  withTutorPrompting,
  type StoredRun,
} from './workspace.ts';
import { selectItems } from '../moves/items.ts';
import { classifySession } from '../moves/classify.ts';
import { loadMovesCodebook, moveCodes } from '../moves/codebook.ts';
import { computeMovesAgreement } from '../moves/agreement.ts';
import type { Agreement, CallUsage, Episode, MovesMarks, RunShown, Session, Turn } from '../contract/types.ts';
import { drawSample } from '../sampling/draw.ts';
import { spawnSync } from 'node:child_process';

export interface ApiResult {
  status: number;
  body: unknown;
}

const ok = (body: unknown): ApiResult => ({ status: 200, body });
const bad = (message: string): ApiResult => ({ status: 400, body: { error: message } });

/**
 * A session that arrived annotated and read by the model is locked on the
 * tutor side for the demo (SPEC D19): its annotation is not saved over and the
 * model is not run on it again. Layer 2's routes and the report are not
 * affected. [OURS: docs/DEVIATIONS.md]
 */
const lockedRefusal = (): ApiResult => ({
  status: 409,
  body: { error: 'This session is locked: it arrived annotated and read by the model.' },
});

/** A turn of a locked session as getSession sends it: who spoke, in what order and when, not what was said (SPEC D19). */
export type TurnOutline = Omit<Turn, 'content' | 'annotations'>;
/** A locked session as getSession sends it: every field but the text of its turns. */
export type SessionOutline = Omit<Session, 'turns'> & { turns: TurnOutline[] };

function outlineOf(session: Session): SessionOutline {
  return {
    ...session,
    turns: session.turns.map((t) => ({
      _id: t._id,
      session_id: t.session_id,
      sequence_id: t.sequence_id,
      role: t.role,
      turn_id: t.turn_id,
      start_time: t.start_time,
      end_time: t.end_time,
    })),
  };
}

/** Everything the page needs to draw itself. */
export function getState(): ApiResult {
  const workspace = loadWorkspace();
  const sessions = listSessions();
  const agreement = computeWorkspaceAgreement();
  const gate = sessionGate(sessions);
  const locked = new Set(workspace.locked_session_ids ?? []);

  return ok({
    workspace,
    agreement,
    // Layer 2's own figure. Never pooled or combined with `agreement` above.
    moves_agreement: computeMovesAgreement(),
    session_gate: gate,
    report: loadReport(),
    sessions: sessions.map((s) => {
      const runs = hasRuns(s.session_id);
      return {
        session_id: s.session_id,
        session_index: s.session_index,
        session_date: s.session_date,
        session_topic: s.session_topic ?? null,
        turn_count: s.turns.length,
        has_timestamps: s.has_timestamps,
        problems: s.problems ?? null,
        annotated: runs.annotated,
        modelled: runs.modelled,
        // Whether the annotation was generated for the demo rather than made by
        // a tutor. The page must not say "a tutor annotated" about a generated one.
        annotation_simulated: runs.annotated ? loadRun(s.session_id, 'human')?.simulated === true : null,
        locked: locked.has(s.session_id),
      };
    }),
  });
}

export function getSession(sessionId: string): ApiResult {
  let session: Session;
  try {
    session = loadSession(sessionId);
  } catch {
    return bad(`no session ${sessionId}`);
  }
  const locked = isLocked(sessionId);
  return ok({
    locked,
    // A locked session goes out without the text of its turns (SPEC D19). The
    // report, built by buildReport, still carries them as evidence.
    session: locked ? outlineOf(session) : session,
    human: loadRun(sessionId, 'human'),
    llm: loadRun(sessionId, 'llm'),
    // What a tutor is shown by default: one whole problem, or null where the
    // session is shown whole (src/sampling/draw.ts, SPEC D18).
    sample: drawSample(session, config),
  });
}

interface AnnotationBody {
  annotator_id?: string;
  episodes: Array<{ code: string; start_turn_id: string; end_turn_id: string }>;
  /** Which view the tutor marked in. Absent means the whole session (SPEC D18). */
  shown?: 'sample' | 'whole_session';
}

/**
 * Save a tutor's marking of one session. A tutor marks the problem-solving
 * work and nothing else: a turn left unmarked counts as not problem solving
 * when the two readings are compared (src/agreement/gate.ts). So the marking
 * need not cover every turn, but it may use only the five problem-solving
 * codes, and no two stretches may overlap.
 */
export function putAnnotation(sessionId: string, body: AnnotationBody): ApiResult {
  let session: Session;
  try {
    session = loadSession(sessionId);
  } catch {
    return bad(`no session ${sessionId}`);
  }
  if (isLocked(sessionId)) return lockedRefusal();

  const order = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  const process = problemProcessCodes();
  const allowed = new Set(
    loadCodebookForSession(session.has_timestamps)
      .codes.map((c) => c.code)
      .filter((code) => process.has(code)),
  );
  if (!Array.isArray(body.episodes) || body.episodes.length === 0) {
    return bad('mark at least one stretch of problem-solving work before saving');
  }

  // What the tutor was shown is saved with the marking, and agreement compares
  // those turns only (SPEC D18). For a sample the turns are drawn again here,
  // from config, and never taken from the page.
  const mode = body.shown ?? 'whole_session';
  if (mode !== 'sample' && mode !== 'whole_session') {
    return bad(`shown is ${JSON.stringify(body.shown)}; it is "sample" or "whole_session"`);
  }
  let shown: RunShown;
  if (mode === 'sample') {
    const sample = drawSample(session, config);
    if (sample === null) {
      return bad('this session has no sampled problem: it is shown whole, so save it as the whole session');
    }
    shown = {
      mode: 'sample',
      turn_ids: sample.turn_ids,
      problem_ids: sample.problem_ids,
      sampling: { problems_per_session: sample.problems_per_session, seed: sample.seed },
    };
  } else {
    shown = {
      mode: 'whole_session',
      turn_ids: [...session.turns].sort((x, y) => x.sequence_id - y.sequence_id).map((t) => t.turn_id),
      problem_ids: (session.problems ?? []).map((p) => p.problem_id),
      sampling: null,
    };
  }
  const shownIds = new Set(shown.turn_ids);
  const sorted = [...body.episodes].sort(
    (a, b) => (order.get(a.start_turn_id) ?? 0) - (order.get(b.start_turn_id) ?? 0),
  );

  let nextFree = 0;
  for (const [i, e] of sorted.entries()) {
    const start = order.get(e.start_turn_id);
    const end = order.get(e.end_turn_id);
    if (start === undefined || end === undefined) return bad(`stretch ${i + 1}: a turn id is not in this session`);
    if (end < start) return bad(`stretch ${i + 1}: ends before it starts`);
    if (!allowed.has(e.code)) {
      return bad(`stretch ${i + 1}: ${e.code} is not one of the problem-solving codes a tutor marks`);
    }
    if (start < nextFree) return bad(`stretch ${i + 1} overlaps the one before it`);
    nextFree = end + 1;
    // Nothing is clipped to fit: a stretch that reaches past what was shown is
    // refused whole. [OURS: a stretch whose ends are both shown can still
    // cross turns that were not, where two problems apart are drawn.]
    if (!shownIds.has(e.start_turn_id)) return bad(`stretch ${i + 1}: starts outside the sample`);
    if (!shownIds.has(e.end_turn_id)) return bad(`stretch ${i + 1}: ends outside the sample`);
    if (session.turns.slice(start, end + 1).some((t) => !shownIds.has(t.turn_id))) {
      return bad(`stretch ${i + 1}: runs over turns outside the sample`);
    }
  }

  // Two TOUCHING stretches marked with the same code are one episode, not two:
  // a tutor who marks turns 78-79 and then turn 80 as the same kind of work has
  // marked one stretch of it. Two same-code stretches with unmarked turns
  // between them stay two: the gap is the tutor saying those turns are not
  // problem solving, and joining across it would count them as the code.
  const merged: typeof sorted = [];
  for (const e of sorted) {
    const previous = merged[merged.length - 1];
    const touches =
      previous !== undefined &&
      (order.get(previous.end_turn_id) ?? -2) + 1 === (order.get(e.start_turn_id) ?? -1);
    if (previous && previous.code === e.code && touches) previous.end_turn_id = e.end_turn_id;
    else merged.push({ ...e });
  }

  const runId = `run-human-${sessionId}`;
  const episodes: Episode[] = merged.map((e, i) => {
    const start = order.get(e.start_turn_id) ?? 0;
    const end = order.get(e.end_turn_id) ?? start;
    return {
      _id: String(i),
      episode_id: `ep-${runId}-${String(i + 1).padStart(3, '0')}`,
      run_id: runId,
      identifiedBy: 'HUMAN',
      layer_id: 'episodes',
      codebook_version: codebookVersion(),
      domain: config.codebook.domain,
      EPISODE: e.code,
      start_turn_id: e.start_turn_id,
      end_turn_id: e.end_turn_id,
      evidence: session.turns.slice(start, end + 1).map((t) => t.turn_id),
      reviewer_id: null,
      reviewed_at: null,
    };
  });

  const run: StoredRun = {
    run_id: runId,
    kind: 'human',
    simulated: false,
    model: null,
    prompt_hash: null,
    annotator_id: body.annotator_id ?? 'tutor',
    codebook_version: codebookVersion(),
    domain: config.codebook.domain,
    created_at: new Date().toISOString(),
    shown,
    episodes,
  };

  saveRun(sessionId, run);
  // The model is not re-run: saving an annotation recomputes the agreement and
  // nothing else. The report keeps whatever the model last produced.
  return ok({ saved: run.run_id, episodes: episodes.length, agreement: computeWorkspaceAgreement() });
}

/** Run the model on one session, now, and keep what it produced. */
export async function generate(sessionId: string): Promise<ApiResult> {
  let session: Session;
  try {
    session = loadSession(sessionId);
  } catch {
    return bad(`no session ${sessionId}`);
  }
  if (isLocked(sessionId)) return lockedRefusal();

  const composed = loadCodebookForSession(session.has_timestamps);
  const allowed = new Set(composed.codes.map((c) => c.code));
  const runId = `run-llm-${sessionId}`;
  const usage = new UsageLog();

  try {
    const result = await segmentSession(session, runId, codebookVersion(), config.codebook.domain, allowed);
    usage.record('segment', result.usage, sessionId);

    const run: StoredRun = {
      run_id: runId,
      kind: 'llm',
      simulated: false,
      model: config.model.id,
      prompt_hash: result.prompt_hash,
      annotator_id: null,
      codebook_version: codebookVersion(),
      domain: config.codebook.domain,
      created_at: new Date().toISOString(),
      usage: usage.toRunUsage(),
      merged_adjacent: result.merged_adjacent,
      episodes: result.episodes,
    };
    saveRun(sessionId, run);

    // Layer 2 runs on what was just segmented. The episode run is already
    // saved, so a failure here costs this layer's labels and nothing else;
    // it is reported, not thrown. [OURS: the layers are independent, so one
    // layer's failure does not discard the other's output.]
    let moves: MovesOutcome;
    try {
      const stored = await storeMoves(session, run);
      moves = { ok: true, items: stored.items, classified: stored.classified };
    } catch (error) {
      moves = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    return ok({ run_id: runId, episodes: result.episodes.length, agreement: computeWorkspaceAgreement(), moves });
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error));
  }
}

// --- Layer 2 (docs/SPEC-layer2.md) -----------------------------------------
//
// What the tutor did in the one turn before a student-opened problem-solving
// episode of the model run. Its own codebook, its own marks file and its own
// agreement figure; nothing here reads or writes the episode annotation.

/** What generate() says about the Layer 2 pass it ran after segmenting. */
export type MovesOutcome = { ok: true; items: number; classified: number } | { ok: false; error: string };

/** One item as a screen draws it: the tutor turn, the student turn after it, and both labels. */
export interface MoveItemView {
  episode_id: string;
  preceding_turn_id: string;
  /** The role string of the turn before the episode, as the transcript has it. */
  preceding_speaker: string;
  preceding_text: string;
  /** The episode's first turn, a student's. */
  following_turn_id: string;
  following_speaker: string;
  following_text: string;
  /** False when the turn before is not the tutor's: nothing to classify or mark. */
  classifiable: boolean;
  /** The model's code; null when not classifiable or not yet classified. */
  model_move: string | null;
  /** The tutor's mark; null when not marked. */
  tutor_mark: string | null;
}

export interface SessionMoves {
  session_id: string;
  /** codebook.tutor-moves.json's current version. */
  codebook_version: string;
  /** Null when the model has not read this session, and so there are no items. */
  model_run_id: string | null;
  /** True when every item carries the model's Layer 2 result. False when there are no items. */
  classified: boolean;
  /** The layer codebook version the model's labels were made under; null when unclassified. */
  model_codebook_version: string | null;
  /** Who marked and when; the marks themselves are on the items. */
  marks: Omit<MovesMarks, 'marks'> | null;
  items: MoveItemView[];
}

function movesView(session: Session, run: StoredRun | null): SessionMoves {
  const codebook_version = loadMovesCodebook().codebook_version;
  const stored = loadMovesMarks(session.session_id);
  const marks: SessionMoves['marks'] = stored
    ? { session_id: stored.session_id, codebook_version: stored.codebook_version, annotator_id: stored.annotator_id, simulated: stored.simulated, created_at: stored.created_at }
    : null;
  if (!run) {
    return { session_id: session.session_id, codebook_version, model_run_id: null, classified: false, model_codebook_version: null, marks, items: [] };
  }
  const items = selectItems(session, run.episodes, problemProcessCodes());
  const byEpisode = new Map(run.episodes.map((e) => [e.episode_id, e]));
  const prompting = items.map((item) => byEpisode.get(item.episode_id)?.tutor_prompting ?? null);
  const versions = prompting.filter((p) => p !== null).map((p) => p.codebook_version);
  return {
    session_id: session.session_id,
    codebook_version,
    model_run_id: run.run_id,
    classified: items.length > 0 && prompting.every((p) => p !== null),
    model_codebook_version: versions[0] ?? null,
    marks,
    items: items.map((item, i) => ({
      episode_id: item.episode_id,
      preceding_turn_id: item.preceding_turn.turn_id,
      preceding_speaker: item.preceding_turn.role,
      preceding_text: item.preceding_turn.content,
      following_turn_id: item.opening_turn.turn_id,
      following_speaker: item.opening_turn.role,
      following_text: item.opening_turn.content,
      classifiable: item.classifiable,
      model_move: prompting[i]?.tutor_move ?? null,
      tutor_mark: item.classifiable ? (stored?.marks[item.preceding_turn.turn_id] ?? null) : null,
    })),
  };
}

/**
 * Classify one session's items and keep the result on its model run, with the
 * call's usage recorded under purpose 'moves'. Throws when the model's answer
 * is rejected; the run on disk is then left as it was.
 */
async function storeMoves(
  session: Session,
  run: StoredRun,
): Promise<{ items: number; classified: number; usage: CallUsage | null; prompt_hash: string | null }> {
  const items = selectItems(session, run.episodes, problemProcessCodes());
  const result = await classifySession(session, items);
  const labels = new Map(result.labels.map((l) => [l.preceding_turn_id, l.code]));
  const updated = withTutorPrompting(run, items, labels, result.codebook_version);
  if (result.usage) {
    const log = new UsageLog(run.usage);
    log.record('moves', result.usage, session.session_id);
    updated.usage = log.toRunUsage();
  }
  saveRun(session.session_id, updated);
  return { items: items.length, classified: result.labels.length, usage: result.usage, prompt_hash: result.prompt_hash };
}

/** GET /api/session/:id/moves */
export function getMoves(sessionId: string): ApiResult {
  let session: Session;
  try {
    session = loadSession(sessionId);
  } catch {
    return bad(`no session ${sessionId}`);
  }
  return ok(movesView(session, loadRun(sessionId, 'llm')));
}

/** POST /api/session/:id/moves/classify: run the Layer 2 model call on this session now. */
export async function classifyMoves(sessionId: string): Promise<ApiResult> {
  let session: Session;
  try {
    session = loadSession(sessionId);
  } catch {
    return bad(`no session ${sessionId}`);
  }
  const run = loadRun(sessionId, 'llm');
  if (!run) return bad(`the model has not read ${sessionId} yet, so there are no episodes to find tutor turns before`);
  try {
    const stored = await storeMoves(session, run);
    return ok({
      ...movesView(session, loadRun(sessionId, 'llm')),
      usage: stored.usage,
      prompt_hash: stored.prompt_hash,
      moves_agreement: computeMovesAgreement(),
    });
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error));
  }
}

interface MovesBody {
  annotator_id?: string;
  marks?: Record<string, string>;
}

/**
 * PUT /api/session/:id/moves: save a tutor's marks for this session's items,
 * replacing any saved before. Every key must be a classifiable item's
 * preceding turn id and every value one of the five layer codes; anything
 * else refuses the whole save.
 */
export function putMoves(sessionId: string, body: MovesBody): ApiResult {
  let session: Session;
  try {
    session = loadSession(sessionId);
  } catch {
    return bad(`no session ${sessionId}`);
  }
  const run = loadRun(sessionId, 'llm');
  if (!run) return bad(`the model has not read ${sessionId} yet, so there are no tutor turns to mark`);

  const raw = body.marks;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return bad('marks must be an object of preceding_turn_id to code');
  }
  const entries = Object.entries(raw);
  if (entries.length === 0) return bad('mark at least one tutor turn before saving');

  const classifiable = new Set(
    selectItems(session, run.episodes, problemProcessCodes())
      .filter((item) => item.classifiable)
      .map((item) => item.preceding_turn.turn_id),
  );
  const codes = moveCodes();
  for (const [id, code] of entries) {
    if (!classifiable.has(id)) return bad(`${id} is not a tutor turn this layer classifies in ${sessionId}`);
    if (typeof code !== 'string' || !codes.has(code)) return bad(`${id}: "${String(code)}" is not a tutor-move code`);
  }

  const marks: MovesMarks = {
    session_id: sessionId,
    codebook_version: loadMovesCodebook().codebook_version,
    annotator_id: typeof body.annotator_id === 'string' && body.annotator_id !== '' ? body.annotator_id : 'tutor',
    simulated: false,
    created_at: new Date().toISOString(),
    marks: Object.fromEntries(entries),
  };
  saveMovesMarks(marks);
  const moves_agreement: Agreement = computeMovesAgreement();
  return ok({ saved: entries.length, moves_agreement });
}

/**
 * Build the report from the sessions that have been annotated, and only those
 * (owner decision): an un-annotated session is not in the report at all.
 */
export async function buildReport(): Promise<ApiResult> {
  const workspace = loadWorkspace();
  const sessions = listSessions().filter((s) => {
    const runs = hasRuns(s.session_id);
    return runs.annotated && runs.modelled;
  });

  if (sessions.length === 0) {
    return bad('no session has both an annotation and a model run yet');
  }

  const humanEpisodes: Episode[] = [];
  const llmEpisodes: Episode[] = [];
  let humanTemplate: StoredRun | null = null;
  let llmTemplate: StoredRun | null = null;
  const quoteItems: DescribeItem[] = [];
  const shownPairs: Array<{ session: Session; human: StoredRun }> = [];

  for (const session of sessions) {
    const human = loadRun(session.session_id, 'human');
    const llm = loadRun(session.session_id, 'llm');
    if (!human || !llm) continue;
    shownPairs.push({ session, human });
    humanEpisodes.push(...human.episodes);
    llmEpisodes.push(...llm.episodes);
    quoteItems.push(...describeItems(session, llm.episodes));
    humanTemplate ??= human;
    llmTemplate ??= llm;
  }
  if (!humanTemplate || !llmTemplate) return bad('no paired runs');

  // If any session's annotation was generated rather than made by a tutor, the
  // report's comparison is partly against generated labels, and says so.
  const anySimulated = sessions.some((s) => loadRun(s.session_id, 'human')?.simulated === true);
  // The template's own `shown` covers one session only; the report's run
  // carries the shown turns of every session it pools, or none where no run
  // records any (src/server/workspace.ts pooledShown).
  const { shown: _templateShown, ...template } = humanTemplate;
  const reportShown = pooledShown(shownPairs);
  const humanRun = {
    ...template,
    run_id: 'run-human-report',
    simulated: anySimulated,
    ...(reportShown ? { shown: reportShown } : {}),
    episodes: undefined,
  } as unknown as StoredRun;
  const llmRun = { ...llmTemplate, run_id: 'run-llm-report', episodes: undefined } as unknown as StoredRun;
  const reId = (episodes: Episode[], runId: string) => episodes.map((e) => ({ ...e, run_id: runId }));

  const process = problemProcessCodes();
  const aggregate = aggregatesFor(
    sessions,
    reId(llmEpisodes, llmRun.run_id).filter((e) => process.has(e.EPISODE)),
  );
  const episodeIndex = aggregate.sessions.flatMap((s) =>
    s.measures.map((m) => ({
      episode_id: m.episode_id,
      code: m.code,
      session_index: s.session_index,
      turns: m.turns,
    })),
  );

  // The quote descriptions run beside the summary. Their failure never fails
  // the build: the report is then built without them.
  const described = describeQuotes(quoteItems).catch((error: unknown): DescribeResult | null => {
    console.warn(`quote_descriptions: not written: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });

  try {
    const [summary, quotes] = await Promise.all([summarise(aggregate, episodeIndex), described]);
    const report = assembleReport({
      studentId: workspace.student_id,
      sessions,
      llm: { run: llmRun, episodes: reId(llmEpisodes, llmRun.run_id) },
      annotation: { run: humanRun, episodes: reId(humanEpisodes, humanRun.run_id) },
      sourceRunId: llmRun.run_id,
      uiLabel: workspace.data_provenance.ui_label,
      status: workspace.data_provenance.status,
      summary: summary.summary,
      claims: summary.claims,
      annotationMakers: sessions.map((s) => ({
        session_index: s.session_index,
        simulated: loadRun(s.session_id, 'human')?.simulated === true,
      })),
    });
    // The per-session figures come from the workspace, which is where the
    // comparison actually lives.
    report.agreement = { ...report.agreement, per_session: computeWorkspaceAgreement().per_session };
    if (quotes && Object.keys(quotes.descriptions).length > 0) report.quote_descriptions = quotes.descriptions;
    for (const d of quotes?.dropped ?? []) {
      console.warn(`quote_descriptions: dropped ${d.turn_id}: ${d.reason}${d.text ? ` — "${d.text}"` : ''}`);
    }
    saveReport(report);
    return ok({ report, dropped: summary.dropped, quote_descriptions_dropped: quotes?.dropped ?? null });
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error));
  }
}

interface TranscriptBody extends IntakeMeta {
  filename: string;
  content: string;
}

/** Take a transcript file and add it to the workspace as a session. */
export function addTranscript(body: TranscriptBody): ApiResult {
  try {
    assertSessionId(body.session_id);
    if (sessionExists(body.session_id)) {
      return bad(`there is already a session ${body.session_id}; choose another id`);
    }
    const taken = listSessions().some((s) => s.session_index === Number(body.session_index));
    if (taken) return bad(`session number ${body.session_index} is already used; choose another`);
    const session = parseTranscript(body.filename, body.content, body);
    saveSession(session);
    const workspace = loadWorkspace();
    if (!workspace.session_ids.includes(session.session_id)) {
      workspace.session_ids.push(session.session_id);
      saveWorkspace(workspace);
    }
    return ok({ session_id: session.session_id, turns: session.turns.length, has_timestamps: session.has_timestamps });
  } catch (error) {
    return bad(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Put the workspace back where it starts: three sessions annotated, run and
 * locked (SPEC D19), one untouched. Everything saved since is discarded, which is the point of it.
 */
export function reset(): ApiResult {
  const result = spawnSync('node', ['--experimental-strip-types', 'scripts/seed-live.ts', '--clean'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return bad(result.stderr || 'the reset did not complete');
  return ok({ reset: true, log: result.stdout.trim() });
}
