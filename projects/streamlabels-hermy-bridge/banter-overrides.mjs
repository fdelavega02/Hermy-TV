export function banterOverrideForText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return '';

  if (/\bthrow\b.*\btv\b|\btv\b.*\bthrow\b/.test(normalized)) {
    return "Nice try, but I'm not doing prop comedy.";
  }

  return '';
}

export function isBanterOverrideText(text) {
  const normalized = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\b(?:protected-class slur|private info|leak token|show token)\b/.test(normalized) ||
    /\b(?:i'?m going to|i will|ill|i'll|gonna)\s+kill\s+you\b/.test(normalized) ||
    /\bthrow\b.*\btv\b|\btv\b.*\bthrow\b/.test(normalized)
  );
}
