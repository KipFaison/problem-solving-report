// Layer 2's codebook (docs/SPEC-layer2.md): its own file, its own version.
// Nothing here reads or writes the episode codebook.
import { readJson } from '../storage/index.ts';
import { config } from '../config.ts';

export interface MoveCode {
  code: string;
  name: string;
  origin: string;
  definition: string;
  include: string[];
  exclude: string[];
}

export interface MovesProvenance {
  citation: string;
  licence: string;
  corpus: string;
  agreement_as_reported: string;
  status: string;
  not_validated_on: string;
  in_this_project: string;
}

export interface MovesCodebook {
  codebook_version: string;
  layer_id: 'tutor_moves';
  source: string;
  unit_of_analysis: string;
  note_on_independence: string;
  note_on_none: string;
  provenance: MovesProvenance;
  codes: MoveCode[];
}

export function loadMovesCodebook(): MovesCodebook {
  const book = readJson<MovesCodebook>(config.moves.codebookPath);
  if (!Array.isArray(book.codes) || book.codes.length === 0) {
    throw new Error(`${config.moves.codebookPath}: no codes`);
  }
  return book;
}

export function moveCodes(): Set<string> {
  return new Set(loadMovesCodebook().codes.map((c) => c.code));
}

/** The only code that licenses "with no prompt in the turn before it". */
export const NO_PROMPT = 'NONE';
