# Configuration

This repo only includes example configuration. Copy `projects/streamlabels-hermy-bridge/config.example.json` to a private `config.json` and fill in local values on the stream machine.

## Public-Safe Values

Safe to document here:

- Setting names
- Placeholder environment variable names
- Fake OBS scene/source names
- Fake thresholds
- Fake reward titles
- Localhost-style example endpoints

Do not publish:

- Bot tokens or OAuth tokens
- Twitch, YouTube, Discord, Streamlabs, or OBS secrets
- Real channel ids or user ids
- Private hostnames, IP addresses, or routes
- Real stream scene/source names if they expose private operations
- Raw logs, raw event payloads from real viewers, or generated TTS output
- Private prompts, memory files, moderation notes, or allowlists

## Environment Variables

Use environment variables for secrets:

```bash
ELEVENLABS_API_KEY=replace-with-private-value
ELEVENLABS_VOICE_ID=replace-with-private-value
TWITCH_CHANNEL_POINTS_TOKEN=replace-with-private-value
YOUTUBE_API_KEY=replace-with-private-value
YOUTUBE_ACCESS_TOKEN=replace-with-private-value
THE_ODDS_API_KEY=replace-with-private-value
OBS_WEBSOCKET_PASSWORD=replace-with-private-value
```

Keep real values outside Git.
