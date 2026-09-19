// `yarn seed:live` — the state the site opens in.
//
// Three sessions arrive already annotated by a simulated annotator, with the
// model genuinely run on them, so there is something to look at straight away.
// The fourth is left untouched, so the loop can be walked from the beginning:
// annotate it, save, generate, watch the agreement change.
//
// The transcripts and the starting annotations are simulated. Every
// computation performed on them afterwards is real.
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { readJson, writeJson, exists } from '../src/storage/index.ts';
import { REPO_ROOT } from '../src/config.ts';
import { config } from '../src/config.ts';
import { joinTouching } from '../src/pipeline/segment.ts';
import type { Episode, Report, Run, Session } from '../src/contract/types.ts';

const SOURCE = `${config.paths.demoDir}/demo-a`;
const OUT = `${config.paths.outputDir}/demo-a/report.json`;
const ANNOTATED = 3;

interface SetFile {
  student_id: string;
  data_provenance: { status: 'synthetic' | 'authentic'; ui_label: string };
  sessions: Array<{ session_id: string; file: string }>;
  runs?: Array<{ run_id: string; kind: string; file: string }>;
}

if (!exists(`${SOURCE}/set.json`)) {
  console.error(`no demo data at ${SOURCE}. Run: yarn generate:demo`);
  process.exit(1);
}

if (process.argv.includes('--clean')) {
  // Uploaded transcripts and saved annotations go too: a reset returns the
  // workspace to exactly the state it opens in.
  rmSync(resolve(REPO_ROOT, 'data/live'), { recursive: true, force: true });
}

const set = readJson<SetFile>(`${SOURCE}/set.json`);
const sessions = set.sessions.map((s) => readJson<Session>(`${SOURCE}/${s.file}`));

const humanEntry = (set.runs ?? []).find((r) => r.kind === 'human');
const humanRun = humanEntry ? readJson<Run & { episodes: Episode[] }>(`${SOURCE}/${humanEntry.file}`) : null;
const report = exists(OUT) ? readJson<Report>(OUT) : null;

if (!humanRun) {
  console.error('the demo set has no annotation run to seed from');
  process.exit(1);
}

const turnsOf = (session: Session) => new Set(session.turns.map((t) => t.turn_id));
const modelEpisodesFor = (session: Session): Episode[] => {
  const stored = report?.sessions.find((s) => s.session_id === session.session_id);
  const llmRunIds = new Set((report?.runs ?? []).filter((r) => r.kind === 'llm').map((r) => r.run_id));
  return (stored?.annotations ?? []).filter((e) => llmRunIds.has(e.run_id));
};

let annotated = 0;
let modelled = 0;
// Every session seeded with a simulated annotation is locked on the tutor side
// (SPEC D19): its annotation was built from the planted plan, so re-marking it
// live is not what the demo shows. The untouched session is where that is shown.
const locked: string[] = [];

for (const [index, session] of sessions.entries()) {
  writeJson(`data/live/sessions/${session.session_id}.json`, session);
  if (index >= ANNOTATED) continue;

  const ids = turnsOf(session);
  const mine = humanRun.episodes.filter((e) => ids.has(e.start_turn_id));
  if (mine.length > 0) {
    const runId = `run-human-${session.session_id}`;
    writeJson(`data/live/runs/${session.session_id}.human.json`, {
      ...humanRun,
      run_id: runId,
      annotator_id: 'simulated-annotator',
      episodes: mine.map((e) => ({ ...e, run_id: runId })),
    });
    annotated += 1;
    locked.push(session.session_id);
  }

  const model = modelEpisodesFor(session);
  if (model.length > 0) {
    const runId = `run-llm-${session.session_id}`;
    const source = (report?.runs ?? []).find((r) => r.kind === 'llm');
    // These runs were stored before touching same-code pieces were joined;
    // join them now, the way a fresh run would be, and keep the count.
    const { episodes, merged } = joinTouching(
      session,
      model.map((e) => ({ ...e, run_id: runId })),
    );
    writeJson(`data/live/runs/${session.session_id}.llm.json`, {
      ...source,
      run_id: runId,
      merged_adjacent: merged,
      episodes,
    });
    modelled += 1;
  }
}

writeJson('data/live/workspace.json', {
  student_id: set.student_id,
  session_ids: sessions.map((s) => s.session_id),
  data_provenance: set.data_provenance,
  locked_session_ids: locked,
});

console.log(`seeded data/live with ${sessions.length} sessions`);
console.log(`  ${annotated} carry a simulated annotation, and are locked on the tutor side`);
console.log(`  ${modelled} carry a model run`);
console.log(`  ${sessions.length - ANNOTATED} left untouched, for the loop to be walked from the start`);
// Generate is refused on a locked session, so one seeded without a model run
// cannot get one from the page.
const unread = locked.filter((id) => !exists(`data/live/runs/${id}.llm.json`));
if (unread.length > 0) {
  console.warn(`  ${unread.join(', ')} locked without a model run: run yarn pipeline demo-a, then seed again`);
}
