# Cursor Agent Music

Play music while the Cursor agent is working, then stop playback when the agent finishes.

## How it works

- Cursor hook scripts write agent activity into `~/.cursor/cursor-agent-music/agent-music-state.json`.
- The extension watches that file.
- When the file says the agent is active, the extension starts playback.
- When the file says the agent has stopped, playback is terminated.

## Current scope

- Cursor-first
- macOS-first
- Playback uses the built-in `afplay` command
- Bundled default lofi track is copied into `~/.cursor/cursor-agent-music/music` for zero-config testing
- Global setup in `~/.cursor`, so it works across Cursor workspaces by default

## Setup

1. Install dependencies:

```sh
npm install
```

2. Open this folder in Cursor or VS Code.
3. Run the extension in an Extension Development Host.
4. The extension automatically installs and updates its Cursor hooks in `~/.cursor/hooks.json` on activation.
5. Optional: run `Cursor Agent Music: Pick Music Source` if you want your own audio file or folder.
6. If you skip step 5, the extension uses `~/.cursor/cursor-agent-music/music` automatically.
7. You can drop more music files into `~/.cursor/cursor-agent-music/music` and they will be picked up automatically.

## Commands

- `Cursor Agent Music: Pick Music Source`
- `Cursor Agent Music: Use Bundled Default Music`
- `Cursor Agent Music: Start Test Playback`
- `Cursor Agent Music: Stop Test Playback`
- `Cursor Agent Music: Toggle Enabled`
- `Cursor Agent Music: Open Hook Config`

## Settings

- `cursorAgentMusic.enabled`
- `cursorAgentMusic.musicSource`
- `cursorAgentMusic.volume`
- `cursorAgentMusic.shuffle`
- `cursorAgentMusic.fadeOutMs`
- `cursorAgentMusic.stateFilePath`

## Verification

1. Start test playback manually and confirm music starts.
2. Stop test playback manually and confirm music stops.
3. Confirm `~/.cursor/cursor-agent-music/music` contains the default track after activation.
4. Start a Cursor agent request in any workspace and confirm `~/.cursor/cursor-agent-music/agent-music-state.json` flips to active.
5. Wait for the agent to finish and confirm the state flips back to inactive and music stops.

## Limitations

- This version supports macOS only.
- `afplay` has no true fade API, so `fadeOutMs` is only a short stop delay.
- Hook names may need adjustment if Cursor changes hook semantics in a future release.
