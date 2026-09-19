import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  Agreement,
  AgreementState,
  Episode,
  Report as ReportType,
  Session,
  Turn,
} from '../src/contract/types.ts';
import { buildReport, getSession, type SessionSummary, type WorkspaceState } from './api.ts';
import { useWorkspace } from './workspace.tsx';
import { Legend } from './Timeline.tsx';
import { Schematic, openingLine, problemGroups } from './Schematic.tsx';
import { codeColour, codeDefinition, codeName, isProblemProcess, speakerName } from './data.ts';
import { KEY_MOVE_LABEL, chooseQuotes, descriptionsOf, readingsOf, starredOpener, type Readings } from './quotes.ts';

// Layer 2's own codebook, read for its provenance block only. Nothing on this
// page names a tutor move, and no figure from the layer appears here.
interface MovesProvenance {
  codebook_version: string;
  provenance: { citation: string; licence: string; corpus: string; status: string; not_validated_on: string };
}
const movesBook = (await import('../codebook.tutor-moves.json')).default as MovesProvenance;

// The report a student and a parent read together (§7.1). Warm, about two
// minutes, and it resists the dashboard. No agreement figure appears anywhere
// on this surface (D11): the state is said in words, and the number lives in
// the internal view. The model's written summary is not shown here either; it
// is on the internal view with the claims it made.
//
// Everything here reads the live workspace (app/workspace.tsx): the stored
// report is `state.report`, built by the button on this page from the sessions
// that have both a tutor's annotation and a model run, and only those (D16).
//
// Only the codes the codebook marks `in_problem_process` reach this surface.
// The other four are labelled so that every turn has somewhere to go — that is
// what keeps them out of the episodes that matter — and they are not drawn, not
// coloured, not counted and not named here. A code the live codebook does not
// carry is treated the same way; see `isProblemProcess` in data.ts.
//
// The strip is drawn in this file rather than by Timeline.tsx because the
// description panel opens against the side of the window away from the block
// selected, which needs the block's position, and because the strip has to
// close the gaps left by what is no longer drawn. Neither is expressible
// through Timeline's props.

type Side = 'left' | 'right';

interface Focus {
  episode: Episode;
  session: Session;
  /** Which edge of the window the panel opens against: the one away from the
   *  pointer, so the panel never covers the block being read. */
  side: Side;
}

const sideAwayFrom = (x: number): Side => (x >= window.innerWidth / 2 ? 'left' : 'right');

function turnIndex(session: Session): Map<string, number> {
  return new Map(session.turns.map((t, i) => [t.turn_id, i]));
}

/** One run's episodes over this session, in turn order, and only the kinds of
 *  work this surface draws. */
function shownEpisodes(session: Session, runId: string): Episode[] {
  const order = turnIndex(session);
  return (session.annotations ?? [])
    .filter((e) => e.run_id === runId && isProblemProcess(e.EPISODE))
    .sort((a, b) => (order.get(a.start_turn_id) ?? 0) - (order.get(b.start_turn_id) ?? 0));
}

/** [DERIVED: an episode's first and last turn → how many turns it ran.] */
function turnsIn(session: Session, episode: Episode): number {
  const order = turnIndex(session);
  const start = order.get(episode.start_turn_id) ?? 0;
  const end = order.get(episode.end_turn_id) ?? start;
  return Math.max(1, end - start + 1);
}

function spanLabel(session: Session, episode: Episode): string {
  const order = turnIndex(session);
  const start = (order.get(episode.start_turn_id) ?? 0) + 1;
  const end = (order.get(episode.end_turn_id) ?? start - 1) + 1;
  return start === end ? `turn ${start}` : `turns ${start}–${end}`;
}

// Timestamps. An instant carries a zone, so it renders in the reader's own; a
// session_date is a date with no zone attached and is read as written.
function clockOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayOf(iso: string): string | null {
  const at = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

function clockSpan(turns: Turn[]): string | null {
  const first = turns[0];
  const last = turns[turns.length - 1];
  if (!first || !last) return null;
  const from = clockOf(first.start_time);
  if (!from) return null;
  const to = clockOf(last.end_time ?? last.start_time);
  return to && to !== from ? `${from}–${to}` : from;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function sessionList(indices: number[]): string {
  const sorted = [...indices].sort((a, b) => a - b).map(String);
  return `${sorted.length === 1 ? 'session' : 'sessions'} ${joinAnd(sorted)}`;
}

/**
 * Who made the marking the model's is compared with, over these sessions, as
 * each session's `annotation_simulated` records it: a tutor, a marking
 * generated for this demo, or each for the sessions it covers. The words are
 * the provenance card's (`provenanceCard` in src/pipeline/report.ts). A
 * session is credited to a tutor only when its flag is `false`.
 */
function comparedWith(sessions: SessionSummary[]): string {
  const byTutor = sessions.filter((s) => s.annotation_simulated === false).map((s) => s.session_index);
  const generated = sessions.filter((s) => s.annotation_simulated !== false).map((s) => s.session_index);
  if (byTutor.length === 0) return 'an annotator generated for this demo';
  if (generated.length === 0) return 'a tutor';
  return `a tutor on ${sessionList(byTutor)} and an annotator generated for this demo on ${sessionList(generated)}`;
}

// --- building ----------------------------------------------------------------

// A build waits on the model, and switching tabs unmounts this component. Its
// progress is kept here, outside the component, so leaving the tab and coming
// back still shows the build running, or the server's reason it did not finish.
interface BuildStatus {
  startedAt: number | null;
  error: string | null;
}

let build: BuildStatus = { startedAt: null, error: null };
const buildListeners = new Set<() => void>();

function setBuild(next: BuildStatus): void {
  build = next;
  for (const listener of buildListeners) listener();
}

function subscribeBuild(listener: () => void): () => void {
  buildListeners.add(listener);
  return () => {
    buildListeners.delete(listener);
  };
}

const getBuild = (): BuildStatus => build;

async function runBuild(refresh: () => Promise<void>): Promise<void> {
  if (build.startedAt !== null) return;
  setBuild({ startedAt: Date.now(), error: null });
  try {
    await buildReport();
    await refresh();
    setBuild({ startedAt: null, error: null });
  } catch (error) {
    setBuild({ startedAt: null, error: error instanceof Error ? error.message : String(error) });
  }
}

function useSecondsSince(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

function BuildButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-2 text-sm transition-opacity disabled:opacity-50"
      style={{ background: 'var(--ink)', color: 'var(--paper)', cursor: disabled ? 'default' : 'pointer' }}
    >
      {label}
    </button>
  );
}

function Building({ indices, startedAt }: { indices: number[]; startedAt: number }) {
  const seconds = useSecondsSince(startedAt);
  return (
    <p
      className="mb-6 flex items-center gap-3 rounded-lg px-4 py-3 text-sm"
      style={{ background: '#f4f1ec', color: 'var(--ink)' }}
      role="status"
    >
      <span className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full" style={{ background: 'var(--accent)' }} />
      <span>
        Building the report from {sessionList(indices)}. The model is reading the marked stretches of work, which
        takes a little while.
      </span>
      <span className="ml-auto tabular-nums" style={{ color: 'var(--muted)' }}>
        {seconds} s
      </span>
    </p>
  );
}

function BuildError({ message }: { message: string }) {
  return (
    <p className="mb-6 rounded-lg px-4 py-3 text-sm" style={{ background: '#fff1f1', color: '#8a2c2c' }} role="alert">
      The report was not built. The server said: {message}
    </p>
  );
}

// --- is the stored report current? -------------------------------------------

type Freshness =
  | { state: 'checking' }
  | { state: 'current' }
  | { state: 'changed'; changes: string[] }
  | { state: 'unknown'; error: string };

function tilingKey(episodes: Episode[], order: Map<string, number>): string {
  return [...episodes]
    .sort((a, b) => (order.get(a.start_turn_id) ?? 0) - (order.get(b.start_turn_id) ?? 0))
    .map((e) => `${e.EPISODE}:${e.start_turn_id}:${e.end_turn_id}`)
    .join('|');
}

/**
 * What has changed in the workspace since the stored report was built.
 *
 * Timestamps cannot answer this: the report records no time it was built, and
 * the run records inside it are copies of the first session's runs only, so no
 * run time in the report speaks for any other session. The session list in
 * `state.sessions` carries no times either. So this compares content instead:
 * each session the report covers is fetched, and its current annotation and
 * model run are compared episode by episode — code, first turn, last turn —
 * with the ones the report was built from. A session that has both runs now
 * and is not in the report counts as a change as well.
 * [OURS: content comparison over timestamps; exact, at the cost of one request
 * per session in the report whenever the workspace changes.]
 */
async function changesSince(report: ReportType, state: WorkspaceState): Promise<string[]> {
  const humanRunId = report.runs.find((r) => r.kind === 'human')?.run_id ?? null;
  const llmRunId = report.runs.find((r) => r.kind === 'llm')?.run_id ?? null;
  const covered = new Set(report.sessions.map((s) => s.session_id));
  const changes: Array<{ index: number; text: string }> = [];

  for (const s of state.sessions) {
    if (s.annotated && s.modelled && !covered.has(s.session_id)) {
      changes.push({ index: s.session_index, text: `session ${s.session_index} has been annotated and run` });
    }
  }

  const details = await Promise.all(report.sessions.map((s) => getSession(s.session_id)));
  report.sessions.forEach((stored, i) => {
    const live = details[i];
    if (!live) return;
    const order = turnIndex(stored);
    const was = (runId: string | null) =>
      tilingKey((stored.annotations ?? []).filter((e) => e.run_id === runId), order);
    if (humanRunId && tilingKey(live.human?.episodes ?? [], order) !== was(humanRunId)) {
      changes.push({ index: stored.session_index, text: `the annotation of session ${stored.session_index} has changed` });
    }
    if (llmRunId && tilingKey(live.llm?.episodes ?? [], order) !== was(llmRunId)) {
      changes.push({ index: stored.session_index, text: `the model has run again on session ${stored.session_index}` });
    }
  });

  return changes.sort((a, b) => a.index - b.index).map((c) => c.text);
}

// --- the provenance card's line about agreement ------------------------------

// The stored card was written when the report was built, and one of its lines
// says what the agreement allowed at that moment. The page's gate reads the
// live agreement, so when the two have come apart that line would contradict
// the page. It is then swapped for a line saying what holds now. The prefixes
// are the openings of the three lines `provenanceCard` in
// src/pipeline/report.ts writes; if that wording changes, the old line shows
// beside the new one rather than disappearing. The new line names who made the
// comparison marking from the live sessions (`comparedWith`), in the card's
// words.
const CARD_GATE_LINE_OPENINGS = [
  'These sessions were marked by the model and, separately, by',
  'Nobody has marked these sessions by hand',
];

const LIVE_GATE_LINE: Record<AgreementState, (who: string) => string> = {
  shown: (who) =>
    `These sessions were marked by the model and, separately, by ${who}. The two lined up closely enough for this view to be shown. Lining up is not evidence that either marking is right.`,
  suppressed: (who) =>
    `These sessions were marked by the model and, separately, by ${who}. The two diverged too much for this view to be shown, so the episode detail is held back.`,
  unmeasured: () => 'The two markings of these sessions could not be compared, so the episode detail is held back.',
};

function cardLines(report: ReportType, live: Agreement, who: string): string[] {
  if (report.agreement.state === live.state) return report.provenance_card;
  return [
    ...report.provenance_card.filter((line) => !CARD_GATE_LINE_OPENINGS.some((opening) => line.startsWith(opening))),
    LIVE_GATE_LINE[live.state](who),
  ];
}

// --- pieces ------------------------------------------------------------------

function DataLabel({ label }: { label: string }) {
  return (
    <div
      className="mb-6 rounded px-3 py-2 text-xs"
      style={{ background: '#fff8e6', border: '1px solid #f0e0b0', color: '#6b5a2e' }}
    >
      {label}
    </div>
  );
}

function Held({ title, body }: { title: string; body: string }) {
  return (
    <section className="my-8 rounded p-5" style={{ border: '1px solid var(--rule)', background: '#fbfaf8' }}>
      <h2 className="mb-2 text-lg">{title}</h2>
      <p className="max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        {body}
      </p>
    </section>
  );
}

/**
 * One session's stretches of work, side by side in the order they came.
 *
 * Widths are shares of the turns drawn here, not of the whole session, so the
 * strip closes the gaps left by the stretches this surface does not draw. Two
 * blocks still compare exactly — a block twice as wide ran twice as many turns
 * — and the count beside the session counts the same turns the strip draws, so
 * the number and the picture agree. [OURS: the alternative was leaving the gaps
 * open, which draws the undrawn stretches as blank space and puts them back in
 * front of a reader in the one way left.]
 */
function Strip({
  session,
  episodes,
  selectedId,
  onSelect,
}: {
  session: Session;
  episodes: Episode[];
  selectedId: string | null;
  /** `x` is the block's centre, which decides the side the panel opens on. */
  onSelect: (episode: Episode, x: number) => void;
}) {
  const spans = episodes.map((e) => ({ episode: e, turns: turnsIn(session, e) }));
  const total = spans.reduce((n, s) => n + s.turns, 0);
  const centre = (el: HTMLElement): number => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  };

  return (
    <div
      className="flex h-10 w-full overflow-hidden rounded"
      style={{ border: '1px solid var(--rule)' }}
    >
      {spans.map(({ episode, turns }) => (
        <button
          key={episode.episode_id}
          onClick={(e) => onSelect(episode, centre(e.currentTarget))}
          title={`${codeName(episode.EPISODE)}, ${spanLabel(session, episode)}`}
          aria-label={`${codeName(episode.EPISODE)}, ${turns} turn${turns === 1 ? '' : 's'}`}
          className="h-full transition-opacity hover:opacity-80"
          style={{
            width: `${(turns / total) * 100}%`,
            background: codeColour[episode.EPISODE] ?? '#ccc',
            outline: selectedId === episode.episode_id ? '2px solid var(--ink)' : 'none',
            outlineOffset: '-2px',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

/**
 * The stretch held open, against the edge of the window away from the block
 * that opened it. Rule 7: nothing here is a claim that does not
 * open the turns it rests on. The wording of what a kind of work is comes from
 * the codebook, never from this file.
 */
function Detail({
  focus,
  movesShown,
  readings,
  descriptions,
  onClose,
}: {
  focus: Focus;
  movesShown: boolean;
  readings: Readings;
  /** `descriptionsOf`: what was done in an exchange, by the quote's turn_id. */
  descriptions: Record<string, string>;
  onClose: () => void;
}) {
  const { episode, session, side } = focus;
  const turns = session.turns.filter((t) => episode.evidence.includes(t.turn_id));
  const starred = starredOpener(session, episode, movesShown);
  const quotes = chooseQuotes(session, turns, readings, starred);
  const definition = codeDefinition(episode.EPISODE);
  const clock = clockSpan(turns);
  const opening = openingLine(session, episode, movesShown);

  return (
    <aside
      className="fixed top-24 z-30 overflow-y-auto rounded-lg p-5 shadow-lg"
      style={{
        ...(side === 'left' ? { left: '0.5rem' } : { right: '0.5rem' }),
        width: 'min(24rem, calc(100vw - 1rem))',
        maxHeight: 'calc(100vh - 8rem)',
        background: 'var(--paper)',
        border: '1px solid var(--rule)',
      }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl">
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-sm"
            style={{ background: codeColour[episode.EPISODE] ?? '#ccc' }}
          />
          {codeName(episode.EPISODE)}
        </h3>
        <button className="text-sm underline" onClick={onClose} style={{ color: 'var(--muted)' }}>
          close
        </button>
      </div>

      <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>
        Session {session.session_index} &middot; {spanLabel(session, episode)}
        {clock ? ` · ${clock}` : ''}
      </p>

      {definition && (
        <p className="mb-5 text-lg leading-relaxed" style={{ color: 'var(--ink)' }}>
          {definition}
        </p>
      )}

      {opening && (
        <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>
          {opening}
        </p>
      )}

      {quotes.length < turns.length && (
        <p className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
          {quotes.length} of the {turns.length} turns in this stretch.
        </p>
      )}

      <ol className="space-y-4 text-base leading-relaxed">
        {quotes.map((t) => {
          const at = clockOf(t.start_time);
          return (
            <li key={t.turn_id}>
              <div className="mb-0.5 text-xs uppercase" style={{ color: 'var(--muted)' }}>
                {speakerName(t.role, session)}
                {at ? ` · ${at}` : ''}
              </div>
              {t.turn_id === starred && (
                <div className="mb-0.5 text-sm" style={{ color: 'var(--ink)' }}>
                  <span aria-hidden="true">&#9733;</span> {KEY_MOVE_LABEL}
                </div>
              )}
              {t.content}
              {t.turn_id === starred && descriptions[t.turn_id] && (
                <p className="mt-1 text-sm leading-snug" style={{ color: 'var(--muted)' }}>
                  {descriptions[t.turn_id]}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** A problem worked on with no stretch of the work this surface draws. It gets
 *  its heading and a line saying so, rather than a frame with nothing in it. */
function NoRoute({ topic }: { topic: string | null }) {
  return (
    <div>
      {topic ? (
        <h3 className="mb-2 text-base" style={{ color: 'var(--ink)' }}>
          {topic}
        </h3>
      ) : null}
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        No stretch of work was marked here, so there is no route to draw.
      </p>
    </div>
  );
}

// --- the page ----------------------------------------------------------------

export function Report() {
  const { state, refresh } = useWorkspace();
  if (!state) return null;
  return <LiveReport state={state} refresh={refresh} />;
}

function LiveReport({ state, refresh }: { state: WorkspaceState; refresh: () => Promise<void> }) {
  const [held, setHeld] = useState<Focus | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [freshness, setFreshness] = useState<Freshness>({ state: 'checking' });
  const status = useSyncExternalStore(subscribeBuild, getBuild);

  // Read the server on arrival, so the gate below reflects any annotation
  // saved on another tab even if that tab did not refresh the workspace.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const report = state.report;

  useEffect(() => {
    if (!report) return;
    let current = true;
    changesSince(report, state).then(
      (changes) => {
        if (current) setFreshness(changes.length > 0 ? { state: 'changed', changes } : { state: 'current' });
      },
      (error: unknown) => {
        if (current) setFreshness({ state: 'unknown', error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [report, state]);

  const paired = state.sessions
    .filter((s) => s.annotated && s.modelled)
    .sort((a, b) => a.session_index - b.session_index);
  const pairedIndices = paired.map((s) => s.session_index);
  const building = status.startedAt !== null;
  const onBuild = () => void runBuild(refresh);

  // Nothing has both a tutor's annotation and a model run: there is nothing to
  // build from and nothing to check it against. That is the whole page.
  if (paired.length === 0) {
    return (
      <article>
        <DataLabel label={state.workspace.data_provenance.ui_label} />
        <h1 className="mb-1 text-3xl">How the problem-solving went</h1>
        <Held
          title="Nothing to compare against yet"
          body="This report is built from sessions that carry two separate markings: the model's, and a second one to check it against. No session has both yet, so there is nothing to show. This is not a problem with the sessions."
        />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          To start one, mark a session in Tutor Annotation, save it, and run the model on it there.
        </p>
      </article>
    );
  }

  const controls = (
    <>
      {building && status.startedAt !== null && <Building indices={pairedIndices} startedAt={status.startedAt} />}
      {!building && status.error && <BuildError message={status.error} />}
    </>
  );

  if (!report) {
    return (
      <article>
        <DataLabel label={state.workspace.data_provenance.ui_label} />
        <h1 className="mb-1 text-3xl">How the problem-solving went</h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--muted)' }}>
          No report has been built yet. It will cover {sessionList(pairedIndices)}: the sessions marked by the model
          and, separately, by {comparedWith(paired)}.
        </p>
        {controls}
        <BuildButton label="Build the report" onClick={onBuild} disabled={building} />
      </article>
    );
  }

  // The gate reads the LIVE agreement, `state.agreement`, not the snapshot the
  // stored report carries in `report.agreement`. Saving an annotation
  // recomputes the agreement on the server and leaves the model's run and the
  // stored report untouched (SPEC D14). If a tutor's edit to an earlier session
  // pulls the pooled kappa under the threshold, the episode detail has to be
  // held back on this page's next render, with no model call and no rebuild;
  // the snapshot would go on saying what held when the report was built. The
  // snapshot is used only to tell whether the card's agreement line is out of
  // date (`cardLines`).
  const live = state.agreement;
  const shown = live.state === 'shown';
  // Layer 2 has its own gate, read live the same way, and is never combined
  // with the one above. It only ever adds a clause inside the session detail,
  // so it reaches this page only when that detail is drawn.
  const movesShown = state.moves_agreement.state === 'shown';
  const movesOnPage = shown && movesShown;
  // Who made the marking the live agreement compares with, over the sessions
  // it is computed on: the paired ones, as the server records them now.
  const who = comparedWith(paired);

  const sourceRun = report.runs.find((r) => r.run_id === report.source_run_id);
  const reportable = new Set(report.session_gate.sessions.filter((s) => s.reportable).map((s) => s.session_id));
  const sessions = [...report.sessions]
    .filter((s) => reportable.has(s.session_id))
    // Most recent first: the session just worked on is the one a family opens
    // the report to read. [OURS: owner decision 2026-09-18]
    .sort((a, b) => b.session_index - a.session_index);

  const codesUsed = [
    ...new Set(sessions.flatMap((s) => shownEpisodes(s, report.source_run_id).map((e) => e.EPISODE))),
  ];
  const heldBack = report.session_gate.sessions.filter((s) => !s.reportable);

  // A stretch left open while the report changes underneath belongs to a session
  // this report is no longer showing, and the held-back states show no session
  // detail at all. Either way the panel closes rather than carrying a stretch
  // across, and the stale stretch stops counting as the one being held.
  const here = (focus: Focus | null): Focus | null =>
    focus && sessions.some((s) => s.session_id === focus.session.session_id) ? focus : null;

  const heldHere = here(held);
  const panel = shown ? heldHere : null;

  const hold = (next: Focus): void => {
    setHeld(heldHere?.episode.episode_id === next.episode.episode_id ? null : next);
  };

  return (
    <article>
      <DataLabel label={report.data_provenance.ui_label} />

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="mb-1 text-3xl">How the problem-solving went</h1>
          {/* The held-back states draw no session, so the line says so. */}
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {sessions.length} session{sessions.length === 1 ? '' : 's'}
            {shown ? ', most recent first.' : ', held back for the reason below.'}
          </p>
        </div>
        {freshness.state !== 'changed' && (
          <button
            className="text-sm underline disabled:no-underline disabled:opacity-50"
            onClick={onBuild}
            disabled={building}
            style={{ color: 'var(--muted)' }}
          >
            Rebuild the report
          </button>
        )}
      </div>

      {controls}

      {freshness.state === 'changed' && (
        <div
          className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-4 py-3 text-sm"
          style={{ border: '1px solid var(--rule)', background: '#fbfaf8' }}
        >
          <span>Since this report was built, {joinAnd(freshness.changes)}.</span>
          <BuildButton label="Rebuild the report" onClick={onBuild} disabled={building} />
        </div>
      )}
      {freshness.state === 'unknown' && (
        <p className="mb-6 text-sm" style={{ color: '#8a2c2c' }}>
          Whether this report is current could not be checked. The server said: {freshness.error}
        </p>
      )}

      {shown ? (
        <>
          <p className="mb-8 max-w-3xl text-base leading-relaxed" style={{ color: 'var(--muted)' }}>
            Each block below is one stretch of work, in the order it came, and its width is how many turns it ran next
            to the others. Select a block to read what that stretch was, and select it again to close it.
          </p>

          <section className="space-y-14">
            {sessions.map((session) => {
              const episodes = shownEpisodes(session, report.source_run_id);
              const drawnTurns = episodes.reduce((n, e) => n + turnsIn(session, e), 0);
              const date = dayOf(session.session_date);
              const focusAt = (episode: Episode, x: number): Focus => ({ episode, session, side: sideAwayFrom(x) });
              return (
                <div key={session.session_id}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                    <span>
                      Session {session.session_index}
                      {date ? <span style={{ color: 'var(--muted)' }}> &middot; {date}</span> : null}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      {episodes.length} stretch{episodes.length === 1 ? '' : 'es'} of work &middot; {drawnTurns} turn
                      {drawnTurns === 1 ? '' : 's'}
                    </span>
                  </div>
                  {episodes.length > 0 ? (
                    <Strip
                      session={session}
                      episodes={episodes}
                      selectedId={heldHere?.episode.episode_id ?? null}
                      onSelect={(episode, x) => hold(focusAt(episode, x))}
                    />
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      No stretch of work was marked in this session, so there is nothing to draw.
                    </p>
                  )}
                  {/* One diagram per problem, in order, each across the full
                      width of the page. A session with no `problems` is one
                      problem and its diagram has no heading. The diagram opens
                      its own evidence panel from its steps; `selectedId` rings
                      the step whose turns are held open from the strip. */}
                  <div className="mt-6 w-full space-y-10">
                    {problemGroups(session, episodes).map((group) =>
                      group.episodes.length > 0 ? (
                        <Schematic
                          key={group.key}
                          session={session}
                          episodes={group.episodes}
                          topic={group.topic}
                          selectedId={heldHere?.episode.episode_id ?? null}
                          movesShown={movesShown}
                          readings={readingsOf(report.runs)}
                          descriptions={descriptionsOf(report)}
                        />
                      ) : (
                        <NoRoute key={group.key} topic={group.topic} />
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          <div className="mt-4">
            <Legend codes={codesUsed} />
          </div>
        </>
      ) : live.state === 'suppressed' ? (
        <Held
          title="The session detail is held back"
          body={`These sessions were marked by the model and, separately, by ${who}, and the two markings diverged too much about where one kind of work ends and the next begins. Until that settles, showing the detail would suggest more certainty than there is.`}
        />
      ) : (
        <Held
          title="Nothing to compare against yet"
          body={`These sessions were marked by the model and, separately, by ${who}, but the two markings could not be compared, so there is no second reading to check the model's against. The detail stays held back until there is one. This is not a problem with the sessions.`}
        />
      )}

      {panel && (
        <Detail
          focus={panel}
          movesShown={movesShown}
          readings={readingsOf(report.runs)}
          descriptions={descriptionsOf(report)}
          onClose={() => setHeld(null)}
        />
      )}

      {/* Only when other sessions are on screen: in a held-back state nothing is
          shown, and "one session is not shown" would imply the rest are. */}
      {shown && heldBack.length > 0 && (
        <p className="mt-8 text-xs" style={{ color: 'var(--muted)' }}>
          {heldBack.length} session{heldBack.length === 1 ? ' is' : 's are'} not shown:{' '}
          {heldBack.every((s) => s.turn_count < report.session_gate.min_turns)
            ? `too few turns to say anything about the shape of the work (${report.session_gate.min_turns} turns is the floor).`
            : `too short, or only part of the session was recorded (${report.session_gate.min_turns} turns is the floor).`}
        </p>
      )}

      <section className="mt-10 border-t pt-4" style={{ borderColor: 'var(--rule)' }}>
        <button className="text-sm underline" onClick={() => setCardOpen((v) => !v)}>
          {cardOpen ? 'Hide' : 'Where this comes from'}
        </button>
        {cardOpen && (
          <ul className="mt-3 max-w-3xl space-y-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            {cardLines(report, live, who).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
            <li>
              Marked by:{' '}
              {sourceRun?.kind === 'human'
                ? sourceRun.simulated
                  ? 'a marking generated for this demo'
                  : 'a person'
                : 'a model'}{' '}
              &middot; codebook{' '}
              {report.codebook_version}
            </li>
          </ul>
        )}
        {/* Layer 2's own card, apart from the one above: its own source, its
            own codebook version and its own gate, never merged with either.
            [OURS: two fields of the codebook's provenance block stay off this
            surface. `agreement_as_reported` carries the authors' figures, and
            this page shows no agreement figure (D11); both rounds are on the
            internal view. `in_this_project` names the threshold and says no
            agreement is established, which the live gate line below replaces
            while the layer is shown.] */}
        {cardOpen && movesOnPage && (
          <div className="mt-6 max-w-3xl border-t pt-3" style={{ borderColor: 'var(--rule)' }}>
            <p className="mb-2 text-xs" style={{ color: 'var(--ink)' }}>
              The turn before a stretch of work
            </p>
            <ul className="space-y-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              <li>
                Where a stretch reads &ldquo;with no prompt in the turn before it&rdquo;, that rests on a separate
                marking of the one turn just before the stretch, kept apart from the kinds of work above.
              </li>
              <li>
                {movesBook.provenance.citation} {movesBook.provenance.licence}.
              </li>
              <li>Developed on: {movesBook.provenance.corpus}</li>
              <li>Status: {movesBook.provenance.status}</li>
              <li>Not validated on: {movesBook.provenance.not_validated_on}</li>
              <li>
                That turn was marked by the model and, separately,{' '}
                {state.moves_agreement.simulated
                  ? 'by an annotator generated for this demo, on some or all of the sessions'
                  : 'by a tutor'}
                . The two lined up closely enough for these words to be shown. Lining up is not evidence that either
                marking is right.
              </li>
              <li>Tutor-move codebook {movesBook.codebook_version}</li>
            </ul>
          </div>
        )}
      </section>
    </article>
  );
}
