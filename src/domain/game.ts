import { NotFoundError, type ApiReader } from '../api/client.js';
import type { Generation, ResourceList, Version, VersionGroup } from '../api/types.js';
import { idFromUrl, suggest } from '../util.js';

export interface GameContext {
  /** null when the user did not pass --game: everything falls back to the latest generation. */
  version: Version | null;
  versionGroup: VersionGroup | null;
  generationId: number;
  /** Versions whose encounters are relevant: the chosen one, or every version of the generation. */
  versionNames: string[];
}

export class UnknownGameError extends Error {
  constructor(public readonly input: string, public readonly suggestions: string[]) {
    super(`Unknown game: ${input}`);
    this.name = 'UnknownGameError';
  }
}

async function latestGenerationId(client: ApiReader): Promise<number> {
  const list = await client.get<ResourceList>('generation?limit=100');
  const last = list.results.at(-1);
  if (!last) throw new Error('PokeAPI returned no generations');
  return idFromUrl(last.url);
}

export async function resolveGame(client: ApiReader, input?: string): Promise<GameContext> {
  if (!input) {
    return {
      version: null,
      versionGroup: null,
      generationId: await latestGenerationId(client),
      versionNames: [],
    };
  }

  const slug = input.trim().toLowerCase().replace(/\s+/g, '-');

  let version: Version;
  try {
    version = await client.get<Version>(`version/${slug}`);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    const list = await client.get<ResourceList>('version?limit=200');
    const names = list.results.map((item) => item.name);
    throw new UnknownGameError(input, suggest(slug, names));
  }

  const versionGroup = await client.get<VersionGroup>(version.version_group.url);

  return {
    version,
    versionGroup,
    generationId: idFromUrl(versionGroup.generation.url),
    versionNames: [version.name],
  };
}

export async function generationVersionNames(client: ApiReader, generationId: number): Promise<string[]> {
  const generation = await client.get<Generation>(`generation/${generationId}`);
  const groups = await client.getAll<VersionGroup>(generation.version_groups.map((group) => group.url));
  return groups.flatMap((group) => group.versions.map((version) => version.name));
}
