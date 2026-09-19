// The data contract of docs/SPEC-gate0.md §5, as TypeScript.
//
// The JSON Schemas in schema/ are the contract; these types are for the editor.
// When they disagree, the schema wins and this file is wrong.

/** A single turn. Field names at this level match Sandpiper's (SPEC §10 item 3). */
export interface Turn {
  _id: string;
  session_id: string;
  sequence_id: number;
  role: string;
  content: string;
  turn_id: string;
  start_time?: string;
  end_time?: string;
  annotations?: unknown[];
}

/**
 * One problem worked on within a session. A session may hold more than one, and
 * an episode never straddles a boundary: a new problem is new work, whatever
 * kind of work it is. Absent means the whole session was one problem.
 */
export interface SessionProblem {
  problem_id: string;
  topic: string;
  start_turn_id: string;
  end_turn_id: string;
}

export interface Session {
  session_id: string;
  student_id: string;
  session_index: number;
  session_date: string;
  session_topic?: string;
  has_timestamps: boolean;
  transcript_scope: 'full' | 'excerpt';
  problems?: SessionProblem[];
  turns: Turn[];
  /**
   * In a report, every episode covering this session, one tiling set per run
   * (SPEC §5.3). Absent in a standalone transcript file, where a run file
   * carries its own episodes instead.
   */
  annotations?: Episode[];
}

/** Token usage for one model call. README next steps 4 and 5. */
export interface CallUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface RunUsage {
  calls: number;
  totals: CallUsage;
  /** Per call, in order, so a re-run can be compared call by call. */
  per_call: Array<CallUsage & { purpose: 'segment' | 'summarise' | 'moves'; session_id?: string }>;
}

/** One labelling source. Gate 0 produces two kinds (SPEC §5.3). */
export interface Run {
  run_id: string;
  kind: 'llm' | 'human';
  simulated: boolean;
  model: string | null;
  prompt_hash: string | null;
  annotator_id: string | null;
  codebook_version: string;
  domain: string;
  created_at: string;
  usage?: RunUsage;
  /**
   * Set when this run's episodes were NOT produced by the thing its `kind`
   * names. The only use is a generated stand-in that lets the interface be
   * built and tested before a model has ever run: `model` is null, the reason
   * is carried here, and every surface that renders the run says so.
   * [OURS: the alternative was writing generated episodes into an `llm` run
   * and letting a reader assume a model produced them, which is the exact
   * confusion this project exists to avoid.]
   */
  stand_in?: { reason: string } | null;
  /**
   * How many touching same-code pieces of the model's output were joined into
   * one episode. Recorded so the joining is visible rather than silent.
   */
  merged_adjacent?: number;
  /**
   * On an annotation run, the turns the tutor was shown when marking it
   * (INTENT.md, "What a tutor is shown"; SPEC D18). Agreement compares these
   * turns and no others. Absent or null means the whole session was shown,
   * which is how every run saved before D18 reads, simulated ones included.
   */
  shown?: RunShown | null;
}

/** What a tutor was shown of a session: a drawn sample, or the whole of it. */
export interface RunShown {
  mode: 'sample' | 'whole_session';
  /** Every turn shown, in session order. */
  turn_ids: string[];
  problem_ids: string[];
  /** The config the sample was drawn with; null when the whole session was shown. */
  sampling: { problems_per_session: number; seed: number } | null;
}

/** An episode: a contiguous span of turns, spanning both speakers. */
export interface Episode {
  _id: string;
  episode_id: string;
  run_id: string;
  identifiedBy: 'AI' | 'HUMAN';
  layer_id: 'episodes';
  codebook_version: string;
  domain: string;
  EPISODE: string;
  start_turn_id: string;
  end_turn_id: string;
  evidence: string[];
  /** Present, and null in Gate 0. Nothing writes these (SPEC §5.3). */
  reviewer_id: string | null;
  reviewed_at: string | null;
  /**
   * Layer 2 (docs/SPEC-layer2.md), on a model run's episode that a student's
   * turn opens. Nested, not flat: `codebook_version` above is the episode
   * codebook's, and this layer carries its own. Absent when the episode is not
   * student-opened or the layer has not run on it.
   */
  tutor_prompting?: TutorPrompting | null;
}

/** What the tutor did in the one turn before a student-opened episode. */
export interface TutorPrompting {
  preceding_turn_id: string;
  preceding_speaker: string;
  /** One of the five layer codes, or null when the preceding turn is not the tutor's. */
  tutor_move: string | null;
  /** codebook.tutor-moves.json's version, not the episode codebook's. */
  codebook_version: string;
}

/** A tutor's own marks for Layer 2, one per item, kept apart from their episode marking. */
export interface MovesMarks {
  session_id: string;
  codebook_version: string;
  annotator_id: string;
  simulated: boolean;
  created_at: string;
  /** preceding_turn_id to one of the five layer codes. */
  marks: Record<string, string>;
}

export type AgreementState = 'shown' | 'suppressed' | 'unmeasured';

/**
 * The agreement gate (SPEC §5.4). Computed, internal, never learner-facing.
 * A refusal is `unmeasured` with a reason — never a kappa of 0.
 */
export interface Agreement {
  threshold: number;
  statistic: "Cohen's kappa";
  unit: 'turn';
  compared_runs: [string, string] | null;
  n_turns: number | null;
  value: number | null;
  band: string | null;
  measured: boolean;
  state: AgreementState;
  simulated: boolean;
  /** Why nothing was computed, when state is `unmeasured`. */
  refusal: null | {
    reason:
      | 'no_annotation_run'
      | 'length_mismatch'
      | 'degenerate_single_code'
      | 'too_few_turns'
      | 'codebook_version_mismatch';
    detail: string;
  };
  statement: string;
  /** Internal view only (SPEC §7.3). Never rendered learner-facing. */
  per_code?: Record<string, { n_turns: number; agreed: number }>;
  /**
   * The same comparison, one session at a time. Annotating a single session
   * should show what that session scores; the pooled figure above is what the
   * gate acts on.
   */
  per_session?: Array<{
    session_id: string;
    session_index: number;
    value: number | null;
    band: string | null;
    n_turns: number | null;
    state: AgreementState;
    refusal: Agreement['refusal'];
  }>;
}

export interface SessionGate {
  min_turns: number;
  sessions: Array<{ session_id: string; turn_count: number; reportable: boolean }>;
}

export interface Claim {
  claim_id: string;
  text: string;
  evidence_episode_ids: string[];
  provenance: string;
}

export interface DataProvenance {
  status: 'synthetic' | 'authentic';
  ui_label: string;
}

export interface Report {
  report_version: string;
  data_provenance: DataProvenance;
  student_id: string;
  /** Which run this report was generated from (SPEC D12, P7 — explicit, no default). */
  source_run_id: string;
  codebook_version: string;
  domain: string;
  /** Each session carries the episodes covering it, in `annotations` (§5.3). */
  sessions: Session[];
  runs: Run[];
  agreement: Agreement;
  session_gate: SessionGate;
  claims: Claim[];
  summary: string;
  provenance_card: string[];
  /**
   * Keyed by the turn_id of a student turn that opens a model-run episode
   * carrying `tutor_prompting`: one plain line describing what was done in
   * that exchange, from one batched model call per report build
   * (src/pipeline/describe.ts). A line that failed the wording lint was
   * dropped, so a key may be absent. [OURS]
   */
  quote_descriptions?: Record<string, string>;
}
