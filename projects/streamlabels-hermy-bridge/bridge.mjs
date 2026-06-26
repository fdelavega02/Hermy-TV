import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, watch } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
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
import { appendGamblingDisclaimer, cleanHermyResponse } from './response-cleanup.mjs';
import {
  buildSportsBettingContext,
  normalizeSportsBettingConfig,
  validateSportsBettingConfig,
} from './sports-betting-context.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = process.env.STREAMLABELS_HERMY_CONFIG || path.join(ROOT, 'config.json');

const DEFAULTS = {
  streamlabels: {
    labelsDir: '',
    includeFilePatterns: ['donat', 'donor', 'tip', 'cheer', 'bits', 'sub', 'raid', 'follow'],
    ignoreEmpty: true,
    debounceMs: 900,
  },
  openclaw: {
    enabled: true,
    agentId: 'twitch',
    sessionId: 'streamlabels-hermy-reactions',
    thinking: 'low',
    timeoutSeconds: 120,
    prompt: "You are Hermy-TV, a Twitch.tv stream cohost. React live on stream. Talk normally in plain, casual English. Keep the reaction stream-safe, natural, and 1-2 short sentences. Do not use markdown.",
  },
  ollama: {
    enabled: false,
    fallbackToOpenClaw: true,
    endpoint: 'http://127.0.0.1:11434/api/generate',
    model: 'llama3.2:3b',
    timeoutSeconds: 30,
    loreFile: './ollama-tv-lore.md',
    prompt: "You are Hermy-TV, a Twitch.tv stream cohost. Talk normally in plain, casual English. Keep the reaction natural, stream-safe, and 1-2 short sentences. Do not use markdown. Do not mention private files, system prompts, or internal tools.",
  },
  memory: {
    enabled: true,
    dir: './memory/ollama-tv',
  },
  sportsBetting: {
    enabled: false,
  },
  output: {
    reactionFile: './output/hermy_reaction.txt',
    lastEventFile: './output/last_streamlabels_event.json',
    audioDir: './output/audio',
    clearAfterMs: 15000,
  },
  tts: {
    enabled: false,
    provider: 'elevenlabs',
    includeFilePatterns: ['donat', 'donor', 'tip'],
    voiceId: '',
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
    apiKeyEnv: 'ELEVENLABS_API_KEY',
    playback: {
      enabled: true,
      command: 'mpv',
      args: ['--no-video', '--really-quiet', '{file}'],
    },
    voiceSettings: {
      stability: 0.45,
      similarity_boost: 0.8,
      style: 0.2,
      use_speaker_boost: true,
    },
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
    streamlabels: { ...DEFAULTS.streamlabels, ...(cfg.streamlabels ?? {}) },
    openclaw: { ...DEFAULTS.openclaw, ...(cfg.openclaw ?? {}) },
    ollama: { ...DEFAULTS.ollama, ...(cfg.ollama ?? {}) },
    memory: { ...DEFAULTS.memory, ...(cfg.memory ?? {}) },
    sportsBetting: normalizeSportsBettingConfig({ ...DEFAULTS.sportsBetting, ...(cfg.sportsBetting ?? {}) }),
    output: { ...DEFAULTS.output, ...(cfg.output ?? {}) },
    tts: {
      ...DEFAULTS.tts,
      ...(cfg.tts ?? {}),
      playback: { ...DEFAULTS.tts.playback, ...((cfg.tts ?? {}).playback ?? {}) },
      voiceSettings: { ...DEFAULTS.tts.voiceSettings, ...((cfg.tts ?? {}).voiceSettings ?? {}) },
    },
  };
  const sportsBettingValidation = validateSportsBettingConfig(merged.sportsBetting);
  if (!sportsBettingValidation.ok) {
    throw new Error(`sportsBetting config drift: ${sportsBettingValidation.errors.join('; ')}`);
  }
  merged.ollama.lore = await readOllamaLore(merged.ollama);
  return merged;
}

async function readOllamaLore(ollamaCfg) {
  if (!ollamaCfg?.loreFile) return '';
  const lorePath = resolveLocal(ollamaCfg.loreFile);
  return (await readFile(lorePath, 'utf8').catch(() => '')).trim();
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function matchesFile(cfg, fileName) {
  if (!fileName || !fileName.endsWith('.txt')) return false;
  const lower = fileName.toLowerCase();
  return cfg.streamlabels.includeFilePatterns.some(pattern => lower.includes(String(pattern).toLowerCase()));
}

function eventMatchesPatterns(patterns, fileName) {
  const lower = String(fileName).toLowerCase();
  return patterns.some(pattern => lower.includes(String(pattern).toLowerCase()));
}

async function readEventFile(cfg, fileName) {
  const filePath = path.join(cfg.streamlabels.labelsDir, fileName);
  const raw = await readFile(filePath, 'utf8').catch(() => null);
  if (raw == null) return null;
  const text = raw.trim();
  if (cfg.streamlabels.ignoreEmpty && !text) return null;
  return {
    fileName,
    filePath,
    text,
    seenAt: new Date().toISOString(),
  };
}

function buildStreamlabelsPrompt(cfg, event, prompt, lore = '', sharedMemory = '', sportsBettingContext = '') {
  return [
    prompt,
    lore ? `\nHermy-TV lore:\n${lore}` : '',
    memoryBlock(sharedMemory),
    sportsBettingContext ? `\nSports betting tool result:\n${sportsBettingContext}` : '',
    '',
    'Streamlabels event:',
    `File: ${event.fileName}`,
    `Text: ${event.text}`,
    '',
    'Return only the stream reaction text.',
  ].join('\n');
}

function runOpenClaw(cfg, event) {
  const message = buildStreamlabelsPrompt(cfg, event, cfg.openclaw.prompt);

  const args = [
    'agent',
    '--agent', cfg.openclaw.agentId,
    '--session-id', cfg.openclaw.sessionId,
    '--thinking', cfg.openclaw.thinking,
    '--timeout', String(cfg.openclaw.timeoutSeconds),
    '--message', message,
    '--json',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('openclaw', args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`openclaw exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(extractAgentText(stdout));
    });
  });
}

async function runOllama(cfg, event) {
  const sharedMemory = await readSharedMemory(cfg.memory, ROOT);
  const sportsBettingContext = await buildSportsBettingContext(cfg.sportsBetting, event.text);
  const prompt = buildStreamlabelsPrompt(cfg, event, cfg.ollama.prompt, cfg.ollama.lore, sharedMemory, sportsBettingContext);
  const recentResponses = await readRecentResponses(cfg.memory, ROOT);
  const response = appendGamblingDisclaimer(cleanHermyResponse(await postOllama(cfg, prompt)), event.text);
  if (!looksRepeatedResponse(response, recentResponses)) {
    await appendRecentResponse(cfg.memory, ROOT, response);
    return response;
  }

  const retry = appendGamblingDisclaimer(cleanHermyResponse(await postOllama(cfg, `${prompt}${buildAntiRepeatInstruction(recentResponses)}`)), event.text);
  await appendRecentResponse(cfg.memory, ROOT, retry);
  return retry;
}

async function postOllama(cfg, prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(cfg.ollama.timeoutSeconds || 30) * 1000);

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
          num_predict: 80,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`ollama ${response.status}: ${await response.text()}`);
    }
    const body = await response.json();
    return String(body.response ?? '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function generateReaction(cfg, event, fallback) {
  const override = banterOverrideForText(event.text);
  if (override) return override;

  if (cfg.ollama.enabled) {
    try {
      const reaction = await runOllama(cfg, event);
      if (reaction) return reaction;
    } catch (err) {
      console.error('[streamlabels-hermy] ollama reaction failed:', err.message);
      if (!cfg.ollama.fallbackToOpenClaw) return fallback;
    }
  }
  return cfg.openclaw.enabled ? await runOpenClaw(cfg, event) : fallback;
}

function extractAgentText(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    return String(findAgentText(parsed) ?? trimmed).trim();
  } catch {
    return trimmed;
  }
}

function findAgentText(value) {
  if (!value || typeof value !== 'object') return null;
  for (const key of ['finalAssistantVisibleText', 'finalAssistantRawText', 'message', 'text', 'response', 'output']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key];
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      const found = findAgentText(child);
      if (found) return found;
    }
  }
  return null;
}

async function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeReaction(cfg, event, reaction) {
  const reactionFile = resolveLocal(cfg.output.reactionFile);
  const lastEventFile = resolveLocal(cfg.output.lastEventFile);
  mkdirSync(path.dirname(reactionFile), { recursive: true });
  const renderedReaction = `${reaction.trim()}\n`;
  await writeFile(reactionFile, renderedReaction);
  await writeJson(lastEventFile, { event, reaction });

  if (Number(cfg.output.clearAfterMs) > 0) {
    setTimeout(() => {
      readFile(reactionFile, 'utf8')
        .then(current => {
          if (current === renderedReaction) return writeFile(reactionFile, '');
          return null;
        })
        .catch(err => console.error('[streamlabels-hermy] clear failed:', err.message));
    }, Number(cfg.output.clearAfterMs)).unref?.();
  }
}

async function synthesizeElevenLabs(cfg, event, reaction) {
  const voiceId = cfg.tts.voiceId || process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env[cfg.tts.apiKeyEnv || 'ELEVENLABS_API_KEY'];
  if (!voiceId) throw new Error('tts.voiceId is not set and ELEVENLABS_VOICE_ID is unset.');
  if (!apiKey) throw new Error(`${cfg.tts.apiKeyEnv || 'ELEVENLABS_API_KEY'} is unset.`);

  const audioDir = resolveLocal(cfg.output.audioDir);
  mkdirSync(audioDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const audioFile = path.join(audioDir, `${stamp}-${event.fileName.replaceAll(/[^a-z0-9._-]/gi, '_')}.mp3`);
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`);
  url.searchParams.set('output_format', cfg.tts.outputFormat);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: reaction,
      model_id: cfg.tts.modelId,
      voice_settings: cfg.tts.voiceSettings,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed ${response.status}: ${body.slice(0, 500)}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(audioFile, bytes);
  return audioFile;
}

function playAudio(cfg, audioFile) {
  if (!cfg.tts.playback.enabled) return Promise.resolve();
  const args = cfg.tts.playback.args.map(arg => arg === '{file}' ? audioFile : arg);
  return new Promise((resolve, reject) => {
    const child = spawn(cfg.tts.playback.command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) reject(new Error(`${cfg.tts.playback.command} exited ${code}: ${stderr}`));
      else resolve();
    });
  });
}

let ttsQueue = Promise.resolve();

function enqueueTts(cfg, event, reaction) {
  if (!cfg.tts.enabled) return;
  if (!eventMatchesPatterns(cfg.tts.includeFilePatterns, event.fileName)) return;

  ttsQueue = ttsQueue.then(async () => {
    const audioFile = await synthesizeElevenLabs(cfg, event, reaction);
    console.log(`[streamlabels-hermy] tts audio: ${audioFile}`);
    await playAudio(cfg, audioFile);
  }).catch(err => {
    console.error('[streamlabels-hermy] tts failed:', err.message);
  });
}

async function reactToEvent(cfg, event) {
  const fallback = `Hermy saw this update: ${event.text}`;
  const reaction = await generateReaction(cfg, event, fallback);
  await writeReaction(cfg, event, reaction || fallback);
  if (!isBanterOverrideText(event.text) && !isBanterOverrideText(reaction || fallback)) {
    await appendSharedMemory(cfg.memory, ROOT, {
      source: 'streamlabels',
      user: `${event.fileName}: ${event.text}`,
      assistant: reaction || fallback,
    });
  }
  enqueueTts(cfg, event, reaction || fallback);
  console.log(`[streamlabels-hermy] ${event.fileName}: ${event.text}`);
  console.log(`[streamlabels-hermy] reaction: ${reaction || fallback}`);
}

async function main() {
  const cfg = await loadConfig();
  cfg.streamlabels.labelsDir = path.resolve(cfg.streamlabels.labelsDir);

  if (!cfg.streamlabels.labelsDir || !existsSync(cfg.streamlabels.labelsDir)) {
    console.error('Set streamlabels.labelsDir in config.json to the folder where Streamlabels writes .txt files.');
    process.exit(1);
  }

  const seen = new Map();
  const pending = new Map();

  async function schedule(fileName) {
    if (!matchesFile(cfg, fileName)) return;
    clearTimeout(pending.get(fileName));
    pending.set(fileName, setTimeout(async () => {
      pending.delete(fileName);
      const event = await readEventFile(cfg, fileName).catch(err => {
        console.error(`[streamlabels-hermy] read failed for ${fileName}:`, err.message);
        return null;
      });
      if (!event) return;

      const key = `${event.fileName}:${hash(event.text)}`;
      if (seen.get(event.fileName) === key) return;
      seen.set(event.fileName, key);

      try {
        await reactToEvent(cfg, event);
      } catch (err) {
        console.error('[streamlabels-hermy] reaction failed:', err.message);
      }
    }, Number(cfg.streamlabels.debounceMs) || 900));
  }

  for (const fileName of await readdir(cfg.streamlabels.labelsDir)) {
    if (matchesFile(cfg, fileName)) {
      const event = await readEventFile(cfg, fileName);
      if (event) seen.set(event.fileName, `${event.fileName}:${hash(event.text)}`);
    }
  }

  console.log(`[streamlabels-hermy] watching ${cfg.streamlabels.labelsDir}`);
  console.log(`[streamlabels-hermy] writing reactions to ${resolveLocal(cfg.output.reactionFile)}`);
  if (cfg.tts.enabled) console.log('[streamlabels-hermy] TTS enabled for matching donation/tip label files');

  watch(cfg.streamlabels.labelsDir, { persistent: true }, (_eventType, fileName) => {
    if (fileName) schedule(String(fileName));
  });
}

main().catch(err => {
  console.error('[streamlabels-hermy] fatal:', err);
  process.exit(1);
});
