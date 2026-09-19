import type { Episode, Turn } from '../src/contract/types.ts';
import { codeColour, codeName } from './data.ts';

// Consecutive segments sized by turns (§7.1 item 2). One row per session, in
// session order, so the shape of a session is legible at a glance rather than
// read off a table.
export function Timeline({ session, episodes }: { session: { turns: Array<Pick<Turn, 'turn_id'>> }; episodes: Episode[] }) {
  const order = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  const total = session.turns.length;

  return (
    <div className="flex h-8 w-full overflow-hidden rounded" style={{ border: '1px solid var(--rule)' }}>
      {episodes.map((e) => {
        const start = order.get(e.start_turn_id) ?? 0;
        const end = order.get(e.end_turn_id) ?? start;
        const turns = end - start + 1;
        return (
          <div
            key={e.episode_id}
            title={`${codeName(e.EPISODE)} · ${turns} turn${turns === 1 ? '' : 's'}`}
            className="h-full"
            style={{
              width: `${(turns / total) * 100}%`,
              background: codeColour[e.EPISODE] ?? '#ccc',
            }}
          />
        );
      })}
    </div>
  );
}

export function Legend({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
      {codes.map((c) => (
        <span key={c} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: codeColour[c] ?? '#ccc' }} />
          {codeName(c)}
        </span>
      ))}
    </div>
  );
}
