# Hermy-TV

Hermy-TV is the stream-facing side of Hermy: a Twitch and OBS automation assistant built to keep live ops fast, funny, and controlled.

She handles stream alerts, donation/subscription reactions, TTS-friendly phrasing, and whitelisted OBS actions while treating viewer input as untrusted. The whole point is to let stream chaos be useful without letting it leak into private systems or the main assistant personality.

## Flow

Viewer event -> local receiver -> event normalization -> safety checks -> Hermy-TV reaction -> optional TTS -> optional whitelisted OBS action -> local logs/output.

The public repo documents the shape of the system. It is not an operations dump for a live stream machine.

## Projects

- `projects/streamlabels-hermy-bridge`: local Streamlabels/Streamlabs/Twitch bridge for alert handling, TTS, and OBS command routing.
- Viewer-facing status card generation for OBS browser sources and future chat status replies.
- Twitch alert handling: donations, follows, subscription/resubscription messages, and channel-point reward routes.
- YouTube paid-event handling: optional Super Chat and Super Sticker polling through YouTube live chat.
- OBS scene/source automation: source toggles, scene switches, text updates, temporary bitrate changes, optional filter/transform effects, and stream-safe command filtering.
- TTS message shaping: reads viewer messages first when appropriate, then adds a short Hermy-TV reaction.
- Local model support: optional Ollama reactions with short-term repetition avoidance and private local memory files.
- Optional sports betting context for Ollama gambling prompts, with config drift checks, sanitized private smoke-test output, public synthetic examples, and mandatory `(this isn't actual advice)` wording on gambling replies.

## Docs

- `docs/architecture.md`: system flow and trust boundaries.
- `docs/commands.md`: public command categories and safety tiers.
- `docs/configuration.md`: placeholder-only config guidance.
- `docs/message-guidelines.md`: stream-safe reaction and TTS rules.
- `docs/private-scope.md`: what does not belong in this repo.
- `examples/`: fake event payloads and demo config shapes.

## Safety Model

Viewer text is never treated as a command directly. Commands go through a whitelist, thresholds are configurable, and secrets stay in environment variables or private local config files that do not belong in this repo.

No bot tokens, API keys, private IDs, local paths, or live output logs are published here.

## Vibe

Fast, stream-safe, slightly sarcastic, operational, and useful.
