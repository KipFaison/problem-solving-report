// yarn generate:demo — builds the three simulated demo sets of SPEC-gate0 §8.
//
// Three sets exist because there are three states in §5.4 to render: one where
// the agreement gate lets the layer surface, one where it suppresses it, and
// one where there is no annotation run to compare against at all. The first
// two are built the same way and differ only in how much noise is injected
// into the simulated annotation run.
import { codebookVersion } from '../src/codebook/load.ts';
import { AGREEMENT_THRESHOLD } from '../src/config.ts';
import { fixturePath } from '../src/generator/fixture.ts';
import { buildSet, type DemoSetSpec } from '../src/generator/sets.ts';

// --pool-lines: build every session from the pool lines in
// src/generator/dialogue.ts, ignoring any stored model-written file. It is how
// the plan files are refreshed before `yarn write:dialogue` when the plan has
// changed and the stored files no longer match it.
const poolLines = process.argv.slice(2).includes('--pool-lines');

// [OURS: seeds, session lengths and noise parameters. The lengths clear the
// session gate (40 turns) with one deliberate exception, and the two sets with
// an annotation run clear the agreement minimum (100 turns) pooled. The noise
// parameters were tuned by running this script, not derived from anything. The
// seeds were chosen the same way: the first ones under which every code in the
// codebook gets planted somewhere in the set, so no code is missing from a
// demo report's per-code breakdown.]
const SPECS: DemoSetSpec[] = [
  {
    setId: 'demo-a',
    seed: 20260102,
    intendedState: 'shown',
    // Two of these sessions are spent on two problems rather than one, so the
    // report has to show a session that is not a single stretch of work.
    sessions: [
      { turns: 52, hasTimestamps: true },
      { turns: 72, hasTimestamps: true, problems: 2 },
      { turns: 46, hasTimestamps: false },
      { turns: 80, hasTimestamps: true, problems: 2 },
    ],
    noise: { boundaryShiftProbability: 0.35, maxBoundaryShift: 1, relabelProbability: 0.06 },
    // [OURS: owner decision 2026-09-18, SPEC D19. The three sessions that arrive
    // with a simulated annotation run and a model run use pool lines, which
    // follow the planted plan that annotation run is built from; the stored
    // model-written lines drifted from it. The fourth, annotated live, keeps
    // its model-written lines. Pool lines can repeat within a session.]
    poolLineSessions: ['demo-a-s01', 'demo-a-s02', 'demo-a-s03'],
  },
  {
    setId: 'demo-b',
    seed: 20260106,
    intendedState: 'suppressed',
    sessions: [
      { turns: 56, hasTimestamps: true },
      { turns: 48, hasTimestamps: true },
      { turns: 60, hasTimestamps: false },
      { turns: 50, hasTimestamps: true },
    ],
    noise: { boundaryShiftProbability: 0.7, maxBoundaryShift: 2, relabelProbability: 0.55 },
  },
  {
    setId: 'demo-c',
    seed: 20260104,
    intendedState: 'unmeasured',
    sessions: [
      { turns: 54, hasTimestamps: true },
      // Under the session gate on purpose, so the gate has a case to refuse.
      { turns: 22, hasTimestamps: true },
      { turns: 46, hasTimestamps: false },
      { turns: 58, hasTimestamps: true },
    ],
    noise: null,
  },
];

let wrongSide = 0;

console.log(`codebook ${codebookVersion()}, agreement threshold ${AGREEMENT_THRESHOLD}\n`);

for (const spec of SPECS) {
  const built = buildSet(spec, { poolLines });
  const intendedSide = built.noise === null ? 'n/a (no annotation run)' : spec.intendedState === 'shown' ? `at or above ${AGREEMENT_THRESHOLD}` : `below ${AGREEMENT_THRESHOLD}`;

  console.log(`${built.setId}  seed ${built.seed}  → intended state "${built.intendedState}"`);
  console.log(
    `  sessions ${built.sessionCount} (${built.sessionTurnCounts.join(', ')} turns, ${built.turnCount} pooled), ` +
      `${built.sessionsWithoutTimestamps} without timestamps`,
  );
  console.log(`  annotation run: ${built.runId ?? 'none — this is what renders "unmeasured"'}`);
  console.log(`  intended side of the threshold: ${intendedSide}`);

  if (built.noise !== null) {
    console.log(
      `  noise: boundary shift p=${built.noise.boundaryShiftProbability} max ${built.noise.maxBoundaryShift} turn(s), ` +
        `relabel p=${built.noise.relabelProbability}`,
    );
  }
  if (built.noiseCheck !== null) {
    const check = built.noiseCheck;
    if (!check.measured) {
      wrongSide += 1;
      console.log(`  noise check refused: ${check.reason} — ${check.detail}`);
    } else {
      const lands = check.value >= AGREEMENT_THRESHOLD ? 'at or above' : 'below';
      const asIntended = (check.value >= AGREEMENT_THRESHOLD) === (spec.intendedState === 'shown');
      if (!asIntended) wrongSide += 1;
      console.log(
        `  noise check (run against the planted plan, not the §5.4 figure): kappa ${check.value.toFixed(3)} ` +
          `over ${check.n_turns} turns — ${lands} the threshold, ${asIntended ? 'as intended' : 'NOT as intended'}`,
      );
    }
  }
  const modelWritten = built.sessionSchedules.filter((entry) => entry.lines === 'model').length;
  console.log(`  dialogue: ${modelWritten} session(s) model-written, ${built.sessionCount - modelWritten} from pool lines`);
  for (const entry of built.sessionSchedules) {
    if (entry.poolChosen) {
      console.log(`  ${entry.sessionId}: pool lines chosen for it by the set spec (SPEC D19)`);
    } else if (entry.lines === 'pool') {
      const why = poolLines ? '--pool-lines given' : `no stored dialogue at ${fixturePath(entry.sessionId)}`;
      console.warn(`  WARNING ${entry.sessionId}: pool lines used (${why}); its lines can repeat`);
    }
  }
  console.log(`  ${built.fileCount} files under data/demo/${built.setId}/\n`);
}

console.log(
  'The figure above is the noise that was injected, measured against the planted plan.\n' +
    "SPEC §5.4's kappa compares the annotation run with the LLM run and is computed elsewhere;\n" +
    'these two coincide only to the extent the pipeline recovers the plan, which is untested.',
);

if (wrongSide > 0) {
  console.error(`\n${wrongSide} set(s) landed on the wrong side of the threshold. Retune the noise.`);
  process.exit(1);
}
