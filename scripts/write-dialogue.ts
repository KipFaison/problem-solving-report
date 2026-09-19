// `yarn write:dialogue [set-id ...] [--force]`
//
// Writes each demo session's lines with one model call, from the planted
// per-turn schedule in its plan file (data/demo/<set>/plans/<session>.plan.json),
// and stores them under src/generator/dialogue/ so that `yarn generate:demo`
// gives the same transcript every time without calling a model. A session whose
// stored file matches its schedule is skipped unless --force is given.
//
// Run `yarn generate:demo --pool-lines` first whenever the plan has changed:
// the plan files it writes are what this reads.
//
// [OURS: model-written demo dialogue. The writer is told each turn's planted
// code, but nothing here checks that a line fits it (docs/DEVIATIONS.md D-034).
// The checks below are about shape and repetition only.]
import { loadCodebook, promptView } from '../src/codebook/load.ts';
import { config } from '../src/config.ts';
import type { CallUsage } from '../src/contract/types.ts';
import { PROBLEMS, type Problem } from '../src/generator/dialogue.ts';
import { fixturePath, scheduleHash, type DialogueFixture, type ScheduleEntry } from '../src/generator/fixture.ts';
import { call } from '../src/pipeline/client.ts';
import { promptHash } from '../src/pipeline/prompt.ts';
import { zeroUsage } from '../src/pipeline/usage.ts';
import { exists, listDirs, listJson, readJson, writeJson } from '../src/storage/index.ts';

interface PlanFile {
  set_id: string;
  session_id: string;
  schedule_hash?: string;
  schedule?: ScheduleEntry[];
}

// [OURS: at most this many calls in flight, so a full rewrite of every set does
// not hit the API with a dozen requests at once.]
const CONCURRENCY = 4;
// [OURS: a length at which a line stops reading as something said aloud in one
// turn. Checked in code, not left to the prompt.]
const MAX_LINE_CHARS = 280;
// Well above the answer, since thinking is charged against the same allowance
// (client.ts), and under the SDK's ceiling for a call that does not stream.
const MAX_TOKENS = 20000;

const LINES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'text'],
        properties: {
          index: { type: 'integer' },
          text: { type: 'string' },
        },
      },
    },
  },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const unknownFlags = args.filter((arg) => arg.startsWith('--') && arg !== '--force');
if (unknownFlags.length > 0) {
  console.error(`unknown option(s): ${unknownFlags.join(', ')}\nusage: yarn write:dialogue [set-id ...] [--force]`);
  process.exit(1);
}
const requestedSets = args.filter((arg) => !arg.startsWith('--'));
const allSets = listDirs(config.paths.demoDir);
const missingSets = requestedSets.filter((setId) => !allSets.includes(setId));
if (missingSets.length > 0) {
  console.error(`no set ${missingSets.join(', ')} under ${config.paths.demoDir}/. Run "yarn generate:demo --pool-lines" first.`);
  process.exit(1);
}
const setIds = requestedSets.length > 0 ? requestedSets : allSets;

// ------------------------------------------------------------------ the prompt

/**
 * What each code means, from the loader and nothing else (CLAUDE.md rule 10).
 * The whole codebook, not only the codes a session uses, so the block is the
 * same in every call and is served from cache after the first.
 */
function codebookBlock(): string {
  return [
    'CODEBOOK. The kinds of work a turn in the schedule can belong to. Each schedule entry names one',
    'of these codes. The line written for that turn should sound like that kind of work, as described',
    'here. Never name a code, or say which kind of work a line is.',
    '',
    JSON.stringify(promptView(loadCodebook()), null, 2),
  ].join('\n');
}

/** The same in every call. Rules about the lines, none of them about what a code means. */
const RULES = [
  'You are writing the dialogue of a simulated tutoring session for a software demo. It is one-to-one',
  'and online. There are two speakers: TUTOR, and STUDENT_1, a middle-school student. Both speak',
  'aloud.',
  '',
  'You are given the problem or problems the session is spent on, and a schedule with one entry per',
  'turn, in order. Each entry gives the turn index, turn_id, the speaker (role), the kind of work the',
  'turn belongs to (code, from the codebook), the problem the turn is on (problem_topic), and a cue',
  'or null.',
  '',
  'Write exactly one line per turn, in order, spoken by that turn\'s role.',
  '',
  'Rules:',
  '1. One line per schedule entry: the same number of lines as entries, and each line\'s index is its',
  '   entry\'s index, from 0 upward with none skipped.',
  '2. Each line sounds like its code\'s kind of work, as the codebook describes it, without naming',
  '   the code.',
  '3. The mathematics is correct. It moves forward step by step, and no step is done twice: a line',
  '   builds on what has already been said about its problem.',
  '4. Most lines are one or two short sentences, the way people talk out loud. No line is longer',
  `   than ${MAX_LINE_CHARS} characters.`,
  '5. Lines about the mathematics stay on their turn\'s problem_topic. Where problem_topic changes,',
  '   the session moves on to that problem at that turn.',
  '6. No line repeats another line in the session, or nearly repeats it. Short replies and',
  '   acknowledgements are varied too.',
  '7. No names, and no personal details about anyone.',
  '8. Cues. With a cue of null, the line only follows rules 1 to 7. Otherwise:',
  '   - handoff (a TUTOR turn): the line closes the earlier work and asks for nothing new.',
  '   - opening (a STUDENT_1 turn): the line turns to the new kind of work without doing it yet.',
  '   - follow (a TUTOR turn): the line lets that new work go on.',
  '',
  'Answer with JSON only, no prose, in this shape:',
  '{"lines":[{"index":0,"text":"<line>"},{"index":1,"text":"<line>"}]}',
].join('\n');

function problemView(problem: Problem): Record<string, string> {
  return {
    topic: problem.topic,
    statement: problem.statement,
    given: problem.given,
    plan: problem.plan,
    firstStep: problem.firstStep,
    result: problem.result,
    check: problem.check,
    probe: problem.probe,
  };
}

function sessionInstruction(sessionId: string, schedule: readonly ScheduleEntry[], problems: Problem[]): string {
  return [
    `SESSION ${sessionId}: ${schedule.length} turns, ${problems.length} problem(s).`,
    '',
    'PROBLEMS, in the order the session takes them. Besides the statement, each carries notes for you:',
    'given (what the statement gives, put together), plan (a route to the answer), firstStep (the',
    'first step of that route), result (the answer), check (a check of the answer against the',
    'statement), probe (something to try out). Use them to keep the mathematics right; do not read',
    'them out word for word.',
    '',
    ...problems.map((problem) => JSON.stringify(problemView(problem), null, 2)),
    '',
    'SCHEDULE, one entry per turn:',
    ...schedule.map((entry) => JSON.stringify(entry)),
    '',
    `Write the ${schedule.length} lines now, indices 0 to ${schedule.length - 1}.`,
  ].join('\n');
}

// ------------------------------------------------------------------ the checks

interface ProposedLine {
  index: number;
  text: string;
}

function parseLines(text: string): ProposedLine[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('the answer held no JSON object');
  const parsed = JSON.parse(text.slice(start, end + 1)) as { lines?: ProposedLine[] };
  if (!Array.isArray(parsed.lines)) throw new Error('the answer held no "lines" array');
  return parsed.lines;
}

/** What two lines are compared on: lower case, with punctuation and whitespace removed. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[\p{P}\s]/gu, '');
}

/** The lines, trimmed; throws the reason when they fail. Rejects rather than repairs. */
function checkLines(proposed: ProposedLine[], turns: number): string[] {
  if (proposed.length !== turns) throw new Error(`${proposed.length} lines for ${turns} turns`);
  const seen = new Map<string, number>();
  return proposed.map((line, position) => {
    if (line.index !== position) throw new Error(`line ${position} carries index ${line.index}; indices must run 0 to ${turns - 1} in order`);
    const text = line.text.trim();
    if (text === '') throw new Error(`line ${position} is empty`);
    if (text.length > MAX_LINE_CHARS) throw new Error(`line ${position} is ${text.length} characters, over ${MAX_LINE_CHARS}`);
    const key = normalise(text);
    const earlier = seen.get(key);
    if (earlier !== undefined) throw new Error(`line ${position} repeats line ${earlier}: "${text}"`);
    seen.set(key, position);
    return text;
  });
}

// ------------------------------------------------------------------ one session

function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  };
}

async function writeSession(plan: PlanFile & { schedule: ScheduleEntry[] }, hash: string): Promise<string> {
  const { session_id: sessionId, schedule } = plan;
  const topics = [...new Set(schedule.map((entry) => entry.problem_topic))];
  const problems = topics.map((topic) => {
    const problem = PROBLEMS.find((candidate) => candidate.topic === topic);
    if (!problem) throw new Error(`no problem "${topic}" in src/generator/dialogue.ts PROBLEMS`);
    return problem;
  });

  const blocks = [codebookBlock(), RULES];
  const base = sessionInstruction(sessionId, schedule, problems);
  let usage = zeroUsage();
  let calls = 0;
  let failure: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const instruction =
      failure === null
        ? base
        : `${base}\n\nAn earlier answer for this session was rejected: ${failure}. Write all ${schedule.length} lines again and fix that.`;
    const result = await call({ cacheablePrefix: blocks, instruction, maxTokens: MAX_TOKENS, schema: LINES_SCHEMA });
    calls += 1;
    usage = addUsage(usage, result.usage);
    try {
      const lines = checkLines(parseLines(result.text), schedule.length);
      const fixture: DialogueFixture = {
        $comment:
          '[OURS: model-written demo dialogue, simulated and not from any real session. Written by ' +
          'scripts/write-dialogue.ts in one call from the planted per-turn schedule in ' +
          `data/demo/${plan.set_id}/plans/${sessionId}.plan.json, and used by src/generator/sets.ts only ` +
          'while schedule_hash matches that schedule. The writer was told each turn\'s planted code; ' +
          'nothing checks that a line fits it (docs/DEVIATIONS.md D-034).]',
        session_id: sessionId,
        schedule_hash: hash,
        model: config.model.id,
        prompt_hash: promptHash(blocks, instruction),
        created_at: new Date().toISOString(),
        lines,
      };
      writeJson(fixturePath(sessionId), fixture);
      return (
        `${sessionId}  ${schedule.length} turns · ${calls} call(s) · in ${usage.input_tokens} · out ${usage.output_tokens} · ` +
        `cache write ${usage.cache_creation_input_tokens} · cache read ${usage.cache_read_input_tokens} → ${fixturePath(sessionId)}`
      );
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      console.log(`  ${sessionId}: attempt ${attempt} rejected: ${failure}`);
    }
  }
  throw new Error(
    `rejected twice, last for: ${failure} (${calls} calls · in ${usage.input_tokens} · out ${usage.output_tokens} · ` +
      `cache write ${usage.cache_creation_input_tokens} · cache read ${usage.cache_read_input_tokens}); nothing written`,
  );
}

// ------------------------------------------------------------------ the run

const jobs: Array<{ sessionId: string; run: () => Promise<string> }> = [];
let current = 0;

for (const setId of setIds) {
  for (const path of listJson(`${config.paths.demoDir}/${setId}/plans`)) {
    const plan = readJson<PlanFile>(path);
    const schedule = plan.schedule;
    if (schedule === undefined) {
      console.error(`${path} has no schedule. Run "yarn generate:demo --pool-lines" first.`);
      process.exit(1);
    }
    const hash = scheduleHash(schedule);
    if (hash !== plan.schedule_hash) {
      console.error(`${path}: its schedule_hash does not match its schedule. Run "yarn generate:demo --pool-lines" again.`);
      process.exit(1);
    }
    const stored = exists(fixturePath(plan.session_id)) ? readJson<DialogueFixture>(fixturePath(plan.session_id)) : null;
    if (!force && stored !== null && stored.schedule_hash === hash && stored.lines.length === schedule.length) {
      current += 1;
      continue;
    }
    jobs.push({ sessionId: plan.session_id, run: () => writeSession({ ...plan, schedule }, hash) });
  }
}

console.log(
  `model ${config.model.id} · sets ${setIds.join(', ')} · ${jobs.length} session(s) to write, ` +
    `${current} already current${force ? ' (--force: rewriting all)' : ''}\n`,
);

const failed: string[] = [];
let next = 0;
const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
  while (next < jobs.length) {
    const job = jobs[next]!;
    next += 1;
    try {
      console.log(`  ${await job.run()}`);
    } catch (error) {
      failed.push(job.sessionId);
      console.error(`  ERROR ${job.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
await Promise.all(workers);

if (failed.length > 0) {
  console.error(`\n${failed.length} session(s) not written: ${failed.join(', ')}`);
  process.exit(1);
}
if (jobs.length > 0) {
  console.log('\nNext: "yarn generate:demo" to rebuild the sets with these lines, then "yarn pipeline <set-id>".');
}
