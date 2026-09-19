// `node --experimental-strip-types scripts/reassemble-out.ts`
//
// Rebuilds data/out/<set>/report.json for each demo set that has one, without
// calling a model.
//
// Why: on 2026-09-18 the owner decided that a tutor marks only the five
// problem-solving codes and may leave turns unmarked, and the gate now compares
// six classes: those five, and "not problem solving" for everything else
// (src/agreement/gate.ts). The stored reports were assembled under the old
// nine-class comparison, against annotation runs carrying all nine codes, so
// their stored agreement no longer matches a recompute and `yarn validate`
// rejects them.
//
// No model is called, and that is legitimate because nothing a model produced
// changes:
//   - the model's run is kept exactly as stored in data/out/<set>/run-*.json,
//     and the script refuses to go on if that file and the stored report
//     disagree about it;
//   - the summary and the claims are kept as stored. They were written from
//     aggregates over the model run's episodes in the reportable sessions
//     (scripts/run-pipeline.ts), and neither the agreement nor the annotation
//     run is among their inputs. The script refuses a report whose source run
//     is not the model run, since its claims would then rest on the annotation
//     run being replaced;
//   - the transcripts are the ones the model read: the script refuses to go on
//     if the regenerated data/demo/<set>/sessions differ from the stored ones.
// What does change is computed in code: the annotation run, taken from the
// regenerated data/demo/<set>/runs/ (the simulated annotator now marks only the
// five codes, src/generator/sets.ts); the agreement, recomputed by the gate;
// and the provenance card, in the wording src/pipeline/report.ts
// `assembleReport` writes today.
import { readJson, writeJson, exists } from '../src/storage/index.ts';
import { assembleReport } from '../src/pipeline/report.ts';
import { config } from '../src/config.ts';
import type { Episode, Report, Run, Session } from '../src/contract/types.ts';

interface SetFile {
  set_id: string;
  student_id: string;
  sessions: Array<{ session_id: string; file: string }>;
  runs?: Array<{ run_id: string; kind: string; file: string }>;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function describe(report: Report): string {
  const a = report.agreement;
  return a.value === null
    ? `${a.state} (${a.refusal?.reason ?? 'no value'})`
    : `${a.state} ${a.value.toFixed(3)} over ${a.n_turns} turns`;
}

let failed = false;

for (const setId of ['demo-a', 'demo-b', 'demo-c']) {
  const setDir = `${config.paths.demoDir}/${setId}`;
  const outDir = `${config.paths.outputDir}/${setId}`;
  if (!exists(`${outDir}/report.json`)) {
    console.log(`${setId}: no stored report, nothing to rebuild`);
    continue;
  }

  const refuse = (why: string): void => {
    console.error(`${setId}: not rebuilt. ${why}`);
    failed = true;
  };

  const stored = readJson<Report>(`${outDir}/report.json`);
  const set = readJson<SetFile>(`${setDir}/set.json`);

  const storedModel = stored.runs.find((run) => run.kind === 'llm');
  if (!storedModel) {
    refuse('the stored report carries no model run');
    continue;
  }
  if (stored.source_run_id !== storedModel.run_id) {
    refuse(`the stored report was generated from ${stored.source_run_id}, not the model run, so its claims rest on the annotation run being replaced`);
    continue;
  }

  const runFile = `${outDir}/run-${storedModel.run_id}.json`;
  if (!exists(runFile)) {
    refuse(`${runFile} does not exist`);
    continue;
  }
  const { episodes: modelEpisodes, ...modelRun } = readJson<Run & { episodes: Episode[] }>(runFile);
  const storedModelEpisodes = stored.sessions.flatMap((session) =>
    (session.annotations ?? []).filter((episode) => episode.run_id === storedModel.run_id),
  );
  if (!same(modelRun, storedModel) || !same(modelEpisodes, storedModelEpisodes)) {
    refuse(`${runFile} and the stored report disagree about the model run`);
    continue;
  }

  const sessions = set.sessions.map((entry) => readJson<Session>(`${setDir}/${entry.file}`));
  const storedSessions = stored.sessions.map(({ annotations: _annotations, ...session }) => session);
  if (!same(sessions, storedSessions)) {
    refuse(`the transcripts under ${setDir}/sessions differ from the ones the model read`);
    continue;
  }

  const annotationEntry = (set.runs ?? []).find((run) => run.kind === 'human');
  const annotationRun = annotationEntry
    ? readJson<Run & { episodes: Episode[] }>(`${setDir}/${annotationEntry.file}`)
    : null;

  const report = assembleReport({
    studentId: stored.student_id,
    sessions,
    llm: { run: modelRun, episodes: modelEpisodes },
    annotation: annotationRun ? { run: annotationRun, episodes: annotationRun.episodes } : null,
    sourceRunId: stored.source_run_id,
    uiLabel: stored.data_provenance.ui_label,
    status: stored.data_provenance.status,
    summary: stored.summary,
    claims: stored.claims,
  });

  // The promise above, checked on the output rather than assumed.
  const rebuiltModel = report.runs.find((run) => run.run_id === storedModel.run_id);
  const rebuiltModelEpisodes = report.sessions.flatMap((session) =>
    (session.annotations ?? []).filter((episode) => episode.run_id === storedModel.run_id),
  );
  if (!same(rebuiltModel, storedModel) || !same(rebuiltModelEpisodes, storedModelEpisodes)) {
    refuse('the rebuilt report does not carry the model run exactly as stored');
    continue;
  }

  writeJson(`${outDir}/report.json`, report);
  const marked = annotationRun ? `${annotationRun.run_id}, ${annotationRun.episodes.length} episodes` : 'none';
  console.log(`${setId}: agreement ${describe(stored)} -> ${describe(report)}`);
  console.log(`  annotation run: ${marked}`);
  console.log(`  model run ${storedModel.run_id} kept as stored, ${modelEpisodes.length} episodes`);
  console.log(`  summary and ${stored.claims.length} claims kept as stored`);
  console.log(`  wrote ${outDir}/report.json`);
}

if (failed) process.exitCode = 1;
