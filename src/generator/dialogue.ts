// The words the simulated participants say, when no model-written lines are
// stored for a session.
//
// A session's lines normally come from a stored file under
// src/generator/dialogue/, written by scripts/write-dialogue.ts from the
// planted per-turn schedule (src/generator/fixture.ts, docs/DEVIATIONS.md
// D-034). The pools below are now the fallback: used for a session with no
// stored file, and for every session under `yarn generate:demo --pool-lines`.
// With four lines per pool and up to fourteen turns of one code and role in a
// session, they repeat lines within a session; the rotation in makeSpeaker only
// keeps a repeat from following itself. The problems in PROBLEMS are used either
// way: the writer is given them.
//
// [OURS: every line below is written for this demo. None of it is taken from a
// transcript, and none of it restates a codebook definition — the lines are
// what the work sounds like, not what the code means. A session that needs a
// code with no lines here fails loudly rather than generating something
// unrecognisable.]
import type { Prng } from './prng.ts';

export type Role = 'TUTOR' | 'STUDENT_1';

/** The one problem a session is spent on, so its turns cohere. */
export interface Problem {
  topic: string;
  statement: string;
  given: string;
  plan: string;
  firstStep: string;
  result: string;
  check: string;
  probe: string;
}

export const PROBLEMS: readonly Problem[] = [
  {
    topic: 'Perimeter and area of a rectangle',
    statement:
      'A rectangle has a perimeter of 36 centimetres and its length is twice its width. Find the area.',
    given: 'if the width is w, the length is 2w, so the perimeter is 6w',
    plan: 'solve 6w = 36 for the width, double it for the length, then multiply the two',
    firstStep: '6w = 36, so w = 6',
    result: 'the length is 12 and the width is 6, so the area is 72 square centimetres',
    check: '6 and 12 give a perimeter of 36, and 12 is twice 6',
    probe: 'try a width of 5 and see how far the perimeter lands from 36',
  },
  {
    topic: 'Solving a linear equation with variables on both sides',
    statement: 'Solve 5(x - 3) = 2x + 9 for x.',
    given: 'the left side expands to 5x - 15, so both sides carry an x term',
    plan: 'expand the bracket, collect the x terms on one side, then divide',
    firstStep: '5x - 15 = 2x + 9, so 3x = 24',
    result: 'x = 8',
    check: '5 times (8 - 3) is 25, and 2 times 8 plus 9 is also 25',
    probe: 'move the 2x across first instead and see whether it lands in the same place',
  },
  {
    topic: 'Scaling a ratio',
    statement:
      'A recipe uses flour and sugar in a 3 to 5 ratio. If 12 cups of flour are used, how much sugar is needed?',
    given: 'the two amounts move together: each part of flour comes with a fixed part of sugar',
    plan: 'find what one part is worth from the flour side, then multiply by five',
    firstStep: '3 parts is 12 cups, so one part is 4 cups',
    result: '5 parts of sugar is 20 cups',
    check: '12 to 20 reduces to 3 to 5',
    probe: 'double the whole recipe and see whether the ratio holds',
  },
];

const LINES: Record<string, Record<Role, readonly string[]>> = {
  reading: {
    TUTOR: [
      'Here is the one for today. {statement}',
      'Read it through once before either of us says anything.',
      'Read the last sentence again — what is it asking for?',
      'Start by reading it out loud, and stop where it stops making sense.',
    ],
    STUDENT_1: [
      'Okay, it gives the whole setup and then asks for one number.',
      'Let me read that part again.',
      'So everything we need is in those two sentences.',
      'Two sentences of setup, and then the question at the end.',
    ],
  },
  analysis: {
    TUTOR: [
      'What do the two pieces tell us together?',
      'Say what depends on what here.',
      'What changes once we give the unknown a name?',
      'What is fixed here, and what is still free to move?',
    ],
    STUDENT_1: [
      'So {given}.',
      'The two conditions are not separate — one of them fixes the other.',
      'That means only one value can work.',
      'The unknown shows up in both places, not just one.',
    ],
  },
  planning: {
    TUTOR: [
      'Before we compute anything, what is the order of steps?',
      'There are two routes here. Which one, and why that one?',
      'What would you do first, and what would it give you?',
      'Say the whole route before we take the first step of it.',
    ],
    STUDENT_1: [
      'I would {plan}.',
      'I would rather set it up than try numbers until one fits.',
      'First the unknown, then the quantity the question actually asks for.',
      'Set it up first, then do the arithmetic once at the end.',
    ],
  },
  implementation: {
    TUTOR: [
      'Go ahead and run it.',
      'Write the next line.',
      'Keep going — what does that come out to?',
      'Show me that step written out.',
    ],
    STUDENT_1: [
      '{firstStep}.',
      'So {result}.',
      'Dividing both sides leaves the value on its own.',
      'Next line: I combine the two terms and then divide.',
    ],
  },
  exploration: {
    TUTOR: [
      'What if we {probe}?',
      'Suppose one of the conditions changed — where would that lead?',
      'No harm in trying something and seeing where it goes.',
      'Try it a different way and let us see whether it lands anywhere.',
    ],
    STUDENT_1: [
      'Let me {probe}.',
      'What if I drew it out — maybe that shows something.',
      'I am not sure this route goes anywhere, but let me follow it a little.',
      'Maybe there is a shortcut if I look at the two parts separately.',
    ],
  },
  verification: {
    TUTOR: [
      'Check it against the conditions we started with.',
      'Does that answer the question that was asked?',
      'Substitute back and see whether both statements hold.',
      'Read the question once more and see whether that is what it wanted.',
    ],
    STUDENT_1: [
      '{check}, so that part holds.',
      'And the units match what the question asked for.',
      'Both conditions come out right.',
      'Putting it back in, both sides come out the same.',
    ],
  },
  monitor: {
    TUTOR: [
      'Where are we right now?',
      'Is this still the route you set out?',
      'Worth stopping here for a second?',
      'Are we still going somewhere with this?',
    ],
    STUDENT_1: [
      'Wait — I think I have drifted from what I said I would do.',
      'Hold on, let me look at where I am.',
      'This is taking longer than I expected; let me back up.',
      'I think I am going in circles here.',
    ],
  },
  organization: {
    TUTOR: [
      'Let me share my screen — can you see the whiteboard?',
      'Scroll down to problem four in the packet.',
      'We have about fifteen minutes left today.',
      'Copy that line into your notes before we move on.',
    ],
    STUDENT_1: [
      'Yes, I can see it now.',
      'One second, my audio cut out.',
      'Okay, I am on problem four.',
      'Writing it down now.',
    ],
  },
  digression: {
    TUTOR: [
      'How did the game go on Saturday?',
      'Did you get the new laptop sorted out?',
      'Before I forget — is next week the same time?',
    ],
    STUDENT_1: ['We won, barely.', 'Yes, it finally turned on last night.', 'Same time works.'],
  },
};

/**
 * Where a turn sits relative to a stretch that opens on the student's turn.
 * `handoff` is the tutor turn that ends the stretch before it, `opening` is the
 * student turn that opens it, and `follow` is the tutor turn after that.
 */
export type Cue = 'handoff' | 'opening' | 'follow';

// [OURS: written for this demo, like LINES. At a boundary the student's turn
// opens, the tutor turn before it has to close the earlier work rather than ask
// for the next, or the transcript reads as the student ignoring a question.
// So a handoff line answers the stretch it ends — mostly an acknowledgement,
// sometimes a result given or a line to look at again — and asks for nothing
// new. The tutor move each one would be coded as is not planted or recorded:
// Layer 2's items are classified by the model and marked by the tutor.]
const HANDOFF: Record<string, readonly string[]> = {
  reading: ['Good, that is all of it.', 'Right — that is the whole question.', 'Take a second with it.'],
  analysis: ['Yes, that is how the two pieces fit.', 'Right. Both conditions are doing work there.', 'Okay. And from there?'],
  planning: ['That order works.', 'Okay, that is a route.', 'Fine by me.'],
  implementation: ['Yes — and from there, {result}.', 'Look at that last line again.', 'That line is right.'],
  exploration: [
    'Interesting — that does land somewhere.',
    'Okay, that one does not go anywhere useful.',
    'Fair enough, it was worth a look.',
  ],
  verification: ['Good, it holds.', 'Both of those check out.', 'Right.'],
  monitor: ['Fair enough.', 'Take your time.', 'Okay, no rush.'],
  organization: ['Great.', 'Perfect, thanks.', 'Okay, good.'],
  digression: ['Nice.', 'Good to hear.', 'Glad it worked out.'],
};

// An opening line turns to the new work without yet doing it, and a follow
// line lets it go on, so the problem's content arrives in the student's next
// line rather than twice in a row.
const OPENING: Record<string, readonly string[]> = {
  analysis: [
    'Hold on — I want to look at what the two pieces say together.',
    'Wait, before anything: what depends on what here?',
    'Okay, but what changes if I give the unknown a name?',
  ],
  planning: [
    'Okay, before I compute anything, let me say the order of steps.',
    'I think I need a route first. Which step comes first?',
    'Let me work out the order before I start.',
  ],
  implementation: ['Let me just run it.', 'Okay, I am going to write it out now.', 'I will do the arithmetic now.'],
  exploration: [
    'Can I try something different and see where it goes?',
    'I want to try it another way.',
    'Maybe there is a shortcut — can I look for one?',
  ],
  verification: [
    'Let me check it against the conditions.',
    'I am going to put it back in and see whether it holds.',
    'Does that actually answer the question? Let me look.',
  ],
};

const FOLLOW: Record<string, readonly string[]> = {
  analysis: ['Go on — what do you see?', 'Okay, say more.'],
  planning: ['Go on — what is the order?', 'Okay, say the route.'],
  implementation: ['Go ahead.', 'Okay, show me.'],
  exploration: ['Sure, try it.', 'Go on, see where it lands.'],
  verification: ['Go ahead and check.', 'Okay — does it hold?'],
};

const CUED: Record<Cue, Record<string, readonly string[]>> = { handoff: HANDOFF, opening: OPENING, follow: FOLLOW };

/**
 * Fails loudly when the codebook carries a code this file has no voice for.
 * Any code can end the stretch before a student-opened one, so each needs a
 * handoff line; only the problem-solving codes are opened that way, so only
 * they need opening and follow lines.
 */
export function assertLinesExist(codes: readonly string[], processCodes: ReadonlySet<string>): void {
  const missing = codes.flatMap((code) => {
    const gaps: string[] = [];
    if (LINES[code] === undefined) gaps.push(code);
    if (HANDOFF[code] === undefined) gaps.push(`${code} (handoff)`);
    if (processCodes.has(code) && OPENING[code] === undefined) gaps.push(`${code} (opening)`);
    if (processCodes.has(code) && FOLLOW[code] === undefined) gaps.push(`${code} (follow)`);
    return gaps;
  });
  if (missing.length > 0) {
    throw new Error(
      `No demo dialogue for codebook code(s): ${missing.join(', ')}. Add lines in src/generator/dialogue.ts.`,
    );
  }
}

function fill(line: string, problem: Problem): string {
  return line.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = problem[key as keyof Problem];
    return typeof value === 'string' ? value : whole;
  });
}

/**
 * A speaker for one session. It rotates through a pool rather than drawing
 * from it independently, because an independent draw over a pool this small
 * says the same sentence twice in a row often enough to read as a loop.
 */
export function makeSpeaker(problem: Problem, rng: Prng): (code: string, role: Role, cue?: Cue) => string {
  const cursors = new Map<string, number>();
  return (code, role, cue) => {
    const pool = cue === undefined ? LINES[code]?.[role] : CUED[cue][code];
    if (pool === undefined) throw new Error(`No ${cue ?? role} dialogue for code "${code}"`);
    const key = `${cue ?? 'line'}:${code}:${role}`;
    const previous = cursors.get(key);
    const index =
      previous === undefined
        ? rng.int(0, pool.length - 1)
        : (previous + rng.int(1, pool.length - 1)) % pool.length;
    cursors.set(key, index);
    return fill(pool[index]!, problem);
  };
}
