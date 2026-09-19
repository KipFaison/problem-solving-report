// Stored, model-written dialogue for a demo session, and the per-turn schedule
// it was written from.
//
// [OURS: a session's lines are written once by scripts/write-dialogue.ts from
// the planted schedule and kept as a fixed file under src/generator/dialogue/,
// so a later `yarn generate:demo` gives the same transcript without a model
// call. The schedule hash ties a file to the schedule it was written for: a
// file whose hash no longer matches is never used (docs/DEVIATIONS.md D-034).]
import { createHash } from 'node:crypto';
import { exists, readJson } from '../storage/index.ts';
import type { Cue, Role } from './dialogue.ts';

/** One turn of the planted plan, as the writer is given it. */
export interface ScheduleEntry {
  index: number;
  turn_id: string;
  role: Role;
  code: string;
  cue: Cue | null;
  problem_topic: string;
}

export interface DialogueFixture {
  $comment: string;
  session_id: string;
  schedule_hash: string;
  model: string;
  prompt_hash: string;
  created_at: string;
  lines: string[];
}

/** Committed source, not data/, which is gitignored. */
export const FIXTURE_DIR = 'src/generator/dialogue';

export function fixturePath(sessionId: string): string {
  return `${FIXTURE_DIR}/${sessionId}.json`;
}

/** JSON with every object's keys sorted and no whitespace, so equal values hash equal. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function scheduleHash(schedule: readonly ScheduleEntry[]): string {
  return createHash('sha256').update(canonicalJson(schedule)).digest('hex');
}

/**
 * The stored lines for a session, or null when it has none. A file written for
 * a different schedule is refused, not used: its lines would sit on turns
 * planted with other codes.
 */
export function fixtureLines(sessionId: string, schedule: readonly ScheduleEntry[]): string[] | null {
  const path = fixturePath(sessionId);
  if (!exists(path)) return null;
  const fixture = readJson<DialogueFixture>(path);
  const hash = scheduleHash(schedule);
  if (fixture.schedule_hash !== hash || fixture.lines.length !== schedule.length) {
    throw new Error(
      `${sessionId}: the stored dialogue at ${path} was written for a different schedule ` +
        `(its hash ${fixture.schedule_hash.slice(0, 12)}…, ${fixture.lines.length} lines; the plan now gives ` +
        `${hash.slice(0, 12)}…, ${schedule.length} turns), so it is not used. Run "yarn generate:demo --pool-lines" ` +
        'and then "yarn write:dialogue".',
    );
  }
  return fixture.lines;
}
