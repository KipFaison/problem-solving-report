import { useEffect, useState, type ReactNode } from 'react';
import type { Agreement, Episode, Report, Run, SessionGate } from '../src/contract/types.ts';
import type { MovesCodebook } from '../src/moves/codebook.ts';
import { getMoves, getSession, type SessionDetail, type SessionMoves, type SessionOutline, type SessionSummary } from './api.ts';
import { Legend, Timeline } from './Timeline.tsx';
import { codebook, codeColour, codeName, comparableCode, isProblemProcess, NOT_PROBLEM_SOLVING } from './data.ts';
import { useWorkspace } from './workspace.tsx';

// The internal view (§7.3). Not learner-facing, never linked from the report or
// from the annotation interface, and the one surface where every computed
// figure belongs: the pooled figure the gate acts on, the per-session figures
// kept apart from it, the session gate, where each run came from, the summary
// call's output, and the two tilings side by side.
//
// Everything is read live: the workspace state from useWorkspace(), and each
// session's runs from getSession(). This page changes nothing on the server,
// so it never calls refresh(); it re-reads whenever the state it is handed
// changes, which is how a save or a model run on another tab shows up here.
//
// Layer 2 (tutor moves) has its own section at the foot of the page, read from
// state.moves_agreement and getMoves(). No figure, pool or index spans the two
// layers.
//
// Token usage (Run.usage) is on the run file on disk and is deliberately not
// rendered: cost is bookkeeping for whoever runs the pipeline.
//
// Copy rule for this file: terse. One line per explanation, the citation in
// parentheses at the end of it. No shell commands, and no account of how any of
// this came to be built.
//
// [OURS: the panel layout and the turn-by-turn difference strip. Each is
// bookkeeping for a reader of this page, not a measurement.]

const MATCH = '#e7e3dc';
const DIFFER = '#c0392b';

/** Per-turn code under one run's episodes, in the session's turn order, and
 *  undefined for a turn no episode covers. SessionBlock turns these into the
 *  classes src/agreement/gate.ts pairs before it calls the calculator.
 *  [DERIVED: episodes of one run → the code covering each turn; recomputed
 *  here for display, and it feeds no figure the report uses.] */
function perTurnCodes(session: SessionOutline, episodes: Episode[]): Array<string | undefined> {
  const turns = [...session.turns].sort((x, y) => x.sequence_id - y.sequence_id);
  const position = new Map(turns.map((t, i) => [t.turn_id, i]));
  const codes: Array<string | undefined> = turns.map(() => undefined);
  for (const e of episodes) {
    const start = position.get(e.start_turn_id);
    const end = position.get(e.end_turn_id);
    if (start === undefined || end === undefined) continue;
    for (let i = start; i <= end && i < codes.length; i += 1) codes[i] = e.EPISODE;
  }
  return codes;
}

/** Episodes in the order they occur, by the position of their first turn. */
function inTurnOrder(session: SessionOutline, episodes: Episode[]): Episode[] {
  const order = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  return [...episodes].sort((x, y) => (order.get(x.start_turn_id) ?? 0) - (order.get(y.start_turn_id) ?? 0));
}

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function Panel({ title, question, children }: { title: string; question: string; children: ReactNode }) {
  return (
    <section className="rounded p-4" style={{ border: '1px solid var(--rule)', background: '#fbfaf8' }}>
      <h3 className="text-base">{title}</h3>
      <p className="mb-3 text-xs italic" style={{ color: 'var(--muted)' }}>
        {question}
      </p>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 py-1"
      style={{ borderTop: '1px solid var(--rule)' }}
    >
      <span className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="min-w-0 text-xs">{children}</span>
    </div>
  );
}

const Mono = ({ children }: { children: ReactNode }) => (
  <code className="text-[11px]" style={{ fontFamily: 'ui-monospace, Menlo, monospace', overflowWrap: 'anywhere' }}>
    {children}
  </code>
);

const Note = ({ children }: { children: ReactNode }) => (
  <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
    {children}
  </p>
);

/** The value against the threshold, on a 0–1 axis. Hand-written, no library. */
function KappaScale({ value, threshold }: { value: number; threshold: number }) {
  const w = 300;
  const at = (v: number) => 6 + Math.max(0, Math.min(1, v)) * (w - 12);
  return (
    <svg viewBox={`0 0 ${w} 46`} className="mt-2 w-full" role="img" aria-label="the value against the threshold">
      <text x={at(threshold)} y={10} fontSize={9} textAnchor="middle" fill="var(--ink)">
        {threshold}
      </text>
      <line x1={at(0)} x2={at(1)} y1={26} y2={26} stroke="var(--rule)" strokeWidth={6} strokeLinecap="round" />
      <line x1={at(0)} x2={at(value)} y1={26} y2={26} stroke="var(--accent)" strokeWidth={6} strokeLinecap="round" />
      <line x1={at(threshold)} x2={at(threshold)} y1={15} y2={37} stroke="var(--ink)" strokeWidth={1.5} />
      <circle cx={at(value)} cy={26} r={4} fill="var(--ink)" />
      <text x={at(0)} y={45} fontSize={9} fill="var(--muted)">
        0
      </text>
      <text x={at(1)} y={45} fontSize={9} textAnchor="end" fill="var(--muted)">
        1
      </text>
    </svg>
  );
}

function stateMeaning(a: Agreement): string {
  if (a.state === 'shown') return 'at or above the threshold: the report shows episode detail (§7.1).';
  if (a.state === 'suppressed') {
    return 'under the threshold: the report holds episode detail back and says why, without the figure (§7.1 item 6).';
  }
  return 'no figure, for the reason below; the report says so plainly (§7.1 item 7).';
}

type RefusalReason = NonNullable<Agreement['refusal']>['reason'];

// Keyed by the contract's union, so a reason added there fails the typecheck
// until it has plain words here.
const REFUSAL_MEANING: Record<RefusalReason, string> = {
  no_annotation_run: 'No session has both an annotation and a model run to compare.',
  length_mismatch: 'The two label sequences differ in length, so their turns cannot be paired.',
  degenerate_single_code: 'One run put every turn in the same class, so no disagreement was possible.',
  too_few_turns: 'Fewer turns paired than the configured floor (O-7).',
  codebook_version_mismatch:
    'The annotation and the model run were labelled under different codebook versions, so their codes cannot be paired (§4).',
};

/** Plain words for a refusal reason, or null for a reason the server sends that this page has no words for. */
const refusalMeaning = (reason: string): string | null =>
  Object.hasOwn(REFUSAL_MEANING, reason) ? REFUSAL_MEANING[reason as RefusalReason] : null;

/** Sessions the pooled figure leaves out: the server pools only sessions whose
 *  two runs share a codebook version (computeWorkspaceAgreement in
 *  src/server/workspace.ts), and refuses the rest one by one. */
const heldOutOfPool = (e: NonNullable<Agreement['per_session']>[number]): boolean =>
  e.refusal?.reason === 'codebook_version_mismatch';

const sessionList = (indexes: number[]): string =>
  indexes.length === 0 ? 'none' : `session${indexes.length === 1 ? '' : 's'} ${indexes.join(', ')}`;

/** Where a session's annotation came from, read from SessionSummary.annotation_simulated. */
const annotationSource = (simulated: boolean | null): string =>
  simulated === null ? 'none' : simulated ? 'generated for the demo' : 'made by a tutor';

/** The annotation a session's κ was computed against, and what that κ is therefore a test of (§8). */
function ComparedAgainst({ simulated }: { simulated: boolean | null }) {
  if (simulated === null) return <>—</>;
  return (
    <>
      {simulated ? annotationSource(simulated) : <strong>{annotationSource(simulated)}</strong>}
      <span style={{ color: 'var(--muted)' }}>
        {simulated ? ' · a test of the pipeline' : ' · a comparison with a person'}
      </span>
    </>
  );
}

/** Who made the pooled annotations, in one line. A session counts as a tutor's
 *  only when its flag is false, as the report's provenance line counts it. */
function PooledAnnotations({ pooled, sessions }: { pooled: string[]; sessions: SessionSummary[] }) {
  const inPool = sessions.filter((s) => pooled.includes(s.session_id)).sort((x, y) => x.session_index - y.session_index);
  const byTutor = inPool.filter((s) => s.annotation_simulated === false).map((s) => s.session_index);
  const generated = inPool.filter((s) => s.annotation_simulated !== false).map((s) => s.session_index);
  const reads =
    byTutor.length === 0
      ? 'a test of the pipeline'
      : generated.length === 0
        ? 'a comparison with a person'
        : 'part test of the pipeline, part comparison with a person';
  return (
    <>
      made by a tutor: {byTutor.length === 0 ? 'none' : <strong>{sessionList(byTutor)}</strong>} · generated for the
      demo: {generated.length === 0 ? 'none' : sessionList(generated)}
      <span style={{ color: 'var(--muted)' }}> · {reads} (§8)</span>
    </>
  );
}

function PooledGate({ agreement: a, sessions }: { agreement: Agreement; sessions: SessionSummary[] }) {
  const entries = a.per_session ?? [];
  const pooledEntries = entries.filter((s) => !heldOutOfPool(s));
  const pooled = pooledEntries.map((s) => s.session_index).sort((x, y) => x - y);
  const heldOut = entries
    .filter(heldOutOfPool)
    .map((s) => s.session_index)
    .sort((x, y) => x - y);
  const pooledOver =
    pooled.length > 0
      ? `${a.n_turns === null ? 'no' : a.n_turns.toLocaleString()} turns from ${sessionList(pooled)}`
      : heldOut.length > 0
        ? 'nothing'
        : 'nothing yet: no session has both an annotation and a model run';
  return (
    <Panel title="Agreement gate · pooled" question="The one figure that decides what the report surfaces (D7, D15).">
      <Row label="statistic">
        {a.statistic} per turn over six classes: the five problem-solving codes, and {codeName(NOT_PROBLEM_SOLVING)}{' '}
        for a turn the annotation leaves unmarked or the model gives any other code (§5.4,{' '}
        <Mono>src/agreement/gate.ts</Mono>)
      </Row>
      <Row label="pooled over">
        {pooledOver}
        {heldOut.length > 0 && (
          <span style={{ color: 'var(--muted)' }}>
            {pooled.length > 0 ? ' · ' : ': '}
            {sessionList(heldOut)} held out, codebook versions differ (§4)
          </span>
        )}
      </Row>
      <Row label="value">
        {a.value === null ? <span style={{ color: 'var(--muted)' }}>none, refused (see below)</span> : a.value.toFixed(4)}
      </Row>
      <Row label="band">
        {a.band === null ? (
          <span style={{ color: 'var(--muted)' }}>none</span>
        ) : (
          <>
            {a.band} (Landis &amp; Koch, <Mono>vendor/sandpiper/getKappaInterpretation.ts</Mono>)
          </>
        )}
      </Row>
      <Row label="threshold">
        {a.threshold}, floor of the Substantial band (<Mono>config/gate0.json</Mono>)
      </Row>
      <Row label="state">
        <strong>{a.state}</strong>: {stateMeaning(a)}
      </Row>
      <Row label="annotations">
        {pooled.length === 0 ? (
          'none compared'
        ) : (
          <PooledAnnotations pooled={pooledEntries.map((s) => s.session_id)} sessions={sessions} />
        )}
      </Row>
      {a.value !== null && <KappaScale value={a.value} threshold={a.threshold} />}
      <Note>Recomputed on every saved annotation; the model does not re-run (D14).</Note>
    </Panel>
  );
}

function SessionGatePanel({ gate }: { gate: SessionGate }) {
  return (
    <Panel title="Session gate" question="Does a session hold enough turns to describe at all? (§5.5)">
      <table className="w-full text-left text-xs">
        <thead style={{ color: 'var(--muted)' }}>
          <tr>
            <th className="py-1 font-normal">session</th>
            <th className="py-1 font-normal">turns</th>
            <th className="py-1 font-normal">reportable</th>
            <th className="py-1 font-normal">why not</th>
          </tr>
        </thead>
        <tbody>
          {gate.sessions.map((s) => (
            <tr key={s.session_id} style={{ borderTop: '1px solid var(--rule)' }}>
              <td className="py-1">
                <Mono>{s.session_id}</Mono>
              </td>
              <td className="py-1">{s.turn_count}</td>
              <td className="py-1">{s.reportable ? 'yes' : 'held'}</td>
              <td className="py-1" style={{ color: 'var(--muted)' }}>
                {s.reportable
                  ? '—'
                  : s.turn_count < gate.min_turns
                    ? `${s.turn_count} turns, under the floor of ${gate.min_turns}`
                    : 'the transcript is an excerpt, not the full session'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note>Floor: {gate.min_turns} turns and a full transcript, a placeholder of ours with no source (O-7).</Note>
    </Panel>
  );
}

/** What the tutor was shown of a session, from its saved annotation; a run with
 *  no record of it was marked over the whole session (D18). */
function shownText(loaded: Loaded | undefined, summary: SessionSummary): string {
  if (loaded?.status !== 'ready') return '…';
  const shown = loaded.detail.human?.shown;
  if (shown?.mode !== 'sample') return 'whole session';
  const n = shown.problem_ids.length;
  return `sampled problem${n === 1 ? '' : 's'} (${n} of ${summary.problems?.length ?? '?'})`;
}

function PerSession({
  agreement,
  sessions,
  details,
}: {
  agreement: Agreement;
  sessions: SessionSummary[];
  details: Record<string, Loaded>;
}) {
  const entries = new Map((agreement.per_session ?? []).map((e) => [e.session_id, e]));
  const ordered = [...sessions].sort((x, y) => x.session_index - y.session_index);
  return (
    <section>
      <h2 className="mb-1 text-base">Agreement per session</h2>
      <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Each session on its own turns; not what the gate acts on, and a session under the threshold suppresses nothing by
        itself (§5.4, D15).
      </p>
      <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        A κ against a generated annotation tests the pipeline; against a tutor's, it is a comparison with a person (§8).
      </p>
      <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Turns compared: the turns shown to the tutor, out of the session's total (D18).
      </p>
      <table className="w-full text-left text-xs">
        <thead style={{ color: 'var(--muted)' }}>
          <tr>
            <th className="py-1 font-normal">session</th>
            <th className="px-2 py-1 font-normal">annotation compared against</th>
            <th className="py-1 font-normal">κ</th>
            <th className="py-1 font-normal">band</th>
            <th className="py-1 font-normal">turns compared</th>
            <th className="px-2 py-1 font-normal">shown</th>
            <th className="py-1 font-normal"> </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((s) => {
            const e = entries.get(s.session_id);
            const label = (
              <td className="py-1">
                Session {s.session_index} · <Mono>{s.session_id}</Mono>
              </td>
            );
            if (!e) {
              const missing = [!s.annotated && 'no annotation', !s.modelled && 'no model run'].filter(Boolean);
              return (
                <tr key={s.session_id} style={{ borderTop: '1px solid var(--rule)', color: 'var(--muted)' }}>
                  {label}
                  <td className="px-2 py-1">—</td>
                  <td className="py-1">—</td>
                  <td className="py-1">—</td>
                  <td className="py-1">—</td>
                  <td className="px-2 py-1">—</td>
                  <td className="py-1">not compared: {missing.join(', ') || 'no pair'}</td>
                </tr>
              );
            }
            return (
              <tr key={s.session_id} style={{ borderTop: '1px solid var(--rule)' }}>
                {label}
                <td className="px-2 py-1">
                  <ComparedAgainst simulated={s.annotation_simulated} />
                </td>
                <td className="py-1">{e.value === null ? '—' : e.value.toFixed(4)}</td>
                <td className="py-1">{e.band ?? '—'}</td>
                <td className="py-1">
                  {e.n_turns ?? '—'} of {s.turn_count}
                </td>
                <td className="px-2 py-1">{shownText(details[s.session_id], s)}</td>
                <td className="py-1" style={{ color: 'var(--muted)' }}>
                  {e.refusal ? (
                    <>
                      refused, <Mono>{e.refusal.reason}</Mono>:{' '}
                      {refusalMeaning(e.refusal.reason) ?? (e.refusal.detail || 'no reason given')}
                    </>
                  ) : e.value !== null && e.value < agreement.threshold ? (
                    `under the threshold of ${agreement.threshold}`
                  ) : (
                    ''
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Refusal({ agreement }: { agreement: Agreement }) {
  const refusal = agreement.refusal;
  if (!refusal) return null;
  return (
    <section className="rounded p-4 text-xs leading-relaxed" style={{ background: '#fff8e6', border: '1px solid #f0e0b0' }}>
      <h3 className="mb-1 text-sm">Pooled figure refused, not scored</h3>
      <p className="mb-1">
        <Mono>{refusal.reason}</Mono>: {refusal.detail}
      </p>
      <p className="mb-1">{refusalMeaning(refusal.reason) ?? ''}</p>
      <p style={{ color: 'var(--muted)' }}>A refusal is never reported as a κ of 0 (§5.4).</p>
    </section>
  );
}

function PerCode({ agreement }: { agreement: Agreement }) {
  const perCode = agreement.per_code;
  if (!perCode || Object.keys(perCode).length === 0) return null;
  const rows = Object.entries(perCode).sort((x, y) => y[1].n_turns - x[1].n_turns);
  return (
    <section>
      <h2 className="mb-1 text-base">Per code, pooled</h2>
      <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Turns either run put in each class, and turns both did; counts, not a per-class κ (§7.3).
      </p>
      <table className="w-full text-left text-xs">
        <thead style={{ color: 'var(--muted)' }}>
          <tr>
            <th className="py-1 font-normal">class</th>
            <th className="py-1 font-normal">turns</th>
            <th className="py-1 font-normal">both runs</th>
            <th className="py-1 font-normal">share</th>
            <th className="w-2/5 py-1 font-normal"> </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([code, v]) => {
            const share = v.n_turns > 0 ? v.agreed / v.n_turns : 0;
            return (
              <tr key={code} style={{ borderTop: '1px solid var(--rule)' }}>
                <td className="py-1">{codeName(code)}</td>
                <td className="py-1">{v.n_turns}</td>
                <td className="py-1">{v.agreed}</td>
                <td className="py-1">{v.n_turns > 0 ? `${Math.round(share * 100)}%` : '—'}</td>
                <td className="py-1">
                  <span className="block h-2 w-full rounded-sm" style={{ background: 'var(--rule)' }}>
                    <span
                      className="block h-2 rounded-sm"
                      style={{ width: `${share * 100}%`, background: 'var(--accent)' }}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function SummaryCall({ report }: { report: Report | null }) {
  return (
    <section>
      <h2 className="mb-1 text-base">The report's summary and claims</h2>
      <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Written by a separate model call from counts computed in code; the call counts nothing itself (D10).
      </p>
      {!report ? (
        <p className="rounded p-3 text-xs" style={{ background: '#fbfaf8', border: '1px solid var(--rule)' }}>
          No report has been built yet.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
            Built from <Mono>{report.source_run_id}</Mono> (D12) · covers{' '}
            {sessionList([...report.sessions].map((s) => s.session_index).sort((x, y) => x - y))} (D16) · codebook{' '}
            {report.codebook_version}
          </p>
          {report.summary && (
            <p
              className="mb-4 rounded p-3 text-sm leading-relaxed"
              style={{ background: '#fbfaf8', border: '1px solid var(--rule)' }}
            >
              {report.summary}
            </p>
          )}
          {report.claims.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              No claims in this report.
            </p>
          ) : (
            <ol className="space-y-2">
              {report.claims.map((claim) => (
                <li key={claim.claim_id} className="text-xs leading-relaxed">
                  <span className="mr-2" style={{ color: 'var(--muted)' }}>
                    <Mono>{claim.claim_id}</Mono>
                  </span>
                  {claim.text}
                  <div className="mt-1" style={{ color: 'var(--muted)' }}>
                    {claim.provenance}
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer" style={{ color: 'var(--muted)' }}>
                      {claim.evidence_episode_ids.length} episode ids this rests on
                    </summary>
                    <div className="mt-1 break-words">
                      <Mono>{claim.evidence_episode_ids.join('  ')}</Mono>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function DiffStrip({ match }: { match: Array<boolean | null> }) {
  return (
    <div className="flex h-2 w-full gap-px overflow-hidden rounded-sm">
      {match.map((m, i) => (
        <span
          key={i}
          className="h-full flex-1"
          style={{ background: m === null ? 'transparent' : m ? MATCH : DIFFER }}
        />
      ))}
    </div>
  );
}

/** One run's turns in the compared classes, a segment per stretch of one class,
 *  sized by turns. A turn in no class, which only a model run with a gap could
 *  produce and the gate refuses, is left blank. */
function ClassStrip({ classes }: { classes: Array<string | undefined> }) {
  const stretches: Array<{ value: string | undefined; turns: number }> = [];
  for (const value of classes) {
    const last = stretches.at(-1);
    if (last !== undefined && last.value === value) last.turns += 1;
    else stretches.push({ value, turns: 1 });
  }
  return (
    <div className="flex h-8 w-full overflow-hidden rounded" style={{ border: '1px solid var(--rule)' }}>
      {stretches.map((s, i) => (
        <span
          key={i}
          className="h-full"
          title={`${s.value === undefined ? 'in no episode' : codeName(s.value)} · ${s.turns} turn${s.turns === 1 ? '' : 's'}`}
          style={{
            flex: `${s.turns} 1 0`,
            background: s.value === undefined ? 'transparent' : (codeColour[s.value] ?? '#ccc'),
          }}
        />
      ))}
    </div>
  );
}

function EpisodeTable({ title, session, episodes }: { title: string; session: SessionOutline; episodes: Episode[] }) {
  const order = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  return (
    <div>
      <div className="mb-1 text-[11px]" style={{ color: 'var(--muted)' }}>
        {title}
      </div>
      <table className="w-full text-left text-xs">
        <thead style={{ color: 'var(--muted)' }}>
          <tr>
            <th className="py-0.5 font-normal">#</th>
            <th className="py-0.5 font-normal">code</th>
            <th className="py-0.5 font-normal">turns</th>
          </tr>
        </thead>
        <tbody>
          {episodes.map((e, i) => {
            const start = order.get(e.start_turn_id) ?? 0;
            const end = order.get(e.end_turn_id) ?? start;
            return (
              <tr
                key={e.episode_id}
                style={{
                  borderTop: '1px solid var(--rule)',
                  color: isProblemProcess(e.EPISODE) ? 'var(--ink)' : 'var(--muted)',
                }}
              >
                <td className="py-0.5">{i + 1}</td>
                <td className="py-0.5">{codeName(e.EPISODE)}</td>
                <td className="py-0.5">{start === end ? start + 1 : `${start + 1}–${end + 1}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunCard({ run, episodes }: { run: Run; episodes: number }) {
  return (
    <div className="rounded p-3" style={{ border: '1px solid var(--rule)', background: 'var(--paper)' }}>
      {run.stand_in && (
        <p className="mb-2 rounded p-2 text-xs" style={{ background: '#fff1f1', border: '1px solid #f0c9c9' }}>
          <strong>No model produced these episodes.</strong> {run.stand_in.reason}
        </p>
      )}
      <Row label="run id">
        <Mono>{run.run_id}</Mono>
      </Row>
      <Row label="kind">
        {run.kind === 'llm' ? 'model run' : `annotation, ${annotationSource(run.simulated)}`}
      </Row>
      <Row label="model">{run.model ?? '—'}</Row>
      <Row label="prompt hash">{run.prompt_hash ? <Mono>{run.prompt_hash}</Mono> : '—'}</Row>
      <Row label="codebook">{run.codebook_version}</Row>
      <Row label={run.kind === 'llm' ? 'ran at' : 'saved at'}>
        <span title={run.created_at}>{when(run.created_at)}</span>
      </Row>
      <Row label="annotator">
        {run.annotator_id ? <Mono>{run.annotator_id}</Mono> : '—'}
        {run.kind === 'human' && run.simulated && ' · generated, not marked by a person (§8)'}
      </Row>
      <Row label="episodes">{episodes}</Row>
    </div>
  );
}

const Missing = ({ children }: { children: ReactNode }) => (
  <p className="rounded px-3 py-2 text-xs" style={{ border: '1px dashed var(--rule)', color: 'var(--muted)' }}>
    {children}
  </p>
);

type Loaded = { status: 'error'; message: string } | { status: 'ready'; detail: SessionDetail };

function SessionBlock({ summary, loaded }: { summary: SessionSummary; loaded: Loaded | undefined }) {
  const header = (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 text-xs">
      <span>
        <strong>Session {summary.session_index}</strong> · <Mono>{summary.session_id}</Mono> · {summary.session_date}
        {summary.session_topic && ` · ${summary.session_topic}`} · {summary.turn_count} turns
      </span>
      <span style={{ color: 'var(--muted)' }}>
        annotation: {annotationSource(summary.annotation_simulated)} · model run: {summary.modelled ? 'done' : 'none'}
      </span>
    </div>
  );

  if (!loaded) {
    return (
      <div>
        {header}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Loading this session's runs…
        </p>
      </div>
    );
  }
  if (loaded.status === 'error') {
    return (
      <div>
        {header}
        <p className="rounded p-2 text-xs" style={{ background: '#fff1f1', color: '#8a2c2c' }}>
          Could not load this session: {loaded.message}
        </p>
      </div>
    );
  }

  const { session, human, llm } = loaded.detail;
  const annotatedBy = annotationSource(summary.annotation_simulated);
  const humanEpisodes = human ? inTurnOrder(session, human.episodes) : [];
  const modelEpisodes = llm ? inTurnOrder(session, llm.episodes) : [];
  // The classes src/agreement/gate.ts pairs: a turn the annotation leaves
  // unmarked is the residual class, as is any code outside the five. A turn in
  // no episode of the model's run stays undefined: the model tiles every turn,
  // so a gap there is broken data, not the residual.
  const humanClasses = perTurnCodes(session, humanEpisodes).map((c) =>
    c === undefined ? NOT_PROBLEM_SOLVING : comparableCode(c),
  );
  const modelClasses = perTurnCodes(session, modelEpisodes).map((c) => (c === undefined ? undefined : comparableCode(c)));
  const match =
    human && llm
      ? humanClasses.map((c, i) => {
          const other = modelClasses[i];
          if (other === undefined) return null;
          return c === other;
        })
      : [];
  const paired = match.filter((m) => m !== null).length;
  const same = match.filter((m) => m === true).length;
  return (
    <div>
      {header}
      <div className="mb-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
        Annotation
        {human && ` · ${annotatedBy} · ${human.annotator_id ?? 'no annotator id'}`}
      </div>
      {human ? (
        <ClassStrip classes={humanClasses} />
      ) : (
        <Missing>No annotation saved for this session.</Missing>
      )}
      <div className="mt-2 mb-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
        Model run{llm && ` · ${llm.model ?? 'no model recorded'}`}
      </div>
      {llm ? (
        <ClassStrip classes={modelClasses} />
      ) : (
        <Missing>The model has not run on this session.</Missing>
      )}
      {paired > 0 && (
        <div className="mt-2">
          <DiffStrip match={match} />
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
            Same class on {same} of {paired} turns; red marks a turn the two runs put in different classes.
          </div>
        </div>
      )}
      {human && llm && human.codebook_version !== llm.codebook_version && (
        <p className="mt-1 text-[11px]" style={{ color: '#8a5a00' }}>
          Codebook: annotation {human.codebook_version}, model run {llm.codebook_version}; no κ for this session (§4).
        </p>
      )}
      {(human || llm) && (
        <div className="mt-2 grid gap-x-6 gap-y-1 text-xs md:grid-cols-2">
          <details>
            <summary className="cursor-pointer" style={{ color: 'var(--muted)' }}>
              Run provenance
            </summary>
            <div className="mt-2 space-y-3">
              {human && <RunCard run={human} episodes={human.episodes.length} />}
              {llm && <RunCard run={llm} episodes={llm.episodes.length} />}
            </div>
          </details>
          <details>
            <summary className="cursor-pointer" style={{ color: 'var(--muted)' }}>
              Episodes
            </summary>
            <div className="mt-2 space-y-3">
              {human && <EpisodeTable title={`Annotation · ${annotatedBy}`} session={session} episodes={humanEpisodes} />}
              {llm && (
                <div>
                  <div className="mb-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                    Model run in its own codes: what it segmented with, not what was compared
                  </div>
                  <Timeline session={session} episodes={modelEpisodes} />
                  <div className="mt-1">
                    <Legend codes={codebook.codes.map((c) => c.code)} />
                  </div>
                </div>
              )}
              {llm && <EpisodeTable title="Model run" session={session} episodes={modelEpisodes} />}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function Tilings({ sessions, details }: { sessions: SessionSummary[]; details: Record<string, Loaded> }) {
  const ordered = [...sessions].sort((x, y) => x.session_index - y.session_index);
  const compared = [...codebook.codes.filter((c) => c.in_problem_process).map((c) => c.code), NOT_PROBLEM_SOLVING];
  return (
    <section>
      <h2 className="mb-1 text-base">Two tilings, side by side</h2>
      <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        The same turns under each run, in the six classes compared; the strip below each pair is for display only
        (§7.3).
      </p>
      <div className="mb-4">
        <Legend codes={compared} />
      </div>
      <div className="space-y-6">
        {ordered.map((s) => (
          <SessionBlock key={s.session_id} summary={s} loaded={details[s.session_id]} />
        ))}
      </div>
    </section>
  );
}

// --- Layer 2: tutor moves ----------------------------------------------------
// Its own codebook, its own figure (src/moves/agreement.ts) and its own items.
// Nothing below reads the episode agreement, and nothing above reads this one.

/** Layer 2's codebook, read for its version, its code names and origins, and its provenance block. */
const movesBook = (await import('../codebook.tutor-moves.json')).default as MovesCodebook;

const moveName = (code: string): string => movesBook.codes.find((c) => c.code === code)?.name ?? code;

/** A code's origin, shortened to its tag when the code is ours. */
const moveOrigin = (origin: string): string => (origin.startsWith('[OURS]') ? '[OURS]' : origin);

// Layer 2's own words for each refusal: its unit is the item, one tutor turn,
// and its floors are its own.
const MOVES_REFUSAL_MEANING: Record<RefusalReason, string> = {
  no_annotation_run: 'No session has tutor marks for this layer, so nothing was compared (src/moves/agreement.ts).',
  length_mismatch: 'The marks and the model labels differ in length, so their items cannot be paired (src/agreement/kappa.ts).',
  degenerate_single_code: 'One side gave every item the same code, and the wrapper refuses rather than score it (src/agreement/kappa.ts).',
  too_few_turns: "Fewer items paired than this layer's own floor, which counts items, not turns (config/gate0.json).",
  codebook_version_mismatch:
    'The marks and the model labels were made under different tutor-move codebook versions (codebook.tutor-moves.json).',
};

const movesRefusalMeaning = (reason: string): string | null =>
  Object.hasOwn(MOVES_REFUSAL_MEANING, reason) ? MOVES_REFUSAL_MEANING[reason as RefusalReason] : null;

function movesStateMeaning(a: Agreement): string {
  if (a.state === 'shown') return 'at or above the threshold: this layer may reach the report (INTENT.md).';
  if (a.value !== null) return 'under the threshold: this layer stays off the report (INTENT.md).';
  return 'no figure, for the reason below: this layer stays off the report (INTENT.md).';
}

/** Where a session's Layer 2 marks came from. */
const marksSource = (marks: SessionMoves['marks']): string =>
  marks === null ? 'none' : marks.simulated ? 'generated for the demo' : 'made by a tutor';

type LoadedMoves = { status: 'error'; message: string } | { status: 'ready'; moves: SessionMoves };

function MovesGate({ agreement: a }: { agreement: Agreement }) {
  const entries = a.per_session ?? [];
  const pooled = entries
    .filter((s) => !heldOutOfPool(s))
    .map((s) => s.session_index)
    .sort((x, y) => x - y);
  const heldOut = entries
    .filter(heldOutOfPool)
    .map((s) => s.session_index)
    .sort((x, y) => x - y);
  const pooledOver =
    pooled.length > 0
      ? `${a.n_turns === null ? 'no' : a.n_turns.toLocaleString()} items from ${sessionList(pooled)}`
      : heldOut.length > 0
        ? 'nothing'
        : 'nothing yet: no session has both tutor marks and model labels';
  return (
    <Panel title="Layer 2 agreement · pooled" question="The one figure that decides whether this layer reaches the report.">
      <Row label="statistic">
        {a.statistic} per item, one tutor turn each, over the five layer codes; an unmarked item is left out (
        <Mono>src/moves/agreement.ts</Mono>)
      </Row>
      <Row label="pooled over">
        {pooledOver}
        {heldOut.length > 0 && (
          <span style={{ color: 'var(--muted)' }}>
            {pooled.length > 0 ? ' · ' : ': '}
            {sessionList(heldOut)} held out, codebook versions differ
          </span>
        )}
      </Row>
      <Row label="value">
        {a.value === null ? <span style={{ color: 'var(--muted)' }}>none, refused (see below)</span> : a.value.toFixed(4)}
      </Row>
      <Row label="band">
        {a.band === null ? (
          <span style={{ color: 'var(--muted)' }}>none</span>
        ) : (
          <>
            {a.band} (Landis &amp; Koch, <Mono>vendor/sandpiper/getKappaInterpretation.ts</Mono>)
          </>
        )}
      </Row>
      <Row label="threshold">
        {a.threshold}, held against this figure alone (<Mono>config/gate0.json</Mono>)
      </Row>
      <Row label="floors">
        in items, not turns; placeholders of ours with no source (<Mono>config/gate0.json</Mono>)
      </Row>
      <Row label="state">
        <strong>{a.state}</strong>: {movesStateMeaning(a)}
      </Row>
      {a.refusal && (
        <Row label="refusal">
          <Mono>{a.refusal.reason}</Mono>: {movesRefusalMeaning(a.refusal.reason) ?? 'no plain words for this reason.'}
          <span style={{ color: 'var(--muted)' }}> · {a.refusal.detail} · never scored as a κ of 0</span>
        </Row>
      )}
      <Row label="marks">
        {a.compared_runs === null ? (
          'none compared'
        ) : a.simulated ? (
          <>
            generated for the demo in at least one marked session
            <span style={{ color: 'var(--muted)' }}> · a test of the pipeline (§8)</span>
          </>
        ) : (
          <>
            <strong>made by a tutor</strong>
            <span style={{ color: 'var(--muted)' }}> · a comparison with a person (§8)</span>
          </>
        )}
      </Row>
      {a.value !== null && <KappaScale value={a.value} threshold={a.threshold} />}
      <Note>Recomputed on every saved mark; the model does not re-run (src/server/api.ts).</Note>
    </Panel>
  );
}

function MovesCard() {
  const p = movesBook.provenance;
  return (
    <Panel title="Provenance card · tutor moves" question="Where this layer's codes come from, as the authors report it.">
      <Row label="source">{p.citation}</Row>
      <Row label="licence">{p.licence}</Row>
      <Row label="corpus">{p.corpus}</Row>
      <Row label="agreement as reported">{p.agreement_as_reported}</Row>
      <Row label="status">{p.status}</Row>
      <Row label="not validated on">{p.not_validated_on}</Row>
      <Row label="in this project">{p.in_this_project}</Row>
      <Row label="unit">{movesBook.unit_of_analysis}</Row>
      <Row label="codebook">
        {movesBook.codebook_version} (<Mono>codebook.tutor-moves.json</Mono>)
      </Row>
    </Panel>
  );
}

function MovesPerSession({
  agreement,
  sessions,
  moves,
}: {
  agreement: Agreement;
  sessions: SessionSummary[];
  moves: Record<string, LoadedMoves>;
}) {
  const entries = new Map((agreement.per_session ?? []).map((e) => [e.session_id, e]));
  const ordered = [...sessions].sort((x, y) => x.session_index - y.session_index);
  return (
    <section>
      <h3 className="mb-1 text-base">Layer 2 agreement per session</h3>
      <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Each session on its own items; the pooled figure is what the gate acts on (src/moves/agreement.ts).
      </p>
      <table className="w-full text-left text-xs">
        <thead style={{ color: 'var(--muted)' }}>
          <tr>
            <th className="py-1 font-normal">session</th>
            <th className="px-2 py-1 font-normal">tutor turns of items</th>
            <th className="py-1 font-normal">model labels</th>
            <th className="px-2 py-1 font-normal">marks</th>
            <th className="py-1 font-normal">κ</th>
            <th className="py-1 font-normal">band</th>
            <th className="py-1 font-normal">items compared</th>
            <th className="px-2 py-1 font-normal">state</th>
            <th className="py-1 font-normal"> </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((s) => {
            const loaded = moves[s.session_id];
            const view = loaded?.status === 'ready' ? loaded.moves : null;
            const e = entries.get(s.session_id);
            const labels =
              view === null
                ? '—'
                : view.model_run_id === null
                  ? 'no model run'
                  : view.classified
                    ? `codebook ${view.model_codebook_version ?? '—'}`
                    : 'not classified';
            const marks =
              view === null
                ? '—'
                : view.marks === null
                  ? 'none'
                  : `${marksSource(view.marks)} · codebook ${view.marks.codebook_version}`;
            let note: ReactNode = '';
            if (e) {
              if (e.refusal) {
                note = (
                  <>
                    refused, <Mono>{e.refusal.reason}</Mono>:{' '}
                    {movesRefusalMeaning(e.refusal.reason) ?? (e.refusal.detail || 'no reason given')}
                  </>
                );
              } else if (e.value !== null && e.value < agreement.threshold) {
                note = `under the threshold of ${agreement.threshold}`;
              }
            } else if (!loaded) {
              note = 'loading…';
            } else if (loaded.status === 'error') {
              note = `could not load: ${loaded.message}`;
            } else if (loaded.moves.model_run_id === null) {
              note = 'not compared: no model run';
            } else if (loaded.moves.items.length === 0) {
              note = 'not compared: no items';
            } else {
              const missing = [!loaded.moves.classified && 'no model labels', loaded.moves.marks === null && 'no tutor marks'];
              note = `not compared: ${missing.filter(Boolean).join(', ') || 'no item has both'}`;
            }
            return (
              <tr key={s.session_id} style={{ borderTop: '1px solid var(--rule)', color: e ? undefined : 'var(--muted)' }}>
                <td className="py-1">
                  Session {s.session_index} · <Mono>{s.session_id}</Mono>
                </td>
                <td className="px-2 py-1">
                  {view === null ? '—' : `${view.items.filter((i) => i.classifiable).length} of ${view.items.length}`}
                </td>
                <td className="py-1">{labels}</td>
                <td className="px-2 py-1">{marks}</td>
                <td className="py-1">{e?.value == null ? '—' : e.value.toFixed(4)}</td>
                <td className="py-1">{e?.band ?? '—'}</td>
                <td className="py-1">{e?.n_turns ?? '—'}</td>
                <td className="px-2 py-1">{e?.state ?? '—'}</td>
                <td className="py-1" style={{ color: 'var(--muted)' }}>
                  {note}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function MovesPerCode({ agreement }: { agreement: Agreement }) {
  const perCode = agreement.per_code;
  const known = movesBook.codes.map((c) => c.code);
  // A code the server counts that the codebook does not name is still shown, not dropped.
  const rows = [...known, ...Object.keys(perCode ?? {}).filter((code) => !known.includes(code))];
  return (
    <section>
      <h3 className="mb-1 text-base">Layer 2 per code, pooled</h3>
      <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Items either side put under each code, and items both did; counts, not a per-code κ (src/agreement/gate.ts).
      </p>
      {!perCode && (
        <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
          No counts: the pooled figure was not computed.
        </p>
      )}
      <table className="w-full text-left text-xs">
        <thead style={{ color: 'var(--muted)' }}>
          <tr>
            <th className="py-1 font-normal">code</th>
            <th className="px-2 py-1 font-normal">origin</th>
            <th className="py-1 font-normal">items</th>
            <th className="py-1 font-normal">both sides</th>
            <th className="py-1 font-normal">share</th>
            <th className="w-1/4 py-1 font-normal"> </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((code) => {
            const origin = movesBook.codes.find((c) => c.code === code)?.origin;
            const v = perCode?.[code];
            const share = v && v.n_turns > 0 ? v.agreed / v.n_turns : 0;
            return (
              <tr key={code} style={{ borderTop: '1px solid var(--rule)' }}>
                <td className="py-1">
                  {moveName(code)} · <Mono>{code}</Mono>
                </td>
                <td className="px-2 py-1" style={{ color: 'var(--muted)' }} title={origin}>
                  {origin === undefined ? 'not in the codebook' : moveOrigin(origin)}
                </td>
                <td className="py-1">{v ? v.n_turns : '—'}</td>
                <td className="py-1">{v ? v.agreed : '—'}</td>
                <td className="py-1">{v && v.n_turns > 0 ? `${Math.round(share * 100)}%` : '—'}</td>
                <td className="py-1">
                  <span className="block h-2 w-full rounded-sm" style={{ background: 'var(--rule)' }}>
                    <span
                      className="block h-2 rounded-sm"
                      style={{ width: `${share * 100}%`, background: 'var(--accent)' }}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function MovesSessionItems({ summary, loaded }: { summary: SessionSummary; loaded: LoadedMoves | undefined }) {
  const view = loaded?.status === 'ready' ? loaded.moves : null;
  const header = (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 text-xs">
      <span>
        <strong>Session {summary.session_index}</strong> · <Mono>{summary.session_id}</Mono>
      </span>
      {view && (
        <span style={{ color: 'var(--muted)' }}>
          model run: {view.model_run_id ? <Mono>{view.model_run_id}</Mono> : 'none'} · marks: {marksSource(view.marks)}
          {view.marks && ` · ${view.marks.annotator_id}`}
        </span>
      )}
    </div>
  );
  if (!loaded) {
    return (
      <div>
        {header}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Loading this session's items…
        </p>
      </div>
    );
  }
  if (loaded.status === 'error') {
    return (
      <div>
        {header}
        <p className="rounded p-2 text-xs" style={{ background: '#fff1f1', color: '#8a2c2c' }}>
          Could not load this session's items: {loaded.message}
        </p>
      </div>
    );
  }
  const { moves } = loaded;
  if (moves.model_run_id === null || moves.items.length === 0) {
    return (
      <div>
        {header}
        <Missing>
          {moves.model_run_id === null
            ? 'The model has not run on this session, so it has no items.'
            : "No problem-solving stretch in the model run opens on a student's turn."}
        </Missing>
      </div>
    );
  }
  const paired = moves.items.filter((i) => i.classifiable && i.model_move !== null && i.tutor_mark !== null);
  const same = paired.filter((i) => i.model_move === i.tutor_mark).length;
  const versionsDiffer =
    moves.marks !== null && moves.model_codebook_version !== null && moves.marks.codebook_version !== moves.model_codebook_version;
  return (
    <div>
      {header}
      {versionsDiffer && (
        <p className="mb-1 text-[11px]" style={{ color: '#8a5a00' }}>
          Codebook: marks {moves.marks?.codebook_version}, model labels {moves.model_codebook_version}; no κ for this
          session (codebook.tutor-moves.json).
        </p>
      )}
      <table className="w-full text-left text-xs">
        <thead style={{ color: 'var(--muted)' }}>
          <tr>
            <th className="py-1 font-normal">#</th>
            <th className="w-1/3 px-2 py-1 font-normal">turn before</th>
            <th className="w-1/3 py-1 font-normal">opening turn</th>
            <th className="px-2 py-1 font-normal">model label</th>
            <th className="py-1 font-normal">tutor mark</th>
            <th className="py-1 font-normal"> </th>
          </tr>
        </thead>
        <tbody>
          {moves.items.map((item, i) => {
            const both = item.model_move !== null && item.tutor_mark !== null;
            const differs = both && item.model_move !== item.tutor_mark;
            return (
              <tr key={item.episode_id} className="align-top" style={{ borderTop: '1px solid var(--rule)' }}>
                <td className="py-1">{i + 1}</td>
                <td className="px-2 py-1">
                  <Mono>{item.preceding_speaker}</Mono> {item.preceding_text}
                </td>
                <td className="py-1">
                  <Mono>{item.following_speaker}</Mono> {item.following_text}
                </td>
                {item.classifiable ? (
                  <>
                    <td className="px-2 py-1">{item.model_move === null ? '—' : moveName(item.model_move)}</td>
                    <td className="py-1">{item.tutor_mark === null ? '—' : moveName(item.tutor_mark)}</td>
                    <td className="py-1" style={{ color: differs ? DIFFER : 'var(--muted)' }}>
                      {both ? (differs ? 'differs' : 'same') : ''}
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="px-2 py-1" style={{ color: 'var(--muted)' }}>
                    The turn before is not the tutor's, so there is nothing to classify.
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {paired.length > 0 && (
        <div className="mt-1 text-[11px]" style={{ color: 'var(--muted)' }}>
          Same code on {same} of {paired.length} items with both a model label and a tutor mark.
        </div>
      )}
    </div>
  );
}

function MovesItems({ sessions, moves }: { sessions: SessionSummary[]; moves: Record<string, LoadedMoves> }) {
  const ordered = [...sessions].sort((x, y) => x.session_index - y.session_index);
  return (
    <section>
      <h3 className="mb-1 text-base">Layer 2 items, side by side</h3>
      <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Each tutor turn before a problem-solving stretch of the model run that opens on a student's turn, with both labels
        (src/moves/items.ts).
      </p>
      <div className="space-y-6">
        {ordered.map((s) => (
          <MovesSessionItems key={s.session_id} summary={s} loaded={moves[s.session_id]} />
        ))}
      </div>
    </section>
  );
}

export function Internal() {
  const { state } = useWorkspace();
  const [details, setDetails] = useState<Record<string, Loaded>>({});
  const [moves, setMoves] = useState<Record<string, LoadedMoves>>({});

  // Re-read every session's runs whenever the workspace state changes: a save
  // or a model run elsewhere replaces `state`, and the tilings follow it.
  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    for (const s of state.sessions) {
      getSession(s.session_id).then(
        (detail) => {
          if (!cancelled) setDetails((d) => ({ ...d, [s.session_id]: { status: 'ready', detail } }));
        },
        (e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          if (!cancelled) setDetails((d) => ({ ...d, [s.session_id]: { status: 'error', message } }));
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [state]);

  // Layer 2's items, one getMoves() per session, re-read on the same trigger.
  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    for (const s of state.sessions) {
      getMoves(s.session_id).then(
        (view) => {
          if (!cancelled) setMoves((m) => ({ ...m, [s.session_id]: { status: 'ready', moves: view } }));
        },
        (e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          if (!cancelled) setMoves((m) => ({ ...m, [s.session_id]: { status: 'error', message } }));
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (!state) return null;
  const { agreement, moves_agreement, session_gate, report, sessions, workspace } = state;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Internal view</h1>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          The working figures behind the report; not linked from it, and none of them reaches a student or a parent (D11).
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          Agreement here is apparatus, not evidence: no figure shows which reading is right (INTENT.md).
        </p>
        <p
          className="mt-2 rounded px-3 py-2 text-xs"
          style={{ background: '#fff8e6', border: '1px solid #f0e0b0', color: '#6b5a2e' }}
        >
          {workspace.data_provenance.ui_label}
        </p>
      </header>

      <section>
        <h2 className="mb-1 text-base">Two gates, kept apart</h2>
        <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          A κ from two runs, and a turn count; computed separately and never merged (§5.5).
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <PooledGate agreement={agreement} sessions={sessions} />
          <SessionGatePanel gate={session_gate} />
        </div>
      </section>

      <Refusal agreement={agreement} />

      <PerSession agreement={agreement} sessions={sessions} details={details} />

      <PerCode agreement={agreement} />

      <SummaryCall report={report} />

      <Tilings sessions={sessions} details={details} />

      <section className="space-y-6 pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
        <header>
          <h2 className="mb-1 text-base">Layer 2 · tutor moves</h2>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            The tutor turn before each problem-solving stretch that opens on a student's turn, in five codes
            (codebook.tutor-moves.json).
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            Its own codebook, figure and threshold decision; no pool or index spans it and the episode layer
            (codebook.tutor-moves.json).
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            Layer codebook {movesBook.codebook_version}, apart from the episode codebook {codebook.codebook_version}{' '}
            (codebook.tutor-moves.json).
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <MovesGate agreement={moves_agreement} />
          <MovesCard />
        </div>
        <MovesPerSession agreement={moves_agreement} sessions={sessions} moves={moves} />
        <MovesPerCode agreement={moves_agreement} />
        <MovesItems sessions={sessions} moves={moves} />
      </section>
    </div>
  );
}
