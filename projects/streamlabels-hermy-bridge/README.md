# Streamlabels Hermy Bridge

Local Node.js bridge for routing stream events into Hermy-TV reactions, TTS, and whitelisted OBS commands.

It can watch Streamlabels text files, receive Streamlabs custom-widget events, poll local Streamlabels recent events when configured, and listen to Twitch EventSub channel-point redemptions. Reactions are written to an OBS-readable text file, and optional ElevenLabs TTS can speak the viewer message plus Hermy-TV's reply.

## What It Does

- Watches alert-like Streamlabels files for donations, tips, cheers, subs, raids, follows, and similar events.
- Receives Streamlabs custom-widget events from browser-side JavaScript.
- Routes events to an OpenClaw agent such as `twitch` for short stream-safe reactions.
- Writes reactions to a text file for OBS.
- Optionally generates TTS audio with ElevenLabs.
- Runs whitelisted OBS commands through OBS WebSocket.
- Supports Twitch channel-point reward routes for talk or OBS-command modes.
- Supports optional YouTube Super Chat and Super Sticker polling.
- Supports optional Ollama reactions with local memory and OpenClaw fallback.

## Setup

Install dependencies:

```bash
npm install
```

Copy the example config:

```bash
cp config.example.json config.json
```

Edit `config.json` with your local paths, OBS scene/source names, and environment-variable names. Keep secrets out of the file when possible.

Run the Streamlabels file watcher:

```bash
npm start
```

Run the Streamlabs/Twitch receiver:

```bash
npm run streamlabs:receiver
```

Check OBS connectivity:

```bash
npm run obs -- status
```

## Streamlabs Widget

Paste `streamlabs-custom-widget.js` into a Streamlabs custom widget or alert area that supports custom JavaScript. It forwards Streamlabs widget events to the local receiver.

The receiver defaults to `http://127.0.0.1:17328/streamlabs/event`. Change that in both the widget snippet and `config.json` if you use a different host or port.

## OBS Commands

OBS commands are intentionally whitelisted. Viewer input cannot run shell commands or arbitrary OBS requests.

Supported command families include:

- Show, hide, or toggle configured sources.
- Switch to configured scenes.
- Temporarily change stream bitrate within a configured range, then restore it.
- Toggle a configured grayscale filter.
- Optionally flip or rotate configured sources when transform commands are enabled.
- Stop/end/kill stream only when explicitly enabled and only for the higher donation threshold.

Edit `obsCommands.sourceAliases`, `obsCommands.sceneAliases`, `donationRules`, and `twitchChannelPoints.rewardRoutes` for your own stream layout.

## Local Ollama

Set `ollama.enabled` to `true` to try a local model first and fall back to OpenClaw when configured. The bridge can read `ollama-tv-lore.md` and write local memory under `memory.dir`; keep that generated memory private.

For a terminal test chat:

```bash
npm run hermy:chat
```

## YouTube Super Chats

Set `youtubeSuperChats.enabled` to `true` and provide either `liveChatId` or `broadcastVideoId`. The receiver polls YouTube live chat, normalizes Super Chats and Super Stickers, then applies the same TTS and OBS command tiers as donation-like events.

## Secrets

Use environment variables for secrets:

- `ELEVENLABS_API_KEY` for TTS.
- `ELEVENLABS_VOICE_ID` or `tts.voiceId` for the voice.
- `TWITCH_CHANNEL_POINTS_TOKEN` for Twitch EventSub.
- `YOUTUBE_API_KEY` or `YOUTUBE_ACCESS_TOKEN` for YouTube live chat polling.
- `OBS_WEBSOCKET_PASSWORD` for OBS WebSocket, unless you intentionally read it from a private local OBS config file.

Do not commit `config.json`, raw event logs, generated audio, or output files.

## Notes

This project is designed for local stream machines. Keep it boring where it matters: explicit config, whitelisted actions, short reactions, and no public secrets.
