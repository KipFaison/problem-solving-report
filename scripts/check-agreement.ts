// The S6 done criterion (PLAN-gate0 §2): unequal lengths, a single-code run
// and a short comparison each refuse rather than return a number, and the
// three states of §5.4 are reachable.
//
// Hand-built sequences, because the point of this slice is the refusals, and a
// refusal is easiest to trust on input small enough to check by hand. The κ in
// case E is worked out in the report that accompanies this script.
import { agreementKappa } from '../src/agreement/kappa.ts';
import { NOT_PROBLEM_SOLVING, computeAgreement } from '../src/agreement/gate.ts';
import type { Episode, Run, Session, Turn } from '../src/contract/types.ts';
import { config } from '../src/config.ts';

let failures = 0;

function check(name: string, ok: boolean, detail: string): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  console.log(`      ${detail}`);
}

function session(id: string, index: number, turnCount: number): Session {
  const turns: Turn[] = Array.from({ length: turnCount }, (_, i) => ({
    _id: String(i),
    session_id: id,
    sequence_id: i + 1,
    role: i % 2 === 0 ? 'Tutor' : 'Student',
    content: `turn ${i + 1}`,
    turn_id: `${id}-t${String(i + 1).padStart(3, '0')}`,
  }));
  return {
    session_id: id,
    student_id: 'stu-001',
    session_index: index,
    session_date: '2026-09-0' + index,
    has_timestamps: false,
    transcript_scope: 'full',
    turns,
  };
}

function run(id: string, kind: Run['kind'], simulated: boolean): Run {
  return {
    run_id: id,
    kind,
    simulated,
    model: kind === 'llm' ? config.model.id : null,
    prompt_hash: null,
    annotator_id: kind === 'human' ? 'annotator-001' : null,
    codebook_version: '2.0.0',
    domain: config.codebook.domain,
    created_at: '2026-09-17T00:00:00Z',
  };
}

/** Consecutive equal labels grouped into the episodes those labels describe. */
function tile(r: Run, s: Session, labels: string[]): Episode[] {
  const episodes: Episode[] = [];
  let start = 0;
  for (let i = 1; i <= labels.length; i++) {
    if (i < labels.length && labels[i] === labels[start]) continue;
    const code = labels[start];
    const first = s.turns[start];
    const last = s.turns[i - 1];
    if (code === undefined || first === undefined || last === undefined) {
      throw new Error(`fixture: ${labels.length} labels for ${s.turns.length} turns of ${s.session_id}`);
    }
    episodes.push({
      _id: String(episodes.length),
      episode_id: `ep-${r.run_id}-${s.session_id}-${String(episodes.length + 1).padStart(3, '0')}`,
      run_id: r.run_id,
      identifiedBy: r.kind === 'human' ? 'HUMAN' : 'AI',
      layer_id: 'episodes',
      codebook_version: r.codebook_version,
      domain: r.domain,
      EPISODE: code,
      start_turn_id: first.turn_id,
      end_turn_id: last.turn_id,
      evidence: s.turns.slice(start, i).map((turn) => turn.turn_id),
      reviewer_id: null,
      reviewed_at: null,
    });
    start = i;
  }
  return episodes;
}

const A = 'analysis';
const P = 'planning';
const repeat = (code: string, n: number): string[] => Array.from({ length: n }, () => code);

const human = run('run-human-001', 'human', true);
const llm = run('run-llm-001', 'llm', false);

console.log(`threshold:            ${config.agreement.threshold}`);
console.log(`minTurnsForAgreement: ${config.agreement.minTurnsForAgreement}`);
console.log('');
console.log('--- the wrapper (src/agreement/kappa.ts) ---');

// A. Unequal lengths. Under tiling this cannot happen, so it is a backstop;
// upstream answers it with 0, which reads as chance agreement (D-023).
const mismatch = agreementKappa(repeat(A, 120), repeat(P, 119));
check(
  'A. unequal lengths refuse, naming both lengths',
  !mismatch.measured && mismatch.reason === 'length_mismatch',
  mismatch.measured ? `returned ${mismatch.value}` : `${mismatch.reason}: ${mismatch.detail}`,
);

// B. One code across every turn, both runs: upstream's perfect 1 (:37).
const bothSingle = agreementKappa(repeat(A, 120), repeat(A, 120));
check(
  'B. a single code in both runs refuses (upstream returns 1 here)',
  !bothSingle.measured && bothSingle.reason === 'degenerate_single_code',
  bothSingle.measured ? `returned ${bothSingle.value}` : `${bothSingle.reason}: ${bothSingle.detail}`,
);

// C. One code in one run only: two distinct codes overall, so upstream
// computes a number; §5.4 refuses it anyway.
const oneSingle = agreementKappa([...repeat(A, 60), ...repeat(P, 60)], repeat(A, 120));
check(
  'C. a single code in one run refuses',
  !oneSingle.measured && oneSingle.reason === 'degenerate_single_code',
  oneSingle.measured ? `returned ${oneSingle.value}` : `${oneSingle.reason}: ${oneSingle.detail}`,
);

// D. Fewer turns than the configured minimum.
const short = agreementKappa([...repeat(A, 40), ...repeat(P, 40)], [...repeat(A, 44), ...repeat(P, 36)]);
check(
  'D. fewer turns than the minimum refuses',
  !short.measured && short.reason === 'too_few_turns',
  short.measured ? `returned ${short.value}` : `${short.reason}: ${short.detail}`,
);

// E. The hand-checked case. 120 turns; 108 agree; each run uses each code 60
// times, so expected agreement is 0.5 and κ is (0.9 - 0.5) / (1 - 0.5) = 0.8.
const handA = [...repeat(A, 60), ...repeat(P, 60)];
const handB = [...repeat(A, 54), ...repeat(P, 6), ...repeat(A, 6), ...repeat(P, 54)];
const hand = agreementKappa(handA, handB);
check(
  'E. a known kappa is returned unchanged, with the vendored band',
  hand.measured && Math.abs(hand.value - 0.8) < 1e-12 && hand.band === 'Substantial',
  hand.measured
    ? `n=${hand.n_turns} value=${hand.value} band=${hand.band} (hand: Po=0.9, Pe=0.5, k=0.8)`
    : `${hand.reason}: ${hand.detail}`,
);

console.log('');
console.log('--- the gate (src/agreement/gate.ts) ---');

// F. shown. The same 120 labels as case E, split across two sessions to
// exercise pooling in session_index order, plus a third session that only the
// annotation run tiles, which is out of the pool rather than an error.
const s1 = session('s01', 1, 60);
const s2 = session('s02', 2, 60);
const s3 = session('s03', 3, 60);
const shown = computeAgreement({
  sessions: [s2, s1, s3],
  annotationRun: {
    run: human,
    episodes: [
      ...tile(human, s1, handA.slice(0, 60)),
      ...tile(human, s2, handA.slice(60)),
      ...tile(human, s3, repeat(A, 60)),
    ],
  },
  llmRun: {
    run: llm,
    episodes: [...tile(llm, s1, handB.slice(0, 60)), ...tile(llm, s2, handB.slice(60))],
  },
});
check(
  'F. state shown when the pooled value reaches the threshold',
  shown.state === 'shown' && shown.measured && shown.n_turns === 120 && shown.value !== null && Math.abs(shown.value - 0.8) < 1e-12,
  `state=${shown.state} n_turns=${shown.n_turns} value=${shown.value} band=${shown.band} simulated=${shown.simulated} refusal=${shown.refusal}`,
);
const agreedTurns = Object.values(shown.per_code ?? {}).reduce((sum, code) => sum + code.agreed, 0);
check(
  'F2. per-code counts are computed for the internal view',
  agreedTurns === 108,
  `${JSON.stringify(shown.per_code)} — agreed turns total ${agreedTurns} of ${shown.n_turns}`,
);
check(
  'F3. the gate composes no sentence',
  shown.statement === '',
  `statement=${JSON.stringify(shown.statement)} (the view writes the words, §5.6)`,
);

// G. suppressed. 84 of 120 agree, same marginals, so κ = (0.7 - 0.5) / 0.5 = 0.4.
const s4 = session('s04', 1, 120);
const suppressedB = [...repeat(A, 42), ...repeat(P, 18), ...repeat(A, 18), ...repeat(P, 42)];
const suppressed = computeAgreement({
  sessions: [s4],
  annotationRun: { run: human, episodes: tile(human, s4, handA) },
  llmRun: { run: llm, episodes: tile(llm, s4, suppressedB) },
});
check(
  'G. state suppressed when the pooled value is below the threshold',
  suppressed.state === 'suppressed' && suppressed.measured && suppressed.value !== null && suppressed.value < config.agreement.threshold,
  `state=${suppressed.state} n_turns=${suppressed.n_turns} value=${suppressed.value} band=${suppressed.band} (hand: Po=0.7, Pe=0.5, k=0.4)`,
);

// H. unmeasured, because there is no annotation run. Not a failure (§7.1).
const noRun = computeAgreement({
  sessions: [s4],
  annotationRun: null,
  llmRun: { run: llm, episodes: tile(llm, s4, suppressedB) },
});
check(
  'H. state unmeasured when there is no annotation run',
  noRun.state === 'unmeasured' && !noRun.measured && noRun.value === null && noRun.refusal?.reason === 'no_annotation_run',
  `state=${noRun.state} value=${noRun.value} compared_runs=${noRun.compared_runs} refusal=${noRun.refusal?.reason}`,
);

// I. suppressed, because the wrapper refused a degenerate comparison. An
// annotation run exists, so this is not `unmeasured`: INTENT.md reserves that
// state for the absence of one ("Three states").
const degenerate = computeAgreement({
  sessions: [s4],
  annotationRun: { run: human, episodes: tile(human, s4, handA) },
  llmRun: { run: llm, episodes: tile(llm, s4, repeat(A, 120)) },
});
check(
  'I. state suppressed when the wrapper refuses, with the reason kept',
  degenerate.state === 'suppressed' && !degenerate.measured && degenerate.value === null && degenerate.refusal?.reason === 'degenerate_single_code',
  `state=${degenerate.state} value=${degenerate.value} n_turns=${degenerate.n_turns} refusal=${degenerate.refusal?.reason}: ${degenerate.refusal?.detail}`,
);

// J. suppressed, because too few turns were compared.
const s5 = session('s05', 1, 80);
const tooShort = computeAgreement({
  sessions: [s5],
  annotationRun: { run: human, episodes: tile(human, s5, [...repeat(A, 40), ...repeat(P, 40)]) },
  llmRun: { run: llm, episodes: tile(llm, s5, [...repeat(A, 44), ...repeat(P, 36)]) },
});
check(
  'J. state suppressed when fewer turns than the minimum are compared',
  tooShort.state === 'suppressed' && tooShort.value === null && tooShort.refusal?.reason === 'too_few_turns',
  `state=${tooShort.state} value=${tooShort.value} refusal=${tooShort.refusal?.reason}: ${tooShort.refusal?.detail}`,
);

// K. A run that tiles part of a session is broken data, not a gap to fill.
let thrown = '';
try {
  computeAgreement({
    sessions: [s4],
    annotationRun: { run: human, episodes: tile(human, s4, handA) },
    llmRun: { run: llm, episodes: tile(llm, s4, suppressedB).slice(0, 2) },
  });
} catch (error) {
  thrown = error instanceof Error ? error.message : String(error);
}
check(
  'K. an uncovered turn raises rather than scoring a partial tiling',
  thrown.includes('does not tile'),
  thrown === '' ? 'returned a number for a partial tiling' : thrown,
);

// L. A tutor marks only the problem-solving work. The turns left unmarked, and
// the turns the model gave a code outside the five, are one class together, so
// a tutor who marked the analysis and left the rest agrees with a model that
// called the rest reading.
const R = 'reading';
const tutorPart = tile(human, s4, [...repeat(A, 60), ...repeat(P, 60)]).slice(0, 1);
const modelFull = tile(llm, s4, [...repeat(A, 60), ...repeat(R, 60)]);
let partial: ReturnType<typeof computeAgreement> | null = null;
let partialError = '';
try {
  partial = computeAgreement({
    sessions: [s4],
    annotationRun: { run: human, episodes: tutorPart },
    llmRun: { run: llm, episodes: modelFull },
  });
} catch (error) {
  partialError = error instanceof Error ? error.message : String(error);
}
check(
  'L. an annotation that marks only problem-solving work is scored, not refused',
  partial !== null && partial.value === 1 && partial.state === 'shown',
  partial ? `value=${partial.value} state=${partial.state} n_turns=${partial.n_turns}` : `threw: ${partialError}`,
);
const codesCompared = Object.keys(partial?.per_code ?? {}).sort();
check(
  "L2. the model's non-process codes and the tutor's unmarked turns are one class",
  codesCompared.join(',') === ['analysis', 'not_problem_solving'].join(','),
  `classes compared: ${codesCompared.join(', ')}`,
);

console.log('');
console.log('--- what a tutor was shown (SPEC D18) ---');

// M. A run that records its shown turns is compared on those turns only. The
// same 120 labels as case E sit in the first 120 turns of a 160-turn session;
// the tutor was shown those 120. The model calls the other 40 analysis, which
// the tutor never saw and so left unmarked: compared, they would all be
// disagreements, and the value would not be 0.8.
const s6 = session('s06', 1, 160);
const firstTurns = (s: Session, n: number): string[] => s.turns.slice(0, n).map((turn) => turn.turn_id);
const shownRun = (turnIds: string[]): Run => ({
  ...human,
  shown: {
    mode: 'sample',
    turn_ids: turnIds,
    problem_ids: ['s06-p01'],
    sampling: { problems_per_session: config.sampling.problemsPerSession, seed: config.sampling.seed },
  },
});
const sampled = shownRun(firstTurns(s6, 120));
const modelOverAll = tile(llm, s6, [...handB, ...repeat(A, 40)]);
const onShown = computeAgreement({
  sessions: [s6],
  annotationRun: { run: sampled, episodes: tile(sampled, s6, handA) },
  llmRun: { run: llm, episodes: modelOverAll },
});
check(
  'M. only the shown turns are compared: n_turns is the shown count, the rest ignored',
  onShown.measured && onShown.n_turns === 120 && onShown.value !== null && Math.abs(onShown.value - 0.8) < 1e-12,
  `n_turns=${onShown.n_turns} of ${s6.turns.length} value=${onShown.value} (hand, over the 120 shown: k=0.8)`,
);

// N. The same markings with no shown record: the whole session was shown, so
// every turn is compared, as before D18, and the 40 turns the model called
// analysis count against the tutor's unmarked ones.
const whole = computeAgreement({
  sessions: [s6],
  annotationRun: { run: human, episodes: tile(human, s6, handA) },
  llmRun: { run: llm, episodes: modelOverAll },
});
const everyTurnKappa = agreementKappa(
  [...handA, ...repeat(NOT_PROBLEM_SOLVING, 40)],
  [...handB, ...repeat(A, 40)],
);
check(
  'N. a run with no shown record compares every turn, as before',
  whole.measured &&
    everyTurnKappa.measured &&
    whole.n_turns === 160 &&
    whole.value !== null &&
    Math.abs(whole.value - everyTurnKappa.value) < 1e-12,
  `n_turns=${whole.n_turns} value=${whole.value} (the wrapper over all 160: ${everyTurnKappa.measured ? everyTurnKappa.value : everyTurnKappa.reason})`,
);

// O. The floors count shown turns. 80 shown turns of the 160 is below the
// pooled floor, so the comparison is refused, although the session is long
// enough.
const fewShown = shownRun(firstTurns(s6, 80));
const tooFewShown = computeAgreement({
  sessions: [s6],
  annotationRun: { run: fewShown, episodes: tile(fewShown, s6, [...repeat(A, 40), ...repeat(P, 40)]) },
  llmRun: { run: llm, episodes: modelOverAll },
});
check(
  'O. fewer shown turns than the minimum refuses, however long the session',
  tooFewShown.state === 'suppressed' &&
    tooFewShown.value === null &&
    tooFewShown.refusal?.reason === 'too_few_turns' &&
    tooFewShown.n_turns === 80,
  `state=${tooFewShown.state} n_turns=${tooFewShown.n_turns} of ${s6.turns.length} refusal=${tooFewShown.refusal?.reason}: ${tooFewShown.refusal?.detail}`,
);

// P. A marking on a turn the tutor was not shown is broken data: it raises
// rather than being dropped from the comparison.
let outsideThrown = '';
try {
  computeAgreement({
    sessions: [s6],
    annotationRun: { run: fewShown, episodes: tile(fewShown, s6, handA) },
    llmRun: { run: llm, episodes: modelOverAll },
  });
} catch (error) {
  outsideThrown = error instanceof Error ? error.message : String(error);
}
check(
  'P. a marking outside the shown turns raises rather than being clipped',
  outsideThrown.includes('shown turns do not include'),
  outsideThrown === '' ? 'returned a number' : outsideThrown,
);

// Q. The model still tiles the whole session, shown or not.
let unshownGap = '';
try {
  computeAgreement({
    sessions: [s6],
    annotationRun: { run: sampled, episodes: tile(sampled, s6, handA) },
    llmRun: { run: llm, episodes: modelOverAll.slice(0, -1) },
  });
} catch (error) {
  unshownGap = error instanceof Error ? error.message : String(error);
}
check(
  'Q. a model gap in turns the tutor was not shown still raises',
  unshownGap.includes('does not tile'),
  unshownGap === '' ? 'returned a number for a partial tiling' : unshownGap,
);

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed: every refusal refuses, and all three states are reachable.');
