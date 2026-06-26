# Private Scope

This repo should stay documentation-first and public-safe.

## Keep Private

- Real memory files
- Internal bridge paths and workspace paths
- API keys, OAuth tokens, webhook secrets, and OBS passwords
- Real Twitch, YouTube, Discord, or donor identifiers
- Hostnames, private IPs, internal routes, and live service names
- Internal prompts, private logs, and exact moderation rules
- Live allowlists that could be abused if copied exactly
- Generated audio, raw event logs, and real chat transcripts
- Exact scene/source names when they reveal the live layout
- Exact moderation logic or sanitizer rules that would make bypasses easier

## Public Scope

Good public material:

- High-level architecture
- Fake event payload examples
- Placeholder config examples
- Public command categories
- Category-level safe-action catalogs
- Synthetic accepted, rejected, duplicate, and paid-event fixtures
- Setup notes that do not reveal a live machine
- Release-style notes

The short rule: publish how the system is shaped, not how to operate the live stream.
