// The codebook loader (SPEC-gate0 §4). Its consumers are the LLM prompt (§6),
// the pipeline, the dev API, the demo generator and the check scripts. The UI
// reads codebook.v2.json directly (app/data.ts), and the report's provenance
// card (§5.6) is written in src/pipeline/report.ts, not built from here.
//
// No code definition is restated here — not in a string, not in a type, not in
// a comment. Everything a consumer renders is read from codebook.v2.json,
// composed with domains/<domain>.json when that file exists. O-4 is open, so
// the loader must work on the unsplit 2.2.0 file as well as on a split pair.
//
// File order is the order everywhere: the prompt's code list is hashed onto
// the run (§5.3 `prompt_hash`), so reordering must be a codebook edit, never a
// side effect of how a view was built.
import { config } from '../config.ts';
import { readJson, exists } from '../storage/index.ts';

/** One code as the general file carries it. Field names are the codebook's. */
export interface GeneralCode {
  code: string;
  name: string;
  origin: string;
  content_related: boolean;
  /**
   * The five codes that describe the problem-solving process. Only these are
   * shown to a tutor or a reader; the model uses all of them to segment.
   */
  in_problem_process?: boolean;
  requires_timestamps?: boolean;
  definition: string;
  include: string[];
  exclude: string[];
  example?: string;
  adaptation?: string;
  deviation_from_paper?: string;
}

/** The domain-specific fields INTENT.md moves to domains/<domain>.json. */
export interface DomainCode {
  example?: string;
  keywords?: string[];
  include_extra?: string[];
}

export type ComposedCode = GeneralCode & Pick<DomainCode, 'keywords' | 'include_extra'>;

export interface ComposedCodebook {
  codebook_version: string;
  domain: string;
  unit_of_analysis: string;
  note_on_adaptation: string;
  codes: ComposedCode[];
}

interface GeneralFile {
  codebook_version: string;
  unit_of_analysis: string;
  note_on_adaptation: string;
  codes: GeneralCode[];
}

interface DomainFile {
  codebook_version?: string;
  codes: Record<string, DomainCode>;
}

const REQUIRED_TOP_LEVEL = ['codebook_version', 'unit_of_analysis', 'note_on_adaptation'] as const;

// Present on every code in 2.2.0. `example`, `adaptation` and `deviation_from_paper`
// are not: they are on some codes and not others, and `requires_timestamps` is
// on none, so requiring them would reject the file the repo actually has.
const REQUIRED_PER_CODE = [
  'code',
  'name',
  'origin',
  'content_related',
  'definition',
  'include',
  'exclude',
] as const;

// The only fields a domain file may carry. Anything else is refused rather
// than merged: a domain file that could override `definition` would put a
// second definition of a code in the repo, which is the one thing §4 forbids.
const DOMAIN_FIELDS = ['example', 'keywords', 'include_extra'] as const;

function readGeneral(): GeneralFile {
  const path = config.codebook.path;
  const file = readJson<GeneralFile>(path);

  for (const field of REQUIRED_TOP_LEVEL) {
    if (typeof file[field] !== 'string' || file[field] === '') {
      throw new Error(`${path}: missing required field \`${field}\``);
    }
  }
  if (!Array.isArray(file.codes) || file.codes.length === 0) {
    throw new Error(`${path}: \`codes\` must be a non-empty array`);
  }

  const seen = new Set<string>();
  for (const entry of file.codes) {
    for (const field of REQUIRED_PER_CODE) {
      if (entry[field] === undefined || entry[field] === null) {
        throw new Error(
          `${path}: code \`${entry.code ?? '<unnamed>'}\` is missing required field \`${field}\``,
        );
      }
    }
    if (seen.has(entry.code)) throw new Error(`${path}: duplicate code \`${entry.code}\``);
    seen.add(entry.code);
  }
  return file;
}

function domainPath(domain: string): string {
  return `${config.codebook.domainsDir}/${domain}.json`;
}

/** Null when the split of O-4 has not been made for this domain. */
function readDomain(domain: string): DomainFile | null {
  const path = domainPath(domain);
  if (!exists(path)) return null;

  const file = readJson<DomainFile>(path);
  if (typeof file.codes !== 'object' || file.codes === null || Array.isArray(file.codes)) {
    throw new Error(`${path}: \`codes\` must be an object keyed by code`);
  }
  return file;
}

/** The composed codebook for a domain: the general file, plus the domain file when it exists. */
export function loadCodebook(domain: string = config.codebook.domain): ComposedCodebook {
  const general = readGeneral();
  const codes: ComposedCode[] = general.codes.map((entry) => ({ ...entry }));
  const domainFile = readDomain(domain);

  if (domainFile) {
    const path = domainPath(domain);
    // A domain file left behind by a codebook bump would compose silently and
    // wrongly, so it is refused [OURS: splitting the codebook is a version bump
    // per O-4, which makes the pair's versions checkable].
    if (
      domainFile.codebook_version !== undefined &&
      domainFile.codebook_version !== general.codebook_version
    ) {
      throw new Error(
        `${path}: codebook_version \`${domainFile.codebook_version}\` does not match ` +
          `\`${general.codebook_version}\` in ${config.codebook.path}`,
      );
    }

    const byCode = new Map(codes.map((entry) => [entry.code, entry]));
    for (const [code, fields] of Object.entries(domainFile.codes)) {
      const target = byCode.get(code);
      if (!target) {
        throw new Error(`${path}: code \`${code}\` is not in ${config.codebook.path}`);
      }
      for (const key of Object.keys(fields)) {
        if (!DOMAIN_FIELDS.includes(key as (typeof DOMAIN_FIELDS)[number])) {
          throw new Error(
            `${path}: code \`${code}\` carries \`${key}\`; a domain file may carry only ` +
              DOMAIN_FIELDS.join(', '),
          );
        }
      }
      if (fields.example !== undefined) target.example = fields.example;
      if (fields.keywords !== undefined) target.keywords = fields.keywords;
      if (fields.include_extra !== undefined) target.include_extra = fields.include_extra;
    }
  }

  return {
    codebook_version: general.codebook_version,
    domain,
    unit_of_analysis: general.unit_of_analysis,
    note_on_adaptation: general.note_on_adaptation,
    codes,
  };
}

/**
 * The codebook a session may be labelled with. A code flagged
 * `requires_timestamps` is unavailable to the dropdown and the prompt when the
 * session has no timing (INTENT.md, SPEC §4).
 *
 * An absent flag counts as false [OURS: O-4 — 2.2.0 sets it on no code,
 * and reading its absence as "not required" is what lets the loader read the
 * file as it stands].
 */
export function loadCodebookForSession(
  hasTimestamps: boolean,
  domain: string = config.codebook.domain,
): ComposedCodebook {
  const composed = loadCodebook(domain);
  if (hasTimestamps) return composed;
  return { ...composed, codes: composed.codes.filter((entry) => entry.requires_timestamps !== true) };
}

export interface DropdownOption {
  code: string;
  name: string;
}

/** The annotation interface's picker (§7.2 item 2). The guide renders the rest. */
export function dropdownOptions(composed: ComposedCodebook): DropdownOption[] {
  return composed.codes.map((entry) => ({ code: entry.code, name: entry.name }));
}

export interface PromptCode {
  code: string;
  name: string;
  definition: string;
  include: string[];
  include_extra?: string[];
  exclude: string[];
  example?: string;
  keywords?: string[];
  adaptation?: string;
}

export interface PromptCodebook {
  codebook_version: string;
  /** §6.2: the prompt takes unit and actor from the codebook, never restated by hand. */
  unit_of_analysis: string;
  note_on_adaptation: string;
  codes: PromptCode[];
}

/**
 * What the prompt sees, and only that. Withheld: `origin` and
 * `deviation_from_paper`, which are provenance for the card rather than
 * instructions for labelling; `requires_timestamps`, already applied by
 * loadCodebookForSession; and `content_related`
 * [OURS: it is an analysis flag, and INTENT.md says a code is applied wherever
 * it fits, so showing a label that reads as "not content" invites the model to
 * treat three codes as lesser].
 */
export function promptView(composed: ComposedCodebook): PromptCodebook {
  return {
    codebook_version: composed.codebook_version,
    unit_of_analysis: composed.unit_of_analysis,
    note_on_adaptation: composed.note_on_adaptation,
    codes: composed.codes.map((entry) => ({
      code: entry.code,
      name: entry.name,
      definition: entry.definition,
      include: entry.include,
      include_extra: entry.include_extra,
      exclude: entry.exclude,
      example: entry.example,
      keywords: entry.keywords,
      adaptation: entry.adaptation,
    })),
  };
}

/** Stamped on every run file (§4 Versioning, §5.3). */
export function codebookVersion(): string {
  return readGeneral().codebook_version;
}

/** The codes a tutor marks and a reader sees: the five problem-solving codes. */
export function problemProcessCodes(domain?: string): Set<string> {
  return new Set(
    loadCodebook(domain)
      .codes.filter((entry) => entry.in_problem_process === true)
      .map((entry) => entry.code),
  );
}
