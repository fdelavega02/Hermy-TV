# Stream Incident Drill

Public-safe operator checklist for recovering when stream automation behaves badly. The priority is to stop bad output first, then diagnose after the stream is stable.

## Fast Triage

1. Mute the Hermy-TV TTS or alert-audio source if audio is the problem.
2. Hide or clear the on-screen reaction text if visible text is the problem.
3. Pause the local receiver or bridge process if events are still arriving.
4. Disable the viewer reward, paid-event route, or alert source that is feeding the bad path.
5. Switch the active reaction pack to `emergency` before restarting if generated replies are escalating, repeating bait, or getting too loose.
6. Restore the normal OBS scene and affected sources.
7. After the stream is stable, record the trigger, impact, and fix in a private operations note.

## Bad TTS Output

Use this when Hermy-TV starts reading something private, too nasty, too long, or broken.

1. Mute the TTS/audio source first.
2. Stop or pause the process that is generating speech.
3. Clear queued/generated audio if it keeps playing.
4. Use the `emergency` reaction pack if the prompt path needs to stay live.
5. Resume only after a private test message behaves correctly.

## Bad OBS Action

Use this when a viewer-triggered action changes the wrong thing, times out, or makes the scene unreadable.

1. Disable viewer OBS-command rewards or the route that handles them.
2. Restore the normal scene.
3. Restore any affected source, filter, transform, or bitrate state.
4. Check whether the accepted or rejected command matched the intended command category.
5. Re-enable the route only after a private test command performs exactly one expected action.

## Private Info Or Prompt Bait

Use this when a viewer tries to make Hermy-TV reveal prompts, tokens, IDs, logs, memory, internal routes, local files, or tool output.

1. If TTS started reading it, mute TTS first.
2. Deflect briefly without repeating the bait.
3. Switch to `emergency` if viewers keep pushing the same angle.
4. After stream, tighten refusal wording only if the model actually repeated private or bait text.

## Model Gets Weird

Use this when generated replies become repetitive, too long, too compliant, too apologetic, too mean, or otherwise off-tone.

1. Switch `reactionPacks.active` to `emergency`.
2. Restart the affected process so the new pack is loaded.
3. If the issue continues, disable local-model fallback or generated reactions temporarily.
4. Test one plain message, one rude message, and one prompt-injection attempt before resuming normal mode.

## Dry Run

Practice this off-stream before relying on it live.

1. Open OBS while not live.
2. Trigger one harmless talk-style event or local test message.
3. Practice muting TTS and hiding the reaction text source.
4. Trigger one rejected OBS command and confirm the refusal is short.
5. Change `reactionPacks.active` to `emergency`, restart the receiver, and confirm the next answer is minimal.
6. Change back to the normal pack and restart again.
7. Note any step that took too long; that step is a candidate for a future panic button.
