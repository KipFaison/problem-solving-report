// What the page knows about the codebook: names, colours, definitions, and
// which codes belong to the problem-solving process. Session data comes from
// the live workspace (app/workspace.tsx), not from here.
import type { Turn } from '../src/contract/types.ts';



interface CodebookFile {
  codebook_version: string;
  codes: Array<{
    code: string;
    name: string;
    content_related: boolean;
    in_problem_process: boolean;
    definition: string;
    requires_timestamps?: boolean;
  }>;
}

export const codebook = (await import('../codebook.v2.json')).default as CodebookFile;

/**
 * The comparison's one class that is not a code: every turn outside the
 * problem-solving work, whether a tutor left it unmarked or the model gave it
 * one of the codes not `in_problem_process`. The agreement is computed over the
 * five problem-solving codes and this class, six in all. The string is the one
 * the server keys `per_code` with, src/agreement/gate.ts `NOT_PROBLEM_SOLVING`,
 * repeated here because that module reads the disk and cannot be bundled.
 * [OURS: the owner's decision of 2026-09-18 that a tutor marks only the
 * problem-solving work.]
 */
export const NOT_PROBLEM_SOLVING = 'not_problem_solving';

/** How the residual class is named wherever it is drawn. Not codebook text:
 *  the class is ours, not a code. */
export const NOT_PROBLEM_SOLVING_NAME = 'Not problem solving';

export const codeName = (code: string): string =>
  code === NOT_PROBLEM_SOLVING
    ? NOT_PROBLEM_SOLVING_NAME
    : (codebook.codes.find((c) => c.code === code)?.name ?? code);

/** The codebook's own wording for a code. Never restate a definition in code:
 *  there is exactly one of each in the repo and this reads it. Null for a code
 *  the live codebook does not carry. */
export const codeDefinition = (code: string): string | null =>
  codebook.codes.find((c) => c.code === code)?.definition ?? null;

/**
 * Whether the codebook marks this code as describing the problem-solving
 * process itself. The rest — reading, monitor, organization, digression — are
 * labelled so that every turn has somewhere to go, which is what keeps them out
 * of the episodes that matter; they are never drawn on a learner-facing
 * surface. See codebook.v2.json `note_on_in_problem_process`.
 *
 * A code the live codebook does not carry answers FALSE. A report on disk may
 * have been produced under an older codebook and carry a code it has since
 * dropped (`writing` went in 2.1.0; no report in the repo carries one today),
 * and for such a code there is no name, no definition and no colour here — so
 * there is nothing a reader could be shown about it that would not be invented.
 * It is therefore not drawn, exactly as the four named non-process codes are
 * not drawn. Which codebook version a run used is already on the report's
 * "Where this comes from" card. [OURS: docs/DEVIATIONS.md]
 */
export const isProblemProcess = (code: string): boolean =>
  codebook.codes.find((c) => c.code === code)?.in_problem_process ?? false;

/**
 * The class a code falls in for the agreement comparison: a problem-solving
 * code is itself, and any other code — including one this codebook does not
 * carry — is `NOT_PROBLEM_SOLVING`, as in src/agreement/gate.ts. A turn a
 * tutor left unmarked is `NOT_PROBLEM_SOLVING` too, but that is the caller's
 * call to make: a gap in the model's run is an error, not this class.
 */
export const comparableCode = (code: string): string =>
  isProblemProcess(code) ? code : NOT_PROBLEM_SOLVING;

/** One hue per code in the codebook, all nine, and a neutral one for the
 *  residual class. Only the five marked `in_problem_process` reach the report
 *  and the annotator; the others are drawn in the internal view, where the two
 *  non-content codes are deliberately muted: they are not lesser work, but they
 *  are not the mathematics either. */
export const codeColour: Record<string, string> = {
  reading: '#8ab4f8',
  analysis: '#7c5cff',
  planning: '#f2994a',
  implementation: '#27ae60',
  exploration: '#eb5757',
  verification: '#2d9cdb',
  monitor: '#bb6bd9',
  organization: '#b9b3ab',
  digression: '#ddd7cf',
  [NOT_PROBLEM_SOLVING]: '#efece7',
};

const STUDENT_ROLE = /^student_(\d+)$/i;

/**
 * The name a transcript role is shown under, the same on every surface.
 *
 *   TUTOR                                  → "Tutor"
 *   STUDENT_1, the only student speaking   → "Student"
 *   STUDENT_1, STUDENT_2, … in one session → "Student 1", "Student 2", …
 *   anything else                          → title-cased, underscores as
 *                                            spaces: TEACHER → "Teacher"
 *
 * The second argument is the whole session, not the turns on screen: whether
 * STUDENT_1 reads "Student" or "Student 1" depends on whether another student
 * speaks anywhere in the session, and a speaker must not change name between
 * views of one session. Matching ignores case.
 * [OURS: display names only. Nothing here decides which speaker leads the
 * session (SPEC §5.8).]
 */
export const speakerName = (role: string, session: { turns: Array<Pick<Turn, 'role'>> }): string => {
  const student = STUDENT_ROLE.exec(role);
  if (student) {
    const students = new Set(
      session.turns.flatMap((t) => {
        const n = STUDENT_ROLE.exec(t.role)?.[1];
        return n === undefined ? [] : [Number(n)];
      }),
    );
    return students.size > 1 ? `Student ${Number(student[1])}` : 'Student';
  }
  const words = role.split(/[_\s]+/).filter((w) => w !== '');
  if (words.length === 0) return 'Unknown speaker';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};
