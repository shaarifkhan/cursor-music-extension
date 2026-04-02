import * as fs from 'fs/promises';

export interface AgentMusicState {
  active: boolean;
  event?: string;
  updatedAt?: string;
  source?: string;
}

export async function readAgentMusicState(stateFilePath: string): Promise<AgentMusicState | undefined> {
  try {
    const raw = await fs.readFile(stateFilePath, 'utf8');
    return parseAgentMusicState(raw);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

export function parseAgentMusicState(raw: string): AgentMusicState | undefined {
  try {
    const value = JSON.parse(raw) as Partial<AgentMusicState>;
    if (typeof value.active !== 'boolean') {
      return undefined;
    }

    return {
      active: value.active,
      event: typeof value.event === 'string' ? value.event : undefined,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
      source: typeof value.source === 'string' ? value.source : undefined
    };
  } catch {
    return undefined;
  }
}
