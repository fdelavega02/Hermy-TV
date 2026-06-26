# Commands

Commands are grouped by what they are allowed to touch. Viewer text never becomes a raw command; it has to match a configured alias and pass the matching tier.

## Public Categories

- Source visibility: show, hide, or toggle a configured OBS source.
- Scene switching: switch to a configured scene alias.
- Text/reaction output: write a short Hermy-TV reaction to an OBS-readable file.
- Temporary stream effects: enable a known filter, apply an optional transform, or temporarily adjust a value within configured limits.
- Stream control: optional high-trust tier for actions such as ending a stream, disabled unless explicitly configured.

## Event Tiers

- Low-risk events can trigger reactions only.
- Paid or trusted events can trigger TTS when configured.
- Higher-threshold events can request whitelisted OBS actions.
- Stream-control commands should require the highest threshold and should be easy to disable.

## Command Rules

- Match aliases, not arbitrary user text.
- Keep OBS scene and source names in private config when they reveal the live layout.
- Clamp numeric values such as bitrate to configured minimums and maximums.
- Prefer temporary changes with automatic restore where possible.
- Log skipped or rejected commands without repeating sensitive values.

## Safe Action Catalog

Public command docs should stay category-level:

- Banner or source visibility changes
- Status text updates
- Temporary visual filter or transform effects
- Scene alias switches
- Timed restores after temporary changes
- Reaction-only requests

The exact live aliases, allowlists, source names, and moderation rules belong in private config.

## Example Phrases

- `show camera`
- `hide banner`
- `switch to gameplay`
- `toggle grayscale`
- `flip camera upside down`
- `raise bitrate`

These are examples only. Live aliases belong in private config.
