import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import * as vscode from 'vscode';

export interface PlaybackOptions {
  musicSource: string;
  volume: number;
  shuffle: boolean;
  fadeOutMs: number;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.aac',
  '.aif',
  '.aiff',
  '.caf',
  '.flac',
  '.m4a',
  '.mp3',
  '.mp4',
  '.wav'
]);

export class AudioPlayer {
  private currentChild?: ChildProcess;
  private loopPromise?: Promise<void>;
  private generation = 0;

  constructor(private readonly output: vscode.OutputChannel) {}

  public get isPlaying(): boolean {
    return this.loopPromise !== undefined;
  }

  public async start(options: PlaybackOptions): Promise<void> {
    if (this.loopPromise) {
      return;
    }

    this.ensurePlatformSupported();

    const tracks = await resolveTracks(options.musicSource);
    if (tracks.length === 0) {
      throw new Error('No supported audio files were found at the configured music source.');
    }

    const generation = ++this.generation;
    this.output.appendLine(`Starting playback with ${tracks.length} track(s).`);

    this.loopPromise = this.playLoop(tracks, options, generation).finally(() => {
      if (this.generation === generation) {
        this.loopPromise = undefined;
      }
    });

    await Promise.resolve();
  }

  public async restart(options: PlaybackOptions): Promise<void> {
    await this.stop(0);
    await this.start(options);
  }

  public async stop(fadeOutMs: number): Promise<void> {
    if (!this.loopPromise && !this.currentChild) {
      return;
    }

    const stopGeneration = ++this.generation;
    const loopPromise = this.loopPromise;

    if (fadeOutMs > 0) {
      await delay(fadeOutMs);
      if (this.generation !== stopGeneration) {
        return;
      }
    }

    this.killCurrentChild();
    await loopPromise?.catch(() => undefined);
    this.loopPromise = undefined;
    this.output.appendLine('Playback stopped.');
  }

  public async dispose(): Promise<void> {
    await this.stop(0);
  }

  private ensurePlatformSupported(): void {
    if (os.platform() !== 'darwin') {
      throw new Error('This first version supports macOS only because it relies on afplay.');
    }
  }

  private async playLoop(tracks: string[], options: PlaybackOptions, generation: number): Promise<void> {
    const queue = new TrackQueue(tracks, options.shuffle);

    while (this.generation === generation) {
      const nextTrack = queue.next();
      await this.playTrack(nextTrack, options.volume, generation);
    }
  }

  private async playTrack(trackPath: string, volume: number, generation: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const args = ['-v', String(volume), trackPath];
      const child = spawn('afplay', args, {
        stdio: 'ignore'
      });

      this.currentChild = child;
      child.once('error', (error) => {
        if (this.currentChild?.pid === child.pid) {
          this.currentChild = undefined;
        }

        reject(error);
      });

      child.once('exit', () => {
        if (this.currentChild?.pid === child.pid) {
          this.currentChild = undefined;
        }

        resolve();
      });

      this.output.appendLine(`Playing ${path.basename(trackPath)}.`);
    });

    if (this.generation !== generation) {
      this.killCurrentChild();
    }
  }

  private killCurrentChild(): void {
    if (!this.currentChild || this.currentChild.killed) {
      return;
    }

    try {
      this.currentChild.kill('SIGTERM');
    } catch {
      // Ignore stop races while shutting down playback.
    } finally {
      this.currentChild = undefined;
    }
  }
}

class TrackQueue {
  private queue: string[] = [];

  constructor(
    private readonly tracks: string[],
    private readonly shuffle: boolean
  ) {}

  public next(): string {
    if (this.queue.length === 0) {
      this.queue = [...this.tracks];
      if (this.shuffle && this.queue.length > 1) {
        shuffleInPlace(this.queue);
      }
    }

    const nextTrack = this.queue.shift();
    if (!nextTrack) {
      throw new Error('No track available for playback.');
    }

    return nextTrack;
  }
}

async function resolveTracks(musicSource: string): Promise<string[]> {
  if (!musicSource) {
    throw new Error('Set cursorAgentMusic.musicSource to an audio file or folder before starting playback.');
  }

  const stat = await fs.stat(musicSource);
  if (stat.isDirectory()) {
    return collectTracksFromDirectory(musicSource);
  }

  if (stat.isFile()) {
    return [musicSource];
  }

  throw new Error('The configured music source must be a file or a directory.');
}

async function collectTracksFromDirectory(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const tracks: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      tracks.push(...await collectTracksFromDirectory(entryPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (SUPPORTED_EXTENSIONS.has(path.extname(entryPath).toLowerCase())) {
      tracks.push(entryPath);
    }
  }

  return tracks;
}

function shuffleInPlace(values: string[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}
