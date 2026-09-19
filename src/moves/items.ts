// Which tutor turns Layer 2 looks at (docs/SPEC-layer2.md): the one turn
// immediately before a problem-solving episode opened by a student turn, in
// the model run. [OURS: a one-turn window is a convenience, not a claim about
// how far tutor influence reaches. docs/DEVIATIONS.md]
import type { Episode, Session, Turn } from '../contract/types.ts';

export interface MoveItem {
  session_id: string;
  episode_id: string;
  episode_code: string;
  opening_turn: Turn;
  preceding_turn: Turn;
  /** Only a tutor turn is classified; a student turn is recorded with no move. */
  classifiable: boolean;
}

export const isStudent = (role: string): boolean => role.toUpperCase().startsWith('STUDENT');
export const isTutor = (role: string): boolean => {
  const r = role.toUpperCase();
  return r.startsWith('TUTOR') || r.startsWith('TEACHER');
};

/**
 * The items of one session, in turn order: every model-run episode whose code
 * is a problem-solving process code and whose first turn is a student's,
 * except one that opens the session, which has no turn before it.
 *
 * `processCodes` is problemProcessCodes() of src/codebook/load.ts; it is taken
 * as an argument so this module reads nothing of the episode codebook itself.
 * An episode whose first turn is not in this session belongs to another one
 * and is skipped.
 */
export function selectItems(session: Session, modelEpisodes: Episode[], processCodes: Set<string>): MoveItem[] {
  const turns = [...session.turns].sort((x, y) => x.sequence_id - y.sequence_id);
  const positionOf = new Map(turns.map((turn, i) => [turn.turn_id, i]));

  const opening = modelEpisodes
    .map((episode) => ({ episode, position: positionOf.get(episode.start_turn_id) }))
    .filter((entry): entry is { episode: Episode; position: number } => entry.position !== undefined)
    .sort((x, y) => x.position - y.position);

  const items: MoveItem[] = [];
  for (const { episode, position } of opening) {
    if (!processCodes.has(episode.EPISODE)) continue;
    const opener = turns[position];
    const before = turns[position - 1];
    if (opener === undefined || before === undefined) continue;
    if (!isStudent(opener.role)) continue;
    items.push({
      session_id: session.session_id,
      episode_id: episode.episode_id,
      episode_code: episode.EPISODE,
      opening_turn: opener,
      preceding_turn: before,
      classifiable: isTutor(before.role),
    });
  }
  return items;
}
