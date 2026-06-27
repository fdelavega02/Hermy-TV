import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  appendRecentResponse,
  appendSharedMemory,
  buildAntiRepeatInstruction,
  looksRepeatedResponse,
  memoryBlock,
  readRecentResponses,
  readSharedMemory,
} from './ollama-memory.mjs';
import { banterOverrideForText, isBanterOverrideText } from './banter-overrides.mjs';
import { buildReactionPackInstruction } from './reaction-packs.mjs';
import { appendGamblingDisclaimer, cleanHermyResponse } from './response-cleanup.mjs';
import {
  buildSportsBettingContext,
  normalizeSportsBettingConfig,
} from './sports-betting-context.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = process.env.STREAMLABELS_HERMY_CONFIG || path.join(ROOT, 'config.json');

const DEFAULTS = {
  ollama: {
    endpoint: 'http://127.0.0.1:11434/api/generate',
    model: '3.2',
    timeoutSeconds: 60,
    loreFile: './ollama-tv-lore.md',
    prompt: "You are Hermy-TV, the local terminal version of a stream cohost. Talk normally in plain, casual English. Be casual, a little sharp when it fits, and helpful. Keep replies concise unless the streamer asks for detail.",
  },
  reactionPacks: {
    active: 'default',
  },
  memory: {
    enabled: true,
    dir: './memory/ollama-tv',
  },
  sportsBetting: {
    enabled: false,
  },
};

function resolveLocal(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

async function loadConfig() {
  let cfg = {};
  if (existsSync(CONFIG_PATH)) {
    cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  }
  const merged = {
    ollama: { ...DEFAULTS.ollama, ...(cfg.ollama ?? {}) },
    reactionPacks: { ...DEFAULTS.reactionPacks, ...(cfg.reactionPacks ?? {}) },
    memory: { ...DEFAULTS.memory, ...(cfg.memory ?? {}) },
    sportsBetting: normalizeSportsBettingConfig({ ...DEFAULTS.sportsBetting, ...(cfg.sportsBetting ?? {}) }),
  };
  merged.ollama.lore = merged.ollama.loreFile
    ? (await readFile(resolveLocal(merged.ollama.loreFile), 'utf8').catch(() => '')).trim()
    : '';
  return merged;
}

async function runOllama(cfg, prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(cfg.ollama.timeoutSeconds || 60) * 1000);
  try {
    const response = await fetch(cfg.ollama.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.ollama.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.55,
          top_p: 0.8,
          num_predict: 350,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ollama ${response.status}: ${await response.text()}`);
    const body = await response.json();
    return String(body.response ?? '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(cfg, sharedMemory, history, userText, sportsBettingContext = '', extraInstruction = '') {
  return [
    cfg.ollama.prompt,
    buildReactionPackInstruction(cfg),
    cfg.ollama.lore ? `\nHermy-TV lore:\n${cfg.ollama.lore}` : '',
    memoryBlock(sharedMemory),
    history.length ? `\nCurrent terminal chat:\n${history.join('\n')}` : '',
    extraInstruction,
    sportsBettingContext ? `\nSports betting tool result:\n${sportsBettingContext}` : '',
    '',
    `Streamer: ${userText}`,
    'Hermy-TV:',
  ].join('\n');
}

async function main() {
  const cfg = await loadConfig();
  const rl = createInterface({ input, output });
  const history = [];

  console.log('Hermy-TV local chat. Type /exit to leave.');
  for (;;) {
    let answer;
    try {
      answer = await rl.question('Streamer> ');
    } catch (err) {
      if (err?.code === 'ERR_USE_AFTER_CLOSE') break;
      throw err;
    }
    const userText = answer.trim();
    if (!userText) continue;
    if (['/exit', 'exit', 'quit', '/quit'].includes(userText.toLowerCase())) break;

    const override = banterOverrideForText(userText);
    const sharedMemory = override ? '' : await readSharedMemory(cfg.memory, ROOT);
    const sportsBettingContext = override ? '' : await buildSportsBettingContext(cfg.sportsBetting, userText);
    const prompt = override ? '' : buildPrompt(cfg, sharedMemory, history.slice(-12), userText, sportsBettingContext);
    const recentResponses = await readRecentResponses(cfg.memory, ROOT);
    let response = appendGamblingDisclaimer(cleanHermyResponse(override || await runOllama(cfg, prompt)), userText);
    if (!override && looksRepeatedResponse(response, recentResponses)) {
      response = appendGamblingDisclaimer(
        cleanHermyResponse(await runOllama(cfg, buildPrompt(cfg, sharedMemory, history.slice(-12), userText, sportsBettingContext, buildAntiRepeatInstruction(recentResponses)))),
        userText,
      );
    }
    console.log(`Hermy-TV> ${response}\n`);

    history.push(`Streamer: ${userText}`);
    history.push(`Hermy-TV: ${response}`);
    if (!isBanterOverrideText(userText) && !isBanterOverrideText(response)) {
      await appendSharedMemory(cfg.memory, ROOT, {
        source: 'terminal',
        user: userText,
        assistant: response,
      });
    }
    await appendRecentResponse(cfg.memory, ROOT, response);
  }

  rl.close();
}

main().catch(err => {
  console.error(`Hermy-TV chat failed: ${err.message}`);
  process.exit(1);
});
