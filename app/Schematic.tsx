import { useId, useState } from 'react';
import type { Episode, Session, Turn } from '../src/contract/types.ts';
import { isStudent } from '../src/moves/items.ts';
import { codeColour, codeDefinition, codeName, isProblemProcess, speakerName } from './data.ts';
import { KEY_MOVE_LABEL, chooseQuotes, starredOpener, type Readings } from './quotes.ts';

// The process schematic (§7.1 item 3, D5), drawn on the frame of Rott, Specht &
// Knipping (2021) Fig. 5, "Descriptive model of problem-solving processes"
// (docs/reference/rott-2021-fig5.md, image at rott-2021-fig5.png), as a large
// flowchart with the evidence for each step beside it.
//
// One diagram per problem, not per session. `Session.problems` may divide a
// session into separately planned problems, and an episode never straddles a
// boundary, so a path that crossed one would draw a move that never happened.
//
// [DERIVED: the in-problem-process episodes of one problem, in turn order → the
// single path traced through Fig. 5's boxes; the ordering and the drawing are
// ours.] Every numbered step is one episode, and the line joining them is the
// order they came in.
//
// [EXTRAPOLATION: Fig. 5 was built from problem-solving processes Rott et al.
// observed and coded; this puts tutoring dialogue on the same node set. What
// would test it: code a body of tutoring transcripts and check whether the
// traced paths stay inside the transitions the model allows, and whether the
// four original nodes still carry the traffic.]
//
// ---------------------------------------------------------------------------
// Decisions here that are the owner's to overturn:
//
// 1. Fig. 5's arrangement is kept — Analysis at the top, one box split by a
//    dotted line into Planning over Implementation, Exploration to the side,
//    Verification at the bottom, a rule above and a rule below. Its arrows are
//    not kept: they are the transitions the model permits, and this draws the
//    one path a problem actually took. [OURS]
// 2. One continuous line, entered on the top rule and left on the bottom rule,
//    through every step in order. Each visit is its own numbered step inside
//    the box it belongs to, so a revisit reads as a return. [OURS]
// 3. Every box is drawn whether or not the path visited it, so stacked
//    diagrams share one frame and an unvisited box says so in place. [OURS]
// 4. Fig. 5's rules are "Given Problem" and "(Verified) Solution". Nothing in
//    an episode code establishes that a solution was reached, or verified, so
//    both are relabelled to where the work started and where it ended.
// 5. Only the codes the codebook marks `in_problem_process` are drawn. The other
//    four are not drawn, not named and not counted here. [OURS: owner direction,
//    2026-09-17; an earlier version stated a count of them under the diagram.]
// 6. The evidence panel sits beside the diagram, not over it, and is sticky, so
//    what was said stays in view while the pointer moves across the steps.
//    [OURS: a tooltip over the diagram hides the path it is explaining.]
// 7. In the panel, a student turn is quoted in full, verbatim, large and
//    highlighted. A tutor turn is context: small, muted, and cut to its opening
//    words when long, with an ellipsis. It is an excerpt, never a paraphrase or
//    a model-written summary: nothing here puts words in a speaker's mouth.
//    The caption over the quotes names the stretch, never a person: "What was
//    said in this stretch of analysis". An episode spans both speakers and
//    nothing here establishes who drove it (INTENT.md, "Why the report
//    exists"), so the quote carries the weight and the caption stays neutral.
// 8. Which turns are the student's. `lead_role`, when the session carries it,
//    is the tutor's role (SPEC §5.8: supplied, never inferred) and every other
//    role is a student's. Without it, a role whose own label names a tutor,
//    teacher or instructor is the tutor's and every other is quoted as
//    evidence. [OURS: reading a role's label is not inferring the lead from
//    what was said, which §5.8 rules out; an uploaded transcript with speakers
//    named only by first name would have every turn quoted as evidence.]
// 9. The panel is this component's own. `selectedId` still rings the step a
//    caller has open. [OURS]
// ---------------------------------------------------------------------------
//
// Everything past the ordering is drawing: coordinates, spacing, colour and
// curvature are [OURS: layout, sized for a page column about 1400px wide with
// the diagram at roughly its natural size beside a 25rem panel].

const SLOTS = ['analysis', 'planning', 'implementation', 'exploration', 'verification'] as const;
type Slot = (typeof SLOTS)[number];
const isSlot = (code: string): code is Slot => (SLOTS as readonly string[]).includes(code);

/** The design width. The drawing scales to its column; at 1440px wide it is
 *  drawn at very nearly one unit to one pixel. */
const W = 940;
const RULE_INSET = 6;
const RULE_TOP = 26;
const TERMINAL_W = 244;
const TERMINAL_H = 40;
/** Clear space between a rule and the nearest box. */
const RULE_GAP = 34;
const ROW_GAP = 60;
/** Step marks. */
const R = 21;
const PITCH_X = 86;
const MAX_COLS = 4;
const LINE_H = 16;
/** Boxes. */
const BOX_PAD_X = 26;
const HEAD_H = 56;
const MIN_BOX_W = 270;
const EMPTY_H = 46;
const RADIUS = 16;
/** Side lanes, for the ways in and out that cannot meet their box head on. */
const LANE_L = 16;
const LANE_R = W - 16;
/** How far a routed vertical keeps from the box it passes. */
const CLEAR = 26;
const BEND = 18;

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

interface Pt {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  n: number;
}

interface Head {
  x: number;
  y: number;
  angle: number;
}

interface Seg {
  d: string;
  heads: Head[];
}

type SpeakerKind = 'tutor' | 'student';

interface Speaker {
  kind: SpeakerKind;
  /** The name the speaker is shown under on every surface: `speakerName` in
   *  data.ts. */
  label: string;
}

interface Step {
  /** 1-based position along the path. */
  n: number;
  episode: Episode;
  code: Slot;
  at: Pt;
  turns: Turn[];
  /** 1-based turn numbers within the session. */
  from: number;
  to: number;
  clock: string | null;
  span: string | null;
  /** `openingLine`: null unless a student's turn opens this step. */
  opening: string | null;
  /** `chooseQuotes`: the turns quoted in the evidence panel, in order. */
  quotes: Turn[];
  /** `starredOpener`: the turn that carries the star, or null. */
  starred: string | null;
  /** What was done in the starred quote's exchange, from the report, or null. */
  description: string | null;
}

type Focus = { kind: 'step'; id: string } | { kind: 'box'; slot: Slot };

const sameFocus = (a: Focus | null, b: Focus | null): boolean =>
  a !== null &&
  b !== null &&
  (a.kind === 'step' ? b.kind === 'step' && a.id === b.id : b.kind === 'box' && a.slot === b.slot);

export interface ProblemGroup {
  key: string;
  /** The problem's topic, or null when the session records no problems. */
  topic: string | null;
  episodes: Episode[];
}

/** One group of episodes per problem, in turn order; one group for the whole
 *  session when `Session.problems` is absent. */
export function problemGroups(session: Session, episodes: Episode[]): ProblemGroup[] {
  const position = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  const at = (e: Episode): number => position.get(e.start_turn_id) ?? 0;
  const ordered = [...episodes].sort((a, b) => at(a) - at(b));

  const problems = session.problems ?? [];
  if (problems.length === 0) return [{ key: session.session_id, topic: null, episodes: ordered }];

  return problems.map((p) => {
    const from = position.get(p.start_turn_id) ?? 0;
    const to = position.get(p.end_turn_id) ?? session.turns.length - 1;
    return {
      key: p.problem_id,
      topic: p.topic,
      episodes: ordered.filter((e) => at(e) >= from && at(e) <= to),
    };
  });
}

// --- colour ------------------------------------------------------------------

const colourOf = (slot: Slot): string => codeColour[slot] ?? '#8a847d';
/** A code's colour washed toward the paper, `pct` percent colour. */
const tint = (c: string, pct: number): string => `color-mix(in srgb, ${c} ${pct}%, var(--paper))`;
/** A code's colour darkened toward the ink, `pct` percent ink. */
const shade = (c: string, pct: number): string => `color-mix(in srgb, ${c} ${100 - pct}%, var(--ink))`;
const QUIET = '#cfc7bd';

// --- the transcript ------------------------------------------------------------

function speakersOf(session: Session): (role: string) => Speaker {
  const lead = (session as Session & { lead_role?: unknown }).lead_role;
  const leadRole = typeof lead === 'string' && lead.trim() !== '' ? lead : null;
  return (role) => {
    const tutor = leadRole !== null ? role === leadRole : /tutor|teacher|instructor/i.test(role);
    return { kind: tutor ? 'tutor' : 'student', label: speakerName(role, session) };
  };
}

/**
 * The one secondary line under a problem-solving stretch whose first turn is a
 * student's (docs/SPEC-layer2.md; owner decision D-C, 2026-09-18). The stretch
 * is the subject, never the student (CLAUDE.md rule 8), and the one allowed
 * construction is "opened on the student's turn" (lint/banned-phrases.json).
 *
 * The clause about the turn before is added only where Layer 2 coded that turn
 * NONE and `movesShown` says the layer's own agreement surfaces it. Any other
 * move is never named on this page, and nothing else from the layer is used.
 * Only a model run's episodes carry `tutor_prompting`, so a report built from
 * an annotation run never gets the clause.
 *
 * [OURS: a student's turn here is `isStudent` of src/moves/items.ts, a role
 * beginning STUDENT, the same test Layer 2 uses to pick its boundaries, so the
 * line and the layer never disagree about which stretches a student's turn
 * opened. It is stricter than `speakersOf` above, which quotes every non-tutor
 * role as evidence.]
 */
export function openingLine(session: Session, episode: Episode, movesShown: boolean): string | null {
  if (!isProblemProcess(episode.EPISODE)) return null;
  const opener = session.turns.find((t) => t.turn_id === episode.start_turn_id);
  if (opener === undefined || !isStudent(opener.role)) return null;
  const code = episode.EPISODE;
  return movesShown && episode.tutor_prompting?.tutor_move === 'NONE'
    ? `This stretch of ${code} opened on the student's turn, with no prompt in the turn before it.`
    : `This stretch of ${code} opened on the student's turn.`;
}

function clockOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function spanOf(turns: Turn[]): string | null {
  const first = turns[0];
  const last = turns[turns.length - 1];
  if (!first || !last) return null;
  const from = clockOf(first.start_time);
  if (!from) return null;
  const to = clockOf(last.end_time ?? last.start_time);
  return to && to !== from ? `${from}–${to}` : from;
}

/** The opening words of a long tutor turn, cut at a word, with an ellipsis. */
function excerpt(text: string, max = 110): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const space = t.lastIndexOf(' ', max);
  const cut = space > max * 0.6 ? space : max;
  return `${t.slice(0, cut).replace(/[\s,;:.—–-]+$/, '')}…`;
}

function turnSpan(from: number, to: number): string {
  return from === to ? `turn ${from}` : `turns ${from}–${to}`;
}

function listNumbers(ns: number[]): string {
  if (ns.length <= 1) return String(ns[0] ?? '');
  return `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
}

// --- geometry ------------------------------------------------------------------

function bezier(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Head {
  const u = 1 - t;
  const x = u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x;
  const y = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y;
  const dx = 3 * u * u * (c1.x - p0.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (p3.x - c2.x);
  const dy = 3 * u * u * (c1.y - p0.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (p3.y - c2.y);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/** A rounded rectangle's outline, open along one horizontal edge, for the two
 *  halves of the split box. */
function halfOutline(x: number, y: number, w: number, h: number, open: 'top' | 'bottom', closed: boolean): string {
  const r = RADIUS;
  const d =
    open === 'bottom'
      ? `M ${x} ${y + h} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h}`
      : `M ${x} ${y} V ${y + h - r} Q ${x} ${y + h} ${x + r} ${y + h} H ${x + w - r} Q ${x + w} ${y + h} ${x + w} ${y + h - r} V ${y}`;
  return closed ? `${d} Z` : d;
}

// --- the component ---------------------------------------------------------------

export function Schematic({
  session,
  episodes,
  topic,
  selectedId,
  movesShown = false,
  readings,
  descriptions,
}: {
  session: Session;
  /** One problem's worth of episodes; `problemGroups` divides a session. */
  episodes: Episode[];
  topic?: string | null;
  /** Optional. Rings the step whose turns are open elsewhere on the page. */
  selectedId?: string | null;
  /** Layer 2's own agreement state is `shown`. Only lets `openingLine` add its
   *  clause about the turn before; false by default. */
  movesShown?: boolean;
  /** The report's two runs, for `chooseQuotes`. */
  readings: Readings;
  /** `descriptionsOf` in app/quotes.ts, keyed by the quote's turn_id. */
  descriptions: Record<string, string>;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [pinned, setPinned] = useState<Focus | null>(null);

  const position = new Map(session.turns.map((t, i) => [t.turn_id, i]));
  const startOf = (e: Episode): number => position.get(e.start_turn_id) ?? 0;
  const endOf = (e: Episode): number => position.get(e.end_turn_id) ?? startOf(e);
  const speaker = speakersOf(session);
  const timed = session.has_timestamps;

  const drawn = episodes
    .filter((e) => isProblemProcess(e.EPISODE) && isSlot(e.EPISODE))
    .sort((a, b) => startOf(a) - startOf(b));

  const heading =
    topic != null && topic !== '' ? (
      <h3 className="mb-5 text-2xl" style={{ color: 'var(--ink)' }}>
        {topic}
      </h3>
    ) : null;

  if (drawn.length === 0) {
    return (
      <div>
        {heading}
        <p className="text-base" style={{ color: 'var(--muted)' }}>
          No stretch of problem-solving work was marked here, so there is no path to draw.
        </p>
      </div>
    );
  }

  // --- sizes: a box grows with the number of visits it takes -----------------
  // [DERIVED: episodes → the number of visits each box takes, which sizes it.]
  // One line of label under a step, the time it began, and only when timed.
  const lines = timed ? 1 : 0;
  /** From a step's centre to the bottom of the labels beneath it. */
  const below = R + 4 + lines * LINE_H;
  const pitchY = below + 18 + R;
  const nodeY0 = HEAD_H + R + 4;

  const visits = (slot: Slot): number => drawn.filter((e) => e.EPISODE === slot).length;
  const sizeOf = (count: number): { cols: number; w: number; h: number } => {
    const cols = Math.max(1, Math.min(count, MAX_COLS));
    const rows = Math.ceil(count / cols);
    const w = Math.max(MIN_BOX_W, BOX_PAD_X * 2 + cols * PITCH_X);
    const h = count === 0 ? HEAD_H + EMPTY_H : nodeY0 + (rows - 1) * pitchY + below + 14;
    return { cols, w, h };
  };
  const size = {
    analysis: sizeOf(visits('analysis')),
    planning: sizeOf(visits('planning')),
    implementation: sizeOf(visits('implementation')),
    exploration: sizeOf(visits('exploration')),
    verification: sizeOf(visits('verification')),
  };

  // --- positions: Fig. 5's frame ------------------------------------------------
  const cx = W / 2;
  const leftX = W * 0.25;
  const rightX = W * 0.75;
  const piW = Math.max(size.planning.w, size.implementation.w);
  const piH = size.planning.h + size.implementation.h;
  const rowA = RULE_TOP + TERMINAL_H / 2 + RULE_GAP;
  const rowB = rowA + size.analysis.h + ROW_GAP;
  const rowBH = Math.max(piH, size.exploration.h);
  const rowC = rowB + rowBH + ROW_GAP;
  const ruleBottom = rowC + size.verification.h + RULE_GAP + TERMINAL_H / 2;
  const H = ruleBottom + TERMINAL_H / 2 + 4;

  const piX = leftX - piW / 2;
  const piY = rowB + (rowBH - piH) / 2;
  const boxOf = (slot: Slot, x: number, y: number, w: number): Box => ({
    x,
    y,
    w,
    h: size[slot].h,
    cols: size[slot].cols,
    n: visits(slot),
  });
  const boxes: Record<Slot, Box> = {
    analysis: boxOf('analysis', cx - size.analysis.w / 2, rowA, size.analysis.w),
    planning: boxOf('planning', piX, piY, piW),
    implementation: boxOf('implementation', piX, piY + size.planning.h, piW),
    exploration: boxOf(
      'exploration',
      rightX - size.exploration.w / 2,
      rowB + (rowBH - size.exploration.h) / 2,
      size.exploration.w,
    ),
    verification: boxOf('verification', cx - size.verification.w / 2, rowC, size.verification.w),
  };
  const isPI = (slot: Slot): boolean => slot === 'planning' || slot === 'implementation';
  const frameTop = (slot: Slot): number => (isPI(slot) ? boxes.planning.y : boxes[slot].y);
  const frameBottom = (slot: Slot): number =>
    isPI(slot) ? boxes.implementation.y + boxes.implementation.h : boxes[slot].y + boxes[slot].h;

  /** The i-th visit's mark inside a box: filled left to right and wrapped, each
   *  row centred, so the marks read in visit order. */
  const markAt = (box: Box, i: number): Pt => {
    const row = Math.floor(i / box.cols);
    const col = i % box.cols;
    const inRow = Math.min(box.cols, box.n - row * box.cols);
    return {
      x: box.x + box.w / 2 - (inRow * PITCH_X) / 2 + PITCH_X / 2 + col * PITCH_X,
      y: box.y + nodeY0 + row * pitchY,
    };
  };

  const used = new Map<Slot, number>();
  const steps: Step[] = drawn.map((e, i) => {
    const code = e.EPISODE as Slot;
    const k = used.get(code) ?? 0;
    used.set(code, k + 1);
    const from = startOf(e);
    const to = endOf(e);
    const turns = session.turns.slice(from, to + 1);
    const first = turns[0];
    const starred = starredOpener(session, e, movesShown);
    return {
      n: i + 1,
      episode: e,
      code,
      at: markAt(boxes[code], k),
      turns,
      from: from + 1,
      to: to + 1,
      clock: timed ? clockOf(first?.start_time) : null,
      span: timed ? spanOf(turns) : null,
      opening: openingLine(session, e, movesShown),
      quotes: chooseQuotes(session, turns, readings, starred),
      starred,
      description: starred === null ? null : (descriptions[starred] ?? null),
    };
  });

  const first = steps[0];
  const last = steps[steps.length - 1];
  if (!first || !last) return null;

  // --- the path ---------------------------------------------------------------
  // In off the upper rule, through every step in order, out to the lower one.
  // A box the rule faces is met head on, as Fig. 5's own verticals meet it;
  // anything else comes in or goes out along a lane at the side, so the line
  // never runs through a box it did not visit.
  const marks = steps.map((s) => s.at);
  const clearOfMarks = (p: Pt): boolean => marks.every((m) => Math.hypot(m.x - p.x, m.y - p.y) > R + 12);
  const hitsMark = (x: number, y0: number, y1: number, except: Pt): boolean =>
    marks.some((m) => m !== except && Math.abs(m.x - x) < R + 6 && m.y > y0 && m.y < y1);

  const A = boxes.analysis;
  const V = boxes.verification;
  const down = (x: number, y: number): Head => ({ x, y, angle: 90 });

  // The way in.
  const inByLane =
    first.code === 'verification' ||
    (first.code === 'implementation' && hitsMark(first.at.x, frameTop(first.code), first.at.y, first.at));
  let entry: Seg;
  let entryX: number;
  if (inByLane) {
    entryX = LANE_L;
    const p = first.at;
    entry = {
      d: `M ${entryX} ${RULE_TOP} V ${p.y - BEND} Q ${entryX} ${p.y} ${entryX + BEND} ${p.y} H ${p.x}`,
      heads: [down(entryX, (RULE_TOP + TERMINAL_H / 2 + p.y) / 2)],
    };
  } else {
    const p = first.at;
    entryX =
      isPI(first.code) ? Math.min(p.x, A.x - CLEAR) : first.code === 'exploration' ? Math.max(p.x, A.x + A.w + CLEAR) : p.x;
    const top = frameTop(first.code);
    if (Math.abs(entryX - p.x) < 0.5) {
      entry = { d: `M ${p.x} ${RULE_TOP} V ${p.y}`, heads: [down(p.x, (RULE_TOP + TERMINAL_H / 2 + top) / 2)] };
    } else {
      const yb = top - BEND * 1.5;
      const k = (p.y - yb) / 2;
      entry = {
        d: `M ${entryX} ${RULE_TOP} V ${yb} C ${entryX} ${yb + k} ${p.x} ${p.y - k} ${p.x} ${p.y}`,
        heads: [down(entryX, (RULE_TOP + TERMINAL_H / 2 + yb) / 2)],
      };
    }
  }

  // The way out.
  const outThroughHalf =
    last.code === 'planning' && hitsMark(last.at.x, last.at.y, frameBottom(last.code), last.at);
  let exit: Seg;
  let exitX: number;
  if (last.code === 'analysis') {
    // The last visit is the rightmost mark in its row, so going right crosses
    // nothing; and it keeps clear of a way in that came down the left lane.
    exitX = LANE_R;
    const p = last.at;
    exit = {
      d: `M ${p.x} ${p.y} H ${exitX - BEND} Q ${exitX} ${p.y} ${exitX} ${p.y + BEND} V ${ruleBottom}`,
      heads: [down(exitX, (p.y + ruleBottom - TERMINAL_H / 2) / 2)],
    };
  } else if (outThroughHalf) {
    // Out of Planning with Implementation marks below it: along the dotted line
    // to the left of the split box, then down the lane.
    exitX = inByLane ? LANE_L + 14 : LANE_L;
    const p = last.at;
    const yd = boxes.implementation.y;
    exit = {
      d: `M ${p.x} ${p.y} V ${yd - BEND} Q ${p.x} ${yd} ${p.x - BEND} ${yd} H ${exitX + BEND} Q ${exitX} ${yd} ${exitX} ${yd + BEND} V ${ruleBottom}`,
      heads: [down(exitX, (yd + ruleBottom) / 2)],
    };
  } else {
    const p = last.at;
    exitX =
      isPI(last.code) ? Math.min(p.x, V.x - CLEAR) : last.code === 'exploration' ? Math.max(p.x, V.x + V.w + CLEAR) : p.x;
    const bottom = frameBottom(last.code);
    if (Math.abs(exitX - p.x) < 0.5) {
      exit = { d: `M ${p.x} ${p.y} V ${ruleBottom}`, heads: [down(p.x, (bottom + ruleBottom - TERMINAL_H / 2) / 2)] };
    } else {
      const yb = bottom + BEND * 1.5;
      const k = (yb - p.y) / 2;
      exit = {
        d: `M ${p.x} ${p.y} C ${p.x} ${p.y + k} ${exitX} ${yb - k} ${exitX} ${yb} V ${ruleBottom}`,
        heads: [down(exitX, (yb + ruleBottom - TERMINAL_H / 2) / 2)],
      };
    }
  }

  // The hops between steps. Each bows to the left of its direction of travel,
  // so two visits between the same pair of boxes never lie on one another, and
  // a hop along a row arcs over the labels under its marks.
  const hops: Seg[] = [];
  for (let i = 1; i < steps.length; i += 1) {
    const a = steps[i - 1]?.at;
    const b = steps[i]?.at;
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(40, Math.max(12, len * 0.16));
    const nx = (dy / len) * bow;
    const ny = (-dx / len) * bow;
    const c1 = { x: a.x + dx * 0.3 + nx, y: a.y + dy * 0.3 + ny };
    const c2 = { x: a.x + dx * 0.7 + nx, y: a.y + dy * 0.7 + ny };
    const spot = [0.5, 0.42, 0.58, 0.34, 0.66].map((t) => bezier(a, c1, c2, b, t)).find((p) => clearOfMarks(p));
    hops.push({
      d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`,
      heads: spot && len > 2 * R + 20 ? [spot] : [],
    });
  }
  /** segs[i] runs into step i + 1; segs[steps.length] runs out to the rule. */
  const segs: Seg[] = [entry, ...hops, exit];

  // --- focus --------------------------------------------------------------------
  const live = (f: Focus | null): Focus | null =>
    f?.kind === 'step' && !steps.some((s) => s.episode.episode_id === f.id) ? null : f;
  const shown = live(pinned);
  const activeStep = shown?.kind === 'step' ? (steps.find((s) => s.episode.episode_id === shown.id) ?? null) : null;
  const activeSlot: Slot | null = shown?.kind === 'box' ? shown.slot : (activeStep?.code ?? null);
  const lit = (s: Step): boolean =>
    shown === null || (shown.kind === 'step' ? s === activeStep : s.code === shown.slot);

  const stepFocus = (s: Step): Focus => ({ kind: 'step', id: s.episode.episode_id });
  const togglePin = (f: Focus): void => setPinned((p) => (sameFocus(live(p), f) ? null : f));

  // --- drawing --------------------------------------------------------------------
  const shadow = `schematic-shadow-${uid}`;
  const bandPct = (slot: Slot): number => (activeSlot === slot ? 26 : 17);
  const titleOf = (slot: Slot, box: Box) => (
    <g key={`title-${slot}`} style={{ pointerEvents: 'none' }}>
      <circle
        cx={box.x + BOX_PAD_X - 4}
        cy={box.y + HEAD_H / 2}
        r={6.5}
        fill={box.n > 0 ? colourOf(slot) : 'none'}
        stroke={box.n > 0 ? 'none' : QUIET}
        strokeWidth={1.5}
      />
      <text
        x={box.x + BOX_PAD_X + 11}
        y={box.y + HEAD_H / 2 + 9.5}
        fontSize={27}
        fontWeight={700}
        style={{
          fill: box.n > 0 ? shade(colourOf(slot), 40) : '#a39b92',
          stroke: box.n > 0 ? tint(colourOf(slot), bandPct(slot)) : 'var(--paper)',
          strokeWidth: 6,
          strokeLinejoin: 'round',
          paintOrder: 'stroke',
        }}
      >
        {codeName(slot)}
      </text>
      {box.n === 0 && (
        <text
          x={box.x + BOX_PAD_X - 10}
          y={box.y + HEAD_H + 26}
          fontSize={15}
          fontStyle="italic"
          fill="var(--muted)"
          style={{ fontFamily: SANS }}
        >
          No step here
        </text>
      )}
    </g>
  );

  /** A box as a target: selecting it shows every step inside it. */
  const boxTarget = (slot: Slot) => ({
    onClick: () => togglePin({ kind: 'box', slot }),
  });

  const cardFill = (slot: Slot, box: Box): string =>
    box.n === 0 ? 'var(--paper)' : tint(colourOf(slot), activeSlot === slot ? 11 : 6);
  const edge = (slot: Slot, box: Box) => ({
    strokeDasharray: box.n > 0 ? undefined : '7 6',
    style: {
      stroke: box.n > 0 ? colourOf(slot) : QUIET,
      strokeWidth: box.n > 0 ? (activeSlot === slot ? 3 : 2) : 1.5,
      transition: 'stroke-width 150ms',
    },
  });
  /** The band a box's name sits in, a deeper wash of its colour. */
  const band = (slot: Slot, box: Box, roundTop: boolean) => {
    if (box.n === 0) return null;
    const { x, y, w } = box;
    const r = RADIUS;
    const d = roundTop
      ? `M ${x} ${y + HEAD_H} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + HEAD_H} Z`
      : `M ${x} ${y} H ${x + w} V ${y + HEAD_H} H ${x} Z`;
    return <path d={d} style={{ fill: tint(colourOf(slot), bandPct(slot)), transition: 'fill 150ms' }} />;
  };

  const single = (slot: 'analysis' | 'exploration' | 'verification') => {
    const box = boxes[slot];
    const on = box.n > 0;
    return (
      <g
        key={slot}
        filter={on ? `url(#${shadow})` : undefined}
        style={{ cursor: 'pointer' }}
        {...boxTarget(slot)}
      >
        <rect
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          rx={RADIUS}
          style={{ fill: cardFill(slot, box), transition: 'fill 150ms' }}
        />
        {band(slot, box, true)}
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={RADIUS} fill="none" {...edge(slot, box)} />
      </g>
    );
  };

  const half = (slot: 'planning' | 'implementation') => {
    const box = boxes[slot];
    const open = slot === 'planning' ? 'bottom' : 'top';
    return (
      <g key={slot} {...boxTarget(slot)} style={{ cursor: 'pointer' }}>
        <path
          d={halfOutline(box.x, box.y, box.w, box.h, open, true)}
          style={{ fill: cardFill(slot, box), transition: 'fill 150ms' }}
        />
        {band(slot, box, slot === 'planning')}
        <path d={halfOutline(box.x, box.y, box.w, box.h, open, false)} fill="none" {...edge(slot, box)} />
      </g>
    );
  };

  const piOn = boxes.planning.n + boxes.implementation.n > 0;

  return (
    <div className="@container">
      {heading}
      <div className="grid gap-8 @5xl:grid-cols-[minmax(0,1fr)_25rem]">
        <figure className="m-0 min-w-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
            role="group"
            aria-label="The path this problem took through the kinds of problem-solving work, from where the work started to where it ended"
          >
            <defs>
              <filter id={shadow} x="-10%" y="-10%" width="120%" height="130%">
                <feDropShadow dx={0} dy={5} stdDeviation={8} floodColor="#1f1d1a" floodOpacity={0.1} />
              </filter>
            </defs>

            {/* The two rules. */}
            <line
              x1={RULE_INSET}
              x2={W - RULE_INSET}
              y1={RULE_TOP}
              y2={RULE_TOP}
              stroke="var(--ink)"
              strokeWidth={1.5}
              opacity={0.55}
            />
            <line
              x1={RULE_INSET}
              x2={W - RULE_INSET}
              y1={ruleBottom}
              y2={ruleBottom}
              stroke="var(--ink)"
              strokeWidth={1.5}
              opacity={0.55}
            />

            {/* The boxes. Planning and Implementation share one, split by a dotted line. */}
            {single('analysis')}
            {single('exploration')}
            {single('verification')}
            <g filter={piOn ? `url(#${shadow})` : undefined}>
              {half('planning')}
              {half('implementation')}
            </g>
            <line
              x1={piX + 10}
              x2={piX + piW - 10}
              y1={boxes.implementation.y}
              y2={boxes.implementation.y}
              stroke="var(--ink)"
              strokeWidth={2}
              strokeDasharray="1 7"
              strokeLinecap="round"
              opacity={0.45}
              style={{ pointerEvents: 'none' }}
            />

            {/* The path: a casing so it reads where it crosses a box edge or
                itself, then the line, then the stretch into and out of the
                step in focus, in that step colour. */}
            <g style={{ pointerEvents: 'none' }}>
              {segs.map((s, i) => (
                <path key={`case-${i}`} d={s.d} fill="none" stroke="var(--paper)" strokeWidth={9} strokeLinecap="round" />
              ))}
              {segs.map((s, i) => (
                <path
                  key={`line-${i}`}
                  d={s.d}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={activeStep ? 0.3 : 0.78}
                  style={{ transition: 'opacity 150ms' }}
                />
              ))}
              {activeStep &&
                [segs[activeStep.n - 1], segs[activeStep.n]].map((s, i) =>
                  s ? (
                    <path
                      key={`focus-${i}`}
                      d={s.d}
                      fill="none"
                      strokeWidth={4.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ stroke: shade(colourOf(activeStep.code), 10) }}
                    />
                  ) : null,
                )}
              {segs.flatMap((s, i) =>
                s.heads.map((h, j) => (
                  <path
                    key={`head-${i}-${j}`}
                    d="M -7 -6 L 7 0 L -7 6 Z"
                    fill="var(--ink)"
                    stroke="var(--paper)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    opacity={activeStep && i !== activeStep.n - 1 && i !== activeStep.n ? 0.35 : 0.9}
                    transform={`translate(${h.x} ${h.y}) rotate(${h.angle})`}
                  />
                )),
              )}
            </g>

            {SLOTS.map((slot) => titleOf(slot, boxes[slot]))}

            {/* Start and end: a terminal on each rule, a ring where the path
                leaves the upper rule and a bar where it meets the lower. */}
            <g style={{ pointerEvents: 'none' }}>
              <rect
                x={cx - TERMINAL_W / 2}
                y={RULE_TOP - TERMINAL_H / 2}
                width={TERMINAL_W}
                height={TERMINAL_H}
                rx={TERMINAL_H / 2}
                fill="var(--ink)"
              />
              <text
                x={cx}
                y={RULE_TOP + 6}
                textAnchor="middle"
                fontSize={17}
                fill="var(--paper)"
                style={{ fontFamily: SANS, letterSpacing: '0.01em' }}
              >
                Where the work started
              </text>
              {Math.abs(entryX - cx) > TERMINAL_W / 2 - 4 && (
                <circle cx={entryX} cy={RULE_TOP} r={7} fill="var(--paper)" stroke="var(--ink)" strokeWidth={3} />
              )}
              <rect
                x={cx - TERMINAL_W / 2}
                y={ruleBottom - TERMINAL_H / 2}
                width={TERMINAL_W}
                height={TERMINAL_H}
                rx={TERMINAL_H / 2}
                fill="var(--ink)"
              />
              <text
                x={cx}
                y={ruleBottom + 6}
                textAnchor="middle"
                fontSize={17}
                fill="var(--paper)"
                style={{ fontFamily: SANS, letterSpacing: '0.01em' }}
              >
                Where the work ended
              </text>
              {Math.abs(exitX - cx) > TERMINAL_W / 2 - 4 && (
                <rect x={exitX - 12} y={ruleBottom - 3.5} width={24} height={7} rx={3.5} fill="var(--ink)" />
              )}
            </g>

            {/* The steps, numbered along the path. */}
            {steps.map((s) => {
              const colour = colourOf(s.code);
              const on = lit(s);
              const focused = s === activeStep;
              const ringed = selectedId === s.episode.episode_id || sameFocus(shown, stepFocus(s));
              const f = stepFocus(s);
              /** Labels stay readable where the line runs under them. */
              const halo = {
                stroke: cardFill(s.code, boxes[s.code]),
                strokeWidth: 4,
                strokeLinejoin: 'round' as const,
                paintOrder: 'stroke',
              };
              return (
                <g
                  key={s.episode.episode_id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Step ${s.n}, ${codeName(s.code)}` + (s.clock ? `, ${s.clock}` : '')}
                  onClick={() => togglePin(f)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      togglePin(f);
                    }
                  }}
                  className="group"
                  style={{ cursor: 'pointer', outline: 'none', opacity: on ? 1 : 0.45, transition: 'opacity 150ms' }}
                >
                  <title>{codeName(s.code)}</title>
                  {/* Pointing or tabbing to a step lights its halo and nothing
                      else; only selecting it opens the panel. */}
                  <circle
                    cx={s.at.x}
                    cy={s.at.y}
                    r={R + 9}
                    className={focused ? undefined : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}
                    style={{ fill: tint(colour, 32) }}
                  />
                  {ringed && (
                    <circle cx={s.at.x} cy={s.at.y} r={R + 6} fill="none" stroke="var(--ink)" strokeWidth={2} />
                  )}
                  <circle
                    cx={s.at.x}
                    cy={s.at.y}
                    r={focused ? R + 3 : R}
                    fill={colour}
                    stroke="var(--paper)"
                    strokeWidth={3}
                  />
                  <text
                    x={s.at.x}
                    y={s.at.y + 6}
                    textAnchor="middle"
                    fontSize={s.n < 10 ? 18 : 16}
                    fontWeight={700}
                    fill="#fff"
                    style={{ fontFamily: SANS, pointerEvents: 'none' }}
                  >
                    {s.n}
                  </text>
                  <g style={{ pointerEvents: 'none', fontFamily: SANS }} textAnchor="middle">
                    {s.clock && (
                      <text
                        x={s.at.x}
                        y={s.at.y + R + 4 + LINE_H - 2}
                        fontSize={13.5}
                        style={{ fill: 'color-mix(in srgb, var(--ink) 78%, transparent)', ...halo }}
                      >
                        {s.clock}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>

          <figcaption className="mt-4 space-y-2 leading-relaxed">
            <p className="text-base" style={{ color: 'var(--ink)' }}>
              Follow the numbered steps along the line, from where the work started to where it ended. Each box is one
              kind of problem-solving work, so a line that comes back to a box is a return to that kind of work.
            </p>
            {timed && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Under each step: the time it began.
              </p>
            )}
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Adapted from Rott, B., Specht, B., &amp; Knipping, C. (2021), Fig. 5, &ldquo;Descriptive model of
              problem-solving processes&rdquo;, <i>ZDM Mathematics Education</i> 53(4), 737&ndash;752,{' '}
              <a href="https://doi.org/10.1007/s11858-021-01244-3" style={{ textDecoration: 'underline' }}>
                https://doi.org/10.1007/s11858-021-01244-3
              </a>
              . &copy; The Author(s) 2021,{' '}
              <a href="https://creativecommons.org/licenses/by/4.0/" style={{ textDecoration: 'underline' }}>
                CC BY 4.0
              </a>
              . Changed: redrawn; the figure&rsquo;s arrows replaced by the one path this problem took; the rules
              relabelled to where the work started and ended.
            </p>
          </figcaption>
        </figure>

        <Evidence
          shown={shown}
          steps={steps}
          speaker={speaker}
          timed={timed}
          onPin={togglePin}
          onUnpin={() => setPinned(null)}
        />
      </div>
    </div>
  );
}

// --- the evidence panel ---------------------------------------------------------

function Evidence({
  shown,
  steps,
  speaker,
  timed,
  onPin,
  onUnpin,
}: {
  shown: Focus | null;
  steps: Step[];
  speaker: (role: string) => Speaker;
  timed: boolean;
  onPin: (f: Focus) => void;
  onUnpin: () => void;
}) {
  const step = shown?.kind === 'step' ? (steps.find((s) => s.episode.episode_id === shown.id) ?? null) : null;
  const slot: Slot | null = shown?.kind === 'box' ? shown.slot : (step?.code ?? null);
  const colour = slot ? colourOf(slot) : 'var(--ink)';

  return (
    <aside
      className="self-start overflow-y-auto rounded-2xl p-6 @5xl:sticky @5xl:top-4 @5xl:max-h-[calc(100vh-2rem)]"
      style={{
        background: 'var(--paper)',
        border: `1px solid ${slot ? tint(colour, 45) : 'var(--rule)'}`,
        boxShadow: '0 10px 30px rgba(31, 29, 26, 0.08)',
        transition: 'border-color 150ms',
      }}
    >
      {shown === null || slot === null ? (
        <Overview steps={steps} timed={timed} onPin={onPin} />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 text-sm" style={{ fontFamily: SANS }}>
            <span style={{ color: 'var(--muted)' }}>
              {step
                ? `Step ${step.n} of ${steps.length}${step.span ? ` · ${step.span}` : ''}`
                : 'Every step in this box'}
            </span>
            <button
              onClick={onUnpin}
              className="rounded-full px-3 py-1 text-xs"
              style={{ border: '1px solid var(--rule)', color: 'var(--ink)' }}
            >
              Close
            </button>
          </div>

          <h4 className="mb-1 flex items-center gap-3 text-3xl" style={{ color: shade(colour, 38) }}>
            <span className="inline-block h-4 w-4 shrink-0 rounded-full" style={{ background: colour }} />
            {codeName(slot)}
          </h4>

          {step ? (
            <StepEvidence step={step} speaker={speaker} />
          ) : (
            <BoxEvidence slot={slot} steps={steps.filter((s) => s.code === slot)} speaker={speaker} />
          )}

          {codeDefinition(slot) && (
            <p
              className="mt-6 border-t pt-4 text-sm leading-relaxed"
              style={{ borderColor: 'var(--rule)', color: 'var(--muted)' }}
            >
              <span style={{ color: 'var(--ink)' }}>What counts as {codeName(slot)}: </span>
              {codeDefinition(slot)}
            </p>
          )}
        </>
      )}
    </aside>
  );
}

/** Nothing in focus: how to use the diagram, and the steps as a list, which is
 *  also the way in from the keyboard. */
function Overview({
  steps,
  timed,
  onPin,
}: {
  steps: Step[];
  timed: boolean;
  onPin: (f: Focus) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-sm" style={{ color: 'var(--muted)', fontFamily: SANS }}>
        What was said
      </p>
      <p className="mb-2 text-2xl leading-snug" style={{ color: 'var(--ink)' }}>
        Select a numbered step, or a box, to read what was said there.
      </p>
      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        Select it again, or press Close, to come back to this list.
      </p>
      <ol className="space-y-1">
        {steps.map((s) => {
          const f: Focus = { kind: 'step', id: s.episode.episode_id };
          return (
            <li key={s.episode.episode_id}>
              <button
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.035]"
                onClick={() => onPin(f)}
              >
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: colourOf(s.code), fontFamily: SANS }}
                >
                  {s.n}
                </span>
                <span className="text-lg" style={{ color: 'var(--ink)' }}>
                  {codeName(s.code)}
                </span>
                <span className="ml-auto text-xs" style={{ color: 'var(--muted)', fontFamily: SANS }}>
                  {timed ? s.clock : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepEvidence({ step, speaker }: { step: Step; speaker: (role: string) => Speaker }) {
  return (
    <>
      <p className="mb-5 text-sm" style={{ color: 'var(--muted)', fontFamily: SANS }}>
        {turnSpan(step.from, step.to)}
      </p>
      <Said step={step} speaker={speaker} caption={`What was said in this stretch of ${step.code}`} />
    </>
  );
}

function BoxEvidence({
  slot,
  steps,
  speaker,
}: {
  slot: Slot;
  steps: Step[];
  speaker: (role: string) => Speaker;
}) {
  if (steps.length === 0) {
    return (
      <p className="mt-3 text-lg leading-relaxed" style={{ color: 'var(--muted)' }}>
        No step in this problem was marked {codeName(slot)}.
      </p>
    );
  }
  return (
    <>
      <p className="mb-5 text-sm" style={{ color: 'var(--muted)', fontFamily: SANS }}>
        {steps.length === 1 ? `Step ${steps[0]?.n}` : `Steps ${listNumbers(steps.map((s) => s.n))}`}
      </p>
      <div className="space-y-7">
        {steps.map((s) => (
          <Said
            key={s.episode.episode_id}
            step={s}
            speaker={speaker}
            caption={`Step ${s.n}` + (s.span ? ` · ${s.span}` : '')}
          />
        ))}
      </div>
    </>
  );
}

/**
 * The quoted turns of one step (`chooseQuotes`), in order. A student turn is
 * the evidence: quoted in full, verbatim, large and highlighted. A tutor turn is
 * context: small, muted, and cut to its opening words when long.
 */
function Said({ step, speaker, caption }: { step: Step; speaker: (role: string) => Speaker; caption: string }) {
  const colour = colourOf(step.code);
  const quoted = step.turns.some((t) => speaker(t.role).kind === 'student');

  return (
    <section>
      <p
        className="mb-3 text-xs uppercase"
        style={{ color: shade(colour, 40), fontFamily: SANS, letterSpacing: '0.08em' }}
      >
        {caption}
      </p>
      {step.opening && (
        <p className="mb-3 text-sm leading-snug" style={{ color: 'var(--muted)', fontFamily: SANS }}>
          {step.opening}
        </p>
      )}
      {!quoted && (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-sm"
          style={{ background: '#f6f3ee', color: 'var(--ink)', fontFamily: SANS }}
        >
          No turn from another speaker falls in this step: every turn in it is from{' '}
          {[...new Set(step.turns.map((t) => speaker(t.role).label))].join(' and ')}.
        </p>
      )}
      {step.quotes.length < step.turns.length && (
        <p className="mb-3 text-sm leading-snug" style={{ color: 'var(--muted)', fontFamily: SANS }}>
          {step.quotes.length} of the {step.turns.length} turns in this step.
        </p>
      )}
      <ol className="space-y-3">
        {step.quotes.map((t) => {
          const who = speaker(t.role);
          if (who.kind === 'tutor') {
            return (
              <li key={t.turn_id} className="text-sm leading-snug" style={{ color: 'var(--muted)' }}>
                <span
                  className="mr-2 text-[10.5px] uppercase"
                  style={{ fontFamily: SANS, letterSpacing: '0.08em' }}
                >
                  {who.label}
                </span>
                {excerpt(t.content)}
              </li>
            );
          }
          return (
            <li key={t.turn_id}>
              <div
                className="mb-1 text-[10.5px] uppercase"
                style={{ color: shade(colour, 40), fontFamily: SANS, letterSpacing: '0.08em' }}
              >
                {who.label}
              </div>
              {t.turn_id === step.starred && (
                <div className="mb-1 text-sm" style={{ color: 'var(--ink)', fontFamily: SANS }}>
                  <span aria-hidden="true">&#9733;</span> {KEY_MOVE_LABEL}
                </div>
              )}
              <blockquote className="m-0 text-[23px] leading-snug" style={{ color: 'var(--ink)' }}>
                <span
                  style={{
                    background: `linear-gradient(transparent 52%, ${tint(colour, 32)} 52%)`,
                    boxDecorationBreak: 'clone',
                    WebkitBoxDecorationBreak: 'clone',
                    padding: '0 0.1em',
                  }}
                >
                  &ldquo;{t.content}&rdquo;
                </span>
              </blockquote>
              {t.turn_id === step.starred && step.description && (
                <p className="mt-1.5 text-sm leading-snug" style={{ color: 'var(--muted)', fontFamily: SANS }}>
                  {step.description}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
