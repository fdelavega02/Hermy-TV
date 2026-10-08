import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }

// Decision metadata only: never turn a review bundle into a replay/archive.
export function safeReviewText(value, maxLength = 280) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/(?:file:\/\/|https?:\/\/|\/home\/|\/etc\/|\/proc\/|\/dev\/)[^\s]*/gi, '[redacted]').replace(/[A-Za-z0-9+/_=-]{80,}/g, '[redacted]').replace(/\s{2,}/g, ' ').trim().slice(0, maxLength);
}
function stamp() { return new Date().toISOString().replaceAll(/[:.]/g, '-'); }
function reviewName(name) { return /^episode-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/.test(name); }
function renderIndex(entries) { const rows = entries.map(entry => `<tr><td>${escapeHtml(entry.recordedAt)}</td><td>${escapeHtml(entry.trigger?.outcome)}</td><td>${escapeHtml(entry.trigger?.pixelDelta)}</td><td>${escapeHtml(entry.selectedFrames?.count)}</td><td>${escapeHtml(entry.vision?.status)}</td><td>${escapeHtml(entry.tts?.status)}</td><td>${escapeHtml(entry.reaction || '—')}</td></tr>`).join(''); return `<!doctype html><meta charset="utf-8"><title>Game-vision review</title><style>body{font:14px system-ui;margin:2rem;color:#ddd;background:#151515}table{border-collapse:collapse;width:100%}th,td{padding:.55rem;border-bottom:1px solid #444;text-align:left;vertical-align:top}th{color:#9bd}</style><h1>Game-vision review</h1><p>Decision metadata only. No frames, raw pixels, paths, chat, credentials, or session identifiers are retained.</p><table><thead><tr><th>Recorded</th><th>Gate</th><th>Pixel delta</th><th>Frames</th><th>Vision</th><th>TTS</th><th>Reaction</th></tr></thead><tbody>${rows}</tbody></table>`; }

export async function appendGameVisionReview({ directory, retain = 50, record }) {
  const safeDirectory = path.resolve(directory); await mkdir(safeDirectory, { recursive: true });
  const entry = { schema: 'game-vision-review.v1', recordedAt: new Date().toISOString(), trigger: { outcome: record.trigger?.outcome || 'triggered', pixelDelta: Number(Number(record.trigger?.pixelDelta || 0).toFixed(4)), score: Number(record.trigger?.score || 0), thresholds: record.trigger?.thresholds || {}, cooldownMs: Number(record.trigger?.cooldownMs || 0) }, selectedFrames: { count: Number(record.selectedFrames?.count || 0), timestamps: Array.isArray(record.selectedFrames?.timestamps) ? record.selectedFrames.timestamps.slice(0, 8) : [] }, vision: { status: record.vision?.status || 'not_run' }, tts: { status: record.tts?.status || 'not_run' }, reaction: safeReviewText(record.reaction) };
  const fileName = `episode-${stamp()}.json`; await writeFile(path.join(safeDirectory, fileName), `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 });
  const names = (await readdir(safeDirectory)).filter(reviewName).sort().reverse(); const retained = names.slice(0, Math.max(1, Number(retain) || 50)); await Promise.all(names.slice(retained.length).map(name => unlink(path.join(safeDirectory, name))));
  const entries = await Promise.all(retained.map(async name => JSON.parse(await readFile(path.join(safeDirectory, name), 'utf8')))); await writeFile(path.join(safeDirectory, 'index.html'), renderIndex(entries), { mode: 0o600 }); return { fileName, count: retained.length };
}
