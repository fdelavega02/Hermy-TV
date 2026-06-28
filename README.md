# Hermy-TV

Hermy-TV is the stream-facing Twitch/OBS side of Hermy: fast, funny, stream-safe, and operationally careful.

She handles stream alerts, donation/subscription reactions, TTS-friendly phrasing, and whitelisted OBS actions while treating viewer input as untrusted. The whole point is to let stream chaos be useful without letting it leak into private systems or the main assistant personality.

## Flow

Viewer event -> local receiver -> event normalization -> safety checks -> Hermy-TV reaction -> optional TTS -> optional whitelisted OBS action -> local logs/output.

This repo documents the public shape of the system, not Francisco's live stream machine. Public examples use fake events, placeholder config, and category-level command descriptions.

## Projects

- `projects/streamlabels-hermy-bridge`: local Streamlabels/Streamlabs/Twitch bridge for alert handling, TTS, and OBS command routing.
- Viewer-facing status card generation for OBS browser sources and future chat status replies.
- Twitch alert handling: donations, follows, subscription/resubscription messages, and channel-point reward routes.
- YouTube paid-event handling: optional Super Chat and Super Sticker polling through YouTube live chat.
- OBS scene/source automation: source toggles, scene switches, text updates, temporary bitrate changes, optional filter/transform effects, and stream-safe command filtering.
- TTS message shaping: reads viewer messages first when appropriate, then adds a short Hermy-TV reaction.
- Reaction packs: shared tone modes for alert reactions, channel-point talk replies, and local model chat.
- Local model support: optional Ollama reactions with short-term repetition avoidance and private local memory files.
- Optional sports betting context for Ollama gambling prompts, with config drift checks, sanitized private smoke-test output, public synthetic examples, and mandatory `(this isn't actual advice)` wording on gambling replies.

## Docs

- `docs/architecture.md`: system flow and trust boundaries.
- `docs/commands.md`: public command categories and safety tiers.
- `docs/configuration.md`: placeholder-only config guidance.
- `docs/message-guidelines.md`: stream-safe reaction and TTS rules.
- `docs/private-scope.md`: what does not belong in this repo.
- `docs/stream-incident-drill.md`: public-safe recovery checklist for bad TTS, OBS actions, prompt bait, and model drift.
- `examples/`: fake event payloads and demo config shapes.

## Candidate Public Ideas

These are public-safe directions Hermy-TV wants to grow next:

- Fake-event preview sandbox for donations, subs, resubs, channel points, and YouTube paid events without touching live services.
- Fake-event controls for previewing every built-in reaction pack without touching live services.
- OBS status-card examples with redacted recent-event display data.
- Message sanitizer examples showing how unsafe viewer text gets summarized, skipped, or softened.
- Channel-point safe-action catalog with categories only, not the exact live allowlist.
- Stream test fixtures for accepted, rejected, duplicate, and paid-event payloads.

## Safety Model

Viewer text is untrusted input. It can request a reaction, but it never becomes shell access, raw OBS control, private memory access, or an authority over stream rules.

Commands go through a whitelist, thresholds are configurable, and secrets stay in environment variables or private local config files that do not belong in this repo.

No bot tokens, API keys, private IDs, local paths, or live output logs are published here.

## Vibe

Fast, stream-safe, slightly sarcastic, operational, and useful.
