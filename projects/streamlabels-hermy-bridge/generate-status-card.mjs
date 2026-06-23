import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_PATH = process.env.STREAMLABELS_HERMY_CONFIG || path.join(ROOT, 'config.json');
const EXAMPLE_CONFIG_PATH = path.join(ROOT, 'config.example.json');

const DEFAULT_OUTPUT = {
  htmlFile: './output/hermy_status_card.html',
  jsonFile: './output/hermy_status_card.json',
};

function resolveLocal(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return {};
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function dollars(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function seconds(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number / 1000) : fallback;
}

function titleCase(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function publicAlias(alias) {
  return titleCase(alias).replace(/\bTippy\b/g, 'Tippy');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getSourceAliases(cfg) {
  return unique(Object.keys(cfg.obsCommands?.sourceAliases ?? {})).map(publicAlias);
}

function getSceneAliases(cfg) {
  return unique(Object.values(cfg.obsCommands?.sceneAliases ?? {}).map(publicAlias));
}

function getRewardRoutes(cfg) {
  return (cfg.twitchChannelPoints?.rewardRoutes ?? [])
    .map(route => ({
      title: String(route.rewardTitle ?? route.reward_title ?? 'Channel Point Reward'),
      mode: String(route.mode ?? 'talk'),
      command: route.command || route.commandText || route.command_text || '',
    }));
}

function buildSummary(cfg) {
  const donationRules = cfg.donationRules ?? {};
  const obs = cfg.obsCommands ?? {};
  const sourceAliases = getSourceAliases(cfg);
  const sceneAliases = getSceneAliases(cfg);
  const routes = getRewardRoutes(cfg);
  const bitrate = obs.bitrate ?? {};
  const restoreSeconds = seconds(bitrate.restoreAfterMs, 60);
  const minSpeakAmount = dollars(donationRules.minSpeakAmount, 5);
  const commandMinAmount = dollars(donationRules.commandMinAmount, 5);
  const streamCommandMinAmount = dollars(donationRules.streamCommandMinAmount, 50);
  const twitchEnabled = Boolean(cfg.twitchChannelPoints?.enabled);
  const youtubeEnabled = Boolean(cfg.youtubeSuperChats?.enabled);
  const obsEnabled = Boolean(obs.enabled);
  const grayscaleEnabled = Boolean(obs.grayscale?.enabled);
  const transformEnabled = Boolean(obs.transform?.enabled);
  const bitrateEnabled = Boolean(obs.allowBitrateControl);

  const liveNow = [
    {
      label: 'Paid alerts',
      value: `$${minSpeakAmount}+ donations get reactions/TTS`,
      enabled: true,
    },
    {
      label: 'OBS commands',
      value: obsEnabled ? `$${commandMinAmount}+ paid alerts can use approved commands` : 'Paused',
      enabled: obsEnabled,
    },
    {
      label: 'Source controls',
      value: sourceAliases.length
        ? `Show/hide/toggle: ${sourceAliases.join(', ')}`
        : 'No public source aliases configured',
      enabled: obsEnabled && sourceAliases.length > 0,
    },
    {
      label: 'Scenes',
      value: sceneAliases.length
        ? `Switch to: ${sceneAliases.join(', ')}`
        : 'No public scene aliases configured',
      enabled: obsEnabled && sceneAliases.length > 0,
    },
    {
      label: 'Bitrate',
      value: bitrateEnabled
        ? `${bitrate.min}-${bitrate.max} kbps, restores after ${restoreSeconds}s`
        : 'Paused',
      enabled: obsEnabled && bitrateEnabled,
    },
    {
      label: 'Grayscale',
      value: grayscaleEnabled
        ? 'Black-and-white named sources, then restore color'
        : 'Paused',
      enabled: obsEnabled && grayscaleEnabled,
    },
  ];

  const channelPoints = routes.map(route => ({
    label: route.title,
    value: route.mode === 'obsCommand' || route.mode === 'obs-command'
      ? (route.command ? `Runs approved command: ${route.command}` : 'Viewer types an approved OBS command')
      : 'Viewer talks to Hermy',
    enabled: twitchEnabled,
  }));

  const paused = [
    !twitchEnabled && routes.length
      ? `${routes.length} Twitch channel-point route${routes.length === 1 ? '' : 's'} configured but listener is paused`
      : '',
    !youtubeEnabled ? 'YouTube Super Chat polling is paused' : '',
    !transformEnabled ? 'Flip, mirror, and rotate commands are paused' : '',
    `Stream stop is locked to $${streamCommandMinAmount}+ paid alerts and is not a channel-point command`,
  ].filter(Boolean);

  const examples = [
    'show camera',
    'hide banner',
    'toggle background',
    sceneAliases.includes('Live') ? 'switch to live' : '',
    sceneAliases.some(alias => alias.toLowerCase() === 'close up') ? 'switch to close up' : '',
    'set bitrate to 800',
    grayscaleEnabled ? 'turn camera black and white' : '',
  ].filter(Boolean);

  const chatText = [
    `Hermy triggers right now: $${minSpeakAmount}+ paid alerts get reactions/TTS.`,
    obsEnabled ? `$${commandMinAmount}+ paid alerts can request approved OBS commands.` : 'OBS commands are paused.',
    twitchEnabled ? 'Channel points are live.' : 'Channel points are configured but paused.',
    `Try: ${examples.slice(0, 4).join(', ')}.`,
  ].join(' ');

  return {
    generatedAt: new Date().toISOString(),
    title: 'Hermy-TV Status',
    subtitle: 'What Hermy is doing now',
    listeners: {
      channelPoints: twitchEnabled,
      subscriptions: twitchEnabled,
      obsCommands: obsEnabled,
    },
    effects: {
      grayscale: Object.fromEntries((obs.grayscale?.sourceAliases ?? []).map(alias => [
        alias,
        {
          label: publicAlias(alias),
          active: false,
        },
      ])),
    },
    bitrate: {
      active: false,
      currentKbps: null,
      restoreToKbps: null,
      expiresAt: null,
    },
    liveNow,
    channelPoints,
    paused,
    examples,
    chatText,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusPill(enabled) {
  return enabled
    ? '<span class="pill on">Live</span>'
    : '<span class="pill off">Paused</span>';
}

function renderRows(rows) {
  return rows.map(row => `
      <li>
        <div>
          <strong>${escapeHtml(row.label)}</strong>
          <span>${escapeHtml(row.value)}</span>
        </div>
        ${statusPill(row.enabled)}
      </li>`).join('');
}

function renderHtml(summary) {
  const generated = new Date(summary.generatedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const fallbackJson = JSON.stringify({
    generatedAt: summary.generatedAt,
    listeners: summary.listeners,
    effects: summary.effects,
    bitrate: summary.bitrate,
  }).replaceAll('</', '<\\/');
  const runtimeStatusFile = escapeHtml(summary.runtimeStatusFile || 'hermy_runtime_status.json');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(summary.title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --panel: #181b21;
      --ink: #f4f4f5;
      --muted: #a7adbb;
      --line: #303541;
      --green: #56d364;
      --amber: #f2b84b;
      --cyan: #78dce8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: transparent;
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    main {
      width: min(360px, calc(100vw - 14px));
      background: rgba(24, 27, 33, .92);
      background: color-mix(in srgb, var(--panel) 92%, transparent);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 8px 22px rgba(0, 0, 0, .28);
      overflow: hidden;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--line);
      background: #20242c;
    }
    h1, p { margin: 0; }
    h1 {
      font-size: 15px;
      line-height: 1.1;
      font-weight: 800;
    }
    header p {
      margin-top: 2px;
      color: var(--muted);
      font-size: 10px;
    }
    .time {
      white-space: nowrap;
      color: var(--cyan);
      font-size: 10px;
    }
    .rows {
      display: grid;
      gap: 0;
    }
    .row {
      min-height: 42px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--line);
      background: #151820;
    }
    .row:last-child { border-bottom: 0; }
    strong {
      display: block;
      font-size: 12px;
      line-height: 1.15;
    }
    .row span:not(.pill) {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.2;
    }
    .pill {
      min-width: 52px;
      padding: 4px 6px;
      border-radius: 999px;
      text-align: center;
      font-size: 10px;
      font-weight: 800;
    }
    .pill.on, .pill.active {
      color: #06230b;
      background: var(--green);
    }
    .pill.off, .pill.idle {
      color: #2b1b02;
      background: var(--amber);
    }
    footer {
      padding: 6px 10px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 10px;
      background: #11141a;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>${escapeHtml(summary.title)}</h1>
        <p>${escapeHtml(summary.subtitle)}</p>
      </div>
      <div class="time" id="clock">Updated ${escapeHtml(generated)}</div>
    </header>
    <div class="rows">
      <div class="row">
        <div><strong>Channel Points</strong><span id="pointsText">Checking listener</span></div>
        <span class="pill idle" id="pointsPill">...</span>
      </div>
      <div class="row">
        <div><strong>Effects</strong><span id="effectsText">No effects active</span></div>
        <span class="pill idle" id="effectsPill">Idle</span>
      </div>
      <div class="row">
        <div><strong>Bitrate</strong><span id="bitrateText">Normal</span></div>
        <span class="pill idle" id="bitratePill">Idle</span>
      </div>
    </div>
    <footer id="footer">Generated ${escapeHtml(generated)}</footer>
  </main>
  <script>
    const runtimeUrl = './${runtimeStatusFile}';
    const fallback = ${fallbackJson};

    function pill(id, active, onText = 'Live', offText = 'Idle') {
      const el = document.getElementById(id);
      el.className = 'pill ' + (active ? 'active' : 'idle');
      el.textContent = active ? onText : offText;
    }

    function secondsLeft(expiresAt) {
      if (!expiresAt) return 0;
      return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
    }

    function setText(id, value) {
      document.getElementById(id).textContent = value;
    }

    function render(status) {
      const pointsLive = Boolean(status.listeners?.channelPoints);
      setText('pointsText', pointsLive ? 'Listening for redeems and subs' : 'Listener paused');
      pill('pointsPill', pointsLive, 'Live', 'Paused');

      const grayscale = Object.values(status.effects?.grayscale || {}).filter(item => item?.active);
      if (grayscale.length) {
        setText('effectsText', 'Grayscale: ' + grayscale.map(item => item.label || 'Source').join(', '));
        pill('effectsPill', true, 'On', 'Idle');
      } else {
        setText('effectsText', 'No effects active');
        pill('effectsPill', false);
      }

      const bitrate = status.bitrate || {};
      const left = secondsLeft(bitrate.expiresAt);
      if (bitrate.active && left > 0) {
        const current = bitrate.currentKbps ? bitrate.currentKbps + ' kbps' : 'Override active';
        setText('bitrateText', current + ' - restores in ' + left + 's');
        pill('bitratePill', true, 'On', 'Idle');
      } else {
        setText('bitrateText', 'Normal');
        pill('bitratePill', false);
      }

      const updated = status.generatedAt ? new Date(status.generatedAt) : new Date();
      setText('clock', updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setText('footer', 'OBS commands: ' + (status.listeners?.obsCommands ? 'enabled' : 'paused'));
    }

    async function refresh() {
      try {
        const response = await fetch(runtimeUrl + '?t=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('runtime unavailable');
        render(await response.json());
      } catch {
        render(fallback);
      }
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>
`;
}

async function main() {
  const cfg = await readJsonIfExists(existsSync(CONFIG_PATH) ? CONFIG_PATH : EXAMPLE_CONFIG_PATH);
  const output = { ...DEFAULT_OUTPUT, ...(cfg.statusCard ?? {}) };
  const summary = buildSummary(cfg);
  const htmlFile = resolveLocal(output.htmlFile);
  const jsonFile = resolveLocal(output.jsonFile);
  const runtimeFile = resolveLocal(cfg.output?.runtimeStatusFile || './output/hermy_runtime_status.json');
  summary.runtimeStatusFile = path.relative(path.dirname(htmlFile), runtimeFile) || path.basename(runtimeFile);

  mkdirSync(path.dirname(htmlFile), { recursive: true });
  mkdirSync(path.dirname(jsonFile), { recursive: true });
  mkdirSync(path.dirname(runtimeFile), { recursive: true });
  if (!existsSync(runtimeFile)) {
    await writeFile(runtimeFile, `${JSON.stringify({
      generatedAt: summary.generatedAt,
      listeners: summary.listeners,
      effects: summary.effects,
      bitrate: summary.bitrate,
    }, null, 2)}\n`);
  }
  await writeFile(jsonFile, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(htmlFile, renderHtml(summary));

  console.log(`Wrote ${htmlFile}`);
  console.log(`Wrote ${jsonFile}`);
  console.log(summary.chatText);
}

main().catch(err => {
  console.error(`status card failed: ${err.message}`);
  process.exit(1);
});
