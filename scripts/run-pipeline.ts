// `yarn pipeline <set-id> --source=llm|human`
//
// Runs the LLM episode pipeline over a demo set (or any set laid out the same
// way), computes the two gates, writes a report. The API key comes from .env
// via node --env-file; it is never written into a file by this project.
import { readJson, writeJson, exists } from '../src/storage/index.ts';
import { loadCodebookForSession, codebookVersion, problemProcessCodes } from '../src/codebook/load.ts';
import { segmentSession } from '../src/pipeline/segment.ts';
import { summarise } from '../src/pipeline/summarise.ts';
import { assembleReport, aggregatesFor, sessionGate } from '../src/pipeline/report.ts';
import { UsageLog } from '../src/pipeline/usage.ts';
import { config } from '../src/config.ts';
import type { Episode, Run, Session } from '../src/contract/types.ts';

interface SetFile {
  set_id: string;
  student_id: string;
  data_provenance: { status: 'synthetic' | 'authentic'; ui_label: string };
  intended_state?: string;
  sessions: Array<{ session_id: string; file: string }>;
  runs?: Array<{ run_id: string; kind: string; file: string }>;
}

const [setId, ...flags] = process.argv.slice(2);
if (!setId) {
  console.error('usage: yarn pipeline <set-id> [--source=llm|human]');
  process.exit(1);
}

const sourceFlag = flags.find((f) => f.startsWith('--source='))?.split('=')[1];
const setDir = `${config.paths.demoDir}/${setId}`;
if (!exists(`${setDir}/set.json`)) {
  console.error(`no set at ${setDir}/set.json`);
  process.exit(1);
}

const set = readJson<SetFile>(`${setDir}/set.json`);
const sessions: Session[] = set.sessions.map((s) => readJson<Session>(`${setDir}/${s.file}`));

// The annotation run, if this set has one. A set without one renders the
// unmeasured state (§5.4), which is the whole point of demo-c.
const annotationEntry = (set.runs ?? []).find((r) => r.kind === 'human');
const annotationRun = annotationEntry
  ? readJson<Run & { episodes: Episode[] }>(`${setDir}/${annotationEntry.file}`)
  : null;

// Explicit, never defaulted (PLAN P7). With only one run there is only one answer.
// Checked before any model call, so a missing flag costs nothing.
const sourceKind = sourceFlag ?? (annotationRun ? null : 'llm');
if (!sourceKind) {
  console.error('this set has both an annotation run and an LLM run: pass --source=llm or --source=human');
  process.exit(1);
}

const runId = `run-llm-${setId}-001`;
const usage = new UsageLog();
const llmEpisodes: Episode[] = [];
let promptHash: string | null = null;

console.log(`${setId}: ${sessions.length} sessions, ${sessions.reduce((n, s) => n + s.turns.length, 0)} turns`);
console.log(`model ${config.model.id}\n`);

for (const session of sessions) {
  const composed = loadCodebookForSession(session.has_timestamps);
  const allowed = new Set(composed.codes.map((c) => c.code));
  process.stdout.write(`  ${session.session_id} (${session.turns.length} turns, ${allowed.size} codes) … `);

  const result = await segmentSession(session, runId, codebookVersion(), config.codebook.domain, allowed);
  llmEpisodes.push(...result.episodes);
  usage.record('segment', result.usage, session.session_id);
  promptHash ??= result.prompt_hash;

  const cached = result.usage.cache_read_input_tokens;
  console.log(`${result.episodes.length} episodes · in ${result.usage.input_tokens} · cache read ${cached}`);
}

const llmRun: Run = {
  run_id: runId,
  kind: 'llm',
  simulated: set.data_provenance.status === 'synthetic',
  model: config.model.id,
  prompt_hash: promptHash,
  annotator_id: null,
  codebook_version: codebookVersion(),
  domain: config.codebook.domain,
  created_at: new Date().toISOString(),
};

const sourceRunId = sourceKind === 'human' && annotationRun ? annotationRun.run_id : runId;
const sourceEpisodes = sourceRunId === runId ? llmEpisodes : (annotationRun?.episodes ?? []);

// The session gate first (§5.5). A session below the floor is not reportable,
// so its episodes must not reach the summary call either — otherwise a claim
// comes back citing a session the report does not show, which is what the
// validator caught the first time this ran.
const gate = sessionGate(sessions);
const reportableIds = new Set(gate.sessions.filter((s) => s.reportable).map((s) => s.session_id));
const reportableSessions = sessions.filter((s) => reportableIds.has(s.session_id));
const excluded = sessions.length - reportableSessions.length;
if (excluded > 0) {
  console.log(`\n  ${excluded} session(s) below the ${gate.min_turns}-turn floor, left out of the summary`);
}

// Only the five problem-solving codes reach the summary; the other four are
// for segmenting and are never shown to a reader (INTENT.md, D17).
const processCodes = problemProcessCodes();
const aggregate = aggregatesFor(
  reportableSessions,
  sourceEpisodes.filter((e) => processCodes.has(e.EPISODE)),
);
const episodeIndex = aggregate.sessions.flatMap((s) =>
  s.measures.map((m) => ({
    episode_id: m.episode_id,
    code: m.code,
    session_index: s.session_index,
    turns: m.turns,
  })),
);

process.stdout.write('\n  summary … ');
const summary = await summarise(aggregate, episodeIndex);
usage.record('summarise', summary.usage);
console.log(`${summary.claims.length} claims kept, ${summary.dropped.length} dropped by the wording lint`);
for (const d of summary.dropped) console.log(`    dropped: ${d.reason}`);

const report = assembleReport({
  studentId: set.student_id,
  sessions,
  llm: { run: llmRun, episodes: llmEpisodes },
  annotation: annotationRun ? { run: annotationRun, episodes: annotationRun.episodes } : null,
  sourceRunId,
  uiLabel: set.data_provenance.ui_label,
  status: set.data_provenance.status,
  summary: summary.summary,
  claims: summary.claims,
});

report.runs = report.runs.map((r) => (r.run_id === runId ? { ...r, usage: usage.toRunUsage() } : r));

const out = `${config.paths.outputDir}/${setId}/report.json`;
writeJson(out, report);
writeJson(`${config.paths.outputDir}/${setId}/run-${runId}.json`, { ...llmRun, usage: usage.toRunUsage(), episodes: llmEpisodes });

const a = report.agreement;
console.log(`\n  agreement: ${a.state}${a.value !== null ? ` (kappa ${a.value.toFixed(3)}, ${a.band}, ${a.n_turns} turns)` : ` — ${a.refusal?.reason ?? 'not computed'}`}`);
console.log(`  source run: ${sourceRunId}`);
console.log(`  tokens: ${usage.summarise()}`);
console.log(`  wrote ${out}`);
