import type { LocalizedName } from './api/types.js';

/** PokeAPI never exposes numeric ids on nested references, only the resource URL. */
export function idFromUrl(url: string): number {
  const match = /\/(\d+)\/?$/.exec(url);
  if (!match) throw new Error(`Cannot extract id from URL: ${url}`);
  return Number(match[1]);
}

const capitalize = (word: string): string => (word === '' ? word : word[0]!.toUpperCase() + word.slice(1));

export function titleCase(slug: string): string {
  return slug.split('-').map(capitalize).join(' ');
}

export function pokemonName(slug: string): string {
  return slug.split('-').map(capitalize).join('-');
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);

  for (let i = 1; i < rows; i++) {
    const current = [i];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }

  return previous[cols - 1]!;
}

export function suggest(input: string, candidates: string[], limit = 3): string[] {
  const threshold = Math.max(2, Math.floor(input.length / 3));
  return candidates
    .map((candidate) => ({ candidate, distance: levenshtein(input, candidate) }))
    .filter(({ candidate, distance }) => distance <= threshold || candidate.startsWith(input))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function englishName(names: LocalizedName[] | undefined, fallback: string): string {
  return names?.find((entry) => entry.language.name === 'en')?.name ?? pokemonName(fallback);
}
