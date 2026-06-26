import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildSportsBettingSmokeReport,
  normalizeSportsBettingConfig,
} from './sports-betting-context.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = process.env.STREAMLABELS_HERMY_CONFIG || path.join(ROOT, 'config.json');

async function readConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  return raw.sportsBetting ?? {};
}

const sportsBetting = normalizeSportsBettingConfig(await readConfig());
const report = await buildSportsBettingSmokeReport(sportsBetting);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
