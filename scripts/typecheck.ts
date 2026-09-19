// `yarn typecheck`.
//
// The vendored Sandpiper files are copied verbatim and must not be edited
// (NOTICE, docs/DEVIATIONS.md D-010), so they are checked under their own
// author's assumptions rather than ours: this repo sets noUncheckedIndexedAccess,
// which upstream does not, and the copy reports four errors because of it.
// Those four, pinned below by file, position and code, are reported and
// ignored; everything else fails the check, including any other vendor error,
// a tsc that could not run, and anything tsc writes to stderr.
// [OURS: the alternative was relaxing the setting for our own code, which is
// the wrong way round — the strictness is for the code we write.]
import { spawnSync } from 'node:child_process';

const KNOWN_VENDOR = [
  'vendor/sandpiper/calculateCohensKappa.ts(28,16): error TS2538:',
  'vendor/sandpiper/calculateCohensKappa.ts(29,16): error TS2538:',
  'vendor/sandpiper/calculateCohensKappa.ts(40,8): error TS2532:',
  'vendor/sandpiper/calculateCohensKappa.ts(40,46): error TS2532:',
];

const result = spawnSync('npx', ['tsc', '--noEmit'], { encoding: 'utf8' });

function fail(why: string): never {
  console.error(`typecheck: ${why}`);
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

if (result.error) fail(`could not run tsc: ${result.error.message}`);
if (result.status === null) fail(`tsc was stopped by ${result.signal}`);
// Under `yarn`, npx warns about yarn's npm_config_* variables. Those lines are
// expected; any other stderr is not.
const stderr = result.stderr.split('\n').filter((l) => l.trim() && !/^npm warn /i.test(l));
if (stderr.length) fail('tsc wrote to stderr');

const lines = result.stdout.split('\n').filter(Boolean);
const diagnostics = lines.filter((l) => /(^|\): )error TS\d+:/.test(l));
if (result.status !== 0 && diagnostics.length === 0) {
  fail(`tsc exited ${result.status} without a diagnostic this script can read`);
}

const vendor = lines.filter((l) => KNOWN_VENDOR.some((k) => l.startsWith(k)));
const ours = lines.filter((l) => !vendor.includes(l));

if (vendor.length) {
  console.log(`${vendor.length} known error(s) in vendored third-party files, ignored:`);
  for (const l of vendor) console.log(`  ${l}`);
}

if (ours.length) {
  console.error(`\n${ours.length} type error(s):`);
  for (const l of ours) console.error(`  ${l}`);
  process.exit(1);
}

console.log('typecheck: clean');
