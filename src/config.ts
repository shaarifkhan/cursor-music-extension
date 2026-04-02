import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const CONFIG_SECTION = 'cursorAgentMusic';

export interface ExtensionConfig {
  enabled: boolean;
  musicSource: string;
  configuredMusicSource: string;
  volume: number;
  shuffle: boolean;
  fadeOutMs: number;
  stateFilePath: string;
  usingBundledMusic: boolean;
}

export function getDefaultStateFilePath(): string {
  return path.join(os.homedir(), '.cursor', 'cursor-agent-music', 'agent-music-state.json');
}

export function getDefaultMusicDirectoryPath(): string {
  return path.join(os.homedir(), '.cursor', 'cursor-agent-music', 'music');
}

export function getBundledMusicSource(): string {
  return getDefaultMusicDirectoryPath();
}

export function getPackagedMusicDirectoryPath(extensionPath: string): string {
  return path.join(extensionPath, 'music', 'lofi');
}

export function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const configuredMusicSource = config.get<string>('musicSource', '').trim();
  const bundledMusicSource = getBundledMusicSource();
  const musicSource = configuredMusicSource || bundledMusicSource;
  const stateFilePath = config.get<string>('stateFilePath', '').trim() || getDefaultStateFilePath();

  return {
    enabled: config.get<boolean>('enabled', true),
    musicSource,
    configuredMusicSource,
    volume: config.get<number>('volume', 1),
    shuffle: config.get<boolean>('shuffle', true),
    fadeOutMs: config.get<number>('fadeOutMs', 0),
    stateFilePath,
    usingBundledMusic: !configuredMusicSource
  };
}

export async function updateMusicSource(selectedPath: string): Promise<void> {
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update('musicSource', selectedPath, target);
}

export async function useBundledMusic(): Promise<void> {
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update('musicSource', '', target);
}

export async function toggleEnabled(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const nextValue = !config.get<boolean>('enabled', true);
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await config.update('enabled', nextValue, target);
  return nextValue;
}
