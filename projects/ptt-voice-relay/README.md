# Local Push-to-Talk Voice Relay

Small Linux reference implementation for a hold-to-talk relay. It reads an
explicitly configured keyboard device and calls a **local** HTTP relay on press
and release.

## What it does

```text
Ctrl+Fn held -> POST /api/ptt/start { profile }
Ctrl+Fn released -> POST /api/ptt/stop  { profile }
```

It does not suppress keyboard input, capture general typing, record audio, or
contact external services. Audio capture, transcription, model selection, and
TTS belong in the local relay implementation—not in this listener.

## Setup

1. Copy `config.example.json` to `config.json`.
2. Replace `inputDevice` with a stable `/dev/input/by-id/...` keyboard path you
   explicitly authorize for these hotkeys.
3. Point `serverUrl` at your local relay and choose the profile names it accepts.
4. First validate safely:

   ```bash
   python3 ptt_listener.py --dry-run
   ```

5. Run it only after the local relay exposes `POST /api/ptt/start` and
   `POST /api/ptt/stop`.

## Safety notes

- Keep `config.json` local; it is intentionally not a production configuration.
- Do not publish device paths, account/session identifiers, local service URLs
  other than loopback examples, recorded audio, transcriptions, or logs.
- On Wayland, input-device permissions and a system-level relay may be needed;
  review that service carefully before granting access.

## Validation

`--dry-run` reads only the configured keys and makes no HTTP requests. Use a
test relay that logs only profile names before connecting a microphone or model.
