// The page's side of the loop. Every call goes to the local server, which holds
// the API key; nothing here ever sees it.
import type { Agreement, CallUsage, Episode, Report, Run, RunShown, Session, SessionGate, SessionProblem } from '../src/contract/types.ts';
import type { MoveItemView, MovesOutcome, SessionMoves, SessionOutline } from '../src/server/api.ts';
import type { SampleView } from '../src/sampling/draw.ts';

export type { MoveItemView, MovesOutcome, RunShown, SampleView, SessionMoves, SessionOutline };

/** Which view a tutor marked in: the drawn sample, or the whole session (SPEC D18). */
export type ShownMode = RunShown['mode'];

export interface SessionSummary {
  session_id: string;
  session_index: number;
  session_date: string;
  session_topic: string | null;
  turn_count: number;
  has_timestamps: boolean;
  problems: SessionProblem[] | null;
  /** A tutor has tiled this session. */
  annotated: boolean;
  /** The model has read this session. */
  modelled: boolean;
  /** True when the annotation was generated for the demo, false when a tutor made it, null when there is none. */
  annotation_simulated: boolean | null;
  /** Arrived annotated and read by the model, and locked on the tutor side for the demo (SPEC D19). */
  locked: boolean;
}

export interface WorkspaceState {
  workspace: { student_id: string; data_provenance: { status: 'synthetic' | 'authentic'; ui_label: string } };
  agreement: Agreement;
  /** Layer 2's own agreement figure, internal only. Never combined with `agreement`. */
  moves_agreement: Agreement;
  session_gate: SessionGate;
  report: Report | null;
  sessions: SessionSummary[];
}

interface SessionRuns {
  human: (Run & { episodes: Episode[] }) | null;
  llm: (Run & { episodes: Episode[] }) | null;
  /** The problem a tutor is shown by default; null where the session is shown whole. */
  sample: SampleView | null;
}

/** One session and its runs. A locked session comes without the text of its turns (SPEC D19). */
export type SessionDetail =
  | (SessionRuns & { locked: false; session: Session })
  | (SessionRuns & { locked: true; session: SessionOutline });

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  // Read the text first: an error page that is not JSON would otherwise surface
  // as a parse error and hide what the server actually said.
  const text = await response.text();
  let body: (T & { error?: string }) | null = null;
  try {
    body = text ? (JSON.parse(text) as T & { error?: string }) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error ?? `The server answered ${response.status} to ${path}: ${text.slice(0, 200)}`);
  }
  if (body === null) throw new Error(`The server sent no data for ${path}`);
  return body;
}

export const getState = () => request<WorkspaceState>('/api/state');

export const getSession = (id: string) => request<SessionDetail>(`/api/session/${encodeURIComponent(id)}`);

export interface DraftEpisode {
  code: string;
  start_turn_id: string;
  end_turn_id: string;
}

/**
 * Save a tiling. The model is not re-run; the agreement is recomputed. `shown`
 * says which view it was marked in; the server works out the turns itself, and
 * absent means the whole session.
 */
export const saveAnnotation = (id: string, episodes: DraftEpisode[], annotator_id?: string, shown?: ShownMode) =>
  request<{ saved: string; episodes: number; agreement: Agreement }>(
    `/api/session/${encodeURIComponent(id)}/annotation`,
    { method: 'PUT', body: JSON.stringify({ episodes, annotator_id, shown }) },
  );

/** Run the model on this session, now, then Layer 2 on what it produced. Takes as long as the model takes. */
export const generate = (id: string) =>
  request<{ run_id: string; episodes: number; agreement: Agreement; moves: MovesOutcome }>(
    `/api/session/${encodeURIComponent(id)}/generate`,
    { method: 'POST' },
  );

/** Layer 2 for one session: each item's tutor turn, the turn after it, the model's code and the tutor's mark. */
export const getMoves = (id: string) => request<SessionMoves>(`/api/session/${encodeURIComponent(id)}/moves`);

/** Run the Layer 2 model call on this session now. Needs the model to have read the session first. */
export const classifyMoves = (id: string) =>
  request<SessionMoves & { usage: CallUsage | null; prompt_hash: string | null; moves_agreement: Agreement }>(
    `/api/session/${encodeURIComponent(id)}/moves/classify`,
    { method: 'POST' },
  );

/** Save a tutor's Layer 2 marks for this session, replacing any saved before. Keys are preceding_turn_id. */
export const saveMoves = (id: string, marks: Record<string, string>, annotator_id?: string) =>
  request<{ saved: number; moves_agreement: Agreement }>(
    `/api/session/${encodeURIComponent(id)}/moves`,
    { method: 'PUT', body: JSON.stringify({ marks, annotator_id }) },
  );

/** Build the report from the sessions that have both a tutor's and the model's reading. */
export const buildReport = () =>
  request<{ report: Report; dropped: Array<{ text: string; reason: string }> }>('/api/report', { method: 'POST' });

export interface TranscriptUpload {
  filename: string;
  content: string;
  session_id: string;
  student_id: string;
  session_index: number;
  session_date: string;
  session_topic?: string;
}

/** Put the workspace back where it opens. Discards everything saved since, uploads included. */
export const reset = () => request<{ reset: boolean; log: string }>('/api/reset', { method: 'POST' });

export const addTranscript = (upload: TranscriptUpload) =>
  request<{ session_id: string; turns: number; has_timestamps: boolean }>('/api/transcript', {
    method: 'POST',
    body: JSON.stringify(upload),
  });
