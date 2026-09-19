// The one place thresholds and paths are read from. See config/gate0.json.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface Gate0Config {
  agreement: { threshold: number; minTurnsForAgreement: number; minTurnsForSessionAgreement: number };
  moves: { codebookPath: string; minItemsForAgreement: number; minItemsForSessionAgreement: number };
  session: { minTurnsReportable: number; requiredTranscriptScope: string };
  sampling: { enabled: boolean; problemsPerSession: number; seed: number };
  codebook: { path: string; domainsDir: string; domain: string };
  paths: { demoDir: string; intakeDir: string; outputDir: string };
  model: { id: string; thinking: 'adaptive' | 'off'; effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' };
}

export function loadConfig(): Gate0Config {
  const raw = readFileSync(resolve(REPO_ROOT, 'config/gate0.json'), 'utf8');
  return JSON.parse(raw) as Gate0Config;
}

export const config = loadConfig();

/** AGREEMENT_THRESHOLD, from config, never inlined anywhere else. */
export const AGREEMENT_THRESHOLD = config.agreement.threshold;
