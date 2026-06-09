# Hermy-TV

Hermy-TV is the stream-facing side of Hermy: a Twitch and OBS automation assistant built to keep live ops fast, funny, and controlled.

She handles stream alerts, donation/subscription reactions, TTS-friendly phrasing, and whitelisted OBS actions while treating viewer input as untrusted. The whole point is to let stream chaos be useful without letting it leak into private systems or the main assistant personality.

## Projects

- `projects/streamlabels-hermy-bridge`: local Streamlabels/Streamlabs/Twitch bridge for alert handling, TTS, and OBS command routing.
- Twitch alert handling: donations, follows, subscription/resubscription messages, and channel-point reward routes.
- OBS scene/source automation: source toggles, scene switches, text updates, temporary bitrate changes, and stream-safe command filtering.
- TTS message shaping: reads viewer messages first when appropriate, then adds a short Hermy-TV reaction.

## Safety Model

Viewer text is never treated as a command directly. Commands go through a whitelist, thresholds are configurable, and secrets stay in environment variables or private local config files that do not belong in this repo.

No bot tokens, API keys, private IDs, local paths, or live output logs are published here.

## Vibe

Fast, stream-safe, slightly sarcastic, operational, and useful.
