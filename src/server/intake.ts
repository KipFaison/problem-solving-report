// Turning a transcript file into a session (SPEC §5.8).
//
// CSV or JSONL, one utterance per row, using the turn-level field names the
// contract carries. Identity that the file cannot supply — which student, which
// session in the sequence — is asked for, never inferred.
import type { Session, Turn } from '../contract/types.ts';

export interface IntakeMeta {
  session_id: string;
  student_id: string;
  session_index: number;
  session_date: string;
  session_topic?: string;
}

interface RawTurn {
  role?: string;
  speaker?: string;
  content?: string;
  text?: string;
  utterance?: string;
  sequence_id?: number | string;
  start_time?: string;
  end_time?: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(field); field = ''; }
    else field += ch;
  }
  out.push(field);
  return out;
}

/**
 * Split CSV text into records, not lines: a quoted field may hold a line break,
 * and a transcript turn often does.
 */
function csvRecords(text: string): string[] {
  const records: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      if (current.trim().length > 0) records.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) records.push(current);
  return records;
}

function parseCsv(text: string): RawTurn[] {
  const lines = csvRecords(text);
  const header = splitCsvLine(lines[0] ?? '').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, i) => { row[key] = cells[i] ?? ''; });
    return row as RawTurn;
  });
}

function parseJsonl(text: string): RawTurn[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RawTurn);
}

function parseJson(text: string): RawTurn[] {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) return parsed as RawTurn[];
  const holder = parsed as { turns?: RawTurn[]; utterances?: RawTurn[] };
  const rows = holder.turns ?? holder.utterances;
  if (!rows) throw new Error('no turns or utterances in that JSON');
  return rows;
}

export function parseTranscript(filename: string, text: string, meta: IntakeMeta): Session {
  const lower = filename.toLowerCase();
  const rows = lower.endsWith('.csv')
    ? parseCsv(text)
    : lower.endsWith('.jsonl')
      ? parseJsonl(text)
      : parseJson(text);

  if (rows.length === 0) throw new Error('that file holds no turns');

  const turns: Turn[] = rows.map((row, index) => {
    const content = (row.content ?? row.text ?? row.utterance ?? '').toString().trim();
    const role = (row.role ?? row.speaker ?? '').toString().trim() || 'UNKNOWN';
    const turn: Turn = {
      _id: String(index),
      session_id: meta.session_id,
      sequence_id: Number(row.sequence_id ?? index + 1),
      role,
      content,
      turn_id: `${meta.session_id}-t${String(index + 1).padStart(3, '0')}`,
    };
    if (row.start_time) turn.start_time = String(row.start_time);
    if (row.end_time) turn.end_time = String(row.end_time);
    return turn;
  });

  const empty = turns.filter((t) => t.content.length === 0).length;
  if (empty > 0) throw new Error(`${empty} of ${turns.length} turns have no text; check the column names`);

  const hasTimestamps = turns.every((t) => t.start_time && t.end_time);

  return {
    session_id: meta.session_id,
    student_id: meta.student_id,
    session_index: meta.session_index,
    session_date: meta.session_date,
    ...(meta.session_topic ? { session_topic: meta.session_topic } : {}),
    has_timestamps: hasTimestamps,
    transcript_scope: 'full',
    turns,
  };
}
