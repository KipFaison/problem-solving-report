// `yarn build:standin` — reports the interface can be tested against before a
// model has ever run.
//
// The second set of episodes every report needs is normally the LLM run. This
// script was written for when there was none, before a model had run. Rather
// than write generated episodes into a run labelled `llm` and let a reader
// assume a model produced them, each run here carries `stand_in` with its
// reason, and every surface that renders it says so.
//
// The reports in data/out are now built by `yarn pipeline <set-id>
// --source=...`, which overwrites a stand-in. The reverse is refused: this
// script exits without writing if an existing report's source run has a
// model, since that report costs model calls to rebuild. [OURS]
import { readJson, writeJson, exists } from '../src/storage/index.ts';
import { loadCodebookForSession, codebookVersion } from '../src/codebook/load.ts';
import { assembleReport } from '../src/pipeline/report.ts';
import { Prng } from '../src/generator/prng.ts';
import { perturb } from '../src/generator/perturb.ts';
import type { Tiling } from '../src/generator/plan.ts';
import { config } from '../src/config.ts';
import type { Episode, Report, Run, Session } from '../src/contract/types.ts';

const REASON =
  'These stretches were generated, not read from the session by a model or marked by a person.';

/**
 * How far the stand-in departs from the planted plan. The annotation run has
 * already departed from it too, so what the gate sees is roughly the two
 * errors combined; a set that is meant to render `shown` needs a stand-in that
 * stays close. This is the demo being built to render all three states of
 * §5.4 (D1, D6), not a result being arranged: the kappa is computed over the
 * two runs like any other.
 */
const NOISE = {
  shown: { boundaryShiftProbability: 0.12, maxBoundaryShift: 1, relabelProbability: 0.02 },
  suppressed: { boundaryShiftProbability: 0.5, maxBoundaryShift: 2, relabelProbability: 0.18 },
};

interface SetFile {
  set_id: string;
  intended_state?: 'shown' | 'suppressed' | 'unmeasured';
  student_id: string;
  data_provenance: { status: 'synthetic' | 'authentic'; ui_label: string };
  sessions: Array<{ session_id: string; file: string; plan_file: string }>;
  runs?: Array<{ run_id: string; kind: string; file: string }>;
  generator: { seed: number };
}

interface PlanFile {
  session_id: string;
  episodes: Array<{ ordinal: number; code: string; turns: number }>;
}

function episodesFrom(session: Session, tiling: Tiling, runId: string): Episode[] {
  const episodes: Episode[] = [];
  let index = 0;
  tiling.forEach((span, i) => {
    const turns = session.turns.slice(index, index + span.turns);
    const first = turns[0];
    const last = turns[turns.length - 1];
    if (!first || !last) throw new Error(`${session.session_id}: plan overruns the transcript`);
    episodes.push({
      _id: String(i),
      episode_id: `ep-${runId}-${session.session_id}-${String(i + 1).padStart(3, '0')}`,
      run_id: runId,
      identifiedBy: 'AI',
      layer_id: 'episodes',
      codebook_version: codebookVersion(),
      domain: config.codebook.domain,
      EPISODE: span.code,
      start_turn_id: first.turn_id,
      end_turn_id: last.turn_id,
      evidence: turns.map((t) => t.turn_id),
      reviewer_id: null,
      reviewed_at: null,
    });
    index += span.turns;
  });
  if (index !== session.turns.length) {
    throw new Error(`${session.session_id}: stand-in covers ${index} of ${session.turns.length} turns`);
  }
  return episodes;
}

for (const setId of ['demo-a', 'demo-b', 'demo-c']) {
  const setDir = `${config.paths.demoDir}/${setId}`;
  if (!exists(`${setDir}/set.json`)) continue;

  const outPath = `${config.paths.outputDir}/${setId}/report.json`;
  if (exists(outPath)) {
    const existing = readJson<Report>(outPath);
    const source = existing.runs.find((r) => r.run_id === existing.source_run_id);
    if (!source || source.model !== null) {
      const what = source ? `was built from model ${source.model}` : `names source run ${existing.source_run_id}, which it does not contain`;
      console.error(`${outPath} ${what}; refusing to overwrite it with a stand-in. Nothing written for ${setId} or later sets.`);
      process.exit(1);
    }
  }

  const set = readJson<SetFile>(`${setDir}/set.json`);
  const sessions = set.sessions.map((s) => readJson<Session>(`${setDir}/${s.file}`));
  const runId = `run-standin-${setId}-001`;
  // A different seed from the annotation run, so the two disagree on their own
  // terms rather than by construction.
  const rng = new Prng(set.generator.seed + 7919);
  const episodes: Episode[] = [];

  set.sessions.forEach((entry, i) => {
    const session = sessions[i];
    if (!session) return;
    const plan = readJson<PlanFile>(`${setDir}/${entry.plan_file}`);
    const codes = loadCodebookForSession(session.has_timestamps).codes;
    const noise = set.intended_state === 'shown' ? NOISE.shown : NOISE.suppressed;
    const tiling = perturb(
      plan.episodes.map((e) => ({ code: e.code, turns: e.turns })),
      codes,
      noise,
      rng,
    );
    episodes.push(...episodesFrom(session, tiling, runId));
  });

  const standInRun: Run = {
    run_id: runId,
    kind: 'llm',
    simulated: true,
    model: null,
    prompt_hash: null,
    annotator_id: null,
    codebook_version: codebookVersion(),
    domain: config.codebook.domain,
    created_at: new Date().toISOString(),
    stand_in: { reason: REASON },
  };

  const annotationEntry = (set.runs ?? []).find((r) => r.kind === 'human');
  const annotationRun = annotationEntry
    ? readJson<Run & { episodes: Episode[] }>(`${setDir}/${annotationEntry.file}`)
    : null;

  const report = assembleReport({
    studentId: set.student_id,
    sessions,
    llm: { run: standInRun, episodes },
    annotation: annotationRun ? { run: annotationRun, episodes: annotationRun.episodes } : null,
    sourceRunId: runId,
    uiLabel: set.data_provenance.ui_label,
    status: set.data_provenance.status,
    // No model has run, so no summary exists. The view says so rather than
    // showing an empty space (§6 step 5, D10).
    summary: '',
    claims: [],
  });

  writeJson(outPath, report);
  const a = report.agreement;
  const figure = a.value !== null ? `kappa ${a.value.toFixed(3)} (${a.band}) over ${a.n_turns} turns` : (a.refusal?.reason ?? 'not computed');
  console.log(`${setId}: ${a.state.padEnd(10)} ${figure}`);
}
