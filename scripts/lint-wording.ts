// yarn lint:wording — docs/SPEC-gate0.md §9.2.
//
// Walks the repo's UI copy and any generated report text it is pointed at, and
// exits non-zero on a finding. The rules live in src/lint/wording.ts; this file
// only decides what counts as copy.
//
// Usage:
//   node --experimental-strip-types scripts/lint-wording.ts [--self-check]
//                                   [--name "Maya"] [path ...]
// With no paths it scans app/ and data/out/ (the default roots below).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { REPO_ROOT } from '../src/config.ts';
import { exists, readJson } from '../src/storage/index.ts';
import { checkText, loadBannedPhrases, type Finding } from '../src/lint/wording.ts';
import type { Report } from '../src/contract/types.ts';

/** UI copy, and the reports the pipeline writes. Both are ours; the codebook is not. */
const DEFAULT_ROOTS = ['app', 'data/out'];
const SCANNABLE = new Set(['.ts', '.tsx', '.html', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

interface Copy {
  where: string;
  text: string;
}

// --- discovery -------------------------------------------------------------

/** The lint's own list, checker and script quote banned phrases by design. */
function isLintOwnFile(rel: string): boolean {
  return rel.split(sep).includes('lint') || basename(rel).startsWith('lint-');
}

function walk(rel: string, out: string[]): void {
  const full = resolve(REPO_ROOT, rel);
  if (!statSync(full).isDirectory()) {
    out.push(rel);
    return;
  }
  for (const entry of readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(`${rel}/${entry.name}`, out);
    } else if (SCANNABLE.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      out.push(`${rel}/${entry.name}`);
    }
  }
}

// --- extraction ------------------------------------------------------------

// What a string literal has to look like before it is treated as copy. These
// are cheap filters against source-code noise, not a parser; each one can hide
// a violation, which is why each is narrow.
function isCopy(value: string): boolean {
  if (!/[A-Za-z]/.test(value)) return false;
  if (/^[./]/.test(value) || value.includes('://')) return false; // module and asset paths, URLs
  if (/\.(ts|tsx|js|jsx|json|css|svg|png|jpg)$/.test(value)) return false;
  // camelCase / dotted / snake identifiers, e.g. sessionIndex, data.out, run_id
  if (!/\s/.test(value) && (/[._$/]/.test(value) || /^[a-z]+([A-Z][a-z0-9]*)+$/.test(value))) return false;
  // utility class lists: several tokens, all lowercase, at least one hyphenated
  const tokens = value.trim().split(/\s+/);
  if (
    tokens.length >= 2 &&
    tokens.every((t) => /^[a-z0-9][a-z0-9:/[\]._-]*$/.test(t)) &&
    tokens.some((t) => /[-:/]/.test(t))
  ) {
    return false;
  }
  return true;
}

/**
 * String literals and JSX text, line by line. Whole-line comments are dropped;
 * a trailing comment on a line of code is not, so an apostrophe in one can
 * produce an odd excerpt. A finding there is still a finding worth reading.
 */
function stringsFromSource(rel: string, src: string): Copy[] {
  const out: Copy[] = [];
  src.split('\n').forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (/^\s*(import|export)\b.*\bfrom\b/.test(line)) return;
    const where = `${rel}:${i + 1}`;
    for (const m of line.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      // A ${...} interpolation is code, not copy: `turn ${i + 1}` must not fire
      // on the loop variable as the pronoun I.
      const value = m[3] !== undefined ? raw.replace(/\$\{[^}]*\}/g, ' ') : raw;
      if (isCopy(value)) out.push({ where, text: value });
    }
    for (const m of line.matchAll(/>([^<>{}]+)</g)) {
      const value = (m[1] ?? '').trim();
      if (value && isCopy(value)) out.push({ where, text: value });
    }
  });
  return out;
}

function stringsFromJsonValue(value: unknown, path: string, out: Copy[]): void {
  if (typeof value === 'string') {
    if (isCopy(value)) out.push({ where: path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => stringsFromJsonValue(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) stringsFromJsonValue(v, `${path}.${k}`, out);
  }
}

/**
 * A report's text, by the field names in src/contract/types.ts. Transcript
 * turns are deliberately not scanned: they quote two people talking, and the
 * rule is about what this product says, not what was said in the session.
 */
function stringsFromReport(rel: string, report: Report): Copy[] {
  const out: Copy[] = [];
  const push = (field: string, text: unknown): void => {
    if (typeof text === 'string' && text.trim()) out.push({ where: `${rel}#${field}`, text });
  };
  push('summary', report.summary);
  (report.provenance_card ?? []).forEach((line, i) => push(`provenance_card[${i}]`, line));
  (report.claims ?? []).forEach((c, i) => push(`claims[${i}].text`, c?.text));
  Object.entries(report.quote_descriptions ?? {}).forEach(([turnId, text]) => push(`quote_descriptions[${turnId}]`, text));
  push('agreement.statement', report.agreement?.statement);
  push('data_provenance.ui_label', report.data_provenance?.ui_label);
  return out;
}

function isReport(value: unknown): value is Report {
  return typeof value === 'object' && value !== null && 'report_version' in value;
}

function copyIn(rel: string): Copy[] {
  if (rel.endsWith('.json')) {
    const parsed = readJson<unknown>(rel);
    if (isReport(parsed)) return stringsFromReport(rel, parsed);
    const out: Copy[] = [];
    stringsFromJsonValue(parsed, rel, out);
    return out;
  }
  return stringsFromSource(rel, readFileSync(resolve(REPO_ROOT, rel), 'utf8'));
}

// --- self-check ------------------------------------------------------------

// One violating string per rule, and copy that must stay clean. The clean set
// is the half that keeps the checker usable: a lint that fires on everything
// gets switched off.
const VIOLATING: Array<{ rule: string; text: string }> = [
  { rule: 'disposition-nouns', text: 'The report describes a visual learner.' },
  { rule: 'ability-words', text: 'The work in session 4 shows real ability.' },
  { rule: 'comparison', text: 'The sessions are on track for a seventh grader.' },
  { rule: 'learning-gain', text: 'Understanding of fractions improved across the term.' },
  { rule: 'deficit-and-judgement', text: 'These sessions show a weakness in checking.' },
  { rule: 'asserted-initiative', text: 'Planning in session 3 began unprompted.' },
  { rule: 'person-pronoun', text: 'She planned twice before starting.' },
  { rule: 'subject-name', text: 'Maya planned twice in session 3.' },
];

const CLEAN: string[] = [
  'In this session the work moved from exploring to planning twice.',
  'The progression of episodes across these sessions is shown below.',
  'Open the turns behind this claim.',
  'Episodes ran from 6 to 14 turns.',
  'This report was generated from an annotation run.',
  'Reading, analysis and planning each appear in session 4.',
  'No inter-rater reliability has been established for this layer in this project.',
  'Synthetic data: every episode on this page comes from a generated session.',
  "Maya's sessions, in order.",
  'Verification appears in four of the last five sessions.',
];

const SELF_CHECK_NAMES = ['Maya'];

function selfCheck(): number {
  const list = loadBannedPhrases();
  const failures: string[] = [];

  // Every phrase in the file must actually match inside a sentence. A phrase
  // that cannot fire is worse than an absent one: it reads as covered.
  const phrases = list.groups.flatMap((g) => g.phrases);
  let detected = 0;
  for (const phrase of phrases) {
    const found = checkText(`In session 4 the note said ${phrase} here.`, 'self-check', { list });
    if (found.some((f) => f.phrase.toLowerCase() === phrase.toLowerCase())) detected += 1;
    else failures.push(`phrase never fires: "${phrase}"`);
  }

  // Every group needs a fixture, so adding a group to the file without one fails here.
  const fixtured = new Set(VIOLATING.map((v) => v.rule));
  for (const g of list.groups) {
    if (!fixtured.has(g.id)) failures.push(`group "${g.id}" has no fixture in VIOLATING`);
  }

  let fired = 0;
  for (const { rule, text } of VIOLATING) {
    const found = checkText(text, 'self-check', { list, names: SELF_CHECK_NAMES });
    if (found.some((f) => f.rule === rule)) fired += 1;
    else failures.push(`rule "${rule}" did not fire on: ${text}`);
  }

  let clean = 0;
  for (const text of CLEAN) {
    const found = checkText(text, 'self-check', { list, names: SELF_CHECK_NAMES });
    if (found.length === 0) clean += 1;
    else failures.push(`clean copy fired [${found.map((f) => `${f.rule}:${f.phrase}`).join(', ')}]: ${text}`);
  }

  console.log('self-check — src/lint/wording.ts against lint/banned-phrases.json');
  console.log(`  phrases fire:    ${detected}/${phrases.length}`);
  console.log(`  rule fixtures:   ${fired}/${VIOLATING.length}   (${VIOLATING.map((v) => v.rule).join(', ')})`);
  console.log(`  clean copy:      ${clean}/${CLEAN.length} produce no finding`);
  if (failures.length > 0) {
    console.log('');
    for (const f of failures) console.log(`  FAIL ${f}`);
    console.log(`\n${failures.length} self-check failure(s)`);
    return 1;
  }
  console.log('\nself-check passed');
  return 0;
}

// --- main ------------------------------------------------------------------

function main(): number {
  const argv = process.argv.slice(2);
  const names: string[] = [];
  const given: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--self-check') continue;
    if (arg === '--name') {
      const value = argv[i + 1];
      if (value === undefined) {
        console.error('--name needs a value');
        return 2;
      }
      names.push(value);
      i += 1;
      continue;
    }
    given.push(arg);
  }

  if (argv.includes('--self-check')) return selfCheck();

  const roots: string[] = [];
  for (const arg of given.length > 0 ? given : DEFAULT_ROOTS) {
    const rel = relative(REPO_ROOT, resolve(process.cwd(), arg));
    if (rel.startsWith('..')) {
      console.error(`outside the repo, refusing to scan: ${arg}`);
      return 2;
    }
    if (given.length > 0 && !exists(rel)) {
      console.error(`no such path: ${arg}`);
      return 2;
    }
    if (exists(rel)) roots.push(rel);
  }

  const files: string[] = [];
  for (const root of roots) walk(root, files);
  const scanned = files.filter((f) => !isLintOwnFile(f));
  const skipped = files.length - scanned.length;

  const findings: Finding[] = [];
  let strings = 0;
  for (const file of scanned) {
    for (const { where, text } of copyIn(file)) {
      strings += 1;
      findings.push(...checkText(text, where, { names }));
    }
  }

  for (const f of findings) {
    console.log(`${f.where}  [${f.rule}] "${f.phrase}"`);
    console.log(`    ${f.excerpt}`);
    console.log(`    why: ${f.reason}`);
    console.log(`    write instead: ${f.suggestion}`);
    console.log('');
  }

  const where = roots.length > 0 ? roots.join(', ') : (given.length > 0 ? given.join(', ') : DEFAULT_ROOTS.join(', '));
  if (scanned.length === 0) {
    console.log(`nothing scanned: no UI copy or report files under ${where}.`);
    console.log('This is not a pass — no copy exists yet to check (the UI ships in S8 of docs/PLAN-gate0.md).');
    console.log(`0 files, 0 strings, 0 findings${skipped > 0 ? `, ${skipped} lint-owned file(s) skipped` : ''}`);
    return 0;
  }

  console.log(
    `${scanned.length} file(s), ${strings} string(s), ${findings.length} finding(s) under ${where}` +
      `${skipped > 0 ? ` (${skipped} lint-owned file(s) skipped)` : ''}`,
  );
  return findings.length > 0 ? 1 : 0;
}

process.exit(main());
