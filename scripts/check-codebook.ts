// The S2 done criterion (PLAN-gate0 §2): the loader's code list for a session
// with timing, and for one without, where a code flagged requires_timestamps
// is unavailable (INTENT.md, SPEC §4).
//
// Nothing here knows how many codes there are or what they are called. Both
// lists and the check between them come out of the loader.
import {
  loadCodebookForSession,
  dropdownOptions,
  codebookVersion,
} from '../src/codebook/load.ts';
import { config } from '../src/config.ts';
import { exists } from '../src/storage/index.ts';

const domain = config.codebook.domain;
const domainFile = `${config.codebook.domainsDir}/${domain}.json`;

function print(label: string, options: ReturnType<typeof dropdownOptions>): void {
  console.log(`${label}: ${options.length}`);
  const width = Math.max(...options.map((option) => option.code.length));
  for (const option of options) {
    console.log(`  ${option.code.padEnd(width)}  ${option.name}`);
  }
  console.log('');
}

console.log(`codebook_version: ${codebookVersion()}`);
console.log(`domain:           ${domain}`);
console.log(
  `composed with:    ${exists(domainFile) ? domainFile : `${config.codebook.path} alone (${domainFile} not present)`}`,
);
console.log('');

const withTimestamps = dropdownOptions(loadCodebookForSession(true, domain));
const withoutTimestamps = dropdownOptions(loadCodebookForSession(false, domain));

print('Codes, session with timestamps', withTimestamps);
print('Codes, session without timestamps', withoutTimestamps);

const kept = new Set(withoutTimestamps.map((option) => option.code));
const dropped = withTimestamps.filter((option) => !kept.has(option.code));
console.log(`Dropped without timestamps: ${dropped.map((option) => option.code).join(', ') || '(none)'}`);

// The list must shrink by exactly the flagged codes, and by nothing else.
const flagged = loadCodebookForSession(true, domain).codes.filter(
  (entry) => entry.requires_timestamps === true,
);
const expected = flagged.map((entry) => entry.code).sort().join(',');
const actual = dropped.map((option) => option.code).sort().join(',');
if (expected !== actual) {
  console.error(`FAIL: codes flagged requires_timestamps are [${expected}]; dropped [${actual}]`);
  process.exit(1);
}
console.log(`OK: dropped exactly the codes flagged requires_timestamps.`);
