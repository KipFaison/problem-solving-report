import { useEffect, useMemo, useRef, useState } from 'react';
import type { Agreement, Episode, Session, Turn } from '../src/contract/types.ts';
import {
  addTranscript,
  classifyMoves,
  generate,
  getMoves,
  getSession,
  saveAnnotation,
  saveMoves,
  type MoveItemView,
  type SessionDetail,
  type SessionMoves,
  type SessionOutline,
  type SessionSummary,
  type ShownMode,
} from './api.ts';
import {
  codebook,
  codeColour,
  codeName,
  comparableCode,
  isProblemProcess,
  NOT_PROBLEM_SOLVING,
  speakerName,
} from './data.ts';
import { useWorkspace } from './workspace.tsx';

// The tutor annotation interface (§7.2). A tutor marks the problem-solving
// work in a session, saves it to the workspace, runs the model on the same
// transcript, and reads the agreement between the two readings, one session at
// a time. This is where the model is validated, so a session's figure is shown
// to the tutor here; the report never shows one.
//
// Only the five problem-solving codes (`in_problem_process`) are offered, and
// a tutor need not mark every turn: a turn left unmarked counts as not
// problem solving. The model still tiles every turn with all nine codes, and
// for the comparison its other four fall in that same class, so both readings
// are drawn here over the six classes the agreement is computed on
// (src/agreement/gate.ts). The four never appear on this page.
// [OURS: the owner's decision of 2026-09-18; the server applies the same rule
// at save (src/server/api.ts, putAnnotation), and its refusal is shown as it
// comes.]
//
// The model's reading of a session stays hidden until a tutor's annotation of
// it is saved, and the model cannot be run on a session before then, so the
// tutor's reading is made without the model's in view.
// [OURS: the agreement figure is only a check on the model if the two
// readings are independent. docs/DEVIATIONS.md]
//
// Where the server draws a sample (a session marking two or more problems),
// the tutor is shown one whole problem by default and may switch to the whole
// session; the choice is sent with the annotation, and the server works out
// the turns itself (INTENT.md, "What a tutor is shown"; SPEC D18). Only the
// shown turns are drawn here, by their index in the session, so a stretch
// keeps the same indices in either view.

interface Draft {
  code: string;
  start: number;
  end: number;
}

/**
 * The parts of a code this page puts in front of a tutor. Every one of them is
 * read from codebook.v2.json at render time; no definition text lives in this
 * file. data.ts types only the fields it needs, so `include` and `exclude` —
 * which is what settles a borderline call — are declared optional here and
 * rendered only when the codebook carries them.
 */
interface CodeGuide {
  code: string;
  name: string;
  definition: string;
  include?: string[];
  exclude?: string[];
}

type Figure = NonNullable<Agreement['per_session']>[number];

interface Notice {
  sessionId: string;
  tone: 'ok' | 'error';
  text: string;
}

interface Running {
  sessionId: string;
  sessionIndex: number;
  turns: number;
  started: number;
}

/** How long the page waits on one model run before saying it has had no
 *  answer. [OURS: the client's own retries can take far longer than this, and
 *  the page must not show a run as going for ever.] */
const GENERATE_LIMIT_MS = 5 * 60 * 1000;

const ERROR_STYLE = { background: '#fff1f1', color: '#8a2c2c' };
const OK_STYLE = { background: '#f1f7f2', color: '#28543a' };
const DIFFER = '#c0392b';

/** The marking tool that returns a stretch to unmarked. Not a code, and never
 *  sent to the server. [OURS: with a turn allowed to stay unmarked, a stretch
 *  marked by mistake has to be able to go back to that.] */
const UNMARK = 'unmark';

// Layer 2 (docs/SPEC-layer2.md): the one tutor turn before each problem-solving
// episode of the model run that a student's turn opens, marked with one of the
// five codes of codebook.tutor-moves.json. Its own codebook, marks, version
// and agreement figure; nothing here is combined with the episode reading.
// The model's code for an item stays hidden until the tutor's mark for that
// item is saved. [OURS: the same blinding as the episode reading above, and for
// the same reason — a mark made with the model's code in view inflates the
// agreement.] Only a saved mark reveals it: the server replaces all marks on
// save, and the comparison is over saved marks alone (src/moves/agreement.ts).
interface MovesCodebookFile {
  codebook_version: string;
  codes: Array<CodeGuide & { origin: string }>;
}

const movesCodebook = (await import('../codebook.tutor-moves.json')).default as MovesCodebookFile;

/** Layer 2's colour, used only for this layer, so its section and codes never
 *  read as episode codes. [OURS] */
const MOVES_ACCENT = '#2f6f8f';

const moveName = (code: string): string => movesCodebook.codes.find((c) => c.code === code)?.name ?? code;

export function Annotate() {
  const { state, refresh } = useWorkspace();
  const sessions = useMemo(
    () => [...(state?.sessions ?? [])].sort((a, b) => a.session_index - b.session_index),
    [state],
  );

  const [selectedId, setSelectedId] = useState<string | null>(() => defaultSession(sessions));
  const selectedRef = useRef<string | null>(selectedId);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [baseline, setBaseline] = useState<Draft[]>([]);
  // What the tutor is shown, and what the saved annotation was marked in.
  const [mode, setMode] = useState<ShownMode>('whole_session');
  const [baselineMode, setBaselineMode] = useState<ShownMode>('whole_session');
  const [dropped, setDropped] = useState(0);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [code, setCode] = useState<string>('');
  const [hovered, setHovered] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<Running | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<Notice | null>(null);
  // Layer 2: the items as the server has them, the tutor's marks being made
  // (preceding_turn_id to code), and the code whose meaning is in the panel.
  const [moves, setMoves] = useState<SessionMoves | null>(null);
  const [movesError, setMovesError] = useState<string | null>(null);
  const [movesDraft, setMovesDraft] = useState<Record<string, string>>({});
  const [movesSaving, setMovesSaving] = useState(false);
  const [classifying, setClassifying] = useState<string | null>(null);
  const [movesNotice, setMovesNotice] = useState<Notice | null>(null);
  const [moveHovered, setMoveHovered] = useState<string | null>(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (selectedId === null && sessions.length > 0) setSelectedId(defaultSession(sessions));
  }, [selectedId, sessions]);

  // Opening a session loads it from the server, and its saved annotation, if
  // there is one, into the editor so that it can be changed.
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    setDetail(null);
    setLoadError(null);
    setLoading(true);
    setDrafts([]);
    setBaseline([]);
    setDropped(0);
    setAnchor(null);
    getSession(selectedId)
      .then((d) => {
        if (!live) return;
        // A locked session arrives without the text of its turns, and nothing
        // of it goes into the editor (SPEC D19).
        if (d.locked) {
          setDetail(d);
          setMode('whole_session');
          setBaselineMode('whole_session');
          return;
        }
        const allowed = new Set(codesFor(d.session).map((c) => c.code));
        const loaded = spansOf(d.human?.episodes ?? [], d.session.turns, allowed);
        const opened = openingMode(d);
        setDetail(d);
        setDrafts(loaded.spans);
        setBaseline(loaded.spans);
        setMode(opened);
        setBaselineMode(opened);
        setDropped(loaded.dropped);
      })
      .catch((e: unknown) => {
        if (live) setLoadError(messageOf(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // Layer 2's items come from the model run, so they are loaded only once the
  // model's reading is shown (after an annotation is saved), and again whenever
  // that run changes. Marks not yet saved are dropped with the old run.
  const movesSessionId = detail?.human && detail.llm ? detail.session.session_id : null;
  const movesRun = detail?.human && detail.llm ? `${detail.llm.run_id}@${detail.llm.created_at}` : null;
  useEffect(() => {
    setMoves(null);
    setMovesDraft({});
    setMovesError(null);
    setMoveHovered(null);
    if (movesSessionId === null || movesRun === null) return;
    let live = true;
    getMoves(movesSessionId)
      .then((m) => {
        if (!live) return;
        setMoves(m);
        setMovesDraft(savedMarks(m));
      })
      .catch((e: unknown) => {
        if (live) setMovesError(messageOf(e));
      });
    return () => {
      live = false;
    };
  }, [movesSessionId, movesRun]);

  const session = detail?.session ?? null;
  const locked = detail?.locked === true;
  // The five problem-solving codes, less any that declares
  // `requires_timestamps` when the session has none (INTENT.md; the loader
  // applies the same rule to the prompt).
  const available = useMemo(() => (session ? codesFor(session) : []), [session]);
  const withheld = useMemo(
    () =>
      session && !session.has_timestamps
        ? codebook.codes.filter((c) => c.requires_timestamps && isProblemProcess(c.code))
        : [],
    [session],
  );

  if (!state) return null;

  // A locked session has no transcript on this page, so no turns to draw or mark.
  const turns: Turn[] = detail && !detail.locked ? detail.session.turns : [];
  const covered = new Map<number, Draft>();
  for (const d of drafts) for (let i = d.start; i <= d.end; i += 1) covered.set(i, d);
  const sample = detail?.sample ?? null;
  // The turns drawn on this page: the sampled problem's, or every turn.
  const shownIds = sample !== null && mode === 'sample' ? new Set(sample.turn_ids) : null;
  const visible = turns.flatMap((t, i) => (shownIds === null || shownIds.has(t.turn_id) ? [i] : []));
  // Switching view on a saved annotation changes what saving would record.
  const dirty = !sameSpans(drafts, baseline) || (detail?.human != null && mode !== baselineMode);
  // Saving needs one marked stretch, not every turn: an annotation with none
  // would leave the session out of the comparison altogether (gate.ts).
  const canSave = drafts.length > 0 && dirty && !saving;

  const saved = detail?.human ?? null;
  // Who made the saved annotation, as the workspace records it: generated for
  // the demo, or made by a tutor. Every line below that names its maker reads this.
  const generated = sessions.find((s) => s.session_id === session?.session_id)?.annotation_simulated === true;
  const model = saved ? (detail?.llm ?? null) : null;
  const modelSpans = model ? spansOf(model.episodes, turns, null).spans : [];
  // Both readings in the six classes the agreement is computed over. A turn the
  // tutor left unmarked is not problem solving; a turn the model left in no
  // episode stays undefined, because a gap in its run is an error (gate.ts).
  const tutorCodes = codesByTurn(drafts, turns.length).map((c) => c ?? NOT_PROBLEM_SOLVING);
  const modelCodes = model
    ? codesByTurn(modelSpans, turns.length).map((c) => (c === undefined ? undefined : comparableCode(c)))
    : null;
  const figure = session ? figureFor(state.agreement, session.session_id) : null;
  const elapsed = running ? Math.max(0, Math.round((now - running.started) / 1000)) : 0;

  // The panel shows the code being hovered, and falls back to the one selected
  // for marking, so moving off a button returns to the selected code.
  const shownCode = hovered ?? code;
  const preview = hovered !== null && hovered !== code;
  const shown: CodeGuide | undefined =
    shownCode && isProblemProcess(shownCode) ? codebook.codes.find((c) => c.code === shownCode) : undefined;
  // A Layer 2 code being hovered takes the panel over; leaving it returns the
  // panel to the episode code.
  const shownMove = moveHovered ? movesCodebook.codes.find((c) => c.code === moveHovered) : undefined;

  // Layer 2 is drawn only beside the model's episode reading: its items are
  // where the model's episodes begin, so they stay hidden while that is.
  const movesShown = model !== null && moves !== null && moves.model_run_id !== null;
  const movesMarked = moves ? savedMarks(moves) : {};
  const movesDirty = !sameMarks(movesDraft, movesMarked);
  // Every tutor turn is marked before any is saved, so no model code comes into
  // view while a mark is still to be made. [OURS: the blinding above, applied
  // across the session's items rather than one item at a time.]
  const movesToMark = (moves?.items ?? []).filter((i) => i.classifiable && moves?.shown_item_ids.includes(i.preceding_turn_id));
  const movesComplete = movesToMark.length > 0 && movesToMark.every((i) => movesDraft[i.preceding_turn_id] !== undefined);
  const canSaveMoves = movesComplete && movesDirty && !movesSaving;
  const movesFigure = session ? figureFor(state.moves_agreement, session.session_id) : null;

  const open = (id: string) => {
    if (id === selectedId) return;
    if (
      (dirty || movesDirty) &&
      session &&
      !window.confirm(`Leave session ${session.session_index}? Changes not saved are discarded.`)
    ) {
      return;
    }
    setSelectedId(id);
  };

  const reload = async (id: string) => {
    await refresh();
    const fresh = await getSession(id);
    if (selectedRef.current === id) setDetail(fresh);
  };

  const assign = (index: number) => {
    if (!code) return;
    if (anchor === null) {
      setAnchor(index);
      return;
    }
    const start = Math.min(anchor, index);
    const end = Math.max(anchor, index);
    // A later assignment wins: re-marking a stretch replaces what was there,
    // which is how a person actually corrects a boundary. Unmarking it leaves
    // nothing there.
    const kept = drafts.flatMap((d) => splitAround(d, start, end)).filter((d) => d.end >= d.start);
    const next = code === UNMARK ? kept : [...kept, { code, start, end }];
    setDrafts(mergeTouching(next.sort((a, b) => a.start - b.start)));
    setAnchor(null);
  };

  // Switching to the sample removes every stretch not wholly inside it, since
  // the server refuses one that is not, and says how many went.
  const switchMode = (next: ShownMode) => {
    if (!session || !sample || next === mode) return;
    if (next === 'sample') {
      const inside = new Set(sample.turn_ids);
      const kept = drafts.filter((d) => turns.slice(d.start, d.end + 1).every((t) => inside.has(t.turn_id)));
      const removed = drafts.length - kept.length;
      if (removed > 0) {
        const what = `${removed} marked stretch${removed === 1 ? '' : 'es'} outside the sampled problem`;
        if (!window.confirm(`Show the sampled problem only? ${what} ${removed === 1 ? 'is' : 'are'} removed from the draft.`)) return;
        setDrafts(kept);
        setNotice({
          sessionId: session.session_id,
          tone: 'ok',
          text: `${what} ${removed === 1 ? 'was' : 'were'} removed from the draft.`,
        });
      }
    }
    setAnchor(null);
    setMode(next);
  };

  const save = async () => {
    if (!session || !canSave) return;
    const id = session.session_id;
    const before = figureFor(state.agreement, id);
    const sent = drafts;
    const sentMode = mode;
    setSaving(true);
    setNotice(null);
    try {
      const result = await saveAnnotation(
        id,
        sent.map((d) => ({
          code: d.code,
          start_turn_id: turns[d.start]?.turn_id ?? '',
          end_turn_id: turns[d.end]?.turn_id ?? '',
        })),
        undefined,
        sentMode,
      );
      await reload(id);
      if (selectedRef.current === id) {
        setBaseline(sent);
        setBaselineMode(sentMode);
      }
      setNotice({
        sessionId: id,
        tone: 'ok',
        text: savedText(result.episodes, before, figureFor(result.agreement, id), detail?.llm != null),
      });
    } catch (e) {
      setNotice({ sessionId: id, tone: 'error', text: messageOf(e) });
    } finally {
      setSaving(false);
    }
  };

  const runModel = async () => {
    // One model call at a time: a Layer 2 call writes the same run file.
    if (!session || !saved || running || classifying !== null) return;
    const id = session.session_id;
    const started = Date.now();
    setRunning({ sessionId: id, sessionIndex: session.session_index, turns: turns.length, started });
    setNow(started);
    setNotice(null);

    const pending = generate(id);
    const timedOut = new Error(
      `No answer from the server after ${GENERATE_LIMIT_MS / 60000} minutes. The run may still complete; this page updates if it does.`,
    );
    let timer = 0;
    const limit = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(timedOut), GENERATE_LIMIT_MS);
    });

    try {
      const result = await Promise.race([pending, limit]);
      const seconds = Math.round((Date.now() - started) / 1000);
      await reload(id);
      setNotice({
        sessionId: id,
        tone: 'ok',
        text: `The model read all ${turns.length} turns of session ${session.session_index} in ${seconds} s and returned ${result.episodes} episodes.`,
      });
    } catch (e) {
      if (e === timedOut) void pending.then(() => reload(id)).catch(() => undefined);
      setNotice({ sessionId: id, tone: 'error', text: messageOf(e) });
    } finally {
      window.clearTimeout(timer);
      setRunning(null);
    }
  };

  const classify = async () => {
    if (!session || classifying !== null || running !== null) return;
    const id = session.session_id;
    setClassifying(id);
    setMovesNotice(null);
    try {
      const result = await classifyMoves(id);
      await refresh();
      // Only the model's codes change; marks not yet saved are kept.
      if (selectedRef.current === id) setMoves(result);
      const coded = result.items.filter((i) => i.model_move !== null).length;
      setMovesNotice({
        sessionId: id,
        tone: 'ok',
        text: `The model coded ${coded} tutor turn${coded === 1 ? '' : 's'} in session ${session.session_index}.`,
      });
    } catch (e) {
      setMovesNotice({ sessionId: id, tone: 'error', text: messageOf(e) });
    } finally {
      setClassifying(null);
    }
  };

  const saveMarks = async () => {
    if (!session || !moves || !canSaveMoves) return;
    const id = session.session_id;
    const sent = { ...movesDraft };
    setMovesSaving(true);
    setMovesNotice(null);
    try {
      const result = await saveMoves(id, sent);
      await refresh();
      const fresh = await getMoves(id);
      if (selectedRef.current === id) {
        setMoves(fresh);
        setMovesDraft(savedMarks(fresh));
      }
      const after = figureFor(result.moves_agreement, id);
      const head = `Saved ${result.saved} mark${result.saved === 1 ? '' : 's'} on the tutor turns.`;
      setMovesNotice({
        sessionId: id,
        tone: 'ok',
        text: !fresh.classified
          ? `${head} Classify to compare them with the model’s codes.`
          : after?.value != null
            ? `${head} Agreement with the model on these turns: κ ${after.value.toFixed(2)}.`
            : `${head} No agreement figure for these turns: ${after?.refusal?.detail || 'the server gave no reason'}.`,
      });
    } catch (e) {
      setMovesNotice({ sessionId: id, tone: 'error', text: messageOf(e) });
    } finally {
      setMovesSaving(false);
    }
  };

  const onAdded = async (id: string, text: string) => {
    await refresh();
    setNotice({ sessionId: id, tone: 'ok', text });
    open(id);
  };

  const scrollToTurn = (index: number) =>
    document.getElementById(`turn-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const problemStarts = new Map(
    (session?.problems ?? []).length > 1
      ? (session?.problems ?? []).map((p, i) => [p.start_turn_id, `Problem ${i + 1} · ${p.topic}`] as const)
      : [],
  );
  const busyHere = running !== null && running.sessionId === session?.session_id;
  const sampleNumbers = sample
    ? sample.problem_ids.map((pid) => (session?.problems ?? []).findIndex((p) => p.problem_id === pid) + 1)
    : [];

  return (
    <div>
      {state.workspace.data_provenance.status === 'synthetic' && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: '#f4f1ec', color: 'var(--muted)' }}>
          {state.workspace.data_provenance.ui_label}
        </p>
      )}

      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        agreement={state.agreement}
        running={running}
        elapsed={elapsed}
        onOpen={open}
      />

      <AddTranscript sessions={sessions} studentId={state.workspace.student_id} onAdded={onAdded} />

      {loadError && (
        <p className="mb-4 rounded-lg p-3 text-sm" style={ERROR_STYLE}>
          {loadError}
        </p>
      )}
      {loading && (
        <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>
          Loading the session…
        </p>
      )}

      {session && locked && (
        <>
          <div className="mb-2">
            <h2 className="text-2xl">Session {session.session_index}</h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {formatDate(session.session_date)} · {session.turns.length} turns
              {session.session_topic ? ` · ${session.session_topic}` : ''}
            </p>
          </div>

          {/* SPEC D19: no transcript, no code buttons, no Save and no Generate
              for a locked session. Layer 2 below stays open. */}
          <section className="mb-4 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--rule)', background: '#fbfaf8' }}>
            <p className="mb-1 text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Locked
            </p>
            <p className="mb-3">
              This session arrived annotated and read by the model, and is locked for this demo. Its transcript is not
              shown here, and it cannot be annotated or sent to the model again. Its turns still appear as evidence in
              the Student Report.
            </p>
            <Status
              on={saved !== null}
              label={!saved ? 'Not annotated yet' : generated ? 'Simulated annotation' : 'Annotated by a tutor'}
            />
            <Status on={detail?.llm != null} label={detail?.llm ? 'Read by the model' : 'Not read by the model'} />
            {figure && (
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                {figure.value !== null ? `κ ${figure.value.toFixed(2)} · ${figure.band ?? ''}` : 'No agreement figure'}
              </p>
            )}
          </section>

          {model && movesError && (
            <p className="mb-4 rounded-lg p-3 text-sm" style={ERROR_STYLE}>
              The tutor turns for this session could not be loaded: {movesError}
            </p>
          )}
          {movesShown && moves && model && (
            <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
              <aside className="min-w-0 md:sticky md:top-6 md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
                {shownMove ? (
                  <DefinitionPanel shown={shownMove} preview code="" origin={shownMove.origin} />
                ) : (
                  <div
                    className="rounded-xl border p-5"
                    style={{ background: '#f3f8fa', borderColor: 'var(--rule)', borderLeftWidth: '5px', minHeight: '14rem' }}
                  >
                    <p className="mb-1 text-xs uppercase tracking-widest" style={{ color: MOVES_ACCENT }}>
                      Codebook
                    </p>
                    <p className="text-[1.0625rem] leading-relaxed" style={{ color: 'var(--muted)' }}>
                      Hover a code on a tutor turn to read it here.
                    </p>
                  </div>
                )}
              </aside>
              <div className="min-w-0">
                <TutorMoves
                  moves={moves}
                  draft={movesDraft}
                  figure={movesFigure}
                  session={session}
                  notice={movesNotice && movesNotice.sessionId === session.session_id ? movesNotice : null}
                  classifying={classifying === session.session_id}
                  canClassify={classifying === null && running === null}
                  canSave={canSaveMoves}
                  complete={movesComplete}
                  dirty={movesDirty}
                  saving={movesSaving}
                  onMark={(turnId, move) => setMovesDraft((d) => ({ ...d, [turnId]: move }))}
                  onHover={setMoveHovered}
                  onClassify={() => void classify()}
                  onSave={() => void saveMarks()}
                />
              </div>
            </div>
          )}
        </>
      )}

      {session && !locked && (
        <>
          <div className="mb-2 flex flex-wrap items-end gap-3">
            <div>
              <h2 className="text-2xl">Session {session.session_index}</h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {formatDate(session.session_date)} · {turns.length} turns
                {session.session_topic ? ` · ${session.session_topic}` : ''}
                {session.has_timestamps ? '' : ' · no timestamps'}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => void save()}
                disabled={!canSave}
                className="rounded-lg px-4 py-2 text-sm"
                style={buttonStyle(canSave, true)}
                title={
                  drafts.length === 0
                    ? 'Mark at least one stretch to save this annotation'
                    : !dirty
                      ? generated
                        ? 'Change a label to save this annotation; saving replaces the generated one'
                        : 'Saved. Nothing has changed since.'
                      : 'Save this annotation to the workspace'
                }
              >
                {saving ? 'Saving…' : saved && !dirty && !generated ? 'Saved' : 'Save annotation'}
              </button>
              <button
                onClick={() => void runModel()}
                disabled={!saved || running !== null || classifying !== null}
                className="rounded-lg px-4 py-2 text-sm"
                style={buttonStyle(saved !== null && running === null && classifying === null, false)}
                title={
                  saved
                    ? 'Runs the model on this transcript now. A run takes tens of seconds.'
                    : 'Save an annotation of this session first'
                }
              >
                {busyHere ? 'Generating…' : detail?.llm ? 'Generate again' : 'Generate model reading'}
              </button>
            </div>
          </div>

          {sample && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div
                className="inline-flex overflow-hidden rounded-lg text-sm"
                role="group"
                aria-label="Turns shown"
                style={{ border: '1px solid var(--rule)' }}
              >
                {(
                  [
                    ['sample', 'Sampled problem'],
                    ['whole_session', 'Whole session'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    aria-pressed={mode === m}
                    className="px-3 py-1.5"
                    style={{
                      background: mode === m ? 'var(--ink)' : 'transparent',
                      color: mode === m ? 'var(--paper)' : 'var(--ink)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'sample' && (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Showing {sampleNumbers.length === 1 ? 'problem' : 'problems'} {numberList(sampleNumbers)} of{' '}
                  {sample.problems_total}, drawn at random · {visible.length} of {turns.length} turns.
                </p>
              )}
            </div>
          )}

          <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
            {drafts.length} stretch{drafts.length === 1 ? '' : 'es'} marked
            {' · '}
            {dirty ? 'unsaved changes' : saved ? (generated ? 'the generated annotation, unchanged' : 'saved') : 'not saved yet'}
            {!saved && ' · the model can be run once an annotation is saved'}
            {running !== null && !busyHere && ` · the model is running on session ${running.sessionIndex}, one run at a time`}
          </p>

          {busyHere && (
            <p className="mb-3 flex items-center gap-3 rounded-lg p-3 text-sm" style={{ background: '#f3f0ff', color: '#3d2d8a' }}>
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
              Running the model on session {session.session_index}: reading all {turns.length} turns and marking each
              stretch with a code. {elapsed} s so far; a run takes tens of seconds.
            </p>
          )}

          {notice && notice.sessionId === session.session_id && (
            <p className="mb-3 rounded-lg p-3 text-sm" style={notice.tone === 'ok' ? OK_STYLE : ERROR_STYLE}>
              {notice.text}
            </p>
          )}

          {saved && (
            <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
              {generated
                ? 'The annotation loaded here is simulated: generated for this demo, not made by a tutor. Saving a changed version replaces it.'
                : `The annotation loaded here was made by a tutor and saved ${formatTime(saved.created_at)}.`}
            </p>
          )}
          {dropped > 0 && (
            <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
              {dropped} turn{dropped === 1 ? '' : 's'} in the saved annotation carried a code that is not one of the
              problem-solving codes and {dropped === 1 ? 'is' : 'are'} shown unmarked.
            </p>
          )}

          {saved && model && modelCodes && (
            <AgreementPanel
              figure={figure}
              tutorCodes={visible.map((i) => tutorCodes[i])}
              modelCodes={visible.map((i) => modelCodes[i])}
              indices={visible}
              model={model}
              dirty={dirty}
              onTurn={scrollToTurn}
            />
          )}
          {saved && !model && !busyHere && (
            <p className="mb-4 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--rule)', color: 'var(--muted)' }}>
              The model has not read this session yet. Generate its reading to see where it and this annotation differ,
              and the agreement between them.
            </p>
          )}
          {movesShown && movesToMark.length > 0 && (
            <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>
              Tutor moves: {movesToMark.length} turn{movesToMark.length === 1 ? '' : 's'} to mark below.{' '}
              <button
                type="button"
                className="underline"
                style={{ color: MOVES_ACCENT }}
                onClick={() => document.getElementById('tutor-moves')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Go to them
              </button>
            </p>
          )}

          <div className="mb-3 flex flex-wrap gap-2">
            {/* Selected is ink with paper text for every code, as the surface
                tabs are: several code colours are too light to carry text, and
                analysis is too mid-tone for either white or ink to reach 4.5:1.
                The swatch keeps each code's colour in view. */}
            {available.map((c) => (
              <button
                key={c.code}
                onClick={() => setCode(c.code)}
                onMouseEnter={() => setHovered(c.code)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(c.code)}
                onBlur={() => setHovered(null)}
                aria-pressed={code === c.code}
                className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm"
                style={{
                  background: code === c.code ? 'var(--ink)' : 'transparent',
                  border: `1px solid ${codeColour[c.code] ?? '#ccc'}`,
                  color: code === c.code ? 'var(--paper)' : 'var(--ink)',
                }}
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: codeColour[c.code] ?? '#ccc' }} />
                {c.name}
              </button>
            ))}
            <button
              onClick={() => setCode(UNMARK)}
              aria-pressed={code === UNMARK}
              className="rounded-lg px-3.5 py-2 text-sm"
              style={{
                background: code === UNMARK ? 'var(--ink)' : 'transparent',
                border: '1px dashed var(--muted)',
                color: code === UNMARK ? 'var(--paper)' : 'var(--ink)',
              }}
            >
              Unmark
            </button>
          </div>

          {withheld.length > 0 && (
            <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
              Not offered for this session, which has no timestamps: {withheld.map((c) => c.name).join(', ')}.
            </p>
          )}

          {/* Two columns from `md` up: the definition on the left, the transcript
              beside it, the left one widening with the screen. The left column
              is always in the grid, so filling it and emptying it never moves
              the transcript. Below `md` it stacks above. */}
          <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
            <aside className="min-w-0 md:sticky md:top-6 md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
              {shownMove ? (
                <DefinitionPanel shown={shownMove} preview code={code} origin={shownMove.origin} />
              ) : (
                <DefinitionPanel shown={shown} preview={preview} code={code} />
              )}
            </aside>

            <div className="min-w-0">
              <p className="mb-1 text-sm" style={{ color: 'var(--muted)' }}>
                {code === UNMARK
                  ? anchor === null
                    ? 'Click the first turn of the stretch to unmark, then the last.'
                    : 'Now click the last turn of the stretch.'
                  : code
                    ? anchor === null
                      ? `Click the first turn of ${/^[AEIOU]/i.test(codeName(code)) ? 'an' : 'a'} ${codeName(code)} stretch, then the last.`
                      : 'Now click the last turn of the stretch.'
                    : 'Pick a code, then click the first and last turn of the stretch it covers.'}
              </p>
              <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
                Turns left unmarked count as not part of the problem-solving work.
              </p>

              {modelCodes && (
                <div
                  className="mb-1 hidden gap-2 px-3 text-xs uppercase tracking-widest sm:grid sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem]"
                  style={{ color: 'var(--muted)' }}
                >
                  <span>Turn</span>
                  <span>Annotation</span>
                  <span>Model</span>
                </div>
              )}

              <ol className="space-y-1">
                {turns.map((turn, i) => {
                  if (shownIds !== null && !shownIds.has(turn.turn_id)) return null;
                  const d = covered.get(i);
                  const isAnchor = anchor === i;
                  const theirs = modelCodes?.[i];
                  const differs = modelCodes !== null && theirs !== tutorCodes[i];
                  const problem = problemStarts.get(turn.turn_id);
                  return (
                    <TurnRow
                      key={turn.turn_id}
                      index={i}
                      turn={turn}
                      speaker={speakerName(turn.role, session)}
                      problem={problem}
                      tutorCode={d?.code ?? (modelCodes ? NOT_PROBLEM_SOLVING : undefined)}
                      modelCode={modelCodes ? (theirs ?? null) : undefined}
                      differs={differs}
                      isAnchor={isAnchor}
                      onClick={() => assign(i)}
                    />
                  );
                })}
              </ol>

              {model && movesError && (
                <p className="mt-8 rounded-lg p-3 text-sm" style={ERROR_STYLE}>
                  The tutor turns for this session could not be loaded: {movesError}
                </p>
              )}
              {movesShown && moves && model && (
                <TutorMoves
                  moves={moves}
                  draft={movesDraft}
                  figure={movesFigure}
                  session={session}
                  notice={movesNotice && movesNotice.sessionId === session.session_id ? movesNotice : null}
                  classifying={classifying === session.session_id}
                  canClassify={classifying === null && running === null}
                  canSave={canSaveMoves}
                  complete={movesComplete}
                  dirty={movesDirty}
                  saving={movesSaving}
                  onMark={(turnId, move) => setMovesDraft((d) => ({ ...d, [turnId]: move }))}
                  onHover={setMoveHovered}
                  onClassify={() => void classify()}
                  onSave={() => void saveMarks()}
                  onTurn={scrollToTurn}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- the session list -------------------------------------------------------

function SessionList({
  sessions,
  selectedId,
  agreement,
  running,
  elapsed,
  onOpen,
}: {
  sessions: SessionSummary[];
  selectedId: string | null;
  agreement: Agreement;
  running: Running | null;
  elapsed: number;
  onOpen: (id: string) => void;
}) {
  const firstUntouched = sessions.find((s) => !s.annotated)?.session_id;
  return (
    <div className="mb-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
      {sessions.map((s) => {
        const selected = s.session_id === selectedId;
        const untouched = !s.annotated;
        const figure = figureFor(agreement, s.session_id);
        const runningHere = running?.sessionId === s.session_id;
        return (
          <button
            key={s.session_id}
            onClick={() => onOpen(s.session_id)}
            className="rounded-xl p-3 text-left text-sm"
            style={{
              border: selected
                ? `2px solid ${untouched ? 'var(--accent)' : 'var(--ink)'}`
                : untouched
                  ? '2px dashed var(--accent)'
                  : '1px solid var(--rule)',
              background: untouched ? '#f6f3ff' : selected ? '#fbfaf8' : 'transparent',
            }}
          >
            <span className="flex items-baseline gap-2">
              <span className="text-lg">Session {s.session_index}</span>
              {s.session_id === firstUntouched && (
                <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--accent)', color: '#fff' }}>
                  Start here
                </span>
              )}
              {s.locked && (
                <span className="rounded px-1.5 py-0.5 text-xs" style={{ border: '1px solid var(--muted)', color: 'var(--muted)' }}>
                  Locked
                </span>
              )}
            </span>
            <span className="block" style={{ color: 'var(--muted)' }}>
              {formatDate(s.session_date)} · {s.turn_count} turns
            </span>
            <span className="mt-1 block">
              <Status
                on={s.annotated}
                label={
                  !s.annotated
                    ? 'Not annotated yet'
                    : s.annotation_simulated
                      ? 'Simulated annotation'
                      : 'Annotated by a tutor'
                }
              />
            </span>
            <span className="block">
              {runningHere ? (
                <span style={{ color: '#3d2d8a' }}>
                  <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
                  Model running · {elapsed} s
                </span>
              ) : (
                <Status on={s.modelled} label={s.modelled ? 'Read by the model' : 'Not read by the model'} />
              )}
            </span>
            {figure && (
              <span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>
                {figure.value !== null ? `κ ${figure.value.toFixed(2)} · ${figure.band ?? ''}` : 'No agreement figure'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Status({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5" style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}>
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: on ? '#27ae60' : 'transparent', border: `1px solid ${on ? '#27ae60' : 'var(--muted)'}` }}
      />
      {label}
    </span>
  );
}

// --- adding a transcript ----------------------------------------------------

interface UploadFields {
  session_id: string;
  student_id: string;
  session_index: string;
  session_date: string;
  session_topic: string;
}

function AddTranscript({
  sessions,
  studentId,
  onAdded,
}: {
  sessions: SessionSummary[];
  studentId: string;
  onAdded: (id: string, text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<UploadFields>(() => uploadDefaults(sessions, studentId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = Number(fields.session_index);
  const problem = !file
    ? 'Choose a transcript file.'
    : !/^[A-Za-z0-9_-]+$/.test(fields.session_id)
      ? 'Session id: letters, digits, hyphens and underscores only.'
      : sessions.some((s) => s.session_id === fields.session_id)
        ? `Session id ${fields.session_id} is already in this workspace.`
        : !Number.isInteger(index) || index < 1
          ? 'Session number: a whole number from 1.'
          : sessions.some((s) => s.session_index === index)
            ? `Session ${index} is already in this workspace.`
            : fields.student_id.trim() === ''
              ? 'Student id is required.'
              : !/^\d{4}-\d{2}-\d{2}$/.test(fields.session_date)
                ? 'Session date is required.'
                : null;

  const submit = async () => {
    if (!file || problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const content = await file.text();
      const topic = fields.session_topic.trim();
      const result = await addTranscript({
        filename: file.name,
        content,
        session_id: fields.session_id,
        student_id: fields.student_id.trim(),
        session_index: index,
        session_date: fields.session_date,
        ...(topic ? { session_topic: topic } : {}),
      });
      setOpen(false);
      await onAdded(
        result.session_id,
        `Added session ${index} from ${file.name}: ${result.turns} turns${result.has_timestamps ? '' : ', no timestamps'}.`,
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="mb-6">
        <button
          onClick={() => {
            setFields(uploadDefaults(sessions, studentId));
            setFile(null);
            setError(null);
            setOpen(true);
          }}
          className="rounded-lg px-3 py-1.5 text-sm"
          style={{ border: '1px solid var(--rule)' }}
        >
          Add a transcript…
        </button>
      </div>
    );
  }

  const set = (key: keyof UploadFields) => (e: { target: { value: string } }) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  return (
    <section className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--rule)', background: '#fbfaf8' }}>
      <h3 className="mb-1 text-base">Add a transcript</h3>
      <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
        CSV, JSONL or JSON, one turn per row, with a role (or speaker) column and a content (or text) column. Start and
        end times are optional. The session joins the list above, ready to annotate.
      </p>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <span style={{ color: 'var(--muted)' }}>Transcript file</span>
          <input
            type="file"
            accept=".csv,.jsonl,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Field label="Session id" value={fields.session_id} onChange={set('session_id')} />
        <Field label="Student id" value={fields.student_id} onChange={set('student_id')} />
        <Field label="Session number" value={fields.session_index} onChange={set('session_index')} type="number" />
        <Field label="Session date" value={fields.session_date} onChange={set('session_date')} type="date" />
        <Field label="Topic (optional)" value={fields.session_topic} onChange={set('session_topic')} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void submit()}
          disabled={problem !== null || busy}
          className="rounded-lg px-4 py-2 text-sm"
          style={buttonStyle(problem === null && !busy, true)}
        >
          {busy ? 'Adding…' : 'Add session'}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm"
          style={{ border: '1px solid var(--rule)' }}
        >
          Cancel
        </button>
        {problem && (
          <span className="text-sm" style={{ color: 'var(--muted)' }}>
            {problem}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-3 rounded-lg p-3 text-sm" style={ERROR_STYLE}>
          The server refused the file: {error}
        </p>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="rounded-lg border px-2 py-1.5"
        style={{ borderColor: 'var(--rule)', background: '#fff' }}
      />
    </label>
  );
}

// --- the two readings side by side ----------------------------------------

function AgreementPanel({
  figure,
  tutorCodes,
  modelCodes,
  indices,
  model,
  dirty,
  onTurn,
}: {
  figure: Figure | null;
  tutorCodes: Array<string | undefined>;
  modelCodes: Array<string | undefined>;
  /** Each position's turn index in the session: the codes cover the shown turns only. */
  indices: number[];
  model: NonNullable<SessionDetail['llm']>;
  dirty: boolean;
  onTurn: (index: number) => void;
}) {
  // [DERIVED: the two per-turn sequences, each in the six classes the kappa is
  // computed over → a count of turns where they differ. Shown to help the tutor
  // find the differences; the figure above it is the server's Cohen's kappa
  // over the saved annotation.]
  const differing = tutorCodes.filter((c, i) => c !== modelCodes[i]).length;
  return (
    <section className="mb-4 rounded-xl border p-4" style={{ borderColor: 'var(--rule)', background: '#fbfaf8' }}>
      <h3 className="mb-2 text-base">Agreement between this annotation and the model&rsquo;s reading</h3>
      {figure && figure.value !== null ? (
        <p className="mb-1">
          <span className="text-3xl">κ {figure.value.toFixed(2)}</span>
          <span className="ml-3 text-base">{figure.band}</span>
        </p>
      ) : (
        <p className="mb-1 text-base">
          No figure for this session: {refusalText(figure?.refusal)}.
        </p>
      )}
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        Cohen&rsquo;s kappa, turn by turn{figure?.n_turns ? `, over ${figure.n_turns} turns` : ''}, between the saved
        annotation and the model&rsquo;s reading, each turn in one of six classes: one of the five
        problem-solving codes, or not problem solving.{dirty ? ' Unsaved changes are not in the figure until saved.' : ''}
        {model.stand_in ? ` Not produced by a model: ${model.stand_in.reason}` : ''}
      </p>
      <Strip label="Annotation" codes={tutorCodes} indices={indices} onTurn={onTurn} />
      <Strip label="Model" codes={modelCodes} indices={indices} onTurn={onTurn} />
      <div className="mt-1 grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          Differ
        </span>
        {/* Only a stretch where the readings differ is a control; the gaps
            between them are empty space, not a place to click or tab to. */}
        <div className="flex h-2" role="group" aria-label="Where the readings differ">
          {runsOf(tutorCodes.map((c, i) => c !== modelCodes[i])).map((r) =>
            r.value ? (
              <button
                key={r.start}
                type="button"
                onClick={() => onTurn(indices[r.start] ?? r.start)}
                title={`${turnSpan(indices, r.start, r.length)}: the readings differ`}
                aria-label={`${turnSpan(indices, r.start, r.length)}: the readings differ`}
                className="h-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]"
                style={{ flex: `${r.length} 1 0`, background: DIFFER }}
              />
            ) : (
              <span key={r.start} className="h-full" style={{ flex: `${r.length} 1 0` }} />
            ),
          )}
        </div>
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
        The two readings differ on {differing} of {tutorCodes.length} turns. Click a strip to go to that turn. Model:{' '}
        {model.model ?? 'none recorded'}, run {formatTime(model.created_at)}.
      </p>
    </section>
  );
}

function Strip({
  label,
  codes,
  indices,
  onTurn,
}: {
  label: string;
  codes: Array<string | undefined>;
  indices: number[];
  onTurn: (index: number) => void;
}) {
  return (
    <div className="mb-1 grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      {/* The focus ring is drawn inside each block, ink with a white edge:
          the strip clips anything outside it, and no single colour stands out
          against every code's. */}
      <div
        className="flex h-5 overflow-hidden rounded"
        style={{ border: '1px solid var(--rule)' }}
        role="group"
        aria-label={label}
      >
        {runsOf(codes).map((r) => {
          const text = `${turnSpan(indices, r.start, r.length)}: ${r.value ? codeName(r.value) : 'not covered'}`;
          return (
            <button
              key={r.start}
              type="button"
              onClick={() => onTurn(indices[r.start] ?? r.start)}
              title={text}
              aria-label={text}
              className="h-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--ink)] focus-visible:shadow-[inset_0_0_0_4px_#fff]"
              style={{ flex: `${r.length} 1 0`, background: r.value ? (codeColour[r.value] ?? '#ccc') : '#fff6f6' }}
            />
          );
        })}
      </div>
    </div>
  );
}

// --- one turn -------------------------------------------------------------

function TurnRow({
  index,
  turn,
  speaker,
  problem,
  tutorCode,
  modelCode,
  differs,
  isAnchor,
  onClick,
}: {
  index: number;
  turn: Turn;
  speaker: string;
  problem: string | undefined;
  /** A problem-solving code; NOT_PROBLEM_SOLVING for an unmarked turn when the
   *  model's reading is shown beside it; undefined for one when it is not. */
  tutorCode: string | undefined;
  /** undefined: no model reading shown. null: the model left this turn uncovered. */
  modelCode: string | null | undefined;
  differs: boolean;
  isAnchor: boolean;
  onClick: () => void;
}) {
  const withModel = modelCode !== undefined;
  const marked = tutorCode !== undefined && tutorCode !== NOT_PROBLEM_SOLVING;
  return (
    <>
      {problem && (
        <li className="pt-3 pb-1 text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          {problem}
        </li>
      )}
      <li id={`turn-${index}`}>
        <button
          type="button"
          onClick={onClick}
          className="block w-full cursor-pointer rounded px-2 py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent)]"
          style={{
            borderLeft: `4px solid ${marked && tutorCode ? (codeColour[tutorCode] ?? '#ccc') : 'var(--rule)'}`,
            background: isAnchor ? '#efeaff' : marked ? '#fbfaf8' : 'transparent',
          }}
        >
          <span
            className={
              withModel
                ? 'grid gap-x-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem]'
                : 'grid gap-x-2 sm:grid-cols-[minmax(0,1fr)_7.5rem]'
            }
          >
            <span>
              <span className="mr-2 text-xs uppercase" style={{ color: 'var(--muted)' }}>
                {speaker}
              </span>
              {turn.content}
            </span>
            <CodeTag code={tutorCode} empty="" />
            {withModel && <CodeTag code={modelCode ?? undefined} empty="not covered" differs={differs} />}
          </span>
        </button>
      </li>
    </>
  );
}

function CodeTag({ code, empty, differs = false }: { code: string | undefined; empty: string; differs?: boolean }) {
  return (
    <span
      className="flex items-baseline gap-1.5 self-start text-xs"
      style={{ color: differs ? DIFFER : code ? 'var(--muted)' : '#8a2c2c' }}
    >
      {code && (
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-sm"
          style={{
            background: codeColour[code] ?? '#ccc',
            // The residual class's fill is near the paper's, so it is outlined.
            border: code === NOT_PROBLEM_SOLVING ? '1px solid #cfc9c1' : undefined,
          }}
        />
      )}
      {code ? codeName(code) : empty}
      {differs && <span title="The two readings differ on this turn">≠</span>}
    </span>
  );
}

// --- tutor moves: the turn before each episode that opens on a student's turn

function TutorMoves({
  moves,
  draft,
  figure,
  session,
  notice,
  classifying,
  canClassify,
  canSave,
  complete,
  dirty,
  saving,
  onMark,
  onHover,
  onClassify,
  onSave,
  onTurn,
}: {
  moves: SessionMoves;
  draft: Record<string, string>;
  figure: Figure | null;
  session: SessionOutline;
  notice: Notice | null;
  classifying: boolean;
  canClassify: boolean;
  canSave: boolean;
  complete: boolean;
  dirty: boolean;
  saving: boolean;
  onMark: (turnId: string, move: string) => void;
  onHover: (move: string | null) => void;
  onClassify: () => void;
  onSave: () => void;
  /** Scrolls to the turn in the transcript; absent where no transcript is drawn. */
  onTurn?: (index: number) => void;
}) {
  const turnIndex = new Map(session.turns.map((t, i) => [t.turn_id, i] as const));
  const toMark = moves.items.filter((i) => i.classifiable && moves.shown_item_ids.includes(i.preceding_turn_id));
  const others = moves.items.filter((i) => !i.classifiable).length;
  const marked = toMark.filter((i) => draft[i.preceding_turn_id] !== undefined).length;
  const stale = moves.classified && moves.model_codebook_version !== moves.codebook_version;
  const compared = moves.classified && moves.marks !== null;
  // [DERIVED: the saved marks and the model's codes, item by item → the items
  // where they differ. Shown to help the tutor find them; the figure is the
  // server's Cohen's kappa over the saved marks.]
  const differing = toMark.filter((i) => i.tutor_mark !== null && i.model_move !== null && i.tutor_mark !== i.model_move);
  const itemLabel = (item: MoveItemView) => {
    const at = turnIndex.get(item.preceding_turn_id);
    return at === undefined ? item.preceding_turn_id : `turn ${at + 1}`;
  };
  const goTo = (item: MoveItemView) =>
    document.getElementById(`move-${item.preceding_turn_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <section
      id="tutor-moves"
      className="mt-8 rounded-xl border p-4"
      style={{ borderColor: MOVES_ACCENT, borderLeftWidth: '5px', background: '#f3f8fa' }}
    >
      <h3 className="mb-1 text-xl">Tutor moves</h3>
      <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
        What does each tutor turn do? Hover a code for its meaning.
      </p>

      {moves.items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          No problem-solving episode in the model&rsquo;s reading of this session opens on a student&rsquo;s turn, so
          there are no tutor turns to mark.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {toMark.length > 0 && (
              <button
                onClick={onSave}
                disabled={!canSave}
                className="rounded-lg px-4 py-2 text-sm"
                style={{
                  background: canSave ? MOVES_ACCENT : 'var(--rule)',
                  color: canSave ? '#fff' : 'var(--muted)',
                  cursor: canSave ? 'pointer' : 'not-allowed',
                }}
                title={
                  !complete
                    ? `Mark all ${toMark.length} tutor turns to save. The model’s codes stay hidden until the marks are saved.`
                    : !dirty
                      ? 'Saved. Nothing has changed since.'
                      : 'Save these marks. Saving replaces any saved before.'
                }
              >
                {saving ? 'Saving…' : moves.marks && !dirty ? 'Marks saved' : 'Save marks'}
              </button>
            )}
            {toMark.length > 0 && (!moves.classified || stale) && (
              <button
                onClick={onClassify}
                disabled={!canClassify}
                className="rounded-lg px-4 py-2 text-sm"
                style={buttonStyle(canClassify, false)}
                title="Runs the model on these tutor turns now. Its codes stay hidden until the marks are saved."
              >
                {classifying ? 'Classifying…' : stale ? 'Classify again' : 'Classify'}
              </button>
            )}
            <span className="text-sm" style={{ color: 'var(--muted)' }}>
              {marked} of {toMark.length} marked{dirty ? ' · unsaved' : moves.marks ? ' · saved' : ''}
              {stale ? ' · the model’s codes are from an older codebook' : ''}
            </span>
          </div>

          {notice && (
            <p className="mb-3 rounded-lg p-3 text-sm" style={notice.tone === 'ok' ? OK_STYLE : ERROR_STYLE}>
              {notice.text}
            </p>
          )}

          {moves.marks && (
            <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
              {moves.marks.simulated
                ? 'The marks loaded here are simulated: generated for this demo, not made by a tutor. Saving replaces them.'
                : `The marks loaded here were saved ${formatTime(moves.marks.created_at)}.`}
            </p>
          )}

          {compared && (
            <div className="mb-4 rounded-lg border p-3" style={{ borderColor: 'var(--rule)', background: '#fff' }}>
              <h4 className="mb-1 text-base">Agreement on the tutor turns</h4>
              {figure && figure.value !== null ? (
                <p className="mb-1">
                  <span className="text-2xl">κ {figure.value.toFixed(2)}</span>
                  <span className="ml-3 text-base">{figure.band}</span>
                </p>
              ) : (
                <p className="mb-1 text-sm">
                  No figure for this session: {figure?.refusal?.detail || 'the server gave no reason'}.
                </p>
              )}
              {(figure?.n_turns || dirty) && (
                <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                  {figure?.n_turns ? `Over ${figure.n_turns} tutor turns.` : ''}
                  {dirty ? ' Save to update.' : ''}
                </p>
              )}
              <p className="text-xs" style={{ color: differing.length > 0 ? DIFFER : 'var(--muted)' }}>
                The saved marks and the model&rsquo;s codes differ on {differing.length} of {toMark.length} tutor turn
                {toMark.length === 1 ? '' : 's'}
                {differing.length > 0 ? ': ' : '.'}
                {differing.map((item, n) => (
                  <span key={item.preceding_turn_id}>
                    {n > 0 && ', '}
                    <button type="button" className="underline" onClick={() => goTo(item)}>
                      {itemLabel(item)}
                    </button>
                  </span>
                ))}
              </p>
            </div>
          )}

          <ol className="space-y-3">
            {toMark.map((item, n) => {
              const at = turnIndex.get(item.preceding_turn_id);
              const mark = draft[item.preceding_turn_id];
              const saved = item.tutor_mark;
              // The model's code is shown only once a mark for this turn is saved.
              const revealed = saved !== null;
              const differs = revealed && item.model_move !== null && item.model_move !== saved;
              return (
                <li
                  key={item.preceding_turn_id}
                  id={`move-${item.preceding_turn_id}`}
                  className="rounded-lg border p-3"
                  style={{ borderColor: differs ? DIFFER : 'var(--rule)', background: '#fff' }}
                >
                  {at !== undefined && (
                    <p className="mb-2 text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                      {onTurn ? (
                        <button type="button" className="uppercase tracking-widest underline" onClick={() => onTurn(at)}>
                          turn {at + 1}
                        </button>
                      ) : (
                        `turn ${at + 1}`
                      )}
                    </p>
                  )}
                  <MoveTurn label={speakerName(item.preceding_speaker, session)} text={item.preceding_text} strong />
                  <MoveTurn label={speakerName(item.following_speaker, session)} text={item.following_text} />
                  <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Code for the tutor turn in item ${n + 1}`}>
                    {movesCodebook.codes.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => onMark(item.preceding_turn_id, c.code)}
                        onMouseEnter={() => onHover(c.code)}
                        onMouseLeave={() => onHover(null)}
                        onFocus={() => onHover(c.code)}
                        onBlur={() => onHover(null)}
                        aria-pressed={mark === c.code}
                        title={c.definition}
                        className="rounded-md px-2.5 py-1 text-xs"
                        style={{
                          background: mark === c.code ? MOVES_ACCENT : 'transparent',
                          border: `1px solid ${MOVES_ACCENT}`,
                          color: mark === c.code ? '#fff' : 'var(--ink)',
                        }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  {revealed && item.model_move !== null && (
                    <p className="mt-2 text-xs" style={{ color: differs ? DIFFER : 'var(--muted)' }}>
                      Model: {moveName(item.model_move)}
                      {differs ? ' · differs from the saved mark' : ''}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          {others > 0 && (
            <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
              In {others} more episode{others === 1 ? '' : 's'} that open{others === 1 ? 's' : ''} on a student&rsquo;s
              turn, the turn before is not the tutor&rsquo;s, so there is nothing to mark.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function MoveTurn({ label, text, strong = false }: { label: string; text: string; strong?: boolean }) {
  return (
    <div
      className="mb-1.5 grid grid-cols-[6rem_minmax(0,1fr)] gap-2 text-sm"
      style={{ color: strong ? 'var(--ink)' : 'var(--muted)' }}
    >
      <span className="text-xs uppercase tracking-widest" style={{ color: strong ? MOVES_ACCENT : 'var(--muted)' }}>
        {label}
      </span>
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}

// --- the definition panel -------------------------------------------------

/** `origin` is given for a tutor-move code only: the panel then reads as that
 *  layer's, in its colour, with the code's origin from its codebook. */
function DefinitionPanel({
  shown,
  preview,
  code,
  origin,
}: {
  shown: CodeGuide | undefined;
  preview: boolean;
  code: string;
  origin?: string;
}) {
  const move = origin !== undefined;
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        background: move ? '#f3f8fa' : '#f7f5f2',
        borderColor: 'var(--rule)',
        borderLeftWidth: '5px',
        borderLeftColor: move ? MOVES_ACCENT : shown ? (codeColour[shown.code] ?? 'var(--rule)') : 'var(--rule)',
        minHeight: '14rem',
      }}
    >
      {shown ? (
        <>
          <p className="mb-1 text-xs uppercase tracking-widest" style={{ color: move ? MOVES_ACCENT : 'var(--muted)' }}>
            {move ? 'Tutor move · hovering' : preview ? 'Hovering' : 'Selected'}
          </p>
          <h2 className="mb-2 text-2xl">{shown.name}</h2>
          {move && (
            <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
              Origin: {origin}
            </p>
          )}
          {preview && !move && (
            <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
              {code === UNMARK
                ? 'Still selected: Unmark'
                : code
                  ? `Still selected for marking: ${codeName(code)}`
                  : 'Click it to select it for marking.'}
            </p>
          )}
          <p className="text-[1.0625rem] leading-relaxed">{shown.definition}</p>
          {shown.include && shown.include.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Includes
              </h3>
              <ul className="list-disc space-y-1.5 pl-5 text-base leading-relaxed">
                {shown.include.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
          {shown.exclude && shown.exclude.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Excludes
              </h3>
              <ul className="list-disc space-y-1.5 pl-5 text-base leading-relaxed">
                {shown.exclude.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <p className="mb-1 text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Codebook
          </p>
          <p className="text-[1.0625rem] leading-relaxed" style={{ color: 'var(--muted)' }}>
            Hover a code above to read it here. Click one to keep it in view and mark turns with it.
          </p>
        </>
      )}
    </div>
  );
}

// --- helpers --------------------------------------------------------------

/** The first session no tutor has annotated, which is where the loop starts;
 *  failing that, the first session that is not locked; failing that, the first. */
function defaultSession(sessions: SessionSummary[]): string | null {
  return (sessions.find((s) => !s.annotated) ?? sessions.find((s) => !s.locked) ?? sessions[0])?.session_id ?? null;
}

/** The codes a tutor marks in this session: the problem-solving ones, less any
 *  that needs timestamps the session does not have. */
function codesFor(session: Pick<Session, 'has_timestamps'>) {
  return codebook.codes.filter(
    (c) => isProblemProcess(c.code) && (session.has_timestamps ? true : !c.requires_timestamps),
  );
}

/** A run's episodes as turn-index spans, in turn order. With `allowed`, an
 *  episode under a code outside it is left out and its turns counted. */
function spansOf(
  episodes: Episode[],
  turns: Turn[],
  allowed: Set<string> | null,
): { spans: Draft[]; dropped: number } {
  const order = new Map(turns.map((t, i) => [t.turn_id, i]));
  const spans: Draft[] = [];
  let dropped = 0;
  for (const e of episodes) {
    const start = order.get(e.start_turn_id);
    const end = order.get(e.end_turn_id);
    if (start === undefined || end === undefined || end < start) continue;
    if (allowed && !allowed.has(e.EPISODE)) {
      dropped += end - start + 1;
      continue;
    }
    spans.push({ code: e.EPISODE, start, end });
  }
  return { spans: spans.sort((a, b) => a.start - b.start), dropped };
}

function codesByTurn(spans: Draft[], length: number): Array<string | undefined> {
  const codes: Array<string | undefined> = Array.from({ length }, () => undefined);
  for (const s of spans) for (let i = s.start; i <= s.end && i < length; i += 1) codes[i] = s.code;
  return codes;
}

/** Consecutive equal values, as runs, so a strip draws one block per run. */
function runsOf<T>(values: T[]): Array<{ value: T; start: number; length: number }> {
  const runs: Array<{ value: T; start: number; length: number }> = [];
  values.forEach((value, i) => {
    const last = runs[runs.length - 1];
    if (last && last.value === value) last.length += 1;
    else runs.push({ value, start: i, length: 1 });
  });
  return runs;
}

/** A run's turns by their number in the session; `indices` maps a position in
 *  a strip to that turn's index in the session. */
function turnSpan(indices: number[], start: number, length: number): string {
  const first = (indices[start] ?? start) + 1;
  const last = (indices[start + length - 1] ?? start + length - 1) + 1;
  return length === 1 ? `Turn ${first}` : `Turns ${first}–${last}`;
}

/** 1, 1 and 3, 1, 3 and 4. */
function numberList(ns: number[]): string {
  return ns.length < 2 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
}

/**
 * The view a session opens in: the saved annotation's, or the sample for a
 * session not yet annotated. A saved run with no record of what was shown was
 * marked over the whole session. [OURS: a run saved on a sample that is no
 * longer the one drawn (the config changed) opens on the whole session, so no
 * saved stretch is hidden.]
 */
function openingMode(d: SessionDetail): ShownMode {
  if (d.sample === null) return 'whole_session';
  if (d.human === null) return 'sample';
  const shown = d.human.shown;
  const same =
    shown?.mode === 'sample' &&
    shown.turn_ids.length === d.sample.turn_ids.length &&
    shown.turn_ids.every((id, i) => id === d.sample?.turn_ids[i]);
  return same ? 'sample' : 'whole_session';
}

function sameSpans(a: Draft[], b: Draft[]): boolean {
  return (
    a.length === b.length &&
    a.every((d, i) => d.code === b[i]?.code && d.start === b[i]?.start && d.end === b[i]?.end)
  );
}

/** The tutor's saved tutor-move marks on the shown items, as the draft holds them: preceding_turn_id to code. */
function savedMarks(moves: SessionMoves): Record<string, string> {
  const marks: Record<string, string> = {};
  for (const item of moves.items) {
    if (item.tutor_mark !== null && moves.shown_item_ids.includes(item.preceding_turn_id)) marks[item.preceding_turn_id] = item.tutor_mark;
  }
  return marks;
}

function sameMarks(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

function figureFor(agreement: Agreement, sessionId: string): Figure | null {
  return agreement.per_session?.find((p) => p.session_id === sessionId) ?? null;
}

function savedText(episodes: number, before: Figure | null, after: Figure | null, modelled: boolean): string {
  const head = `Saved ${episodes} episode${episodes === 1 ? '' : 's'} to the workspace.`;
  if (!modelled) return `${head} Generate the model reading to compare the two.`;
  const kept = ' The model was not run again.';
  if (after?.value == null) {
    return `${head}${kept} No agreement figure for this session: ${refusalText(after?.refusal)}.`;
  }
  const was = before?.value != null ? `${before.value.toFixed(2)} → ` : '';
  return `${head}${kept} Agreement with the model on this session: κ ${was}${after.value.toFixed(2)}.`;
}

/** Why a session has no agreement figure, as a sentence a tutor can act on.
 *  A codebook version mismatch is put in plain words here. Any other reason,
 *  including one this page does not know, is shown as the server wrote it, and
 *  a refusal carrying no detail still reads as a sentence. */
function refusalText(refusal: Figure['refusal'] | undefined): string {
  if (refusal?.reason === 'codebook_version_mismatch') {
    return (
      'the annotation and the model’s reading were made under different versions of the codebook, so the two ' +
      'cannot be compared turn by turn. Whichever was made under the older version needs redoing: generate the ' +
      'model reading again, or change and save the annotation'
    );
  }
  return refusal?.detail || 'the server gave no reason';
}

/** Two touching stretches under the same code as one episode, which is what
 *  the server saves (src/server/api.ts, putAnnotation). Spans in turn order. */
function mergeTouching(spans: Draft[]): Draft[] {
  const merged: Draft[] = [];
  for (const d of spans) {
    const previous = merged[merged.length - 1];
    if (previous && previous.code === d.code && previous.end + 1 === d.start) previous.end = d.end;
    else merged.push({ ...d });
  }
  return merged;
}

/** Remove [start,end] from a draft, leaving whatever of it survives. */
function splitAround(d: Draft, start: number, end: number): Draft[] {
  if (d.end < start || d.start > end) return [d];
  const out: Draft[] = [];
  if (d.start < start) out.push({ ...d, end: start - 1 });
  if (d.end > end) out.push({ ...d, start: end + 1 });
  return out;
}

function uploadDefaults(sessions: SessionSummary[], studentId: string): UploadFields {
  const index = sessions.reduce((max, s) => Math.max(max, s.session_index), 0) + 1;
  return {
    session_id: nextSessionId(sessions, studentId, index),
    student_id: studentId,
    session_index: String(index),
    session_date: today(),
    session_topic: '',
  };
}

/** Follows the numbering of the last session's id when it ends in a number
 *  (demo-a-s04 → demo-a-s05), and never repeats an id already present. */
function nextSessionId(sessions: SessionSummary[], studentId: string, index: number): string {
  const last = sessions.at(-1)?.session_id ?? '';
  const numbered = /^(.*?)(\d+)$/.exec(last);
  const base = numbered
    ? `${numbered[1] ?? ''}${String(index).padStart((numbered[2] ?? '').length, '0')}`
    : `${studentId}-s${String(index).padStart(2, '0')}`;
  let candidate = base;
  for (let n = 2; sessions.some((s) => s.session_id === candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buttonStyle(enabled: boolean, primary: boolean) {
  return {
    background: enabled ? (primary ? 'var(--accent)' : 'var(--ink)') : 'var(--rule)',
    color: enabled ? '#fff' : 'var(--muted)',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
