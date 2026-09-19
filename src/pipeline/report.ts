// Assembling the report (docs/SPEC-gate0.md §5.6, §7.1).
//
// Two gates, computed separately and never merged (CLAUDE.md rule 12): the
// session gate counts turns, the agreement gate compares two runs.
import { config, AGREEMENT_THRESHOLD } from '../config.ts';
import { computeAgreement, type RunTiling } from '../agreement/gate.ts';
import { aggregateReport } from './aggregates.ts';
import type { Agreement, Episode, Report, Run, Session, SessionGate } from '../contract/types.ts';

export function sessionGate(sessions: Session[]): SessionGate {
  const min = config.session.minTurnsReportable;
  return {
    min_turns: min,
    sessions: sessions.map((s) => ({
      session_id: s.session_id,
      turn_count: s.turns.length,
      reportable: s.turns.length >= min && s.transcript_scope === config.session.requiredTranscriptScope,
    })),
  };
}

export interface AssembleInput {
  studentId: string;
  sessions: Session[];
  llm: RunTiling;
  annotation: RunTiling | null;
  /** Explicit, never defaulted: which run the report is built from (D12, PLAN P7). */
  sourceRunId: string;
  uiLabel: string;
  status: 'synthetic' | 'authentic';
  /**
   * Who made the comparison marking, session by session. The card must name it
   * truthfully when some sessions were a tutor's and some were generated.
   */
  annotationMakers?: Array<{ session_index: number; simulated: boolean }>;
  summary: string;
  claims: Report['claims'];
}

type RefusalReason = NonNullable<Agreement['refusal']>['reason'];

/**
 * Why a comparison was refused, in the card's words. Keyed by the contract's
 * union, so a reason added there fails the typecheck until it has words here.
 */
const REFUSED_BECAUSE: Record<RefusalReason, string> = {
  no_annotation_run: 'there is no second marking to set beside the model’s',
  too_few_turns: 'too few turns carry both markings for a comparison to mean anything',
  degenerate_single_code: 'one of the two markings gives every turn the same label, which leaves nothing to compare',
  length_mismatch: 'the two markings do not line up turn for turn',
  codebook_version_mismatch: 'the two markings were made under different versions of the definitions',
};

/**
 * The card a reader can always reach (§5.6). It says the agreement state in
 * words and never the number: D11 keeps the value and its band off every
 * learner-facing surface, and the validator enforces that. The threshold is
 * stated, because INTENT.md has every layer's card say that a construct does
 * not surface unless agreement reaches it.
 */
function provenanceCard(
  input: AssembleInput,
  state: string,
  refusal: Agreement['refusal'],
  sourceKind: 'llm' | 'human',
): string[] {
  const card = [
    'The kinds of work shown come from Schoenfeld’s categories of mathematical problem solving, as set out by Li et al. (2025).',
    'Those definitions were written for other settings: a reasoning model’s written solutions, and video of university students solving geometry problems. Using them on tutoring turns goes beyond the settings where those definitions were tested.',
    sourceKind === 'human'
      ? 'The episodes in this report were marked by a person in the annotation interface.'
      : 'The episodes in this report were proposed by a language model.',
  ];

  const standIn = input.llm.run.stand_in;
  if (standIn) {
    card.unshift(`No language model has read these sessions. ${standIn.reason}`);
  }

  if (input.status === 'synthetic') {
    card.push(input.uiLabel);
  }

  // Who made the comparison marking has to be said truthfully: in the demo,
  // some or all of it was generated rather than made by a tutor, and a card
  // that said "a person" about those sessions would be a claim nothing backs.
  const makers = input.annotationMakers ?? [];
  const byTutor = makers.filter((m) => !m.simulated).map((m) => m.session_index).sort((a, b) => a - b);
  const generated = makers.filter((m) => m.simulated).map((m) => m.session_index).sort((a, b) => a - b);
  const list = (xs: number[]) =>
    xs.length === 1 ? `session ${xs[0]}` : `sessions ${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
  const other =
    makers.length === 0
      ? input.annotation?.run.simulated
        ? 'an annotator generated for this demo'
        : 'a tutor'
      : generated.length === 0
        ? 'a tutor'
        : byTutor.length === 0
          ? 'an annotator generated for this demo'
          : `a tutor on ${list(byTutor)} and an annotator generated for this demo on ${list(generated)}`;
  if (state === 'shown') {
    card.push(`These sessions were marked by the model and, separately, by ${other}. The two lined up closely enough for this view to be shown. Lining up is not evidence that either marking is right.`);
  } else if (state === 'suppressed' && refusal !== null) {
    // Refused, not below the threshold: the two markings were never scored
    // against each other, so "diverged" would be a claim nothing measured.
    card.push(`These sessions were marked by the model and, separately, by ${other}. The two markings could not be compared, because ${REFUSED_BECAUSE[refusal.reason]}, so the episode detail is held back.`);
  } else if (state === 'suppressed') {
    card.push(`These sessions were marked by the model and, separately, by ${other}. The two diverged too much for this view to be shown, so the episode detail is held back.`);
  } else {
    card.push('Nobody has marked these sessions by hand, so there is nothing to compare the model against. The episode detail is held back until there is.');
  }

  card.push('Nobody has established how reliably these labels can be applied. This report describes what happened in the sessions and claims nothing beyond that.');
  card.push(`The episode detail is shown only when the model’s marking and a second, separate marking of the same sessions agree at ${AGREEMENT_THRESHOLD} or above on Cohen’s kappa, a measure of how closely two markings agree beyond chance.`);
  card.push('The definitions were developed on mathematics and are used here on mathematics only.');
  return card;
}

export function assembleReport(input: AssembleInput): Report {
  const gate = sessionGate(input.sessions);
  const reportableIds = new Set(gate.sessions.filter((s) => s.reportable).map((s) => s.session_id));
  const reportable = input.sessions.filter((s) => reportableIds.has(s.session_id));

  const agreement = computeAgreement({
    sessions: reportable,
    annotationRun: input.annotation,
    llmRun: input.llm,
  });

  const source = input.sourceRunId === input.llm.run.run_id ? input.llm : input.annotation;
  if (!source || source.run.run_id !== input.sourceRunId) {
    throw new Error(`source_run_id ${input.sourceRunId} is not one of this report's runs`);
  }

  // A run read from a run file carries its own episodes; inside a report the
  // episodes live in sessions[].annotations[] and the run must not repeat them.
  const withoutEpisodes = (run: Run): Run => {
    const { episodes: _episodes, ...rest } = run as Run & { episodes?: unknown };
    return rest as Run;
  };
  const runs = (input.annotation ? [input.annotation.run, input.llm.run] : [input.llm.run]).map(withoutEpisodes);

  // Every episode covering a session sits in that session's `annotations`, one
  // tiling set per run (§5.3). The validator reads them from there.
  const allEpisodes: Episode[] = input.annotation
    ? [...input.annotation.episodes, ...input.llm.episodes]
    : [...input.llm.episodes];
  const sessions = input.sessions.map((session) => {
    const ids = new Set(session.turns.map((t) => t.turn_id));
    return { ...session, annotations: allEpisodes.filter((e) => ids.has(e.start_turn_id)) };
  });

  return {
    report_version: '0.2.0',
    data_provenance: { status: input.status, ui_label: input.uiLabel },
    student_id: input.studentId,
    source_run_id: input.sourceRunId,
    codebook_version: input.llm.run.codebook_version,
    domain: input.llm.run.domain,
    sessions,
    runs,
    agreement,
    session_gate: gate,
    claims: input.claims,
    summary: input.summary,
    provenance_card: provenanceCard(input, agreement.state, agreement.refusal, source.run.kind),
  };
}

/** The aggregates the summary call is handed, over the source run's episodes. */
export function aggregatesFor(sessions: Session[], episodes: Episode[]) {
  return aggregateReport(sessions, episodes);
}

export { AGREEMENT_THRESHOLD };
