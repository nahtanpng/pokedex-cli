import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = 'https://pokeapi.co/api/v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export class NotFoundError extends Error {
  constructor(public readonly resource: string) {
    super(`Resource not found: ${resource}`);
    this.name = 'NotFoundError';
  }
}

export class ApiError extends Error {
  constructor(message: string, public readonly detail?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The read surface the domain modules depend on, so tests can supply fixtures. */
export interface ApiReader {
  get<T>(path: string): Promise<T>;
  getAll<T>(paths: string[]): Promise<T[]>;
}

export interface BinaryReader {
  getBinary(url: string): Promise<Buffer>;
}

export interface ClientOptions {
  cache?: boolean;
  concurrency?: number;
}

function cacheDir(): string {
  const home = homedir();
  const base = process.env.XDG_CACHE_HOME ?? (home ? join(home, '.cache') : tmpdir());
  return join(base, 'pokedex-cli');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PokeApiClient implements ApiReader, BinaryReader {
  private readonly memory = new Map<string, unknown>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly useCache: boolean;
  private readonly concurrency: number;
  private cacheDirReady: Promise<void> | null = null;

  constructor(options: ClientOptions = {}) {
    this.useCache = options.cache ?? true;
    this.concurrency = options.concurrency ?? 8;
  }

  async get<T>(path: string): Promise<T> {
    const url = this.toUrl(path);
    const cached = this.memory.get(url);
    if (cached !== undefined) return cached as T;

    // A single query fans out to dozens of URLs (one per location area) and the
    // same resource is often requested twice; dedupe concurrent misses.
    const pending = this.inFlight.get(url);
    if (pending) return pending as Promise<T>;

    const promise = this.load<T>(url)
      .then((value) => {
        this.memory.set(url, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(url);
      });

    this.inFlight.set(url, promise);
    return promise;
  }

  /** Sprites are small PNGs served from GitHub; they are cached as raw files. */
  async getBinary(url: string): Promise<Buffer> {
    const file = `${this.cacheFile(url)}.bin`;

    if (this.useCache) {
      try {
        return await readFile(file);
      } catch {
        // Not cached yet.
      }
    }

    const response = await fetch(url);
    if (!response.ok) throw new ApiError(`Could not download ${url} (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());

    if (this.useCache) {
      try {
        this.cacheDirReady ??= mkdir(cacheDir(), { recursive: true }).then(() => undefined);
        await this.cacheDirReady;
        await writeFile(file, buffer);
      } catch {
        // A broken cache must never break a lookup.
      }
    }

    return buffer;
  }

  /** Resolves `paths` keeping at most `concurrency` requests open at a time. */
  async getAll<T>(paths: string[]): Promise<T[]> {
    const results = new Array<T>(paths.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < paths.length) {
        const index = cursor++;
        results[index] = await this.get<T>(paths[index]!);
      }
    };

    const workers = Array.from({ length: Math.min(this.concurrency, paths.length) }, worker);
    await Promise.all(workers);
    return results;
  }

  private toUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${BASE_URL}/${path.replace(/^\/+/, '')}`;
  }

  private async load<T>(url: string): Promise<T> {
    if (this.useCache) {
      const fromDisk = await this.readDisk<T>(url);
      if (fromDisk !== null) return fromDisk;
    }

    const value = await this.fetchWithRetry<T>(url);
    if (this.useCache) await this.writeDisk(url, value);
    return value;
  }

  private async fetchWithRetry<T>(url: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, { headers: { accept: 'application/json' } });

        if (response.status === 404) throw new NotFoundError(url);
        if (response.status >= 500 || response.status === 429) {
          throw new ApiError(`PokeAPI responded with ${response.status} for ${url}`);
        }
        if (!response.ok) {
          throw new ApiError(`PokeAPI responded with ${response.status} for ${url}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof NotFoundError) throw error;
        lastError = error;
        if (attempt < MAX_ATTEMPTS) await sleep(250 * 2 ** (attempt - 1));
      }
    }

    throw new ApiError(`Could not reach PokeAPI (${url})`, lastError);
  }

  private cacheFile(url: string): string {
    return join(cacheDir(), `${createHash('sha1').update(url).digest('hex')}.json`);
  }

  private async readDisk<T>(url: string): Promise<T | null> {
    try {
      const raw = await readFile(this.cacheFile(url), 'utf8');
      const entry = JSON.parse(raw) as { savedAt: number; value: T };
      if (Date.now() - entry.savedAt > CACHE_TTL_MS) return null;
      return entry.value;
    } catch {
      return null;
    }
  }

  private async writeDisk(url: string, value: unknown): Promise<void> {
    try {
      this.cacheDirReady ??= mkdir(cacheDir(), { recursive: true }).then(() => undefined);
      await this.cacheDirReady;
      await writeFile(this.cacheFile(url), JSON.stringify({ savedAt: Date.now(), value }), 'utf8');
    } catch {
      // A broken cache must never break a lookup.
    }
  }
}
