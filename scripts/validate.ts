// `yarn validate` — the data contract, enforced (docs/SPEC-gate0.md §9.1).
//
// The schemas in schema/ carry the shape. Everything a JSON Schema cannot
// express is here: duplicate ids, tiling, version mismatches, the
// agreement-gate consistency rules, the review-field rules, the claim-evidence
// rules and the learner-facing-number rule of D11. Every rejection names its
// rule and the id it is about; a rejection that does not say which episode is
// a rejection nobody can act on.
//
//   node --experimental-strip-types scripts/validate.ts [--self-check] [path...]
//
// With no path, every JSON file under the configured data directories is read
// and dispatched by its shape. With --self-check, the fixture suite of §9.1
// runs: the valid baseline must pass, each changed copy that is still valid
// must pass, and one deliberately broken copy per rule must be rejected with
// that rule's own message.
import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AGREEMENT_THRESHOLD, REPO_ROOT, config } from '../src/config.ts';
import { exists, listDirs, listJson, readJson } from '../src/storage/index.ts';
import { loadCodebook } from '../src/codebook/load.ts';
import { agreementKappa } from '../src/agreement/kappa.ts';
import { comparedLabels, type RunTiling } from '../src/agreement/gate.ts';
import type { Session } from '../src/contract/types.ts';
import { BASELINE_PATH, accepted, mutations } from '../test/fixtures/mutations.ts';

/** One rejection. `rule` is the §9.1 rule; `where` is the file it was found in. */
export interface Problem {
  rule: string;
  where: string;
  message: string;
}

// [OURS: kappa is recomputed here and compared against the stored value, so the
// comparison needs a tolerance. This is float noise, not a project threshold —
// the thresholds that mean something live in config/gate0.json.]
const KAPPA_EPSILON = 1e-9;

/** The rules whose defects make the gate refuse the runs outright. */
const SPAN_RULES = new Set([
  'episode.start_turn_not_in_session',
  'episode.end_turn_not_in_session',
  'episode.start_after_end',
  'episode.tiling_overlap',
  'episode.tiling_gap',
  'episode.outside_shown_turns',
]);

// The shapes below are the validator's own view of a file that has already
// passed its schema. They are deliberately not `src/contract/types.ts`: input
// here is untrusted JSON until ajv has seen it, and the schemas and that file
// disagree about where episodes live (see schema/report.schema.json and the
// slice report). Only the fields the rules touch are named.
interface TurnNode {
  turn_id: string;
  session_id: string;
  sequence_id: number;
  start_time?: string;
  end_time?: string;
}

interface EpisodeNode {
  episode_id: string;
  run_id: string;
  EPISODE: string;
  start_turn_id: string;
  end_turn_id: string;
  evidence: string[];
  reviewer_id?: string | null;
  reviewed_at?: string | null;
}

interface SessionNode {
  session_id: string;
  session_index: number;
  has_timestamps: boolean;
  transcript_scope: string;
  turns: TurnNode[];
  annotations?: EpisodeNode[];
}

interface RunNode {
  run_id: string;
  kind: 'llm' | 'human';
  simulated: boolean;
  codebook_version: string;
  domain: string;
  episodes?: unknown[];
  shown?: { turn_ids: string[] } | null;
}

interface AgreementNode {
  threshold: number;
  compared_runs: [string, string] | null;
  n_turns: number | null;
  value: number | null;
  band: string | null;
  measured: boolean;
  state: 'shown' | 'suppressed' | 'unmeasured';
  simulated: boolean;
  refusal: { reason: string; detail: string } | null;
  statement: string;
}

interface GateEntry {
  session_id: string;
  turn_count: number;
  reportable: boolean;
}

interface ReportNode {
  student_id: string;
  source_run_id: string;
  codebook_version: string;
  domain: string;
  sessions: SessionNode[];
  runs: RunNode[];
  agreement: AgreementNode;
  session_gate: { min_turns: number; sessions: GateEntry[] };
  claims: Array<{ claim_id: string; text: string; evidence_episode_ids: string[] }>;
  summary: string;
  provenance_card: string[];
}

// ---------------------------------------------------------------- schemas

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
for (const name of ['transcript', 'run', 'report']) {
  ajv.addSchema(readJson(`schema/${name}.schema.json`));
}

function compiled(name: string): ValidateFunction {
  const fn = ajv.getSchema(`https://reasoning-trajectory.local/schema/${name}.schema.json`);
  if (!fn) throw new Error(`schema/${name}.schema.json did not compile`);
  return fn;
}

const schemas = {
  report: compiled('report'),
  run: compiled('run'),
  transcript: compiled('transcript'),
};

function schemaProblems(kind: 'report' | 'run' | 'transcript', raw: unknown, where: string): Problem[] {
  const validate = schemas[kind];
  if (validate(raw)) return [];
  return (validate.errors ?? []).map((error: ErrorObject) => {
    const extra =
      error.params && 'additionalProperty' in error.params
        ? ` (\`${String(error.params.additionalProperty)}\`)`
        : '';
    return {
      rule: `schema.${kind}`,
      where,
      message: `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? 'is invalid'}${extra}`,
    };
  });
}

// ---------------------------------------------------------------- helpers

function repeated(values: Array<string | number>): Array<{ value: string | number; count: number }> {
  const counts = new Map<string | number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

/** Every episode in the report, with the session it sits in (SPEC §5.3). */
function episodesOf(report: ReportNode): Array<{ episode: EpisodeNode; session: SessionNode }> {
  return report.sessions.flatMap((session) =>
    (session.annotations ?? []).map((episode) => ({ episode, session })),
  );
}

/** Turn positions within one session, which is the order tiling is checked in. */
function turnIndex(session: SessionNode): Map<string, number> {
  return new Map(session.turns.map((turn, index) => [turn.turn_id, index]));
}

function numberNeedles(value: number): string[] {
  return [...new Set([String(value), value.toFixed(2), value.toFixed(3)])];
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------- the rules

export function validateReport(raw: unknown, where: string): Problem[] {
  const schemaErrors = schemaProblems('report', raw, where);
  // The cross-cutting rules read fields the schema has just guaranteed.
  // Running them over a file that failed the schema would report the same
  // defect twice, in worse words.
  if (schemaErrors.length > 0) return schemaErrors;

  const report = raw as ReportNode;
  const problems: Problem[] = [];
  const add = (rule: string, message: string) => problems.push({ rule, where, message });

  const allEpisodes = episodesOf(report);
  const runsById = new Map(report.runs.map((run) => [run.run_id, run]));
  const gateBySession = new Map(report.session_gate.sessions.map((entry) => [entry.session_id, entry]));

  // --- duplicate ids -------------------------------------------------------
  const duplicateChecks: Array<[string, string, Array<string | number>]> = [
    ['dup.session_id', 'session_id', report.sessions.map((s) => s.session_id)],
    ['dup.session_index', 'session_index', report.sessions.map((s) => s.session_index)],
    ['dup.turn_id', 'turn_id', report.sessions.flatMap((s) => s.turns.map((t) => t.turn_id))],
    ['dup.run_id', 'run_id', report.runs.map((r) => r.run_id)],
    ['dup.episode_id', 'episode_id', allEpisodes.map((e) => e.episode.episode_id)],
    ['dup.claim_id', 'claim_id', report.claims.map((c) => c.claim_id)],
  ];
  for (const [rule, field, values] of duplicateChecks) {
    for (const { value, count } of repeated(values)) {
      add(rule, `${field} \`${String(value)}\` appears ${count} times; ids are unique across the report`);
    }
  }

  // --- runs against the report --------------------------------------------
  for (const run of report.runs) {
    // A run file on disk may carry the tiling set it produced; inside a report
    // there is one place episodes live, or the rules below would run over one
    // copy while a reader looked at another.
    if (Array.isArray(run.episodes) && run.episodes.length > 0) {
      add(
        'report.episodes_outside_sessions',
        `run \`${run.run_id}\` inside this report carries ${run.episodes.length} episode(s); inside a report ` +
          `episodes are stored in sessions[].annotations[], one tiling set per run (SPEC §5.3). A standalone ` +
          `run file may carry them (schema/run.schema.json).`,
      );
    }
    if (run.codebook_version !== report.codebook_version) {
      add(
        'run.codebook_version_mismatch',
        `run \`${run.run_id}\` is stamped codebook_version \`${run.codebook_version}\`; the report is ` +
          `\`${report.codebook_version}\`. A run stamped with a different codebook version does not import (SPEC §4).`,
      );
    }
    if (run.domain !== report.domain) {
      add(
        'run.domain_mismatch',
        `run \`${run.run_id}\` is stamped domain \`${run.domain}\`; the report is \`${report.domain}\``,
      );
    }
  }

  // --- the codebook the episodes are read against --------------------------
  // The loader is the one place a code list comes from (SPEC §4). A run stamped
  // with a version the repo does not carry is refused once, per run, rather
  // than once per episode.
  const codebook = loadCodebook(report.domain);
  const knownCodes = new Map(codebook.codes.map((entry) => [entry.code, entry]));
  const unresolvedVersions = new Set<string>();
  for (const run of report.runs) {
    if (run.codebook_version !== codebook.codebook_version) {
      unresolvedVersions.add(run.run_id);
      add(
        'run.unknown_codebook_version',
        `run \`${run.run_id}\` is stamped codebook_version \`${run.codebook_version}\`; the repo carries ` +
          `\`${codebook.codebook_version}\`, so its codes cannot be resolved`,
      );
    }
  }

  // --- per episode ---------------------------------------------------------
  const indexBySession = new Map(report.sessions.map((session) => [session.session_id, turnIndex(session)]));
  for (const { episode, session } of allEpisodes) {
    const id = episode.episode_id;
    const index = indexBySession.get(session.session_id) ?? new Map<string, number>();
    const run = runsById.get(episode.run_id);

    if (!run) {
      add('episode.unknown_run', `episode \`${id}\` names run \`${episode.run_id}\`, which is not in runs[]`);
    }

    const startIndex = index.get(episode.start_turn_id);
    const endIndex = index.get(episode.end_turn_id);
    if (startIndex === undefined) {
      add(
        'episode.start_turn_not_in_session',
        `episode \`${id}\` starts at turn \`${episode.start_turn_id}\`, which is not a turn of session ` +
          `\`${session.session_id}\``,
      );
    }
    if (endIndex === undefined) {
      add(
        'episode.end_turn_not_in_session',
        `episode \`${id}\` ends at turn \`${episode.end_turn_id}\`, which is not a turn of session ` +
          `\`${session.session_id}\``,
      );
    }
    if (startIndex !== undefined && endIndex !== undefined) {
      if (startIndex > endIndex) {
        add(
          'episode.start_after_end',
          `episode \`${id}\` starts at turn \`${episode.start_turn_id}\` and ends at ` +
            `\`${episode.end_turn_id}\`, which comes before it`,
        );
      } else {
        const span = session.turns.slice(startIndex, endIndex + 1).map((turn) => turn.turn_id);
        const sameTurns =
          span.length === episode.evidence.length && span.every((id, at) => id === episode.evidence[at]);
        if (!sameTurns) {
          add(
            'episode.evidence_mismatch',
            `episode \`${id}\` covers ${span.length} turn(s) (\`${span[0]}\` to \`${span[span.length - 1]}\`) ` +
              `but its evidence lists ${episode.evidence.length}; evidence is exactly the span's turns, in order ` +
              `(SPEC §5.3)`,
          );
        }
      }
    }

    if (run && !unresolvedVersions.has(run.run_id)) {
      const entry = knownCodes.get(episode.EPISODE);
      if (!entry) {
        add(
          'episode.unknown_code',
          `episode \`${id}\` carries code \`${episode.EPISODE}\`, which is not in codebook ${run.codebook_version}`,
        );
      } else if (entry.requires_timestamps === true && !session.has_timestamps) {
        add(
          'episode.writing_without_timestamps',
          `episode \`${id}\` carries code \`${episode.EPISODE}\`, which the codebook flags requires_timestamps, ` +
            `in session \`${session.session_id}\`, which has none`,
        );
      }
    }

    for (const field of ['reviewer_id', 'reviewed_at'] as const) {
      if (!(field in episode)) {
        add(
          'episode.review_field_missing',
          `episode \`${id}\` has no \`${field}\`; the field is present and null in Gate 0 (SPEC §5.3)`,
        );
      } else if (episode[field] !== null) {
        add(
          'episode.review_field_not_null',
          `episode \`${id}\` carries \`${field}\` = ${JSON.stringify(episode[field])}; nothing in Gate 0 writes ` +
            `it (SPEC §5.3)`,
        );
      }
    }
  }

  // --- tiling, per run and session ----------------------------------------
  // A model run tiles every session it covers. An annotation run does not
  // have to: a tutor marks the problem-solving work and leaves the rest, and
  // the gate reads an unmarked turn as "not problem solving"
  // (src/agreement/gate.ts). No turn is in two episodes of one run, in either
  // kind of run. The coverage map is kept: the model run's labels for the
  // pooled turns are read out of it below.
  const labelled = new Map<string, Map<string, string>>();
  for (const session of report.sessions) {
    const index = indexBySession.get(session.session_id) ?? new Map<string, number>();
    const byRun = new Map<string, EpisodeNode[]>();
    for (const episode of session.annotations ?? []) {
      byRun.set(episode.run_id, [...(byRun.get(episode.run_id) ?? []), episode]);
    }

    for (const [runId, episodes] of byRun) {
      const cover: Array<EpisodeNode | null> = new Array(session.turns.length).fill(null);
      for (const episode of episodes) {
        const startIndex = index.get(episode.start_turn_id);
        const endIndex = index.get(episode.end_turn_id);
        if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) continue;
        for (let at = startIndex; at <= endIndex; at++) {
          const already = cover[at];
          const turn = session.turns[at];
          if (already && turn) {
            add(
              'episode.tiling_overlap',
              `run \`${runId}\`, session \`${session.session_id}\`: turn \`${turn.turn_id}\` is in both episode ` +
                `\`${already.episode_id}\` and episode \`${episode.episode_id}\`; no turn belongs to more than ` +
                `one episode of a run (SPEC §3, D4)`,
            );
          }
          cover[at] = episode;
        }
      }

      const uncovered = session.turns.filter((_, at) => cover[at] === null).map((turn) => turn.turn_id);
      if (uncovered.length > 0 && runsById.get(runId)?.kind !== 'human') {
        add(
          'episode.tiling_gap',
          `run \`${runId}\`, session \`${session.session_id}\`: ${uncovered.length} turn(s) belong to no episode ` +
            `(\`${uncovered[0]}\` to \`${uncovered[uncovered.length - 1]}\`); a model run's episodes tile the ` +
            `session (SPEC §3, D4). Only an annotation run may leave turns unmarked.`,
        );
      }

      const codes = labelled.get(runId) ?? new Map<string, string>();
      for (const [at, episode] of cover.entries()) {
        const turn = session.turns[at];
        if (turn && episode) codes.set(turn.turn_id, episode.EPISODE);
      }
      labelled.set(runId, codes);
    }
  }

  // --- what a tutor was shown ---------------------------------------------
  // An annotation run that records the turns its tutor was shown marks inside
  // them and nowhere else, and every turn it records is a turn of the report.
  // Agreement compares those turns only (INTENT.md, "What a tutor is shown";
  // SPEC D18), so a marking outside them, or a shown turn that is not there,
  // would change the figure without anyone having looked. No record means the
  // whole session was shown, and there is nothing to check.
  const reportTurns = new Set(report.sessions.flatMap((session) => session.turns.map((turn) => turn.turn_id)));
  for (const run of report.runs) {
    const shownIds = run.shown?.turn_ids;
    if (!shownIds) continue;
    const absent = shownIds.filter((turnId) => !reportTurns.has(turnId));
    if (absent.length > 0) {
      add(
        'run.shown_turn_not_in_session',
        `run \`${run.run_id}\` records ${absent.length} shown turn(s) that no session of this report has ` +
          `(first: \`${absent[0]}\`); a shown turn is a turn the tutor read, so it is a turn of the session`,
      );
    }
    const shown = new Set(shownIds);
    for (const { episode, session } of allEpisodes) {
      if (episode.run_id !== run.run_id) continue;
      const index = indexBySession.get(session.session_id) ?? new Map<string, number>();
      const startIndex = index.get(episode.start_turn_id);
      const endIndex = index.get(episode.end_turn_id);
      // A span that does not resolve is already refused by its own rule above.
      if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) continue;
      const outside = session.turns
        .slice(startIndex, endIndex + 1)
        .map((turn) => turn.turn_id)
        .filter((turnId) => !shown.has(turnId));
      if (outside.length > 0) {
        add(
          'episode.outside_shown_turns',
          `episode \`${episode.episode_id}\` of run \`${run.run_id}\` marks ${outside.length} turn(s) the ` +
            `run's shown turns do not include (first: \`${outside[0]}\`); a tutor marks only what they were ` +
            `shown, and nothing outside it is compared (SPEC D18)`,
        );
      }
    }
  }

  // --- timestamps ----------------------------------------------------------
  for (const session of report.sessions) {
    if (!session.has_timestamps) continue;
    const missing = session.turns.filter((turn) => !turn.start_time || !turn.end_time);
    const first = missing[0];
    if (first) {
      add(
        'session.timestamps_missing',
        `session \`${session.session_id}\` declares has_timestamps true, but ${missing.length} turn(s) lack ` +
          `start_time or end_time (first: \`${first.turn_id}\`). has_timestamps is true only when every turn has ` +
          `both (SPEC §5.8).`,
      );
    }
  }

  // --- the session gate ----------------------------------------------------
  for (const session of report.sessions) {
    const entry = gateBySession.get(session.session_id);
    if (!entry) {
      add('session_gate.missing_session', `session \`${session.session_id}\` has no session_gate entry`);
      continue;
    }
    if (entry.turn_count !== session.turns.length) {
      add(
        'session_gate.turn_count_mismatch',
        `session \`${session.session_id}\`: session_gate says ${entry.turn_count} turns, the transcript has ` +
          `${session.turns.length}`,
      );
    }
    const shouldBeReportable =
      entry.turn_count >= report.session_gate.min_turns &&
      session.transcript_scope === config.session.requiredTranscriptScope;
    if (entry.reportable !== shouldBeReportable) {
      add(
        'session_gate.reportable_inconsistent',
        `session \`${session.session_id}\`: reportable is ${entry.reportable}, but ${entry.turn_count} turns ` +
          `against min_turns ${report.session_gate.min_turns} and transcript_scope ` +
          `\`${session.transcript_scope}\` make it ${shouldBeReportable}`,
      );
    }
  }

  // The gate refuses a span outside its session, running backwards, or
  // overlapping another, and a model run with a gap. Each is already rejected
  // above under its own rule, so the recompute waits until the spans are sound
  // rather than reporting the same defect a second time.
  const spansSound = !problems.some((problem) => SPAN_RULES.has(problem.rule));
  problems.push(...agreementProblems(report, labelled, gateBySession, spansSound, where));

  // --- claims --------------------------------------------------------------
  const episodeById = new Map(allEpisodes.map((entry) => [entry.episode.episode_id, entry]));
  for (const claim of report.claims) {
    for (const episodeId of claim.evidence_episode_ids) {
      const found = episodeById.get(episodeId);
      if (!found) {
        add(
          'claim.evidence_unresolved',
          `claim \`${claim.claim_id}\` cites evidence \`${episodeId}\`, which is not an episode_id in this report`,
        );
        continue;
      }
      const entry = gateBySession.get(found.session.session_id);
      if (!entry || !entry.reportable) {
        add(
          'claim.evidence_non_reportable_session',
          `claim \`${claim.claim_id}\` cites episode \`${episodeId}\` in session ` +
            `\`${found.session.session_id}\`, which is not reportable`,
        );
      }
    }
  }

  problems.push(...crossStudyProblems(report, where));

  return problems;
}

/**
 * The state the stored figure calls for, or null when no state is legal.
 *
 * A null value is one of two things, and the refusal records which (INTENT.md,
 * "Three states", where none substitutes for another): no annotation run to
 * compare against, which is `unmeasured` and names no compared runs; or a
 * comparison that was attempted and refused, which is `suppressed`. A null
 * value with no refusal recorded is neither.
 */
function expectedState(agreement: AgreementNode): { state: AgreementNode['state'] | null; why: string } {
  const { value, threshold, refusal, compared_runs } = agreement;
  if (value !== null) {
    return { state: value >= threshold ? 'shown' : 'suppressed', why: `value ${value} against threshold ${threshold}` };
  }
  if (refusal === null) {
    return {
      state: null,
      why:
        'a null value and no refusal recorded; a null value is legal only as no annotation run (unmeasured) or ' +
        'as a refused comparison (suppressed), and the refusal says which',
    };
  }
  if (refusal.reason !== 'no_annotation_run') {
    return {
      state: 'suppressed',
      why:
        `a null value and the comparison refused (\`${refusal.reason}\`). A refused comparison is suppressed; ` +
        'unmeasured is reserved for no annotation run (INTENT.md)',
    };
  }
  if (compared_runs !== null) {
    return {
      state: null,
      why:
        `a refusal saying no annotation run exists, while compared_runs names \`${compared_runs[0]}\` and ` +
        `\`${compared_runs[1]}\``,
    };
  }
  return { state: 'unmeasured', why: 'a null value and no annotation run to compare against' };
}

/**
 * The agreement gate (§5.4), recomputed rather than trusted. The label
 * sequences come from the gate's own `comparedLabels`, so the six classes are
 * the gate's and not a second statement of them; the kappa is computed through
 * `src/agreement/kappa.ts`, which refuses the degenerate inputs, and a refused
 * input reported as a number is itself a rejection.
 */
function agreementProblems(
  report: ReportNode,
  labelled: Map<string, Map<string, string>>,
  gateBySession: Map<string, GateEntry>,
  spansSound: boolean,
  where: string,
): Problem[] {
  const problems: Problem[] = [];
  const add = (rule: string, message: string) => problems.push({ rule, where, message });
  const agreement = report.agreement;
  const student = report.student_id;

  if (agreement.threshold !== AGREEMENT_THRESHOLD) {
    add(
      'agreement.threshold_mismatch',
      `report for \`${student}\` carries agreement.threshold ${agreement.threshold}; ` +
        `config.agreement.threshold is ${AGREEMENT_THRESHOLD}`,
    );
  }

  if (agreement.measured && agreement.value === null) {
    add('agreement.measured_without_value', `report for \`${student}\`: measured is true with a null value`);
  }
  if (!agreement.measured && agreement.value !== null) {
    add(
      'agreement.measured_false_with_value',
      `report for \`${student}\`: measured is false with value ${agreement.value}`,
    );
  }

  if (agreement.state === 'unmeasured' && agreement.value !== null) {
    add(
      'agreement.unmeasured_with_value',
      `report for \`${student}\`: state is unmeasured with value ${agreement.value}. A refusal is never a ` +
        `number (SPEC §5.4).`,
    );
  } else if (agreement.state === 'shown' && agreement.value !== null && agreement.value < agreement.threshold) {
    add(
      'agreement.shown_below_threshold',
      `report for \`${student}\`: state is shown with value ${agreement.value}, below the threshold ` +
        `${agreement.threshold}`,
    );
  } else {
    const expected = expectedState(agreement);
    if (expected.state === null) {
      add('agreement.state_inconsistent', `report for \`${student}\`: state is \`${agreement.state}\`, with ${expected.why}`);
    } else if (agreement.state !== expected.state) {
      add(
        'agreement.state_inconsistent',
        `report for \`${student}\`: state is \`${agreement.state}\` with ${expected.why}; that is \`${expected.state}\``,
      );
    }
  }

  // The turns the kappa is computed over are those of the reportable sessions
  // (§5.4, D7). The model run labels every one of them; the annotation run
  // labels what it marks, and the gate reads the rest as "not problem solving".
  const reportable = report.sessions.filter((session) => gateBySession.get(session.session_id)?.reportable === true);
  const pooledTurns = reportable.flatMap((session) => session.turns.map((turn) => turn.turn_id));

  let recomputed: number | null = null;

  if (agreement.compared_runs === null) {
    if (agreement.value !== null) {
      add(
        'agreement.value_mismatch',
        `report for \`${student}\`: value ${agreement.value} with compared_runs null; there is nothing to ` +
          `recompute it over`,
      );
    }
  } else {
    const [firstRun, secondRun] = agreement.compared_runs;
    const named = [firstRun, secondRun].map((runId) => report.runs.find((run) => run.run_id === runId));
    const annotationRun = named.find((run) => run?.kind === 'human');
    const modelRun = named.find((run) => run?.kind === 'llm');

    let pairs: Array<{ annotation: string; llm: string }> | null = null;
    if (!annotationRun || !modelRun) {
      add(
        'agreement.compared_runs_kinds',
        `report for \`${student}\`: compared_runs names \`${firstRun}\` and \`${secondRun}\`; the comparison is ` +
          `between one annotation run and one model run, both in runs[] (SPEC §5.4)`,
      );
    } else {
      const codes = labelled.get(modelRun.run_id) ?? new Map<string, string>();
      const missing = pooledTurns.filter((turnId) => !codes.has(turnId));
      if (missing.length > 0) {
        add(
          'agreement.run_missing_labels',
          `model run \`${modelRun.run_id}\` is compared but leaves ${missing.length} of the ${pooledTurns.length} ` +
            `pooled turns unlabelled (first: \`${missing[0]}\`); the model run tiles every compared turn (SPEC §5.4)`,
        );
      } else if (spansSound) {
        // The report has passed its schema, and the gate reads only turn ids,
        // sequence ids, session_index and the episodes' spans and codes, so the
        // validator's view of a session is handed over as the contract type.
        const tilingOf = (run: RunNode): RunTiling => ({
          run: run as unknown as RunTiling['run'],
          episodes: reportable.flatMap((session) =>
            (session.annotations ?? []).filter((episode) => episode.run_id === run.run_id),
          ) as unknown as RunTiling['episodes'],
        });
        try {
          pairs = comparedLabels(reportable as unknown as Session[], tilingOf(annotationRun), tilingOf(modelRun));
        } catch (error) {
          add(
            'agreement.not_recomputable',
            `report for \`${student}\`: the gate refuses \`${annotationRun.run_id}\` against ` +
              `\`${modelRun.run_id}\`, so the stored figure cannot be checked: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    if (pairs) {
      const result = agreementKappa(
        pairs.map((pair) => pair.annotation),
        pairs.map((pair) => pair.llm),
      );
      if (!result.measured) {
        if (agreement.value !== null) {
          add(
            'agreement.refused_input_scored',
            `report for \`${student}\`: value ${agreement.value} is reported over an input §5.4 refuses — ` +
              `${result.reason}: ${result.detail}`,
          );
        }
      } else {
        recomputed = result.value;
        const agrees = agreement.value !== null && Math.abs(agreement.value - result.value) <= KAPPA_EPSILON;
        if (agreement.value === null) {
          if (agreement.state !== 'unmeasured') {
            add(
              'agreement.value_mismatch',
              `report for \`${student}\`: value is null, but kappa over \`${firstRun}\` and \`${secondRun}\` ` +
                `is ${result.value}`,
            );
          }
        } else if (!agrees) {
          add(
            'agreement.value_mismatch',
            `report for \`${student}\`: value ${agreement.value}, but kappa recomputed over \`${firstRun}\` and ` +
              `\`${secondRun}\` is ${result.value} (${result.n_turns} turns)`,
          );
        }
        // The band belongs to the reported value, and the wrapper is the one
        // call site of the vendored interpreter (kappa.ts), so the band is
        // checkable exactly when the reported and recomputed values agree.
        if (agrees && agreement.band !== result.band) {
          add(
            'agreement.band_mismatch',
            `report for \`${student}\`: band \`${String(agreement.band)}\` for value ${agreement.value}; ` +
              `getKappaInterpretation returns \`${result.band}\``,
          );
        }
      }
    }

    if (annotationRun && annotationRun.simulated && !agreement.simulated) {
      add(
        'agreement.simulated_mismatch',
        `report for \`${student}\`: agreement.simulated is false, but the annotation run compared against ` +
          `(\`${annotationRun.run_id}\`) is simulated`,
      );
    }
  }

  if (agreement.value === null && agreement.band !== null) {
    add(
      'agreement.band_mismatch',
      `report for \`${student}\`: band \`${String(agreement.band)}\` with a null value; a refusal has no band ` +
        `(SPEC §5.4)`,
    );
  }

  // --- D11: no agreement value or band on a learner-facing surface ---------
  // The threshold is not banned: INTENT.md has every layer's provenance card
  // state that a construct does not surface unless agreement reaches it. So
  // each standalone statement of the threshold is taken out of the text before
  // the value is looked for, and a value whose digits run on past it ("0.613")
  // is still found. [OURS: a value written to exactly the threshold's digits
  // cannot be told apart from the threshold, and that one rendering passes.]
  // The reported and the recomputed value are usually the same number, so the
  // needles are deduplicated: one defect, one rejection.
  const needles = new Set<string>();
  for (const value of [agreement.value, recomputed]) {
    if (value !== null) {
      for (const needle of numberNeedles(value)) needles.add(needle);
    }
  }
  const thresholdStated = new RegExp(
    `(?<![\\d.])(?:${numberNeedles(agreement.threshold).map(escapeForRegExp).join('|')})(?!\\d)`,
    'g',
  );

  const surfaces: Array<{ what: string; text: string }> = [
    { what: 'the summary', text: report.summary },
    { what: 'agreement.statement', text: agreement.statement },
    ...report.claims.map((claim) => ({ what: `claim \`${claim.claim_id}\``, text: claim.text })),
    ...report.provenance_card.map((text, at) => ({ what: `provenance_card[${at}]`, text })),
  ];

  for (const surface of surfaces) {
    const withoutThreshold = surface.text.replace(thresholdStated, ' ');
    for (const needle of needles) {
      if (withoutThreshold.includes(needle)) {
        add(
          'd11.learner_facing_number',
          `${surface.what} contains \`${needle}\`, which is the agreement value. Neither the value nor its band ` +
            `reaches a learner-facing surface (SPEC D11).`,
        );
      }
    }
    if (agreement.band !== null && new RegExp(`\\b${escapeForRegExp(agreement.band)}\\b`, 'i').test(surface.text)) {
      add(
        'd11.learner_facing_number',
        `${surface.what} contains the band \`${agreement.band}\`. Neither the value nor its band reaches a ` +
          `learner-facing surface (SPEC D11).`,
      );
    }
  }

  return problems;
}

/** §9.1: a CROSS-STUDY tag with no matching docs/DEVIATIONS.md entry id. */
function crossStudyProblems(report: ReportNode, where: string): Problem[] {
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(report);

  const tagged = strings.filter((text) => text.includes('CROSS-STUDY'));
  if (tagged.length === 0) return [];

  const log = readFileSync(resolve(REPO_ROOT, 'docs/DEVIATIONS.md'), 'utf8');
  const known = new Set((log.match(/^#{1,4}\s+(D-\d{3})/gm) ?? []).map((line) => line.replace(/^#+\s+/, '')));

  return tagged
    .filter((text) => !(text.match(/D-\d{3}/g) ?? []).some((id) => known.has(id)))
    .map((text) => ({
      rule: 'tags.cross_study_without_deviation',
      where,
      message: `a CROSS-STUDY tag names no docs/DEVIATIONS.md entry: "${text.slice(0, 120)}"`,
    }));
}

// ---------------------------------------------------------------- the CLI

function classify(raw: unknown): 'report' | 'run' | 'transcript' | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if ('claims' in value && 'agreement' in value) return 'report';
  if ('run_id' in value && 'kind' in value) return 'run';
  if ('turns' in value && 'session_id' in value) return 'transcript';
  return null;
}

function validateFile(path: string, display: string): { problems: Problem[]; kind: string } {
  const raw = readJson<unknown>(path);
  const kind = classify(raw);
  if (kind === null) return { problems: [], kind: 'skipped: not a report, run or transcript' };
  if (kind === 'report') return { problems: validateReport(raw, display), kind };
  return { problems: schemaProblems(kind, raw, display), kind };
}

function dataFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    found.push(...listJson(dir));
    for (const child of listDirs(dir)) walk(join(dir, child));
  };
  for (const root of [config.paths.demoDir, config.paths.outputDir, config.paths.intakeDir]) {
    if (exists(root)) walk(root);
  }
  return found;
}

function print(problems: Problem[]): void {
  for (const problem of problems) console.log(`  ${problem.rule}: ${problem.message}`);
}

/**
 * §9.1's self-check: the baseline passes, each changed copy that is still
 * valid passes, and one broken copy per rule does not.
 */
function selfCheck(): number {
  const baseline = readJson<unknown>(BASELINE_PATH);
  console.log(`self-check over ${BASELINE_PATH}`);

  const clean = validateReport(baseline, BASELINE_PATH);
  if (clean.length > 0) {
    console.log('FAIL  the valid baseline was rejected:');
    print(clean);
    return 1;
  }
  // Said out loud, because it is the relaxed rule the baseline exercises: a
  // tutor's marking with gaps in it is a valid annotation run.
  const shape = baseline as ReportNode;
  const humanRuns = new Set(shape.runs.filter((run) => run.kind === 'human').map((run) => run.run_id));
  const marked = new Set(
    episodesOf(shape).flatMap(({ episode }) => (humanRuns.has(episode.run_id) ? episode.evidence : [])),
  );
  const turnTotal = shape.sessions.reduce((sum, session) => sum + session.turns.length, 0);
  console.log(
    `PASS  baseline accepted; its annotation run leaves ${turnTotal - marked.size} of ${turnTotal} turns unmarked`,
  );

  let failures = 0;
  console.log(`\n${accepted.length} changed copies that must still be accepted`);
  for (const fixture of accepted) {
    const subject = structuredClone(baseline);
    fixture.mutate(subject as never);
    const problems = validateReport(subject, `${BASELINE_PATH} + ${fixture.id}`);
    if (problems.length > 0) {
      failures++;
      console.log(`FAIL  accepted  [${fixture.id}] was rejected`);
      print(problems);
      continue;
    }
    console.log(`PASS  accepted  [${fixture.id}]`);
    console.log(`      ${fixture.why}`);
  }

  console.log(`\n${mutations.length} broken copies that must be rejected by their own rule`);
  const parts = baseline as { runs: unknown[]; sessions: unknown[] };
  let skipped = 0;
  for (const mutation of mutations) {
    const skip = mutation.skip?.() ?? null;
    if (skip !== null) {
      skipped++;
      console.log(`SKIP  ${mutation.rule}  [${mutation.id}]: ${skip}`);
      continue;
    }
    // A run or transcript fixture is that part of the baseline on its own, which
    // is how those two files arrive on intake (§5.8) and how they are validated.
    const target = mutation.target ?? 'report';
    const subject = structuredClone(
      target === 'run' ? parts.runs[0] : target === 'transcript' ? parts.sessions[0] : baseline,
    );
    mutation.mutate(subject as never);
    const where = `${BASELINE_PATH} + ${mutation.id}`;
    const problems =
      target === 'report' ? validateReport(subject, where) : schemaProblems(target, subject, where);
    const hit = problems.find((problem) => problem.rule === mutation.rule);
    if (!hit) {
      failures++;
      console.log(`FAIL  ${mutation.rule}  [${mutation.id}] was not rejected by its own rule`);
      print(problems);
      continue;
    }
    const others = [...new Set(problems.map((problem) => problem.rule))].filter((rule) => rule !== mutation.rule);
    console.log(`PASS  ${mutation.rule}  [${mutation.id}]`);
    console.log(`      ${hit.message}`);
    if (others.length > 0) console.log(`      (also fired: ${others.join(', ')})`);
  }

  const run = mutations.length - skipped;
  console.log(
    `\n${accepted.length} changed fixtures and ${run} broken fixtures checked` +
      (skipped > 0 ? ` (${skipped} skipped)` : '') +
      (failures > 0 ? `, ${failures} FAILED` : ', all as expected'),
  );
  return failures > 0 ? 1 : 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes('--self-check')) return selfCheck();

  const explicit = args.filter((arg) => !arg.startsWith('--'));
  // A path on the command line is read where it is; the data directories are
  // read through storage, which resolves against the repo root.
  const files: Array<{ display: string; read: string }> =
    explicit.length > 0
      ? explicit.map((arg) => ({ display: arg, read: resolve(arg) }))
      : dataFiles().map((relPath) => ({ display: relPath, read: relPath }));

  if (files.length === 0) {
    const roots = [config.paths.demoDir, config.paths.outputDir, config.paths.intakeDir].join(', ');
    console.log(`no report, run or transcript files under ${roots}`);
    console.log('for the §9.1 fixture suite, run: yarn validate --self-check');
    return 0;
  }

  let total = 0;
  for (const file of files) {
    const { problems, kind } = validateFile(file.read, file.display);
    total += problems.length;
    console.log(`${problems.length === 0 ? 'ok  ' : 'FAIL'}  ${file.display} (${kind})`);
    print(problems);
  }
  console.log(`\n${files.length} file(s), ${total} problem(s)`);
  return total > 0 ? 1 : 0;
}

process.exitCode = main();
