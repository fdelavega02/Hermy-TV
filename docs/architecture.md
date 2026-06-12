# Architecture

Hermy-TV is designed as a local stream assistant, not a hosted bot with broad access. Stream events come in, get normalized, pass through explicit safety and command rules, then produce a short on-stream reaction.

## High-Level Flow

1. Event intake receives donation, subscription, resubscription, follow, raid, channel-point, or widget events.
2. The receiver normalizes the event into a small internal shape: source, display name, amount or tier, message text, and event id when available.
3. Duplicate and empty events are ignored.
4. Text is treated as untrusted viewer input.
5. If enabled, Hermy-TV writes a short reaction for OBS text display.
6. If enabled, TTS speaks the viewer message and/or Hermy-TV reaction.
7. If the event qualifies for an OBS action, a whitelisted command runner maps the request to known scenes, sources, filters, or bitrate ranges.
8. Local output files record the last event and reaction for OBS and debugging.

## Trust Boundaries

Viewer messages can request a reaction. They do not get direct shell access, arbitrary OBS access, filesystem access, or private assistant memory access.

Public documentation should describe categories and patterns. Private stream setup should hold the exact channel ids, tokens, allowlists, private prompts, local hostnames, and live moderation notes.

## Main Components

- `bridge.mjs`: watches local label/event files and routes reactions.
- `streamlabs-widget-receiver.mjs`: receives Streamlabs widget events and Twitch EventSub events.
- `obs-controller.mjs`: sends constrained OBS WebSocket requests.
- `streamlabs-custom-widget.js`: browser-side widget snippet that forwards Streamlabs events to the local receiver.
- `config.example.json`: fake, placeholder-only config shape.

## Failure Behavior

The useful failure mode is boring: log the issue, skip unsafe actions, and keep the stream running. A failed reaction should not stop OBS, leak secrets, or make viewer text more trusted than it was before.
