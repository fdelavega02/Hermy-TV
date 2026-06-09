import OBSWebSocket from 'obs-websocket-js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = process.env.STREAMLABELS_HERMY_CONFIG || path.join(ROOT, 'config.json');

const DEFAULTS = {
  obs: {
    address: 'ws://127.0.0.1:4455',
    passwordEnv: 'OBS_WEBSOCKET_PASSWORD',
    passwordFile: '~/.config/obs-studio/plugin_config/obs-websocket/config.json',
    requestTimeoutMs: 5000,
  },
};

async function loadConfig() {
  let cfg = {};
  if (existsSync(CONFIG_PATH)) {
    cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  }
  return {
    obs: { ...DEFAULTS.obs, ...(cfg.obs ?? {}) },
  };
}

function expandHome(filePath) {
  if (!filePath?.startsWith('~')) return filePath;
  return path.join(os.homedir(), filePath.slice(1));
}

async function getObsPassword(cfg) {
  const envPassword = process.env[cfg.obs.passwordEnv];
  if (envPassword) return envPassword;

  const passwordFile = expandHome(cfg.obs.passwordFile);
  if (!passwordFile || !existsSync(passwordFile)) return undefined;
  const parsed = JSON.parse(await readFile(passwordFile, 'utf8'));
  return parsed.server_password || undefined;
}

function usage() {
  return `
Usage:
  npm run obs -- status
  npm run obs -- scenes
  npm run obs -- scene <scene-name>
  npm run obs -- sources [scene-name]
  npm run obs -- show <scene-name> <source-name>
  npm run obs -- hide <scene-name> <source-name>
  npm run obs -- toggle <scene-name> <source-name>
  npm run obs -- text <input-name> <text>
  npm run obs -- stream start|stop|toggle|status
  npm run obs -- record start|stop|toggle|status

Environment:
  OBS_WEBSOCKET_PASSWORD can override the password from OBS's local websocket config.
`.trim();
}

function requireArg(value, label) {
  if (!value) throw new Error(`Missing ${label}.\n\n${usage()}`);
  return value;
}

async function connectObs(cfg) {
  const obs = new OBSWebSocket();
  const password = await getObsPassword(cfg);
  await obs.connect(cfg.obs.address, password, {
    requestTimeout: Number(cfg.obs.requestTimeoutMs) || DEFAULTS.obs.requestTimeoutMs,
  });
  return obs;
}

async function getSceneItem(obs, sceneName, sourceName) {
  const { sceneItemId } = await obs.call('GetSceneItemId', { sceneName, sourceName });
  return sceneItemId;
}

async function setSceneItemEnabled(obs, sceneName, sourceName, enabled) {
  const sceneItemId = await getSceneItem(obs, sceneName, sourceName);
  await obs.call('SetSceneItemEnabled', {
    sceneName,
    sceneItemId,
    sceneItemEnabled: enabled,
  });
  console.log(`${enabled ? 'shown' : 'hidden'}: ${sourceName} in ${sceneName}`);
}

async function toggleSceneItem(obs, sceneName, sourceName) {
  const sceneItemId = await getSceneItem(obs, sceneName, sourceName);
  const { sceneItemEnabled } = await obs.call('GetSceneItemEnabled', { sceneName, sceneItemId });
  await obs.call('SetSceneItemEnabled', {
    sceneName,
    sceneItemId,
    sceneItemEnabled: !sceneItemEnabled,
  });
  console.log(`${!sceneItemEnabled ? 'shown' : 'hidden'}: ${sourceName} in ${sceneName}`);
}

async function setText(obs, inputName, text) {
  const { inputSettings } = await obs.call('GetInputSettings', { inputName });
  await obs.call('SetInputSettings', {
    inputName,
    inputSettings: { ...inputSettings, text },
    overlay: true,
  });
  console.log(`updated text: ${inputName}`);
}

async function printStatus(obs) {
  const [version, sceneList, streamStatus, recordStatus] = await Promise.all([
    obs.call('GetVersion'),
    obs.call('GetSceneList'),
    obs.call('GetStreamStatus'),
    obs.call('GetRecordStatus'),
  ]);
  console.log(JSON.stringify({
    obsVersion: version.obsVersion,
    websocketVersion: version.obsWebSocketVersion,
    currentScene: sceneList.currentProgramSceneName,
    streaming: streamStatus.outputActive,
    recording: recordStatus.outputActive,
  }, null, 2));
}

async function printScenes(obs) {
  const { currentProgramSceneName, scenes } = await obs.call('GetSceneList');
  for (const scene of scenes) {
    const marker = scene.sceneName === currentProgramSceneName ? '*' : ' ';
    console.log(`${marker} ${scene.sceneName}`);
  }
}

async function printSources(obs, sceneName) {
  const resolvedScene = sceneName || (await obs.call('GetSceneList')).currentProgramSceneName;
  const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: resolvedScene });
  console.log(`Scene: ${resolvedScene}`);
  for (const item of sceneItems) {
    console.log(`${item.sceneItemEnabled ? '*' : ' '} ${item.sourceName} (${item.inputKind ?? item.sourceType ?? 'source'})`);
  }
}

async function setScene(obs, sceneName) {
  await obs.call('SetCurrentProgramScene', { sceneName });
  console.log(`current scene: ${sceneName}`);
}

async function handleOutput(obs, kind, action) {
  const normalized = requireArg(action, 'action');
  const startRequest = kind === 'stream' ? 'StartStream' : 'StartRecord';
  const stopRequest = kind === 'stream' ? 'StopStream' : 'StopRecord';
  const toggleRequest = kind === 'stream' ? 'ToggleStream' : 'ToggleRecord';
  const statusRequest = kind === 'stream' ? 'GetStreamStatus' : 'GetRecordStatus';

  if (normalized === 'start') await obs.call(startRequest);
  else if (normalized === 'stop') await obs.call(stopRequest);
  else if (normalized === 'toggle') await obs.call(toggleRequest);
  else if (normalized !== 'status') throw new Error(`Unknown ${kind} action: ${normalized}`);

  const status = await obs.call(statusRequest);
  console.log(JSON.stringify({ [kind]: status.outputActive ? 'active' : 'inactive' }, null, 2));
}

async function main() {
  const cfg = await loadConfig();
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  const obs = await connectObs(cfg);
  try {
    if (command === 'status') await printStatus(obs);
    else if (command === 'scenes') await printScenes(obs);
    else if (command === 'scene') await setScene(obs, requireArg(args[0], 'scene name'));
    else if (command === 'sources') await printSources(obs, args[0]);
    else if (command === 'show') await setSceneItemEnabled(obs, requireArg(args[0], 'scene name'), requireArg(args[1], 'source name'), true);
    else if (command === 'hide') await setSceneItemEnabled(obs, requireArg(args[0], 'scene name'), requireArg(args[1], 'source name'), false);
    else if (command === 'toggle') await toggleSceneItem(obs, requireArg(args[0], 'scene name'), requireArg(args[1], 'source name'));
    else if (command === 'text') await setText(obs, requireArg(args[0], 'input name'), args.slice(1).join(' '));
    else if (command === 'stream') await handleOutput(obs, 'stream', args[0]);
    else if (command === 'record') await handleOutput(obs, 'record', args[0]);
    else throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  } finally {
    await obs.disconnect();
  }
}

main().catch(err => {
  const hint = err.message.includes('Authentication') || err.message.includes('password')
    ? `\nSet OBS_WEBSOCKET_PASSWORD to the password shown in OBS Tools -> WebSocket Server Settings.`
    : '';
  console.error(`[obs-controller] ${err.message}${hint}`);
  process.exit(1);
});
