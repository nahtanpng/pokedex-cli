import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ApiReader } from '../src/api/client.js';

export function fixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function fakeReader(resources: Record<string, unknown>): ApiReader {
  return {
    async get<T>(path: string): Promise<T> {
      if (!(path in resources)) throw new Error(`Fixture missing for ${path}`);
      return resources[path] as T;
    },
    async getAll<T>(paths: string[]): Promise<T[]> {
      return Promise.all(paths.map((path) => this.get<T>(path)));
    },
  };
}
