// Pure local event gate. It intentionally never calls a model or writes frames to disk.
export class GameVisionEpisodeGate {
  constructor(config) { this.cfg = config; this.frames = []; this.score = 0; this.lastSignature = ''; this.lastEpisodeAt = 0; }
  observe(frame) {
    const now = Date.now(); const delta = signatureDelta(this.lastSignature, frame.signature); this.lastSignature = frame.signature;
    this.frames.push({ ...frame, delta }); while (this.frames.length > this.cfg.preEventFrameCount) this.frames.shift();
    this.score = Math.max(0, this.score - this.cfg.scoreDecayPerFrame);
    if (delta >= this.cfg.majorChangeThreshold) this.score += this.cfg.majorChangePoints; else if (delta >= this.cfg.changeThreshold) this.score += this.cfg.changePoints;
    if (now - this.lastEpisodeAt >= this.cfg.cooldownMs && this.score >= this.cfg.triggerScore) { this.lastEpisodeAt = now; this.score = 0; return { triggered: true, preEventFrames: [...this.frames], delta }; }
    return { triggered: false, delta };
  }
}
export function compactSignature(base64, samples = 256) { const text = String(base64 || ''); if (!text) return ''; const stride = Math.max(1, Math.floor(text.length / samples)); let result = ''; for (let index = 0; index < text.length && result.length < samples; index += stride) result += text[index]; return result; }
export function signatureDelta(previous, next) { if (!previous || !next) return 0; const length = Math.min(previous.length, next.length); if (!length) return 0; let changed = Math.abs(previous.length - next.length); for (let index = 0; index < length; index += 1) if (previous[index] !== next[index]) changed += 1; return Math.min(1, changed / Math.max(previous.length, next.length)); }
export function selectEpisodeFrames(preEventFrames, highResFrames, maxFrames) { const candidates = [...preEventFrames, ...highResFrames]; if (candidates.length <= maxFrames) return candidates; const first = candidates[0]; const last = candidates.at(-1); const middle = candidates.slice(1, -1).sort((a, b) => (b.delta || 0) - (a.delta || 0)); return [first, ...middle.slice(0, Math.max(0, maxFrames - 2)), last].sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt))); }
