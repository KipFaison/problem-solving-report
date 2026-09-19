// The wording checker (docs/SPEC-gate0.md §9.2; INTENT.md "Wording rules";
// CLAUDE.md rule 8).
//
// Why this is a lint and not a review item: INTENT.md records that person- and
// ability-focused feedback is documented to induce fixed beliefs about one's own
// ability and reduced persistence. Most of the text it guards is written by a
// model, one report at a time, long after anyone is reading every line. A rule
// that only holds while someone is looking does not hold.
//
// Not here: the D11 rule — no agreement value, band or threshold on a
// learner-facing surface. That is the validator's (§9.1) and is not duplicated.

import { readJson } from '../storage/index.ts';

export interface BannedGroup {
  id: string;
  reason: string;
  suggestion: string;
  phrases: string[];
  /** Literal contexts in which this group's phrases are copy the product needs. */
  allow?: string[];
}

export interface BannedPhrases {
  groups: BannedGroup[];
}

export interface Finding {
  /** A group id from the phrase file, or 'person-pronoun' / 'subject-name'. */
  rule: string;
  /** The text that fired, as it appears. */
  phrase: string;
  reason: string;
  suggestion: string;
  /** Caller-supplied label: a file and line, or a report field path. */
  where: string;
  index: number;
  excerpt: string;
}

let cached: BannedPhrases | null = null;

export function loadBannedPhrases(): BannedPhrases {
  cached ??= readJson<BannedPhrases>('lint/banned-phrases.json');
  return cached;
}

/**
 * Word-boundary, case-insensitive, whitespace between words flexible.
 * The boundary assertion is only added on an edge that is itself a word
 * character, so a phrase ending in punctuation still matches.
 */
function phraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const left = /^\w/.test(phrase) ? '\\b' : '';
  const right = /\w$/.test(phrase) ? '\\b' : '';
  return new RegExp(left + escaped + right, 'gi');
}

function spansOf(text: string, phrases: string[] | undefined): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const phrase of phrases ?? []) {
    const re = phraseRegex(phrase);
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  return spans;
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

export function checkBannedPhrases(
  text: string,
  where: string,
  list: BannedPhrases = loadBannedPhrases(),
): Finding[] {
  const findings: Finding[] = [];
  for (const group of list.groups) {
    const allowed = spansOf(text, group.allow);
    for (const phrase of group.phrases) {
      const re = phraseRegex(phrase);
      for (let m = re.exec(text); m !== null; m = re.exec(text)) {
        const from = m.index;
        const to = m.index + m[0].length;
        if (allowed.some(([s, e]) => from >= s && to <= e)) continue;
        findings.push({
          rule: group.id,
          phrase: m[0],
          reason: group.reason,
          suggestion: group.suggestion,
          where,
          index: from,
          excerpt: excerptAround(text, from, m[0].length),
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// The subject rule: no claim or heading whose grammatical subject is a person
// (§9.2). This is the rule that matters most and the one no honest regex can
// decide, so here is exactly what it does.
//
// CATCHES
//   - any of I, we, you, he, she, they, anywhere in the string. Not only in
//     subject position: copy whose subject is the session has no reason to
//     contain them at all, and the wrong-position cases are cheap to rewrite.
//   - a supplied display name followed by a finite-looking verb, with one
//     leading adverb allowed: "Maya planned", "Maya often checks", "Maya was".
//
// MISSES
//   - a person noun as subject that is not on the banned list, and a name that
//     was never supplied to the checker.
//   - a possessive-led subject: "Her work moved twice" (her/his/their are not
//     in the pronoun list) and "Maya's approach changed" (a possessive name is
//     skipped, because the subject is the noun that follows it). Both attribute
//     the work to a person; neither is caught. Rewrite them by hand.
//   - a verb this heuristic does not recognise as one: "Maya, in this session,
//     rarely ever plans" — the token after the skipped adverb is not verb-like.
//   - anything in text the script does not scan, including transcript turns,
//     which quote people and are not our copy.
// ---------------------------------------------------------------------------

const PERSON_PRONOUNS = ['I', 'we', 'you', 'he', 'she', 'they'];
const PRONOUN_RE = new RegExp(`\\b(${PERSON_PRONOUNS.join('|')})\\b`, 'gi');

const PRONOUN_REASON =
  'A person pronoun puts a person where the subject should be the session or the work (INTENT.md: the subject of every sentence in the report is the session or the work).';
const PRONOUN_SUGGESTION =
  'Name what happened instead: "the work moved from exploring to planning twice". For an instruction, use the imperative: "Open the turns behind this claim". If the pronoun refers to the episodes rather than a person, name them.';

const NAME_REASON =
  'A claim or heading whose subject is the student names a person, not an episode (INTENT.md; CLAUDE.md rule 8).';
const NAME_SUGGESTION =
  'Make the session the subject: "In session 4 the work opened with reading." A name in a title is fine; a name doing the verb is not.';

const AUXILIARY_RE =
  /^(is|isn't|was|wasn't|are|aren't|were|has|hasn't|have|had|does|doesn't|did|do|can|can't|could|will|won't|would|should|may|might|must)$/i;
const VERB_SHAPED_RE = /^[a-z]{3,}(s|ed|ing)$/i;
const ADVERB_RE =
  /^(often|always|usually|sometimes|rarely|never|then|also|again|still|now|just|already|consistently|mostly)$|ly$/i;

function looksFinite(token: string): boolean {
  return AUXILIARY_RE.test(token) || VERB_SHAPED_RE.test(token);
}

export function checkPersonPronouns(text: string, where: string): Finding[] {
  const findings: Finding[] = [];
  PRONOUN_RE.lastIndex = 0;
  for (let m = PRONOUN_RE.exec(text); m !== null; m = PRONOUN_RE.exec(text)) {
    findings.push({
      rule: 'person-pronoun',
      phrase: m[0],
      reason: PRONOUN_REASON,
      suggestion: PRONOUN_SUGGESTION,
      where,
      index: m.index,
      excerpt: excerptAround(text, m.index, m[0].length),
    });
  }
  return findings;
}

export function checkSubjectName(text: string, where: string, names: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const re = phraseRegex(name);
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const after = text.slice(m.index + m[0].length);
      if (/^['’]s\b/i.test(after)) continue; // possessive: the subject is the noun that follows
      const tokens = after
        .trim()
        .split(/\s+/, 3)
        .map((t) => t.replace(/[^A-Za-z']/g, ''))
        .filter((t) => t.length > 0);
      const next = tokens.find((t) => !ADVERB_RE.test(t));
      if (next === undefined || !looksFinite(next)) continue;
      findings.push({
        rule: 'subject-name',
        phrase: `${m[0]} ${next}`,
        reason: NAME_REASON,
        suggestion: NAME_SUGGESTION,
        where,
        index: m.index,
        excerpt: excerptAround(text, m.index, m[0].length),
      });
    }
  }
  return findings;
}

export interface CheckOptions {
  /** The student's display name, and any other spelling of it to catch. */
  names?: string[];
  list?: BannedPhrases;
}

export function checkText(text: string, where: string, opts: CheckOptions = {}): Finding[] {
  return [
    ...checkBannedPhrases(text, where, opts.list ?? loadBannedPhrases()),
    ...checkPersonPronouns(text, where),
    ...checkSubjectName(text, where, opts.names ?? []),
  ].sort((a, b) => a.index - b.index);
}
