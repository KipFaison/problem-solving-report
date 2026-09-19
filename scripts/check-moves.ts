// Layer 2 checks (docs/SPEC-layer2.md), on hand-built data small enough to
// check by eye: which tutor turns become items, what is stored for them, that
// the model's answer is rejected rather than repaired, and that the layer's
// own agreement reaches all three states and refuses what it should.
//
// No model is called. The one live classification is run by hand against the
// dev server (see the report that accompanies this script).
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { selectItems } from '../src/moves/items.ts';
import { checkLabels, movesCodebookBlock, movesInstruction } from '../src/moves/classify.ts';
import { loadMovesCodebook, moveCodes } from '../src/moves/codebook.ts';
import { movesAgreement, type MovesAgreementInput } from '../src/moves/agreement.ts';
import { loadCodebook, problemProcessCodes } from '../src/codebook/load.ts';
import { exists } from '../src/storage/index.ts';
import { REPO_ROOT, config } from '../src/config.ts';
import { loadMovesMarks, saveMovesMarks, withTutorPrompting, type StoredRun } from '../src/server/workspace.ts';
import type { Episode, MovesMarks, Session, Turn } from '../src/contract/types.ts';

let failures = 0;

function check(name: string, ok: boolean, detail: string): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  console.log(`      ${detail}`);
}

function throws(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const book = loadMovesCodebook();
const LAYER_VERSION = book.codebook_version;
const processCodes = problemProcessCodes();

// --- item selection --------------------------------------------------------

const ROLES = ['Student', 'Tutor', 'Student', 'Tutor', 'Student', 'Student', 'Tutor', 'Student'];
const s1: Session = {
  session_id: 'chk-s1',
  student_id: 'stu-chk',
  session_index: 1,
  session_date: '2026-09-01',
  has_timestamps: false,
  transcript_scope: 'full',
  turns: ROLES.map(
    (role, i): Turn => ({
      _id: String(i),
      session_id: 'chk-s1',
      sequence_id: i + 1,
      role,
      content: `turn ${i + 1}`,
      turn_id: `t${i + 1}`,
    }),
  ),
};

function episode(id: string, code: string, start: string, end: string): Episode {
  return {
    _id: id,
    episode_id: id,
    run_id: 'run-llm-chk',
    identifiedBy: 'AI',
    layer_id: 'episodes',
    codebook_version: '2.0.0',
    domain: config.codebook.domain,
    EPISODE: code,
    start_turn_id: start,
    end_turn_id: end,
    evidence: [],
    reviewer_id: null,
    reviewed_at: null,
  };
}

// Turn 1 Student opens e1 (process, but the first turn of the session)
// Turn 3 Student opens e2 (process, after a tutor turn): classifiable item
// Turn 4 Tutor   opens e3 (process, tutor-opened): not an item
// Turn 5 Student opens e4 (reading, not a process code): not an item
// Turn 6 Student opens e5 (process, after a student turn): item, not classifiable
// Turn 8 Student opens e6 (process, after a tutor turn): classifiable item
const e1 = episode('e1', 'analysis', 't1', 't2');
const e2 = episode('e2', 'planning', 't3', 't3');
const e3 = episode('e3', 'implementation', 't4', 't4');
const e4 = episode('e4', 'reading', 't5', 't5');
const e5 = episode('e5', 'verification', 't6', 't7');
const e6 = episode('e6', 'exploration', 't8', 't8');
const elsewhere = episode('e-other', 'analysis', 'x9', 'x9');
// Deliberately out of order, with an episode from another session mixed in.
const modelEpisodes = [e6, e3, elsewhere, e1, e5, e2, e4];

const items = selectItems(s1, modelEpisodes, processCodes);
const summary = items.map((i) => `${i.episode_id}<-${i.preceding_turn.turn_id}${i.classifiable ? '' : '(not classifiable)'}`);

check(
  'S1. only student-opened process-code episodes become items, in turn order',
  items.map((i) => i.episode_id).join(',') === 'e2,e5,e6',
  `items: ${summary.join(', ')}`,
);
check(
  "S2. an episode opening the session's first turn is not an item",
  !items.some((i) => i.episode_id === 'e1'),
  `e1 opens t1 (Student, analysis); items: ${items.map((i) => i.episode_id).join(',')}`,
);
check(
  'S3. tutor-opened and non-process episodes are not items',
  !items.some((i) => i.episode_id === 'e3' || i.episode_id === 'e4'),
  'e3 is tutor-opened; e4 is reading',
);
const e5item = items.find((i) => i.episode_id === 'e5');
check(
  'S4. an item preceded by a student turn is kept but not classifiable',
  e5item !== undefined && e5item.classifiable === false && e5item.preceding_turn.turn_id === 't5',
  e5item ? `e5 preceded by ${e5item.preceding_turn.turn_id} (${e5item.preceding_turn.role}), classifiable=${e5item.classifiable}` : 'e5 missing',
);
check(
  'S5. items preceded by a tutor turn are classifiable, and carry the next student turn',
  items.filter((i) => i.classifiable).map((i) => `${i.preceding_turn.turn_id}>${i.opening_turn.turn_id}`).join(',') === 't2>t3,t7>t8',
  items.filter((i) => i.classifiable).map((i) => `${i.preceding_turn.turn_id}>${i.opening_turn.turn_id}`).join(','),
);

// --- the prompt carries no episode code ------------------------------------

const classifiable = items.filter((i) => i.classifiable);
const promptText = [movesCodebookBlock(book), movesInstruction(s1, classifiable)].join('\n');
const episodeCodes = loadCodebook().codes.map((c) => c.code);
const leaked = episodeCodes.filter((code) => new RegExp(`\\b${code}\\b`, 'i').test(promptText));
check(
  'P1. the classification prompt names no episode code',
  leaked.length === 0,
  leaked.length === 0 ? `none of ${episodeCodes.length} episode codes appears in the prompt` : `found: ${leaked.join(', ')}`,
);
const layerCodesInPrompt = book.codes.every((c) => promptText.includes(`CODE ${c.code}`) && promptText.includes(c.definition));
check(
  'P2. every layer code and its definition is in the prompt, from the codebook',
  layerCodesInPrompt && promptText.includes(book.note_on_none),
  `${book.codes.length} codes and note_on_none present`,
);

// --- the model's answer is rejected, not repaired --------------------------

const codes = moveCodes();
const answer = (entries: Array<[string, string]>) =>
  JSON.stringify({ items: entries.map(([preceding_turn_id, code]) => ({ preceding_turn_id, code })) });

const good = checkLabels(answer([['t7', 'GIVING_ANSWER'], ['t2', 'NONE']]), classifiable, codes);
check(
  'R1. a complete answer is accepted and returned in item order',
  good.map((l) => `${l.preceding_turn_id}=${l.code}`).join(',') === 't2=NONE,t7=GIVING_ANSWER',
  good.map((l) => `${l.preceding_turn_id}=${l.code}`).join(','),
);
const rejections: Array<[string, string]> = [
  ['missing item', throws(() => checkLabels(answer([['t2', 'NONE']]), classifiable, codes))],
  ['duplicated item', throws(() => checkLabels(answer([['t2', 'NONE'], ['t2', 'NONE'], ['t7', 'NONE']]), classifiable, codes))],
  ['unknown item', throws(() => checkLabels(answer([['t2', 'NONE'], ['t7', 'NONE'], ['t5', 'NONE']]), classifiable, codes))],
  ['invalid code', throws(() => checkLabels(answer([['t2', 'NONE'], ['t7', 'planning']]), classifiable, codes))],
];
for (const [what, message] of rejections) {
  check(`R2. an answer with a ${what} is rejected`, message !== '', message || 'accepted');
}

// --- storage shape ---------------------------------------------------------

const run: StoredRun = {
  run_id: 'run-llm-chk',
  kind: 'llm',
  simulated: false,
  model: config.model.id,
  prompt_hash: null,
  annotator_id: null,
  codebook_version: '2.0.0',
  domain: config.codebook.domain,
  created_at: '2026-09-18T00:00:00Z',
  // e3 carries a stale label from an earlier pass; it is not an item now.
  episodes: [e1, e2, { ...e3, tutor_prompting: { preceding_turn_id: 't3', preceding_speaker: 'Student', tutor_move: null, codebook_version: '0.9.0' } }, e4, e5, e6],
};
const labels = new Map([['t2', 'NONE'], ['t7', 'GIVING_ANSWER']]);
const stored = withTutorPrompting(run, items, labels, LAYER_VERSION);
const tp = (id: string) => stored.episodes.find((e) => e.episode_id === id)?.tutor_prompting;

check(
  'T1. a classifiable item stores exactly {preceding_turn_id, preceding_speaker, tutor_move, codebook_version}',
  JSON.stringify(tp('e2')) ===
    JSON.stringify({ preceding_turn_id: 't2', preceding_speaker: 'Tutor', tutor_move: 'NONE', codebook_version: LAYER_VERSION }),
  JSON.stringify(tp('e2')),
);
check(
  'T2. a student-preceded item stores a null move and the role string',
  JSON.stringify(tp('e5')) ===
    JSON.stringify({ preceding_turn_id: 't5', preceding_speaker: 'Student', tutor_move: null, codebook_version: LAYER_VERSION }),
  JSON.stringify(tp('e5')),
);
check(
  "T3. the stored version is the layer codebook's, not the episode codebook's",
  tp('e6')?.codebook_version === LAYER_VERSION && stored.episodes.every((e) => e.codebook_version === '2.0.0'),
  `tutor_prompting.codebook_version=${tp('e6')?.codebook_version}; episode codebook_version=2.0.0`,
);
check(
  'T4. episodes that are not items carry no tutor_prompting, and a stale one is removed',
  ['e1', 'e3', 'e4'].every((id) => !('tutor_prompting' in (stored.episodes.find((e) => e.episode_id === id) ?? {}))),
  'e1, e3, e4 have no tutor_prompting key',
);
check(
  'T5. a classifiable item with no label refuses rather than storing a null',
  throws(() => withTutorPrompting(run, items, new Map([['t2', 'NONE']]), LAYER_VERSION)) !== '',
  throws(() => withTutorPrompting(run, items, new Map([['t2', 'NONE']]), LAYER_VERSION)),
);
check(
  'T6. every stored move is one of the five codes or null',
  stored.episodes.every((e) => !e.tutor_prompting || e.tutor_prompting.tutor_move === null || codes.has(e.tutor_prompting.tutor_move)),
  [...codes].join(', '),
);

const marksFile: MovesMarks = {
  session_id: 'check-moves-tmp',
  codebook_version: LAYER_VERSION,
  annotator_id: 'tutor-chk',
  simulated: false,
  created_at: '2026-09-18T00:00:00Z',
  marks: { t2: 'NONE' },
};
const marksPath = 'data/live/runs/check-moves-tmp.moves.json';
saveMovesMarks(marksFile);
const readBack = loadMovesMarks('check-moves-tmp');
const wroteWhere = exists(marksPath);
rmSync(resolve(REPO_ROOT, marksPath), { force: true });
check(
  'T7. tutor marks live in their own file per session and read back unchanged',
  wroteWhere && JSON.stringify(readBack) === JSON.stringify(marksFile),
  `${marksPath} written=${wroteWhere}, round trip equal=${JSON.stringify(readBack) === JSON.stringify(marksFile)} (removed after)`,
);
const unsafe = throws(() => saveMovesMarks({ ...marksFile, session_id: '../escape' }));
check(
  'T8. a session id that is not safe as a file name never reaches the file system',
  unsafe !== '' && throws(() => loadMovesMarks('../escape')) !== '',
  unsafe,
);

// --- the layer's agreement -------------------------------------------------

const MOVES = ['PROMPTING_SELF_EXPLANATION', 'PROMPTING_SELF_CORRECTION', 'GIVING_ANSWER', 'OTHER_TUTOR_MOVE', 'NONE'];

/** A session whose model run labels `modelMoves.length` items. */
function labelled(id: string, index: number, modelMoves: string[], markMoves: Array<string | undefined> | null, version = LAYER_VERSION): MovesAgreementInput {
  const episodes = modelMoves.map((move, i) => ({
    ...episode(`${id}-e${i + 1}`, 'analysis', `${id}-t${2 * i + 2}`, `${id}-t${2 * i + 2}`),
    tutor_prompting: { preceding_turn_id: `${id}-t${2 * i + 1}`, preceding_speaker: 'Tutor', tutor_move: move, codebook_version: version },
  }));
  const marks: Record<string, string> = {};
  (markMoves ?? []).forEach((m, i) => {
    if (m !== undefined) marks[`${id}-t${2 * i + 1}`] = m;
  });
  return {
    session_id: id,
    session_index: index,
    modelEpisodes: episodes,
    marks: markMoves === null ? null : { session_id: id, codebook_version: LAYER_VERSION, annotator_id: 'tutor-chk', simulated: false, created_at: '2026-09-18T00:00:00Z', marks },
  };
}

const cycle = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => MOVES[(i + offset) % MOVES.length]!);

// A. No tutor marks anywhere: unmeasured.
const A = movesAgreement([labelled('a1', 1, cycle(8), null), labelled('a2', 2, cycle(8), null)]);
check(
  'A. no tutor marks: unmeasured, with a reason and no number',
  A.state === 'unmeasured' && A.value === null && A.refusal?.reason === 'no_annotation_run',
  `state=${A.state} value=${A.value} refusal=${A.refusal?.reason}`,
);

// B. Sixteen items, identical labels across five codes: shown.
const B = movesAgreement([labelled('b1', 1, cycle(8), cycle(8)), labelled('b2', 2, cycle(8, 3), cycle(8, 3))]);
check(
  'B. full agreement over 16 items: shown',
  B.state === 'shown' && B.value === 1 && B.n_turns === 16 && B.measured,
  `state=${B.state} value=${B.value} n=${B.n_turns} band=${B.band} per_session=${(B.per_session ?? []).map((p) => `${p.session_id}:${p.state}:${p.value}`).join(' ')}`,
);
check(
  'B2. per-code counts cover the compared codes',
  Object.keys(B.per_code ?? {}).sort().join(',') === [...MOVES].sort().join(','),
  JSON.stringify(B.per_code),
);

// C. Sixteen items where half the marks disagree: measured, below threshold, suppressed.
const half = (moves: string[]) => moves.map((m, i) => (i % 2 === 0 ? m : MOVES[(MOVES.indexOf(m) + 1) % MOVES.length]!));
const C = movesAgreement([labelled('c1', 1, cycle(8), half(cycle(8))), labelled('c2', 2, cycle(8, 2), half(cycle(8, 2)))]);
check(
  'C. low agreement over 16 items: measured and suppressed',
  C.measured && C.state === 'suppressed' && C.value !== null && C.value < config.agreement.threshold && C.refusal === null,
  `state=${C.state} value=${C.value?.toFixed(3)} band=${C.band} threshold=${C.threshold}`,
);

// D. Marks exist but too few items: refused, and suppressed rather than unmeasured.
const D = movesAgreement([labelled('d1', 1, cycle(3), cycle(3))]);
check(
  'D. too few items: refused with a reason, suppressed (marks exist), no number',
  D.state === 'suppressed' && D.value === null && D.refusal?.reason === 'too_few_turns' && D.per_session?.[0]?.refusal?.reason === 'too_few_turns',
  `pooled: ${D.refusal?.detail}; session: ${D.per_session?.[0]?.refusal?.detail}`,
);

// E. A tutor who marks every item with one code: degenerate, refused.
const E = movesAgreement([labelled('e1', 1, cycle(8), Array(8).fill('OTHER_TUTOR_MOVE')), labelled('e2', 2, cycle(8), Array(8).fill('OTHER_TUTOR_MOVE'))]);
check(
  'E. a single code throughout: refused as degenerate, never a kappa',
  E.state === 'suppressed' && E.value === null && E.refusal?.reason === 'degenerate_single_code',
  `${E.refusal?.detail}`,
);

// F. Marks under another layer codebook version are refused for that session and kept out of the pool.
const F = movesAgreement([
  labelled('f1', 1, cycle(8), cycle(8)),
  labelled('f2', 2, cycle(8), cycle(8), '0.9.0'),
  labelled('f3', 3, cycle(8, 1), cycle(8, 1)),
]);
const f2 = F.per_session?.find((p) => p.session_id === 'f2');
check(
  'F. a codebook version mismatch is refused per session and left out of the pool',
  f2?.refusal?.reason === 'codebook_version_mismatch' && F.n_turns === 16 && F.state === 'shown',
  `f2: ${f2?.refusal?.detail}; pooled n=${F.n_turns}`,
);

// G. Unmarked items are left out, not counted as a class.
const G = movesAgreement([labelled('g1', 1, cycle(10), [...cycle(8), undefined, undefined]), labelled('g2', 2, cycle(10), cycle(8))]);
check(
  'G. items the tutor has not marked are not compared',
  G.n_turns === 16 && !Object.keys(G.per_code ?? {}).some((k) => !MOVES.includes(k)),
  `20 model labels, 16 marks: n=${G.n_turns}`,
);

// H. Marks exist but the model has not classified anything: suppressed, not unmeasured.
const H = movesAgreement([labelled('h1', 1, [], ['NONE'])]);
check(
  'H. marks with no model labels: suppressed with a reason, not unmeasured',
  H.state === 'suppressed' && H.refusal?.reason === 'too_few_turns' && H.n_turns === 0,
  `state=${H.state} ${H.refusal?.detail}`,
);

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All Layer 2 checks passed.');
