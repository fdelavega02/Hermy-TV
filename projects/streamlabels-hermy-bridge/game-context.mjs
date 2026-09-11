import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
export const GAME_CONTEXT_PATH = path.join(ROOT, 'output', 'game_vision_context.json');

const KNOWN_GAMES = [
  { title: 'Marvel Rivals', profile: 'marvel-rivals', aliases: ['marvel rivals', 'rivals'] },
  { title: 'Overwatch 2', profile: 'overwatch', aliases: ['overwatch 2', 'overwatch', 'ow2'] },
];

export function extractGameDeclaration(transcript) {
  const text = String(transcript || '').trim();
  const match = text.match(/\b(?:i\s*(?:am|'m)|we\s*(?:are|'re))\s+(?:playing|on)\s+(.+?)(?:\s+(?:right now|currently|today))?[.!?]*$/i);
  if (!match) return null;
  const spoken = match[1].trim().replace(/^the\s+/i, '').replace(/\s+/g, ' ');
  if (!spoken || spoken.length > 80) return null;
  const lowered = spoken.toLowerCase();
  const known = KNOWN_GAMES.find(game => game.aliases.includes(lowered));
  return known ? { title: known.title, profile: known.profile, spoken } : { title: spoken.replace(/\b\w/g, char => char.toUpperCase()), profile: 'generic', spoken };
}

export async function setActiveGameContext(game, source = 'ctrl-f3-ptt') {
  const context = { game: game.title, profile: game.profile, source, updatedAt: new Date().toISOString() };
  await mkdir(path.dirname(GAME_CONTEXT_PATH), { recursive: true });
  const temporaryPath = `${GAME_CONTEXT_PATH}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(context, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, GAME_CONTEXT_PATH);
  return context;
}

export async function readActiveGameContext() {
  try { const parsed = JSON.parse(await readFile(GAME_CONTEXT_PATH, 'utf8')); return parsed?.game ? parsed : null; } catch { return null; }
}
