import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import OBSWebSocket from 'obs-websocket-js';
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

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = process.env.STREAMLABELS_HERMY_CONFIG || path.join(ROOT, 'config.json');

const DEFAULTS = {
  widgetReceiver: {
    host: '127.0.0.1',
    port: 17328,
    allowedOrigins: ['https://streamlabs.com', 'https://widgets.streamlabs.com'],
    dedupeSeconds: 30,
  },
  streamlabelsRecentEvents: {
    enabled: true,
    pollMs: 5000,
    tokenSearchDirs: [
      '~/.config/streamlabels/Local Storage/leveldb',
      '~/.config/streamlabels/Cache',
    ],
    endpointBase: 'https://streamlabs.com/api/v5/recentevents',
  },
  donationRules: {
    minSpeakAmount: 5,
    commandMinAmount: 5,
    streamCommandMinAmount: 50,
  },
  obs: {
    address: 'ws://127.0.0.1:4455',
    passwordEnv: 'OBS_WEBSOCKET_PASSWORD',
    passwordFile: '~/.config/obs-studio/plugin_config/obs-websocket/config.json',
    requestTimeoutMs: 5000,
  },
    obsCommands: {
      enabled: true,
      allowStreamControl: true,
      allowBitrateControl: true,
      grayscale: {
      enabled: true,
      commandPatterns: ['grayscale', 'gray', 'grey', 'black and white', 'black-and-white', 'black and white mode', 'vintage', 'old movie', 'old movie mode', '1920s', "1920's", 'the 1920s', 'retro', 'silent film', 'old film', 'bw', 'b&w', 'colorful', 'colourful', 'color back', 'colour back', 'restore color', 'restore colour', 'bring back color', 'bring back colour'],
      filterName: 'Grayscale',
      filterKind: 'color_filter',
      sourceAliases: ['camera', 'cam', 'banner', 'background'],
      filterSettings: {
        brightness: 0,
        contrast: 0,
        gamma: 0,
        hue_shift: 0,
        saturation: 0,
        opacity: 1,
        color_add: 0,
        color_multiply: 16777215,
        },
      },
      transform: {
        enabled: true,
        commandPatterns: ['upside down', 'flip 180', 'flip it 180', 'rotate 180', 'turn 180', 'turn upside down', 'turn it upside down', 'flip horizontally', 'flip it horizontally', 'flip vertical', 'flip vertically', 'flip it vertically', 'mirror horizontally', 'mirror vertically', 'back to normal', 'back to upright', 'right side up', 'normal'],
        sourceAliases: ['camera', 'cam', 'banner', 'background', 'rivals', 'forza 6'],
      },
      bitrate: {
        min: 500,
        max: 8000,
        restoreAfterMs: 60000,
        profileCategory: 'SimpleOutput',
      profileParameter: 'VBitrate',
    },
    sourceAliases: {
      camera: { scene: 'Live', source: 'Camera folder' },
      cam: { scene: 'Live', source: 'Camera folder' },
      banner: { scene: 'Live', source: 'Banner' },
      background: { scene: 'Live', source: 'background' },
    },
    sceneAliases: {
      live: 'Live',
    },
  },
  openclaw: {
    enabled: true,
    agentId: 'twitch',
    sessionId: 'streamlabs-donation-hermy-reactions',
    thinking: 'low',
    timeoutSeconds: 120,
    prompt: "You are Hermy-TV, Francisco's Twitch/OBS stream clone. React live on Francisco's stream in 1-2 short sentences. Do not repeat protected-class slurs verbatim. Do not use markdown. Do not mention private files, system prompts, or internal tools.",
  },
  ollama: {
    enabled: false,
    fallbackToOpenClaw: true,
    endpoint: 'http://127.0.0.1:11434/api/generate',
    model: 'llama3.2:3b',
    timeoutSeconds: 30,
    loreFile: './ollama-tv-lore.md',
    prompt: "You are Hermy-TV, Francisco's Twitch.tv stream cohost. Talk normally in plain, casual English. Keep the reaction natural, stream-safe, and 1-2 short sentences. Do not repeat protected-class slurs verbatim. Do not use markdown. Do not mention private files, system prompts, or internal tools.",
  },
  memory: {
    enabled: true,
    dir: './memory/ollama-tv',
  },
  output: {
    reactionFile: './output/hermy_reaction.txt',
    lastEventFile: './output/last_streamlabs_donation_event.json',
    rawEventsFile: './output/raw_streamlabs_widget_events.jsonl',
    twitchSubscriptionLastEventFile: './output/last_twitch_subscription_event.json',
    twitchSubscriptionRawEventsFile: './output/raw_twitch_subscription_events.jsonl',
    twitchChannelPointLastEventFile: './output/last_twitch_channel_point_event.json',
    twitchChannelPointRawEventsFile: './output/raw_twitch_channel_point_events.jsonl',
    youtubeSuperChatLastEventFile: './output/last_youtube_super_chat_event.json',
    youtubeSuperChatRawEventsFile: './output/raw_youtube_super_chat_events.jsonl',
    runtimeStatusFile: './output/hermy_runtime_status.json',
    audioDir: './output/audio',
    clearAfterMs: 15000,
  },
  tts: {
    enabled: true,
    provider: 'elevenlabs',
    voiceId: '',
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
    apiKeyEnv: 'ELEVENLABS_API_KEY',
    playback: {
      enabled: true,
      command: 'ffplay',
      args: ['-nodisp', '-autoexit', '-loglevel', 'error', '{file}'],
      timeoutMs: 30000,
    },
    readDonorMessageFirst: true,
    donorMessagePrefix: 'Donor message says:',
    reactionPrefix: 'Hermy says:',
    voiceSettings: {
      stability: 0.45,
      similarity_boost: 0.8,
      style: 0.2,
      use_speaker_boost: true,
    },
  },
  twitchChannelPoints: {
    enabled: false,
    websocketUrl: 'wss://eventsub.wss.twitch.tv/ws',
    clientId: '',
    accessTokenEnv: 'TWITCH_CHANNEL_POINTS_TOKEN',
    broadcasterUserId: '',
    dedupeSeconds: 30,
    rewardRoutes: [],
  },
  youtubeSuperChats: {
    enabled: false,
    apiKeyEnv: 'YOUTUBE_API_KEY',
    accessTokenEnv: 'YOUTUBE_ACCESS_TOKEN',
    liveChatId: '',
    broadcastVideoId: '',
    hl: 'en',
    pollMs: 3000,
    dedupeSeconds: 30,
    maxResults: 200,
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
    widgetReceiver: { ...DEFAULTS.widgetReceiver, ...(cfg.widgetReceiver ?? {}) },
    streamlabelsRecentEvents: { ...DEFAULTS.streamlabelsRecentEvents, ...(cfg.streamlabelsRecentEvents ?? {}) },
    donationRules: { ...DEFAULTS.donationRules, ...(cfg.donationRules ?? {}) },
    obs: { ...DEFAULTS.obs, ...(cfg.obs ?? {}) },
    obsCommands: {
      ...DEFAULTS.obsCommands,
      ...(cfg.obsCommands ?? {}),
      grayscale: {
        ...DEFAULTS.obsCommands.grayscale,
        ...((cfg.obsCommands ?? {}).grayscale ?? {}),
        filterSettings: {
          ...DEFAULTS.obsCommands.grayscale.filterSettings,
          ...((cfg.obsCommands ?? {}).grayscale ?? {}).filterSettings,
        },
        sourceAliases: Array.isArray((cfg.obsCommands ?? {}).grayscale?.sourceAliases)
          ? (cfg.obsCommands ?? {}).grayscale.sourceAliases
          : DEFAULTS.obsCommands.grayscale.sourceAliases,
      },
      transform: {
        ...DEFAULTS.obsCommands.transform,
        ...((cfg.obsCommands ?? {}).transform ?? {}),
        sourceAliases: Array.isArray((cfg.obsCommands ?? {}).transform?.sourceAliases)
          ? (cfg.obsCommands ?? {}).transform.sourceAliases
          : DEFAULTS.obsCommands.transform.sourceAliases,
      },
      bitrate: { ...DEFAULTS.obsCommands.bitrate, ...((cfg.obsCommands ?? {}).bitrate ?? {}) },
      sourceAliases: { ...DEFAULTS.obsCommands.sourceAliases, ...((cfg.obsCommands ?? {}).sourceAliases ?? {}) },
      sceneAliases: { ...DEFAULTS.obsCommands.sceneAliases, ...((cfg.obsCommands ?? {}).sceneAliases ?? {}) },
    },
    openclaw: { ...DEFAULTS.openclaw, ...(cfg.openclaw ?? {}) },
    ollama: { ...DEFAULTS.ollama, ...(cfg.ollama ?? {}) },
    memory: { ...DEFAULTS.memory, ...(cfg.memory ?? {}) },
    output: { ...DEFAULTS.output, ...(cfg.output ?? {}) },
    tts: {
      ...DEFAULTS.tts,
      ...(cfg.tts ?? {}),
      playback: { ...DEFAULTS.tts.playback, ...((cfg.tts ?? {}).playback ?? {}) },
      voiceSettings: { ...DEFAULTS.tts.voiceSettings, ...((cfg.tts ?? {}).voiceSettings ?? {}) },
    },
    twitchChannelPoints: {
      ...DEFAULTS.twitchChannelPoints,
      ...(cfg.twitchChannelPoints ?? {}),
      rewardRoutes: Array.isArray(cfg.twitchChannelPoints?.rewardRoutes) ? cfg.twitchChannelPoints.rewardRoutes : DEFAULTS.twitchChannelPoints.rewardRoutes,
    },
    youtubeSuperChats: {
      ...DEFAULTS.youtubeSuperChats,
      ...(cfg.youtubeSuperChats ?? {}),
    },
  };
  merged.ollama.lore = await readOllamaLore(merged.ollama);
  return merged;
}

async function readOllamaLore(ollamaCfg) {
  if (!ollamaCfg?.loreFile) return '';
  const lorePath = resolveLocal(ollamaCfg.loreFile);
  return (await readFile(lorePath, 'utf8').catch(() => '')).trim();
}

function expandHome(p) {
  if (!p?.startsWith('~')) return p;
  return path.join(process.env.HOME, p.slice(1));
}

function send(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function pick(...values) {
  return values.find(value => value != null && String(value).trim() !== '');
}

function normalizeWidgetEvent(raw) {
  const detail = raw.detail ?? raw;
  const event = detail.event ?? detail.message?.[0] ?? detail.message ?? detail;
  const listener = String(detail.listener ?? event.listener ?? event.type ?? '').toLowerCase();
  const type = String(event.type ?? event.name ?? listener).toLowerCase();
  const donationLike = [listener, type].some(value => (
    value.includes('donation') ||
    value.includes('tip') ||
    value.includes('donor')
  )) || event.amount != null || event.formatted_amount != null;
  const subscriptionLike = [listener, type].some(value => (
    value.includes('subscription') ||
    value.includes('subscriber') ||
    value.includes('resub') ||
    value.includes('sub')
  ));
  const followLike = [listener, type].some(value => (
    value.includes('follow')
  ));
  const messageText = String(pick(event.message, event.comment, event.note, event.text) ?? '');

  if (!donationLike && !subscriptionLike && !followLike) return null;
  if (subscriptionLike && !messageText) return null;

  const category = donationLike
    ? 'donation'
    : (followLike
      ? 'follow'
      : (type.includes('resub') || listener.includes('resub') ? 'resubscription' : 'subscription'));

  return {
    source: 'streamlabs-widget',
    category,
    listener,
    type,
    name: String(pick(event.name, event.from, event.username, event.displayName) ?? 'Someone'),
    amount: String(pick(event.formatted_amount, event.amount, event.value) ?? ''),
    numericAmount: parseDonationAmount(pick(event.formatted_amount, event.amount, event.value, '')),
    message: messageText,
    raw,
    seenAt: new Date().toISOString(),
  };
}

function parseDonationAmount(value) {
  const normalized = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return normalized ? Number(normalized[0]) : 0;
}

function parseMicrosAmount(amountMicros) {
  const micros = Number(amountMicros ?? 0);
  if (!Number.isFinite(micros) || micros <= 0) return 0;
  return micros / 1_000_000;
}

function normalizeRecentEvent(raw) {
  return normalizeWidgetEvent({
    detail: {
      listener: raw.listener ?? raw.type ?? raw.event_type ?? raw.name,
      event: raw,
    },
  });
}

function normalizeYouTubeSuperChatEvent(raw) {
  const snippet = raw?.snippet ?? {};
  const author = raw?.authorDetails ?? {};
  const type = String(snippet.type ?? '').toLowerCase();
  if (type !== 'superchatevent' && type !== 'superstickerevent') return null;

  const isSticker = type === 'superstickerevent';
  const details = isSticker ? (snippet.superStickerDetails ?? {}) : (snippet.superChatDetails ?? {});
  const amountMicros = Number(details.amountMicros ?? 0);
  const amount = parseMicrosAmount(amountMicros);
  const amountDisplayString = String(details.amountDisplayString ?? '').trim();
  const currency = String(details.currency ?? '').trim();
  const amountLabel = amountDisplayString || (amount > 0
    ? `${amount.toFixed(2)}${currency ? ` ${currency}` : ''}`
    : '');

  return {
    source: 'youtube-live-chat',
    category: isSticker ? 'youtube-super-sticker' : 'youtube-super-chat',
    type,
    kind: isSticker ? 'superSticker' : 'superChat',
    name: String(author.displayName ?? 'Someone'),
    authorChannelId: String(author.channelId ?? snippet.authorChannelId ?? ''),
    amount: amountLabel,
    numericAmount: amount,
    currency,
    message: String((isSticker ? '' : details.userComment) ?? '').trim(),
    liveChatId: String(snippet.liveChatId ?? ''),
    raw,
    seenAt: new Date().toISOString(),
  };
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function describeStreamEvent(event) {
  if (event.category === 'donation') {
    return `${event.name}${event.amount ? ` donated ${event.amount}` : ' donated'}`;
  }
  if (event.category === 'follow') {
    return `${event.name} followed`;
  }
  if (event.category === 'subscription' || event.category === 'resubscription') {
    return `${event.name} ${event.category === 'resubscription' ? 'resubscribed' : 'subscribed'}`;
  }
  if (event.category === 'youtube-super-chat') {
    return `${event.name}${event.amount ? ` sent ${event.amount} in Super Chat` : ' sent a Super Chat'}`;
  }
  if (event.category === 'youtube-super-sticker') {
    return `${event.name}${event.amount ? ` sent ${event.amount} in Super Sticker` : ' sent a Super Sticker'}`;
  }
  return `${event.name} sent a stream event`;
}

function runOpenClaw(cfg, event) {
  const message = buildStreamEventPrompt(cfg.openclaw.prompt, event);

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

function buildStreamEventPrompt(basePrompt, event, lore = '', sharedMemory = '') {
  const eventLine = describeStreamEvent(event);
  return [
    basePrompt,
    lore ? `\nHermy-TV lore:\n${lore}` : '',
    memoryBlock(sharedMemory),
    '',
    `${event.category ?? 'stream'} event:`,
    eventLine,
    event.message ? `Message: ${event.message}` : 'Message: no viewer message received',
    event.obsCommandResult ? `OBS command result: ${event.obsCommandResult}` : '',
    '',
    'Return only the stream reaction text.',
  ].join('\n');
}

async function runOllamaPrompt(cfg, prompt) {
  const recentResponses = await readRecentResponses(cfg.memory, ROOT);
  const response = cleanHermyResponse(await postOllamaPrompt(cfg, prompt));
  if (!looksRepeatedResponse(response, recentResponses)) {
    await appendRecentResponse(cfg.memory, ROOT, response);
    return response;
  }

  const retry = cleanHermyResponse(await postOllamaPrompt(cfg, `${prompt}${buildAntiRepeatInstruction(recentResponses)}`));
  await appendRecentResponse(cfg.memory, ROOT, retry);
  return retry;
}

function gamblingContextForEvent(event) {
  return [
    event?.message,
    event?.userInput,
    event?.text,
    event?.raw?.message,
    event?.raw?.user_input,
  ].filter(Boolean).join('\n');
}

async function postOllamaPrompt(cfg, prompt) {
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

async function generateStreamReaction(cfg, event, fallback) {
  const override = banterOverrideForText(event.message);
  if (override) return override;

  if (cfg.ollama.enabled) {
    try {
      const sharedMemory = await readSharedMemory(cfg.memory, ROOT);
      const reaction = appendGamblingDisclaimer(
        await runOllamaPrompt(cfg, buildStreamEventPrompt(cfg.ollama.prompt, event, cfg.ollama.lore, sharedMemory)),
        gamblingContextForEvent(event),
      );
      if (reaction) return reaction;
    } catch (err) {
      console.error('[streamlabs-widget] ollama reaction failed:', err.message);
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

async function writeReactionToFile(cfg, event, reaction, lastEventFilePath) {
  const reactionFile = resolveLocal(cfg.output.reactionFile);
  const lastEventFile = resolveLocal(lastEventFilePath);
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
        .catch(err => console.error('[streamlabs-widget] clear failed:', err.message));
    }, Number(cfg.output.clearAfterMs)).unref?.();
  }
}

async function writeReaction(cfg, event, reaction) {
  return writeReactionToFile(cfg, event, reaction, cfg.output.lastEventFile);
}

async function synthesizeElevenLabs(cfg, event, speechText) {
  return synthesizeElevenLabsSpeech(cfg, speechText, `${event.fileName}-streamlabs-donation`);
}

async function synthesizeElevenLabsSpeech(cfg, speechText, artifactName) {
  const voiceId = cfg.tts.voiceId || process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env[cfg.tts.apiKeyEnv || 'ELEVENLABS_API_KEY'];
  if (!voiceId) throw new Error('tts.voiceId is not set and ELEVENLABS_VOICE_ID is unset.');
  if (!apiKey) throw new Error(`${cfg.tts.apiKeyEnv || 'ELEVENLABS_API_KEY'} is unset.`);

  const audioDir = resolveLocal(cfg.output.audioDir);
  mkdirSync(audioDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const audioFile = path.join(audioDir, `${stamp}-${String(artifactName).replaceAll(/[^a-z0-9._-]/gi, '_')}.mp3`);
  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`);
  url.searchParams.set('output_format', cfg.tts.outputFormat);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: speechText,
      model_id: cfg.tts.modelId,
      voice_settings: cfg.tts.voiceSettings,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed ${response.status}: ${body.slice(0, 500)}`);
  }

  await writeFile(audioFile, Buffer.from(await response.arrayBuffer()));
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
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${cfg.tts.playback.command} playback timed out`));
    }, Number(cfg.tts.playback.timeoutMs) || 30000);
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`${cfg.tts.playback.command} exited ${code}: ${stderr}`));
      else resolve();
    });
  });
}

let ttsQueue = Promise.resolve();
let bitrateRestoreTimer = null;
let bitrateRestoreValue = null;
let cachedObsClient = null;
let cachedObsConnectPromise = null;
const runtimeStatus = {
  generatedAt: new Date().toISOString(),
  listeners: {},
  effects: {
    grayscale: {},
  },
  bitrate: {
    active: false,
  },
};

function publicSourceName(sourceName) {
  return String(sourceName || '')
    .replace(/\bfolder\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Source';
}

function publicAliasName(alias) {
  return String(alias || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase()) || 'Source';
}

async function writeRuntimeStatus(cfg) {
  const filePath = resolveLocal(cfg.output.runtimeStatusFile);
  runtimeStatus.generatedAt = new Date().toISOString();
  mkdirSync(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(runtimeStatus, null, 2)}\n`).catch(err => {
    console.error('[streamlabs-widget] runtime status write failed:', err.message);
  });
}

async function initializeRuntimeStatus(cfg) {
  runtimeStatus.listeners = {
    channelPoints: Boolean(cfg.twitchChannelPoints.enabled),
    subscriptions: Boolean(cfg.twitchChannelPoints.enabled),
    obsCommands: Boolean(cfg.obsCommands.enabled),
  };
  runtimeStatus.effects.grayscale = {};
  for (const target of collectGrayscaleTargetCandidatesFromConfig(cfg)) {
    runtimeStatus.effects.grayscale[target.sourceName] = {
      label: publicAliasName(target.alias),
      active: false,
    };
  }
  runtimeStatus.bitrate = {
    active: false,
    currentKbps: null,
    restoreToKbps: null,
    expiresAt: null,
  };
  await writeRuntimeStatus(cfg);
}

function getEventArtifactName(event, fallback = 'event') {
  const rawName = event?.fileName || `${event?.source || fallback}-${event?.category || event?.type || fallback}`;
  return String(rawName).replaceAll(/[^a-z0-9._-]/gi, '_');
}

function enqueueTts(cfg, event, reaction) {
  if (!cfg.tts.enabled) return;
  enqueueSpeechTts(cfg, buildEventSpeech(cfg, event, reaction), `${getEventArtifactName(event)}-${String(event.source || 'stream').replaceAll(/[^a-z0-9._-]/gi, '_')}`);
}

function enqueueSpeechTts(cfg, speechText, artifactName) {
  if (!cfg.tts.enabled) return;
  ttsQueue = ttsQueue.then(async () => {
    const audioFile = await synthesizeElevenLabsSpeech(cfg, speechText, artifactName);
    console.log(`[streamlabs-widget] tts audio: ${audioFile}`);
    await playAudio(cfg, audioFile);
  }).catch(err => {
    console.error('[streamlabs-widget] tts failed:', err.message);
  });
}

function scheduleBitrateRestore(cfg, oldBitrate) {
  if (bitrateRestoreTimer) clearTimeout(bitrateRestoreTimer);
  if (bitrateRestoreValue == null) bitrateRestoreValue = oldBitrate;
  const restoreAfterMs = Number(cfg.obsCommands.bitrate.restoreAfterMs) || 60000;
  runtimeStatus.bitrate = {
    active: true,
    currentKbps: runtimeStatus.bitrate.currentKbps,
    restoreToKbps: Number(bitrateRestoreValue) || bitrateRestoreValue,
    expiresAt: new Date(Date.now() + restoreAfterMs).toISOString(),
  };
  writeRuntimeStatus(cfg);
  bitrateRestoreTimer = setTimeout(async () => {
    const restoreTo = bitrateRestoreValue;
    bitrateRestoreTimer = null;
    bitrateRestoreValue = null;
    const obs = await connectObs(cfg);
    try {
      await obs.call('SetProfileParameter', {
        parameterCategory: cfg.obsCommands.bitrate.profileCategory,
        parameterName: cfg.obsCommands.bitrate.profileParameter,
        parameterValue: String(restoreTo),
      });
      runtimeStatus.bitrate = {
        active: false,
        currentKbps: Number(restoreTo) || restoreTo,
        restoreToKbps: null,
        expiresAt: null,
      };
      await writeRuntimeStatus(cfg);
      console.log(`[streamlabs-widget] restored stream bitrate to ${restoreTo} kbps`);
    } catch (err) {
      console.error('[streamlabs-widget] bitrate restore failed:', err.message);
    }
  }, restoreAfterMs);
  bitrateRestoreTimer.unref?.();
}

function buildDonationSpeech(cfg, event, reaction) {
  return buildEventSpeech(cfg, event, reaction);
}

function buildEventSpeech(cfg, event, reaction) {
  if (!cfg.tts.readDonorMessageFirst || !event.message) return reaction;
  const messagePrefix = event.category === 'donation'
    ? cfg.tts.donorMessagePrefix
    : (event.category === 'follow'
      ? 'Follower message says:'
      : (event.category === 'subscription' || event.category === 'resubscription'
        ? 'Subscriber message says:'
        : (event.category === 'youtube-super-chat'
          ? 'Super Chat message says:'
          : 'Message says:')));
  return [
    messagePrefix,
    sanitizeForSpeech(event.message),
    cfg.tts.reactionPrefix,
    reaction,
  ].filter(Boolean).join(' ');
}

function sanitizeForSpeech(text) {
  return String(text)
    .replace(/\bfag(?:got)?s?\b/gi, 'homophobic slur')
    .replace(/\bn[i1]gg(?:er|a)s?\b/gi, 'racial slur')
    .replace(/\bk[i1]kes?\b/gi, 'antisemitic slur')
    .replace(/\btrann(?:y|ies)\b/gi, 'transphobic slur')
    .replace(/\s+/g, ' ')
    .trim();
}

async function appendRawEvent(cfg, raw) {
  const rawEventsFile = resolveLocal(cfg.output.rawEventsFile);
  mkdirSync(path.dirname(rawEventsFile), { recursive: true });
  await appendFile(rawEventsFile, `${JSON.stringify({ seenAt: new Date().toISOString(), raw })}\n`);
}

function findRecentEventsToken(cfg) {
  for (const configuredDir of cfg.streamlabelsRecentEvents.tokenSearchDirs) {
    const dir = expandHome(configuredDir);
    if (!dir || !existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const full = path.join(dir, file);
      if (!statSync(full).isFile()) continue;
      const text = readFileSyncLatin1(full);
      const recentEventsMatch = text.match(/recentevents\/([A-Za-z0-9_-]{12,})/);
      if (recentEventsMatch) return recentEventsMatch[1];
      const tokenMatch = text.match(/"token"\s*:\s*"([A-Za-z0-9_-]{12,})"/);
      if (tokenMatch) return tokenMatch[1];
    }
  }
  return null;
}

function readFileSyncLatin1(filePath) {
  if (statSync(filePath).size > 10_000_000) return '';
  return readFileSync(filePath).toString('latin1');
}

async function getObsPassword(cfg) {
  const envPassword = process.env[cfg.obs.passwordEnv];
  if (envPassword) return envPassword;
  const passwordFile = expandHome(cfg.obs.passwordFile);
  if (!passwordFile || !existsSync(passwordFile)) return undefined;
  const parsed = JSON.parse(await readFile(passwordFile, 'utf8'));
  return parsed.server_password || undefined;
}

async function connectObs(cfg) {
  if (cachedObsClient) return cachedObsClient;
  if (cachedObsConnectPromise) return cachedObsConnectPromise;

  cachedObsConnectPromise = (async () => {
    const obs = new OBSWebSocket();
    await obs.connect(cfg.obs.address, await getObsPassword(cfg), {
      requestTimeout: Number(cfg.obs.requestTimeoutMs) || 5000,
    });
    cachedObsClient = obs;
    cachedObsConnectPromise = null;
    return obs;
  })().catch(err => {
    cachedObsConnectPromise = null;
    cachedObsClient = null;
    throw err;
  });

  return cachedObsConnectPromise;
}

function clearCachedObsClient() {
  cachedObsClient = null;
}

async function executeObsCommand(cfg, command) {
  if (command.type === 'grayscale' && command.action === 'rejected') {
    return `grayscale command rejected: ${command.reason || 'missing target source'}`;
  }
  const obs = await connectObs(cfg);
  try {
    if (command.type === 'grayscale') {
      return executeGrayscaleMode(cfg, obs, command);
    }

    if (command.type === 'transform') {
      return executeTransformMode(cfg, obs, command);
    }

    if (command.type === 'bitrate') {
      if (command.action === 'rejected') return `bitrate command rejected; allowed range is ${command.min}-${command.max} kbps`;
      const category = cfg.obsCommands.bitrate.profileCategory;
      const parameter = cfg.obsCommands.bitrate.profileParameter;
      const current = await obs.call('GetProfileParameter', {
        parameterCategory: category,
        parameterName: parameter,
      });
      const oldBitrate = current.parameterValue;
      await obs.call('SetProfileParameter', {
        parameterCategory: category,
        parameterName: parameter,
        parameterValue: String(command.bitrate),
      });
      runtimeStatus.bitrate.currentKbps = command.bitrate;
      scheduleBitrateRestore(cfg, oldBitrate);
      return `set stream bitrate to ${command.bitrate} kbps for ${Math.round(Number(cfg.obsCommands.bitrate.restoreAfterMs) / 1000)} seconds`;
    }

    if (command.type === 'stream') {
      const status = await obs.call('GetStreamStatus');
      if (command.action === 'stop') {
        if (!status.outputActive) return 'stream was already offline';
        await obs.call('StopStream');
        return 'stopped the stream';
      }
    }

    if (command.type === 'scene') {
      await obs.call('SetCurrentProgramScene', { sceneName: command.scene });
      return `switched scene to ${command.scene}`;
    }

    if (command.type === 'scene-random') {
      const current = await obs.call('GetCurrentProgramScene');
      const list = await obs.call('GetSceneList');
      const scenes = Array.isArray(list.scenes) ? list.scenes : [];
      const choices = scenes
        .map(scene => scene.sceneName)
        .filter(Boolean)
        .filter(sceneName => sceneName !== current.currentProgramSceneName);
      if (!choices.length) return 'there was no other scene to switch to';
      const nextScene = choices[Math.floor(Math.random() * choices.length)];
      await obs.call('SetCurrentProgramScene', { sceneName: nextScene });
      return `switched scene to ${nextScene}`;
    }

    const { sceneItemId } = await obs.call('GetSceneItemId', {
      sceneName: command.scene,
      sourceName: command.source,
    });
    let enabled;
    if (command.action === 'toggle') {
      const state = await obs.call('GetSceneItemEnabled', {
        sceneName: command.scene,
        sceneItemId,
      });
      enabled = !state.sceneItemEnabled;
    } else {
      enabled = command.action === 'show';
    }
    await obs.call('SetSceneItemEnabled', {
      sceneName: command.scene,
      sceneItemId,
      sceneItemEnabled: enabled,
    });
    return `${enabled ? 'showed' : 'hid'} ${command.source}`;
  } catch (err) {
    clearCachedObsClient();
    throw err;
  } finally {
    // Keep the OBS websocket warm so later channel-point requests do not pay reconnect latency.
  }
}

function getGrayscaleTargets(cfg) {
  const aliases = Array.isArray(cfg.obsCommands.grayscale?.sourceAliases)
    ? cfg.obsCommands.grayscale.sourceAliases
    : [];
  return [...new Set(
    aliases.flatMap(alias => {
      const target = cfg.obsCommands.sourceAliases?.[alias];
      if (!target) return [];
      if (Array.isArray(target.sources)) return target.sources.filter(Boolean);
      if (Array.isArray(target.source)) return target.source.filter(Boolean);
      if (target.source) return [target.source];
      return [];
    }),
  )];
}

function normalizePhrase(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseToPattern(phrase) {
  const tokens = normalizePhrase(phrase)
    .split(' ')
    .filter(Boolean)
    .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!tokens.length) return null;
  return new RegExp(`\\b${tokens.join('\\s+')}\\b`, 'i');
}

function collectGrayscaleTargetCandidatesFromConfig(cfg, aliases = null) {
  const targetAliases = Array.isArray(aliases)
    ? aliases
    : (Array.isArray(cfg.obsCommands.grayscale?.sourceAliases)
      ? cfg.obsCommands.grayscale.sourceAliases
      : []);
  const candidates = [];
  const seen = new Set();

  for (const alias of targetAliases) {
    const target = cfg.obsCommands.sourceAliases?.[alias];
    if (!target) continue;
    const sourceNames = [];
    if (Array.isArray(target.sources)) sourceNames.push(...target.sources);
    if (Array.isArray(target.source)) sourceNames.push(...target.source);
    if (typeof target.source === 'string') sourceNames.push(target.source);

    for (const sourceName of sourceNames) {
      const key = `${alias}:${sourceName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ alias, sourceName, target });
    }
  }

  return candidates.sort((left, right) => normalizePhrase(right.sourceName).length - normalizePhrase(left.sourceName).length);
}

function resolveGrayscaleTarget(cfg, message, aliases = null) {
  const lower = normalizePhrase(message);
  const matches = [];

  for (const candidate of collectGrayscaleTargetCandidatesFromConfig(cfg, aliases)) {
    const aliasPattern = phraseToPattern(candidate.alias);
    const sourcePattern = phraseToPattern(candidate.sourceName);
    if ((aliasPattern && aliasPattern.test(lower)) || (sourcePattern && sourcePattern.test(lower))) {
      matches.push(candidate);
    }
  }

  if (matches.length > 1) return { error: 'pick one target' };
  if (!matches.length) return { error: 'missing target' };

  const target = matches[0];
  return {
    alias: target.alias,
    source: target.sourceName,
    scene: target.target.scene,
  };
}

function grayscaleFilterSettings(cfg) {
  return {
    brightness: 0,
    contrast: 0,
    gamma: 0,
    hue_shift: 0,
    saturation: 0,
    opacity: 1,
    color_add: 0,
    color_multiply: 16777215,
    ...(cfg.obsCommands.grayscale?.filterSettings ?? {}),
  };
}

async function ensureGrayscaleFilter(obs, cfg, sourceName) {
  const filterName = cfg.obsCommands.grayscale?.filterName || 'Grayscale';
  const filterKind = cfg.obsCommands.grayscale?.filterKind || 'color_filter';
  const { filters } = await obs.call('GetSourceFilterList', { sourceName });
  const existing = Array.isArray(filters) ? filters.find(filter => filter.filterName === filterName) : null;
  const settings = grayscaleFilterSettings(cfg);

  if (!existing) {
    try {
      await obs.call('CreateSourceFilter', {
        sourceName,
        filterName,
        filterKind,
        filterSettings: settings,
      });
    } catch (err) {
      if (!String(err.message || err).includes('already exists')) {
        throw err;
      }
    }
  } else {
    await obs.call('SetSourceFilterSettings', {
      sourceName,
      filterName,
      filterSettings: settings,
    });
  }

  return filterName;
}

async function setGrayscaleEnabled(obs, sourceName, filterName, enabled) {
  await obs.call('SetSourceFilterEnabled', {
    sourceName,
    filterName,
    filterEnabled: enabled,
  });
}

async function executeGrayscaleMode(cfg, obs, command) {
  const filterName = cfg.obsCommands.grayscale?.filterName || 'grayscale';
  const nextEnabled = command?.action === 'enable';
  const sourceName = command?.source;
  if (command?.action === 'disable-all') {
    const targets = getGrayscaleTargets(cfg);
    if (!targets.length) return 'grayscale mode needs a target source';
    try {
      for (const targetSource of targets) {
        await obs.call('SetSourceFilterEnabled', {
          sourceName: targetSource,
          filterName,
          filterEnabled: false,
        });
        const previous = runtimeStatus.effects.grayscale[targetSource] || {};
        runtimeStatus.effects.grayscale[targetSource] = {
          label: previous.label || publicSourceName(targetSource),
          active: false,
        };
      }
      await writeRuntimeStatus(cfg);
      return 'grayscale mode is off';
    } catch (err) {
      console.error('[streamlabs-widget] grayscale mode failed:', err.message);
      return `grayscale mode failed: ${err.message}`;
    }
  }
  if (!sourceName) return 'grayscale mode needs a target source';

  try {
    await obs.call('SetSourceFilterEnabled', {
      sourceName,
      filterName,
      filterEnabled: nextEnabled,
    });
    const previous = runtimeStatus.effects.grayscale[sourceName] || {};
    runtimeStatus.effects.grayscale[sourceName] = {
      label: previous.label || publicSourceName(sourceName),
      active: nextEnabled,
    };
    await writeRuntimeStatus(cfg);
  } catch (err) {
    console.error('[streamlabs-widget] grayscale mode failed:', err.message);
    return `grayscale mode failed: ${err.message}`;
  }

  const turnedOn = nextEnabled;
  const turnedOff = !nextEnabled;
  if (turnedOn) return 'grayscale mode is on';
  if (turnedOff) return 'grayscale mode is off';
  return `grayscale mode updated`;
}

function normalizeFlipMagnitude(value, fallback = 1) {
  const magnitude = Math.abs(Number(value));
  return Number.isFinite(magnitude) && magnitude > 0 ? magnitude : fallback;
}

function hasTransformIntent(lower) {
  return /\b(?:upside\s+down|flip|rotate|mirror|horizontal|vertical|normal|upright|reset|restore|undo)\b/i.test(lower);
}

function sanitizeSceneItemTransform(transform) {
  const nextTransform = { ...transform };
  if (String(nextTransform.boundsType || '') === 'OBS_BOUNDS_NONE') {
    delete nextTransform.boundsWidth;
    delete nextTransform.boundsHeight;
    delete nextTransform.boundsAlignment;
  }
  return nextTransform;
}

async function applySceneItemTransform(obs, sceneName, sourceName, update) {
  const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName });
  const current = await obs.call('GetSceneItemTransform', { sceneName, sceneItemId });
  const currentTransform = current.sceneItemTransform ?? {};
  const nextTransform = sanitizeSceneItemTransform({
    ...currentTransform,
    ...(update({ ...currentTransform }) ?? {}),
  });
  await obs.call('SetSceneItemTransform', {
    sceneName,
    sceneItemId,
    sceneItemTransform: nextTransform,
  });
}

async function executeTransformMode(cfg, obs, command) {
  const sourceName = command?.source;
  const sceneName = command?.scene || 'Live';
  if (!sourceName) return 'transform mode needs a target source';

  try {
    await applySceneItemTransform(obs, sceneName, sourceName, current => {
      if (command.action === 'reset') {
        return {
          rotation: 0,
          scaleX: normalizeFlipMagnitude(current.scaleX, 1),
          scaleY: normalizeFlipMagnitude(current.scaleY, 1),
        };
      }

      if (command.action === 'flip-horizontal') {
        return {
          scaleX: -normalizeFlipMagnitude(current.scaleX, 1),
        };
      }

      if (command.action === 'flip-vertical') {
        return {
          scaleY: -normalizeFlipMagnitude(current.scaleY, 1),
        };
      }

      return {
        rotation: 180,
      };
    });
  } catch (err) {
    console.error('[streamlabs-widget] transform mode failed:', err.message);
    return `transform mode failed: ${err.message}`;
  }

  if (command.action === 'reset') return 'restored the source to normal';
  if (command.action === 'flip-horizontal') return 'flipped the source horizontally';
  if (command.action === 'flip-vertical') return 'flipped the source vertically';
  return 'turned the source upside down';
}

async function precreateGrayscaleFilters(cfg) {
  const targets = getGrayscaleTargets(cfg);
  if (!targets.length) {
    console.log('[streamlabs-widget] grayscale warmup skipped: no configured OBS sources');
    return;
  }

  const obs = await connectObs(cfg);
  for (const sourceName of targets) {
    await ensureGrayscaleFilter(obs, cfg, sourceName);
  }
  console.log(`[streamlabs-widget] grayscale filters precreated for ${targets.join(', ')}`);
}

async function parseObsCommand(cfg, message) {
  if (!cfg.obsCommands.enabled || !message) return null;
  const lower = String(message).toLowerCase();

  if (cfg.obsCommands.allowStreamControl) {
    if (/\b(?:stop|end|kill)\s+(?:the\s+)?stream\b/i.test(lower)) {
      return { type: 'stream', action: 'stop' };
    }
  }

  if (cfg.obsCommands.allowBitrateControl) {
    const bitrateMatch = lower.match(/\b(?:set|change|drop|raise)?\s*(?:stream\s+)?bitrate\s*(?:to)?\s*(\d{3,5})\b/i);
    if (bitrateMatch) {
      const bitrate = Number(bitrateMatch[1]);
      const min = Number(cfg.obsCommands.bitrate.min);
      const max = Number(cfg.obsCommands.bitrate.max);
      if (Number.isFinite(bitrate) && bitrate >= min && bitrate <= max) {
        return { type: 'bitrate', action: 'set-temporary', bitrate };
      }
      return { type: 'bitrate', action: 'rejected', bitrate, min, max };
    }
  }

  if (cfg.obsCommands.grayscale?.enabled) {
    const patterns = Array.isArray(cfg.obsCommands.grayscale.commandPatterns)
      ? cfg.obsCommands.grayscale.commandPatterns
      : [];
    const matched = patterns.some(pattern => lower.includes(String(pattern).toLowerCase()));
    if (matched) {
      const restoreColor = /\b(?:off|disable|turn\s+off|restore\s+colou?r|make\s+(?:it|this|the\s+(?:stream|camera|source|scene))?\s*colou?rful|colou?rful|bring\s+back\s+colou?r|bring\s+(?:it|this|the\s+(?:stream|camera|source|scene))?\s*back\s+to\s+colou?r|bring\s+(?:it|this|the\s+(?:stream|camera|source|scene))?\s*colou?r\s+back|give\s+(?:it|this|the\s+(?:stream|camera|source|scene))?\s*(?:its|the)?\s*colou?r\s+back|back\s+to\s+colou?r|back\s+to\s+normal|go\s+back\s+to\s+normal|colou?r\s+back|restore\s+.*\s+to\s+normal|return\s+.*\s+to\s+normal|normal(?:\s+colou?r)?|put\s+back\s+in\s+colou?r)\b/i.test(lower);
      const target = resolveGrayscaleTarget(cfg, lower);
      if (target.error) {
        if (restoreColor && target.error === 'missing target') {
          return { type: 'grayscale', action: 'disable-all' };
        }
        return { type: 'grayscale', action: 'rejected', reason: target.error };
      }
      const enableGrayscale = /\b(?:on|enable|turn\s+on|black\s+and\s+white|black and white mode|vintage|old movie|old movie mode|1920s|the 1920s|1920's|grayscale|gray|grey)\b/i.test(lower);
      if (restoreColor) {
        return { type: 'grayscale', action: 'disable', source: target.source };
      }
      if (enableGrayscale) {
        return { type: 'grayscale', action: 'enable', source: target.source };
      }
      return { type: 'grayscale', action: 'enable', source: target.source };
    }
  }

  if (hasTransformIntent(lower)) {
    if (!cfg.obsCommands.transform?.enabled) {
      return { type: 'transform', action: 'disabled' };
    }
    if (cfg.obsCommands.transform?.enabled) {
      const target = resolveGrayscaleTarget(cfg, lower, cfg.obsCommands.transform.sourceAliases);
      if (target.error) {
        return { type: 'transform', action: 'rejected', reason: target.error };
      }

      if (/\b(?:reset(?:\s+transform)?|reset\s+(?:it|the\s+(?:camera|source|item))|restore(?:\s+(?:it|the\s+(?:camera|source|item)))?|undo\s+(?:flip|rotation)|put\s+back(?:\s+to\s+normal)?|back\s+to\s+normal|back\s+to\s+upright|right\s+side\s+up|normal)\b/i.test(lower)) {
        return { type: 'transform', action: 'reset', source: target.source };
      }
      if (/\b(?:flip\s+(?:it\s+)?horizontally|mirror\s+horizontally)\b/i.test(lower)) {
        return { type: 'transform', action: 'flip-horizontal', source: target.source };
      }
      if (/\bmirror\b/i.test(lower)) {
        return { type: 'transform', action: 'flip-horizontal', source: target.source };
      }
      if (/\b(?:flip\s+(?:it\s+)?vertically|flip\s+vertical|mirror\s+vertically)\b/i.test(lower)) {
        return { type: 'transform', action: 'flip-vertical', source: target.source };
      }
      if (/\b(?:upside\s+down|flip\s+it\s+180|flip\s+180|rotate\s+180|turn\s+180|turn\s+(?:it\s+)?upside\s+down)\b/i.test(lower)) {
        return { type: 'transform', action: 'rotate-180', source: target.source };
      }
      return { type: 'transform', action: 'rotate-180', source: target.source };
    }
  }

  const sourceAliases = Object.entries(cfg.obsCommands.sourceAliases);
  for (const [alias, target] of sourceAliases) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sourcePattern = new RegExp(`\\b(show|hide|toggle|turn on|turn off)\\s+(?:the\\s+)?${escapedAlias}\\b`, 'i');
    const match = lower.match(sourcePattern);
    if (!match) continue;
    const actionMap = {
      show: 'show',
      hide: 'hide',
      toggle: 'toggle',
      'turn on': 'show',
      'turn off': 'hide',
    };
    return {
      type: 'source',
      action: actionMap[match[1].toLowerCase()],
      alias,
      scene: target.scene,
      source: target.source,
    };
  }

  const sceneMatch = lower.match(/\b(?:switch|change|go|set)\s+(?:to\s+)?(?:the\s+)?(?:scene\s+)?([a-z0-9 _-]{2,40})\b/i);
  if (/\bswitch\s+scenes\b/i.test(lower)) {
    return { type: 'scene-random', action: 'set' };
  }
  if (sceneMatch) {
    const alias = sceneMatch[1].trim().replace(/\s+/g, ' ');
    const scene = cfg.obsCommands.sceneAliases[alias];
    if (scene) return { type: 'scene', action: 'set', alias, scene };
  }

  return null;
}

function explainObsCommandRejection(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) {
    return 'I did not get an OBS command to run.';
  }
  if (/\baudio\s+bitrate\b/i.test(lower)) {
    return 'Audio bitrate is not a supported command here. Use "bitrate" by itself, like "set bitrate to 800".';
  }
  if (/\bbitrate\b/i.test(lower)) {
    return 'Bitrate is allowed, but it has to be written as "set bitrate to N" and the number must be between 500 and 8000 kbps.';
  }
  if (/\bgrayscale\b|\bgray\b|\bgrey\b|\bblack\s+and\s+white\b|\bblack\s+and\s+white\s+mode\b|\bvintage\b|\bold\s+movie\b|\b1920s\b|\b1920's\b|\bbw\b|\bb&w\b/i.test(lower)) {
    return 'Say the specific target too, like "turn camera grayscale" or "turn Rivals black and white".';
  }
  if (/\b(?:upside\s+down|flip|rotate|mirror|horizontal|vertical)\b/i.test(lower)) {
    return 'Flip and rotate commands are paused for now.';
  }
  if (/\b(?:show|hide|toggle|turn on|turn off)\b/i.test(lower)) {
    return 'That did not match one of the whitelisted OBS sources or scenes.';
  }
  if (/\bstream\b/i.test(lower)) {
    return 'Stream control is donation-only and requires a $50 donation or higher.';
  }
  return 'That did not match any approved OBS command.';
}

async function maybeExecuteObsCommand(cfg, event) {
  const command = await parseObsCommand(cfg, event.message);
  if (!command) return null;
  const amount = Number(event.numericAmount);
  const isDonation = event.category === 'donation' || event.category === 'youtube-super-chat' || event.category === 'youtube-super-sticker';
  const isSub = event.category === 'subscription' || event.category === 'resubscription';
  const isFollow = event.category === 'follow';

  if (command.type === 'stream') {
    if (!isDonation || amount < Number(cfg.donationRules.streamCommandMinAmount)) return null;
  } else if (command.type === 'grayscale') {
    if (isDonation) {
      if (amount < Number(cfg.donationRules.commandMinAmount)) return null;
    } else if (!isSub && !isFollow) {
      return null;
    }
  } else if (command.type === 'transform' && command.action === 'disabled') {
    return 'Flip and rotate commands are paused for now.';
  } else if (isDonation) {
    if (amount < Number(cfg.donationRules.commandMinAmount)) return null;
  } else if (!isSub && !isFollow) {
    return null;
  }

  return executeObsCommand(cfg, command);
}

function isPaidEventBelowMinimum(cfg, event) {
  const paidEvent = event.category === 'donation' || event.category === 'youtube-super-chat' || event.category === 'youtube-super-sticker';
  return paidEvent && Number(event.numericAmount) < Number(cfg.donationRules.minSpeakAmount);
}

async function appendTwitchChannelPointEvent(cfg, raw) {
  const rawEventsFile = resolveLocal(cfg.output.twitchChannelPointRawEventsFile);
  mkdirSync(path.dirname(rawEventsFile), { recursive: true });
  await appendFile(rawEventsFile, `${JSON.stringify({ seenAt: new Date().toISOString(), raw })}\n`);
}

async function appendTwitchSubscriptionEvent(cfg, raw) {
  const rawEventsFile = resolveLocal(cfg.output.twitchSubscriptionRawEventsFile);
  mkdirSync(path.dirname(rawEventsFile), { recursive: true });
  await appendFile(rawEventsFile, `${JSON.stringify({ seenAt: new Date().toISOString(), raw })}\n`);
}

function normalizeChannelPointEvent(raw) {
  const reward = raw.reward ?? {};
  const status = String(raw.status ?? '').toLowerCase();
  return {
    source: 'twitch-channel-points',
    category: 'channel_point',
    type: 'reward_redemption',
    id: String(raw.id ?? ''),
    status,
    name: String(raw.user_name ?? raw.user_login ?? 'Someone'),
    userInput: String(raw.user_input ?? ''),
    reward: {
      id: String(reward.id ?? ''),
      title: String(reward.title ?? ''),
      cost: Number(reward.cost ?? 0),
    },
    raw,
    seenAt: new Date().toISOString(),
  };
}

function normalizeTwitchSubscriptionEvent(raw, subscriptionType) {
  const type = String(subscriptionType ?? '').toLowerCase();
  if (type === 'channel.subscribe') {
    return {
      source: 'twitch-eventsub',
      category: 'subscription',
      type: 'subscribe',
      name: String(raw.user_name ?? raw.user_login ?? 'Someone'),
      tier: String(raw.tier ?? ''),
      isGift: Boolean(raw.is_gift),
      raw,
      seenAt: new Date().toISOString(),
    };
  }

  if (type === 'channel.subscription.message') {
    const message = raw.message ?? {};
    return {
      source: 'twitch-eventsub',
      category: 'resubscription',
      type: 'resub',
      name: String(raw.user_name ?? raw.user_login ?? 'Someone'),
      tier: String(raw.tier ?? ''),
      isGift: Boolean(raw.is_gift),
      message: String(message.text ?? ''),
      cumulativeMonths: Number(raw.cumulative_months ?? 0),
      streakMonths: raw.streak_months ?? null,
      durationMonths: Number(raw.duration_months ?? 0),
      raw,
      seenAt: new Date().toISOString(),
    };
  }

  return null;
}

function channelPointRouteMatches(route, reward) {
  if (!route || !reward) return false;
  if (route.rewardId && String(route.rewardId) === reward.id) return true;
  if (route.reward_id && String(route.reward_id) === reward.id) return true;
  if (route.rewardTitle && String(route.rewardTitle).toLowerCase() === reward.title.toLowerCase()) return true;
  if (route.reward_title && String(route.reward_title).toLowerCase() === reward.title.toLowerCase()) return true;
  return false;
}

function findChannelPointRoute(cfg, reward) {
  return cfg.twitchChannelPoints.rewardRoutes.find(route => channelPointRouteMatches(route, reward)) ?? null;
}

function buildChannelPointPrompt(cfg, event, route, basePrompt = cfg.openclaw.prompt, lore = '', sharedMemory = '') {
  const action = route?.mode === 'obsCommand' || route?.mode === 'obs-command'
    ? 'react to the safe OBS command result'
    : 'talk back to the viewer';
  const obsNote = event.obsCommandResult?.includes('bitrate command rejected')
    ? 'If the OBS command was rejected because the bitrate number was out of range, say that bitrate is allowed but the value must be between 500 and 8000 kbps.'
    : '';
  return [
    basePrompt,
    lore ? `\nHermy-TV lore:\n${lore}` : '',
    memoryBlock(sharedMemory),
    '',
    'Channel points redemption:',
    `Reward: ${event.reward.title || 'Untitled reward'}`,
    `Viewer: ${event.name}`,
    event.userInput ? `Viewer input: ${event.userInput}` : 'Viewer input: none',
    event.obsCommandResult ? `OBS command result: ${event.obsCommandResult}` : '',
    obsNote,
    '',
    `Your job: ${action}.`,
    'Keep it stream-safe and 1-2 short sentences.',
    'Return only the stream reaction text.',
  ].join('\n');
}

function buildChannelPointReactionFallback(event, route) {
  if (route?.mode === 'obsCommand' || route?.mode === 'obs-command') {
    if (String(event.obsCommandResult || '').includes('grayscale command rejected')) {
      return `Pick one specific target, ${event.name}. Grayscale needs a named source.`;
    }
    if (String(event.obsCommandResult || '').includes('transform mode failed')) {
      return `OBS got weird on the transform, ${event.name}. Try that one again.`;
    }
    if (String(event.obsCommandResult || '').includes('bitrate command rejected')) {
      return `Bitrate is allowed, ${event.name}, but it has to be between 500 and 8000 kbps.`;
    }
    if (String(event.obsCommandResult || '').includes('audio bitrate')) {
      return `Audio bitrate is not a supported command, ${event.name}. Use "set bitrate to 800" instead.`;
    }
    if (String(event.obsCommandResult || '').includes('whitelisted OBS sources or scenes')) {
      return `That OBS source or scene is not whitelisted, ${event.name}.`;
    }
    if (String(event.obsCommandResult || '').includes('approved OBS command')) {
      return `That did not match any approved OBS command, ${event.name}.`;
    }
    return event.userInput
      ? `Okay, ${event.name}. I handled that command.`
      : `Okay, ${event.name}. I handled that command reward.`;
  }
  return event.userInput
    ? `Thanks, ${event.name}. I saw your message.`
    : `Thanks for the channel points, ${event.name}.`;
}

async function handleChannelPointRedemption(cfg, event) {
  const route = findChannelPointRoute(cfg, event.reward);
  if (!route) {
    console.log(`[streamlabs-widget] channel point ignored (no route): ${event.reward.title} from ${event.name}`);
    return;
  }

  let obsCommandResult = null;
  try {
    if (route.mode === 'obsCommand' || route.mode === 'obs-command') {
      const commandSource = route.command || route.commandText || route.command_text || (route.commandFromUserInput ? event.userInput : event.userInput);
      const command = await parseObsCommand(cfg, commandSource);
      if (!command) {
        obsCommandResult = explainObsCommandRejection(commandSource);
      } else if (command.type === 'transform' && command.action === 'disabled') {
        obsCommandResult = 'Flip and rotate commands are paused for now.';
      } else if (command.type === 'stream') {
        obsCommandResult = 'Stream control is donation-only and requires a $50 donation or higher.';
      } else {
        const timeoutMs = Number(cfg.twitchChannelPoints.obsCommandTimeoutMs) || 7000;
        obsCommandResult = await withTimeout(
          executeObsCommand(cfg, command),
          timeoutMs,
          `OBS command timed out after ${timeoutMs}ms`,
        );
      }
    }
  } catch (err) {
    obsCommandResult = `OBS command failed: ${err.message}`;
    console.error('[streamlabs-widget] channel point OBS command failed:', err.message);
  }

  if (obsCommandResult) event.obsCommandResult = obsCommandResult;
  const fallback = buildChannelPointReactionFallback(event, route);
  const prompt = buildChannelPointPrompt(cfg, event, route);
  let reaction = fallback;
  try {
    reaction = await generateChannelPointReaction(cfg, event, route, prompt, fallback);
  } catch (err) {
    console.error('[streamlabs-widget] channel point reaction generation failed:', err.message);
    reaction = fallback;
  }
  await writeReactionToFile(cfg, event, reaction || fallback, cfg.output.twitchChannelPointLastEventFile);
  if (!isBanterOverrideText(event.userInput) && !isBanterOverrideText(reaction || fallback)) {
    await appendSharedMemory(cfg.memory, ROOT, {
      source: 'twitch-channel-points',
      user: `Reward ${event.reward.title || 'Untitled reward'} from ${event.name}${event.userInput ? ` - ${event.userInput}` : ''}`,
      assistant: reaction || fallback,
      meta: { reward: event.reward.title, mode: route.mode },
    });
  }
  enqueueSpeechTts(cfg, reaction || fallback, `channel-points-${event.reward.title || 'reward'}`);
  console.log(`[streamlabs-widget] channel point: ${event.reward.title} ${event.name} ${event.userInput}`);
  console.log(`[streamlabs-widget] reaction: ${reaction || fallback}`);
}

async function generateChannelPointReaction(cfg, event, route, openClawPrompt, fallback) {
  const override = banterOverrideForText(event.userInput);
  if (override) return override;

  const canUseOllama = route?.mode !== 'obsCommand' && route?.mode !== 'obs-command';
  if (canUseOllama && cfg.ollama.enabled) {
    try {
      const sharedMemory = await readSharedMemory(cfg.memory, ROOT);
      const ollamaPrompt = buildChannelPointPrompt(cfg, event, route, cfg.ollama.prompt, cfg.ollama.lore, sharedMemory);
      const reaction = await withTimeout(
        runOllamaPrompt(cfg, ollamaPrompt),
        Math.max(7000, (Number(cfg.ollama.timeoutSeconds) || 20) * 1000 + 2000),
        'ollama reaction timed out',
      );
      if (reaction) return appendGamblingDisclaimer(reaction, gamblingContextForEvent(event));
    } catch (err) {
      console.error('[streamlabs-widget] channel point ollama reaction failed:', err.message);
      if (!cfg.ollama.fallbackToOpenClaw) return fallback;
    }
  }

  return cfg.openclaw.enabled
    ? await withTimeout(
      runOpenClawForChannelPoint(cfg, openClawPrompt),
      Math.max(7000, (Number(cfg.openclaw.timeoutSeconds) || 20) * 1000 + 2000),
      'openclaw reaction timed out',
    )
    : fallback;
}

function getTwitchChannelPointsToken(cfg) {
  const envToken = process.env[cfg.twitchChannelPoints.accessTokenEnv];
  return envToken || cfg.twitchChannelPoints.accessToken || '';
}

async function runOpenClawForChannelPoint(cfg, prompt) {
  const args = [
    'agent',
    '--agent', cfg.openclaw.agentId,
    '--session-id', `${cfg.openclaw.sessionId}-channel-points`,
    '--thinking', cfg.openclaw.thinking,
    '--timeout', String(cfg.openclaw.timeoutSeconds),
    '--message', prompt,
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

function getYouTubeCredentials(cfg) {
  const apiKey = process.env[cfg.youtubeSuperChats.apiKeyEnv || 'YOUTUBE_API_KEY'] || cfg.youtubeSuperChats.apiKey || '';
  const accessToken = process.env[cfg.youtubeSuperChats.accessTokenEnv || 'YOUTUBE_ACCESS_TOKEN'] || cfg.youtubeSuperChats.accessToken || '';
  return {
    apiKey: String(apiKey).trim(),
    accessToken: String(accessToken).trim(),
  };
}

function buildYouTubeFetchInit(cfg) {
  const { apiKey, accessToken } = getYouTubeCredentials(cfg);
  if (accessToken) {
    return {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      apiKey: '',
    };
  }
  if (apiKey) {
    return {
      headers: {
        Accept: 'application/json',
      },
      apiKey,
    };
  }
  throw new Error(`missing YouTube API credentials; set ${cfg.youtubeSuperChats.apiKeyEnv} or ${cfg.youtubeSuperChats.accessTokenEnv}`);
}

async function fetchYouTubeJson(cfg, url) {
  const { headers, apiKey } = buildYouTubeFetchInit(cfg);
  const requestUrl = new URL(url);
  if (apiKey) requestUrl.searchParams.set('key', apiKey);
  const response = await fetch(requestUrl, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`YouTube API ${response.status}: ${body.slice(0, 500)}`);
  }
  return response.json();
}

async function resolveYouTubeLiveChatId(cfg) {
  const directLiveChatId = String(cfg.youtubeSuperChats.liveChatId ?? '').trim();
  if (directLiveChatId) return directLiveChatId;

  const broadcastVideoId = String(cfg.youtubeSuperChats.broadcastVideoId ?? cfg.youtubeSuperChats.videoId ?? '').trim();
  if (!broadcastVideoId) return '';

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'liveStreamingDetails');
  url.searchParams.set('id', broadcastVideoId);
  const parsed = await fetchYouTubeJson(cfg, url);
  const item = Array.isArray(parsed.items) ? parsed.items[0] : null;
  return String(item?.liveStreamingDetails?.activeLiveChatId ?? '').trim();
}

async function appendYouTubeSuperChatEvent(cfg, raw) {
  const rawEventsFile = resolveLocal(cfg.output.youtubeSuperChatRawEventsFile);
  mkdirSync(path.dirname(rawEventsFile), { recursive: true });
  await appendFile(rawEventsFile, `${JSON.stringify({ seenAt: new Date().toISOString(), raw })}\n`);
}

async function pollYouTubeSuperChats(cfg, seen) {
  let liveChatId = await resolveYouTubeLiveChatId(cfg);
  if (!liveChatId) {
    console.error('[youtube-super-chat] startup skipped: no liveChatId or broadcastVideoId configured');
    return;
  }

  let pageToken = '';
  let nextDelayMs = Number(cfg.youtubeSuperChats.pollMs) || 3000;

  const tick = async () => {
    try {
      liveChatId = liveChatId || await resolveYouTubeLiveChatId(cfg);
      if (!liveChatId) {
        console.error('[youtube-super-chat] poll skipped: no liveChatId resolved');
        return;
      }

      const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
      url.searchParams.set('liveChatId', liveChatId);
      url.searchParams.set('part', 'id,snippet,authorDetails');
      url.searchParams.set('maxResults', String(cfg.youtubeSuperChats.maxResults || 200));
      if (cfg.youtubeSuperChats.hl) url.searchParams.set('hl', String(cfg.youtubeSuperChats.hl));
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const parsed = await fetchYouTubeJson(cfg, url);
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      for (const raw of items) {
        const event = normalizeYouTubeSuperChatEvent(raw);
        if (!event) continue;

        const key = hash({
          id: raw.id,
          type: event.type,
          authorChannelId: event.authorChannelId,
          amount: event.amount,
          message: event.message,
        });
        const now = Date.now();
        const lastSeen = seen.get(key);
        if (lastSeen && now - lastSeen < Number(cfg.youtubeSuperChats.dedupeSeconds) * 1000) continue;
        seen.set(key, now);

        if (isPaidEventBelowMinimum(cfg, event)) {
          console.log(`[youtube-super-chat] ignored below $${cfg.donationRules.minSpeakAmount}: ${event.name} ${event.amount}`);
          continue;
        }

        await appendYouTubeSuperChatEvent(cfg, raw);
        handleWidgetEvent(cfg, event, cfg.output.youtubeSuperChatLastEventFile, 'youtube-super-chat').catch(err => {
          console.error('[youtube-super-chat] handling failed:', err.message);
        });
      }

      pageToken = String(parsed.nextPageToken ?? pageToken);
      const returnedPollMs = Number(parsed.pollingIntervalMillis) || 0;
      nextDelayMs = Math.max(Number(cfg.youtubeSuperChats.pollMs) || 3000, returnedPollMs || 0);
    } catch (err) {
      console.error('[youtube-super-chat] poll failed:', err.message);
    } finally {
      setTimeout(tick, nextDelayMs).unref?.();
    }
  };

  await tick();
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(label)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createTwitchEventSubSubscription(cfg, sessionId, type) {
  const token = getTwitchChannelPointsToken(cfg);
  if (!token) throw new Error(`missing Twitch user access token; set ${cfg.twitchChannelPoints.accessTokenEnv}`);
  if (!cfg.twitchChannelPoints.clientId) throw new Error('twitchChannelPoints.clientId is not set');
  if (!cfg.twitchChannelPoints.broadcasterUserId) throw new Error('twitchChannelPoints.broadcasterUserId is not set');

  const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Client-Id': cfg.twitchChannelPoints.clientId,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type,
      version: '1',
      condition: {
        broadcaster_user_id: cfg.twitchChannelPoints.broadcasterUserId,
      },
      transport: {
        method: 'websocket',
        session_id: sessionId,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`twitch eventsub subscribe failed ${response.status}: ${body.slice(0, 500)}`);
  }
}

function startTwitchEventSubListener(cfg) {
  if (!cfg.twitchChannelPoints.enabled) return;
  if (typeof WebSocket !== 'function') {
    console.error('[streamlabs-widget] Twitch eventsub disabled: WebSocket is unavailable in this Node runtime');
    return;
  }

  const seen = new Map();
  let socket = null;
  let reconnectUrl = cfg.twitchChannelPoints.websocketUrl;
  let reconnectDelayMs = 1000;
  let intentionalClose = false;
  let currentSessionId = null;

  const connect = () => {
    if (intentionalClose) return;
    const ws = new WebSocket(reconnectUrl);
    socket = ws;

    ws.addEventListener('open', () => {
      console.log(`[streamlabs-widget] twitch eventsub websocket connected: ${reconnectUrl}`);
    });

    ws.addEventListener('message', async (message) => {
      try {
        const payload = JSON.parse(String(message.data));
        const messageType = String(payload.metadata?.message_type ?? '').toLowerCase();

        if (messageType === 'session_welcome') {
          currentSessionId = payload.payload?.session?.id;
          reconnectDelayMs = 1000;
          const subscriptionTypes = [
            'channel.channel_points_custom_reward_redemption.add',
            'channel.subscribe',
            'channel.subscription.message',
          ];
          const results = await Promise.allSettled(
            subscriptionTypes.map(type => createTwitchEventSubSubscription(cfg, currentSessionId, type)),
          );
          for (let i = 0; i < results.length; i += 1) {
            const type = subscriptionTypes[i];
            const result = results[i];
            if (result.status === 'fulfilled') {
              console.log(`[streamlabs-widget] twitch eventsub subscribed: ${type}`);
            } else {
              console.error(`[streamlabs-widget] twitch eventsub subscribe failed for ${type}: ${result.reason?.message || result.reason}`);
            }
          }
          return;
        }

        if (messageType === 'session_reconnect') {
          reconnectUrl = payload.payload?.session?.reconnect_url || reconnectUrl;
          console.log('[streamlabs-widget] twitch eventsub requested reconnect');
          ws.close();
          return;
        }

        if (messageType === 'revocation') {
          console.error('[streamlabs-widget] twitch eventsub subscription revoked');
          return;
        }

        if (messageType !== 'notification') return;
        const subscriptionType = String(payload.metadata?.subscription_type ?? '');

        const rawEvent = payload.payload?.event;
        if (!rawEvent) return;
        if (subscriptionType === 'channel.channel_points_custom_reward_redemption.add') {
          const event = normalizeChannelPointEvent(rawEvent);
          if (event.status && event.status !== 'unfulfilled') return;

          const key = hash({
            id: event.id,
            rewardId: event.reward.id,
            userInput: event.userInput,
            status: event.status,
          });
          const now = Date.now();
          const lastSeen = seen.get(key);
          if (lastSeen && now - lastSeen < Number(cfg.twitchChannelPoints.dedupeSeconds) * 1000) return;
          seen.set(key, now);

          await appendTwitchChannelPointEvent(cfg, rawEvent);
          handleChannelPointRedemption(cfg, event).catch(err => {
            console.error('[streamlabels-widget] channel point handling failed:', err.message);
          });
          return;
        }

        if (subscriptionType === 'channel.subscribe' || subscriptionType === 'channel.subscription.message') {
          const event = normalizeTwitchSubscriptionEvent(rawEvent, subscriptionType);
          if (!event) return;

          const key = hash({
            type: subscriptionType,
            user: event.name,
            tier: event.tier,
            message: event.message ?? '',
            cumulativeMonths: event.cumulativeMonths ?? 0,
            streakMonths: event.streakMonths ?? null,
            durationMonths: event.durationMonths ?? 0,
            isGift: event.isGift ?? false,
          });
          const now = Date.now();
          const lastSeen = seen.get(key);
          if (lastSeen && now - lastSeen < Number(cfg.twitchChannelPoints.dedupeSeconds) * 1000) return;
          seen.set(key, now);

          await appendTwitchSubscriptionEvent(cfg, rawEvent);
          handleWidgetEvent(cfg, event, cfg.output.twitchSubscriptionLastEventFile).catch(err => {
            console.error('[streamlabs-widget] twitch subscription handling failed:', err.message);
          });
        }
      } catch (err) {
        console.error('[streamlabs-widget] twitch eventsub message parse failed:', err.message);
      }
    });

    ws.addEventListener('close', () => {
      socket = null;
      if (intentionalClose) return;
      setTimeout(connect, reconnectDelayMs).unref?.();
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
    });

    ws.addEventListener('error', err => {
      console.error('[streamlabs-widget] twitch eventsub websocket error:', err.message || err);
    });
  };

  connect();
}

async function handleWidgetEvent(cfg, event, lastEventFilePath = cfg.output.lastEventFile, sourceLabel = 'streamlabs-widget') {
  const commandResult = await maybeExecuteObsCommand(cfg, event).catch(err => {
    console.error('[streamlabs-widget] OBS command failed:', err.message);
    return `OBS command failed: ${err.message}`;
  });
  if (commandResult) event.obsCommandResult = commandResult;

  const fallback = event.category === 'donation'
    ? (event.message ? `Thanks for the donation, ${event.name}. I saw your message.` : `Thanks for the donation, ${event.name}.`)
    : event.category === 'follow'
      ? (event.message ? `Thanks for the follow, ${event.name}. I saw your message.` : `Thanks for the follow, ${event.name}.`)
      : event.category === 'youtube-super-chat'
        ? (event.message ? `Thanks for the Super Chat, ${event.name}. I saw your message.` : `Thanks for the Super Chat, ${event.name}.`)
        : event.category === 'youtube-super-sticker'
          ? `Thanks for the Super Sticker, ${event.name}.`
          : `Thanks for the ${event.category}, ${event.name}. I saw your message.`;
  const reaction = await generateStreamReaction(cfg, event, fallback);
  await writeReactionToFile(cfg, event, reaction || fallback, lastEventFilePath);
  if (!isBanterOverrideText(event.message) && !isBanterOverrideText(reaction || fallback)) {
    await appendSharedMemory(cfg.memory, ROOT, {
      source: event.source || sourceLabel,
      user: `${event.category}: ${event.name}${event.amount ? ` ${event.amount}` : ''}${event.message ? ` - ${event.message}` : ''}`,
      assistant: reaction || fallback,
      meta: { type: event.type, category: event.category },
    });
  }
  enqueueTts(cfg, event, reaction || fallback);
  console.log(`[${sourceLabel}] ${event.category}: ${event.name} ${event.amount} ${event.message}`);
  console.log(`[${sourceLabel}] reaction: ${reaction || fallback}`);
}

async function ingestDonationEvent(cfg, seen, raw, normalize) {
  await appendRawEvent(cfg, raw);
  const event = normalize(raw);
  if (!event) return { ignored: true };
  if (isPaidEventBelowMinimum(cfg, event)) {
    console.log(`[streamlabs-widget] ${event.category} ignored below $${cfg.donationRules.minSpeakAmount}: ${event.name} ${event.amount}`);
    return { ignored: true, belowMinimum: true };
  }

  const key = hash({ name: event.name, amount: event.amount, message: event.message, type: event.type });
  const now = Date.now();
  const lastSeen = seen.get(key);
  if (lastSeen && now - lastSeen < Number(cfg.widgetReceiver.dedupeSeconds) * 1000) {
    return { duplicate: true };
  }
  seen.set(key, now);

  handleWidgetEvent(cfg, event).catch(err => {
    console.error('[streamlabs-widget] event handling failed:', err.message);
  });
  return { accepted: true };
}

async function pollRecentEvents(cfg, seen) {
  const token = findRecentEventsToken(cfg);
  if (!token) {
    console.error('[streamlabs-widget] recent-events polling skipped: no Streamlabels recent-events token found');
    return;
  }

  async function tick() {
    try {
      const endpoint = `${cfg.streamlabelsRecentEvents.endpointBase}/${encodeURIComponent(token)}`;
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`recent-events ${response.status}`);
      const parsed = await response.json();
      const events = Array.isArray(parsed.data) ? parsed.data : [];
      for (const rawEvent of events) {
        await ingestDonationEvent(cfg, seen, rawEvent, normalizeRecentEvent);
      }
    } catch (err) {
      console.error('[streamlabs-widget] recent-events poll failed:', err.message);
    }
  }

  await tick();
  setInterval(tick, Number(cfg.streamlabelsRecentEvents.pollMs) || 5000).unref?.();
  console.log(`[streamlabs-widget] polling Streamlabels recent-events every ${Number(cfg.streamlabelsRecentEvents.pollMs) || 5000}ms`);
}

async function main() {
  const cfg = await loadConfig();
  const seen = new Map();
  await initializeRuntimeStatus(cfg);

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '*';
    if (req.method === 'OPTIONS') {
      send(res, 204, {}, origin);
      return;
    }

    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/health') {
        send(res, 200, { ok: true }, origin);
        return;
      }
      if (req.method !== 'POST' || url.pathname !== '/streamlabs/event') {
        send(res, 404, { ok: false, error: 'not found' }, origin);
        return;
      }

      const result = await ingestDonationEvent(cfg, seen, await readBody(req), normalizeWidgetEvent);
      send(res, 202, { ok: true, ...result }, origin);
    } catch (err) {
      console.error('[streamlabs-widget] request failed:', err.message);
      send(res, 500, { ok: false, error: err.message }, origin);
    }
  });

  server.listen(Number(cfg.widgetReceiver.port), cfg.widgetReceiver.host, () => {
    console.log(`[streamlabs-widget] listening on http://${cfg.widgetReceiver.host}:${cfg.widgetReceiver.port}`);
    console.log('[streamlabs-widget] endpoint: POST /streamlabs/event');
    if (cfg.obsCommands?.grayscale?.enabled) {
      precreateGrayscaleFilters(cfg).catch(err => {
        console.error('[streamlabs-widget] grayscale warmup failed:', err.message);
      });
    }
    if (cfg.streamlabelsRecentEvents.enabled) {
      pollRecentEvents(cfg, seen).catch(err => {
        console.error('[streamlabs-widget] recent-events startup failed:', err.message);
      });
    }
    if (cfg.youtubeSuperChats.enabled) {
      pollYouTubeSuperChats(cfg, new Map()).catch(err => {
        console.error('[youtube-super-chat] startup failed:', err.message);
      });
    }
    if (cfg.twitchChannelPoints.enabled) {
      startTwitchEventSubListener(cfg);
    }
  });
}

main().catch(err => {
  console.error('[streamlabs-widget] fatal:', err);
  process.exit(1);
});
