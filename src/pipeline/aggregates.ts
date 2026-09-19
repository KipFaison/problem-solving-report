// Counts, computed in code and never by a model (CLAUDE.md rule 11).
//
// [DERIVED: Schoenfeld episodes via Li et al. (2025) definitions as adapted in
// codebook.v2.json, applied by a run -> counted per code per session, measured
// in turns and in seconds, and located in the session's turn order; the
// operation is ours. See docs/DEVIATIONS.md D-017.]
import type { Episode, Session } from '../contract/types.ts';

/** Where an episode sits in the session, as thirds of the turn order. */
export type Position = 'opening' | 'middle' | 'closing';

export interface EpisodeMeasure {
  episode_id: string;
  code: string;
  turns: number;
  seconds: number | null;
  position: Position;
}

export interface SessionAggregate {
  session_id: string;
  session_index: number;
  turn_count: number;
  episode_count: number;
  perCode: Record<string, { episodes: number; turns: number; seconds: number | null }>;
  measures: EpisodeMeasure[];
}

export interface ReportAggregate {
  sessions: SessionAggregate[];
  perCodeTotals: Record<string, { episodes: number; turns: number }>;
  /** Ordered pairs of consecutive episode codes within a session, counted. */
  transitions: Record<string, number>;
}

function positionOf(startIndex: number, turnCount: number): Position {
  // [OURS: thirds of the turn order. The binning is a choice, not a finding,
  // and it is here rather than in the prompt so the model never picks it.]
  const third = turnCount / 3;
  if (startIndex < third) return 'opening';
  if (startIndex < third * 2) return 'middle';
  return 'closing';
}

function secondsBetween(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null;
  const start = Date.parse(a);
  const end = Date.parse(b);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function aggregateSession(session: Session, episodes: Episode[]): SessionAggregate {
  const order = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  const byTurnId = new Map(session.turns.map((t) => [t.turn_id, t]));
  const mine = episodes
    .filter((e) => byTurnId.has(e.start_turn_id))
    .sort((a, b) => (order.get(a.start_turn_id) ?? 0) - (order.get(b.start_turn_id) ?? 0));

  const perCode: SessionAggregate['perCode'] = {};
  const measures: EpisodeMeasure[] = [];

  for (const e of mine) {
    const startIndex = order.get(e.start_turn_id) ?? 0;
    const endIndex = order.get(e.end_turn_id) ?? startIndex;
    const turns = endIndex - startIndex + 1;
    const seconds = session.has_timestamps
      ? secondsBetween(byTurnId.get(e.start_turn_id)?.start_time, byTurnId.get(e.end_turn_id)?.end_time)
      : null;

    measures.push({
      episode_id: e.episode_id,
      code: e.EPISODE,
      turns,
      seconds,
      position: positionOf(startIndex, session.turns.length),
    });

    const bucket = (perCode[e.EPISODE] ??= { episodes: 0, turns: 0, seconds: null });
    bucket.episodes += 1;
    bucket.turns += turns;
    if (seconds !== null) bucket.seconds = (bucket.seconds ?? 0) + seconds;
  }

  return {
    session_id: session.session_id,
    session_index: session.session_index,
    turn_count: session.turns.length,
    episode_count: mine.length,
    perCode,
    measures,
  };
}

export function aggregateReport(sessions: Session[], episodes: Episode[]): ReportAggregate {
  const bySession = new Map<string, Episode[]>();
  for (const s of sessions) bySession.set(s.session_id, []);
  for (const e of episodes) {
    // An episode belongs to the session whose turns it covers.
    for (const s of sessions) {
      if (s.turns.some((t) => t.turn_id === e.start_turn_id)) {
        bySession.get(s.session_id)?.push(e);
        break;
      }
    }
  }

  const ordered = [...sessions].sort((a, b) => a.session_index - b.session_index);
  const perSession = ordered.map((s) => aggregateSession(s, bySession.get(s.session_id) ?? []));

  const perCodeTotals: ReportAggregate['perCodeTotals'] = {};
  const transitions: Record<string, number> = {};

  for (const agg of perSession) {
    for (const [code, v] of Object.entries(agg.perCode)) {
      const bucket = (perCodeTotals[code] ??= { episodes: 0, turns: 0 });
      bucket.episodes += v.episodes;
      bucket.turns += v.turns;
    }
    for (let i = 1; i < agg.measures.length; i += 1) {
      const from = agg.measures[i - 1]?.code;
      const to = agg.measures[i]?.code;
      if (from && to) {
        const key = `${from}->${to}`;
        transitions[key] = (transitions[key] ?? 0) + 1;
      }
    }
  }

  return { sessions: perSession, perCodeTotals, transitions };
}
