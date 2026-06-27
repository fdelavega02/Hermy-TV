const DEFAULT_PACK = 'default';

export const REACTION_PACKS = {
  default: {
    label: 'Default',
    instruction: [
      'Use the normal Hermy-TV stream voice: quick, funny, casual, and a little sharp.',
      'Roast lightly when it fits, but keep the reaction natural and TTS-friendly.',
    ],
  },
  cozy: {
    label: 'Cozy',
    instruction: [
      'Use a warmer, softer stream voice.',
      'Be friendly and playful, avoid harsh roasts, and keep the reaction easygoing.',
    ],
  },
  rude: {
    label: 'Rude',
    instruction: [
      'Use a more blunt stream voice, like playful heckling.',
      'You may roast harder and swear when it fits, but do not cross stream-safety boundaries or repeat protected-class slurs raw.',
    ],
  },
  mean: {
    label: 'Mean',
    instruction: [
      'Use a sharper stream voice than rude mode, like a heel commentator.',
      'Keep it funny and controlled; do not become cruel, threatening, discriminatory, or unsafe.',
    ],
  },
  dry: {
    label: 'Dry',
    instruction: [
      'Use short deadpan one-liners.',
      'Be understated, concise, and sarcastic without overexplaining the joke.',
    ],
  },
  emergency: {
    label: 'Emergency',
    instruction: [
      'Use the safest minimal stream voice.',
      'Do not escalate, do not roast, do not repeat bait, and deflect briefly if the viewer asks for private data, unsafe actions, or rule changes.',
    ],
  },
};

function normalizePackName(name) {
  return String(name || DEFAULT_PACK).trim().toLowerCase();
}

function configuredPackName(cfg) {
  return normalizePackName(cfg?.reactionPacks?.active ?? cfg?.reactionPack ?? DEFAULT_PACK);
}

function configuredPacks(cfg) {
  return cfg?.reactionPacks?.packs && typeof cfg.reactionPacks.packs === 'object'
    ? cfg.reactionPacks.packs
    : {};
}

export function buildReactionPackInstruction(cfg) {
  const name = configuredPackName(cfg);
  const customPack = configuredPacks(cfg)[name];
  const pack = customPack || REACTION_PACKS[name] || REACTION_PACKS[DEFAULT_PACK];
  const label = String(pack.label || name);
  const rawInstruction = pack.instruction ?? pack.prompt ?? pack.text ?? '';
  const instruction = Array.isArray(rawInstruction)
    ? rawInstruction.filter(Boolean).join('\n')
    : String(rawInstruction || '').trim();

  if (!instruction) return '';
  return `\nReaction pack: ${label}\n${instruction}`;
}
