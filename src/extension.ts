import * as path from 'path';
import * as vscode from 'vscode';
import { AudioPlayer } from './audioPlayer';
import {
  getBundledMusicSource,
  getExtensionConfig,
  getPackagedMusicDirectoryPath,
  toggleEnabled,
  updateMusicSource,
  useBundledMusic
} from './config';
import { AgentMusicState, readAgentMusicState } from './state';
import { installGlobalHooks } from './globalSetup';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Cursor Agent Music');
  const player = new AudioPlayer(output);

  let watcherDisposable: vscode.Disposable | undefined;
  let poller: NodeJS.Timeout | undefined;
  let syncTimer: NodeJS.Timeout | undefined;
  let lastStateKey = '';
  let lastKnownState: AgentMusicState | undefined;
  let globalHookConfigPath = '';

  context.subscriptions.push(output);
  context.subscriptions.push({
    dispose: () => {
      if (watcherDisposable) {
        watcherDisposable.dispose();
      }

      if (poller) {
        clearInterval(poller);
      }

      if (syncTimer) {
        clearTimeout(syncTimer);
      }

      void player.dispose();
    }
  });

  const scheduleSync = (reason: string) => {
    if (syncTimer) {
      clearTimeout(syncTimer);
    }

    syncTimer = setTimeout(() => {
      void syncFromState(reason);
    }, 200);
  };

  const ensureGlobalSetup = async () => {
    const config = getExtensionConfig();
    const result = await installGlobalHooks(
      context.globalStorageUri.fsPath,
      config.stateFilePath,
      getPackagedMusicDirectoryPath(context.extensionPath),
      getBundledMusicSource()
    );
    globalHookConfigPath = result.hookConfigPath;
    output.appendLine(`Global hooks ready at ${result.hookConfigPath}.`);
    output.appendLine(`Default music directory ready at ${result.musicDirectoryPath}.`);
  };

  const rebuildWatcher = async () => {
    if (watcherDisposable) {
      watcherDisposable.dispose();
      watcherDisposable = undefined;
    }

    if (poller) {
      clearInterval(poller);
      poller = undefined;
    }

    const config = getExtensionConfig();
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.dirname(config.stateFilePath)),
      path.basename(config.stateFilePath)
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange(() => scheduleSync('state-changed'));
    watcher.onDidCreate(() => scheduleSync('state-created'));
    watcher.onDidDelete(() => scheduleSync('state-deleted'));

    watcherDisposable = watcher;
    context.subscriptions.push(watcher);

    poller = setInterval(() => scheduleSync('poll'), 2000);
  };

  const syncFromState = async (reason: string) => {
    const config = getExtensionConfig();

    let state: AgentMusicState | undefined;
    try {
      state = await readAgentMusicState(config.stateFilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`Failed to read state file: ${message}`);
      return;
    }

    if (!state) {
      output.appendLine(`State file is missing or invalid during ${reason}.`);
      return;
    }

    const stateKey = JSON.stringify(state);
    if (stateKey === lastStateKey && reason !== 'config-changed' && reason !== 'manual-play' && reason !== 'manual-stop') {
      return;
    }

    lastStateKey = stateKey;
    lastKnownState = state;
    output.appendLine(`Observed state ${state.active ? 'active' : 'inactive'} from ${state.event ?? 'unknown'} (${reason}).`);

    if (!config.enabled) {
      await player.stop(0);
      return;
    }

    try {
      if (state.active) {
        await player.start({
          musicSource: config.musicSource,
          volume: config.volume,
          shuffle: config.shuffle,
          fadeOutMs: config.fadeOutMs
        });
      } else {
        await player.stop(config.fadeOutMs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`Playback action failed: ${message}`);
      void vscode.window.showErrorMessage(`Cursor Agent Music: ${message}`);
    }
  };

  const handleConfigChange = async (event: vscode.ConfigurationChangeEvent) => {
    if (!event.affectsConfiguration('cursorAgentMusic')) {
      return;
    }

    output.appendLine('Configuration changed.');

    if (event.affectsConfiguration('cursorAgentMusic.stateFilePath')) {
      await ensureGlobalSetup();
      lastStateKey = '';
      await rebuildWatcher();
    }

    if (event.affectsConfiguration('cursorAgentMusic.enabled')) {
      const config = getExtensionConfig();
      if (!config.enabled) {
        await player.stop(0);
      } else {
        scheduleSync('config-changed');
      }
      return;
    }

    if (
      lastKnownState?.active &&
      (event.affectsConfiguration('cursorAgentMusic.musicSource')
        || event.affectsConfiguration('cursorAgentMusic.volume')
        || event.affectsConfiguration('cursorAgentMusic.shuffle'))
    ) {
      const config = getExtensionConfig();
      try {
        await player.restart({
          musicSource: config.musicSource,
          volume: config.volume,
          shuffle: config.shuffle,
          fadeOutMs: config.fadeOutMs
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`Restart failed after config change: ${message}`);
        void vscode.window.showErrorMessage(`Cursor Agent Music: ${message}`);
      }
    }

    scheduleSync('config-changed');
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      void handleConfigChange(event);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorAgentMusic.pickMusicSource', async () => {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Use for Cursor Agent Music'
      });

      const selected = selection?.[0];
      if (!selected) {
        return;
      }

      await updateMusicSource(selected.fsPath);
      void vscode.window.showInformationMessage(`Cursor Agent Music source set to ${selected.fsPath}.`);
    }),
    vscode.commands.registerCommand('cursorAgentMusic.useBundledMusic', async () => {
      await useBundledMusic();
      void vscode.window.showInformationMessage('Cursor Agent Music will use ~/.cursor/cursor-agent-music/music.');
    }),
    vscode.commands.registerCommand('cursorAgentMusic.playTest', async () => {
      const config = getExtensionConfig();
      try {
        await player.start({
          musicSource: config.musicSource,
          volume: config.volume,
          shuffle: config.shuffle,
          fadeOutMs: config.fadeOutMs
        });
        void vscode.window.showInformationMessage('Cursor Agent Music test playback started.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Cursor Agent Music: ${message}`);
      }
    }),
    vscode.commands.registerCommand('cursorAgentMusic.stopTest', async () => {
      const config = getExtensionConfig();
      await player.stop(config.fadeOutMs);
      void vscode.window.showInformationMessage('Cursor Agent Music playback stopped.');
    }),
    vscode.commands.registerCommand('cursorAgentMusic.toggleEnabled', async () => {
      const enabled = await toggleEnabled();
      void vscode.window.showInformationMessage(`Cursor Agent Music ${enabled ? 'enabled' : 'disabled'}.`);
    }),
    vscode.commands.registerCommand('cursorAgentMusic.openHookConfig', async () => {
      await ensureGlobalSetup();
      const document = await vscode.workspace.openTextDocument(globalHookConfigPath);
      await vscode.window.showTextDocument(document);
    })
  );

  await ensureGlobalSetup();
  await rebuildWatcher();
  await syncFromState('startup');
}

export function deactivate(): void {
  // Disposal is handled through extension subscriptions.
}
