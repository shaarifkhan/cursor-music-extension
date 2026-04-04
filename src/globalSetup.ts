import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

interface HookCommand {
  command: string;
}

interface HooksFileShape {
  version: number;
  hooks: Record<string, HookCommand[]>;
}

export interface GlobalSetupResult {
  hookConfigPath: string;
  stateFilePath: string;
  musicDirectoryPath: string;
  installedScriptPaths: string[];
}

export function getGlobalHookConfigPath(): string {
  return path.join(os.homedir(), '.cursor', 'hooks.json');
}

export async function installGlobalHooks(
  globalStoragePath: string,
  stateFilePath: string,
  packagedMusicDirectoryPath: string,
  musicDirectoryPath: string
): Promise<GlobalSetupResult> {
  const hookConfigPath = getGlobalHookConfigPath();
  const scriptDirectory = path.join(globalStoragePath, 'hooks');
  const startScriptPath = path.join(scriptDirectory, 'agent-start.sh');
  const stopScriptPath = path.join(scriptDirectory, 'agent-stop.sh');

  await fs.mkdir(path.dirname(hookConfigPath), { recursive: true });
  await fs.mkdir(scriptDirectory, { recursive: true });

  await fs.writeFile(startScriptPath, renderHookScript(true, stateFilePath), 'utf8');
  await fs.writeFile(stopScriptPath, renderHookScript(false, stateFilePath), 'utf8');
  await fs.chmod(startScriptPath, 0o755);
  await fs.chmod(stopScriptPath, 0o755);

  await ensureStateFileExists(stateFilePath);
  await seedDefaultMusicDirectory(packagedMusicDirectoryPath, musicDirectoryPath);
  await upsertHookConfig(hookConfigPath, startScriptPath, stopScriptPath);

  return {
    hookConfigPath,
    stateFilePath,
    musicDirectoryPath,
    installedScriptPaths: [startScriptPath, stopScriptPath]
  };
}

export async function ensureStateFileExists(stateFilePath: string): Promise<void> {
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true });

  try {
    await fs.access(stateFilePath);
  } catch {
    await fs.writeFile(
      stateFilePath,
      JSON.stringify(
        {
          active: false,
          event: 'initialized',
          updatedAt: new Date().toISOString(),
          source: 'extension'
        },
        null,
        2
      ),
      'utf8'
    );
  }
}

async function upsertHookConfig(hookConfigPath: string, startScriptPath: string, stopScriptPath: string): Promise<void> {
  const existing = await readHooksFile(hookConfigPath);
  const nextValue: HooksFileShape = {
    version: 1,
    hooks: existing?.hooks ?? {}
  };

  appendHookCommand(nextValue.hooks, 'beforeSubmitPrompt', `${quoteForShell(startScriptPath)} beforeSubmitPrompt`);
  appendHookCommand(nextValue.hooks, 'stop', `${quoteForShell(stopScriptPath)} stop`);
  appendHookCommand(nextValue.hooks, 'sessionEnd', `${quoteForShell(stopScriptPath)} sessionEnd`);

  await fs.writeFile(hookConfigPath, JSON.stringify(nextValue, null, 2), 'utf8');
}

async function readHooksFile(hookConfigPath: string): Promise<HooksFileShape | undefined> {
  try {
    const raw = await fs.readFile(hookConfigPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<HooksFileShape>;

    if (!parsed || typeof parsed !== 'object' || typeof parsed.hooks !== 'object' || parsed.hooks === null) {
      return undefined;
    }

    const hooks: Record<string, HookCommand[]> = {};
    for (const [eventName, value] of Object.entries(parsed.hooks)) {
      if (!Array.isArray(value)) {
        continue;
      }

      hooks[eventName] = value.filter(isHookCommand);
    }

    return {
      version: 1,
      hooks
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return undefined;
    }

    return undefined;
  }
}

function appendHookCommand(hooks: Record<string, HookCommand[]>, eventName: string, command: string): void {
  const existingCommands = hooks[eventName] ?? [];
  if (existingCommands.some((entry) => entry.command === command)) {
    hooks[eventName] = existingCommands;
    return;
  }

  hooks[eventName] = [...existingCommands, { command }];
}

function isHookCommand(value: unknown): value is HookCommand {
  return typeof value === 'object' && value !== null && typeof (value as HookCommand).command === 'string';
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function renderHookScript(active: boolean, stateFilePath: string): string {
  const fallbackEvent = active ? 'sessionStart' : 'stop';

  return `#!/bin/sh

set -eu

EVENT_NAME="\${1:-${fallbackEvent}}"
STATE_FILE=${quoteForShell(stateFilePath)}

mkdir -p "$(dirname "$STATE_FILE")"

cat >"$STATE_FILE" <<EOF
{
  "active": ${active},
  "event": "\${EVENT_NAME}",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "source": "cursor-hook"
}
EOF
`;
}

async function seedDefaultMusicDirectory(sourceDirectoryPath: string, targetDirectoryPath: string): Promise<void> {
  await fs.mkdir(targetDirectoryPath, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(sourceDirectoryPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    const sourcePath = path.join(sourceDirectoryPath, entry.name);
    const targetPath = path.join(targetDirectoryPath, entry.name);

    if (entry.isDirectory()) {
      await seedDefaultMusicDirectory(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    try {
      await fs.access(targetPath);
    } catch {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}
