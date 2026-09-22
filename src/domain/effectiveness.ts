import type { ApiReader } from '../api/client.js';
import type { DamageRelations, Pokemon, ResourceList, TypeResource } from '../api/types.js';
import { idFromUrl } from '../util.js';

/** Types that only exist inside the games' data files, never in a matchup. */
const NON_BATTLE_TYPES = new Set(['unknown', 'shadow', 'stellar']);

export interface Matchup {
  multiplier: number;
  types: string[];
}

export async function loadTypes(client: ApiReader): Promise<Map<string, TypeResource>> {
  const list = await client.get<ResourceList>('type?limit=100');
  const relevant = list.results.filter((item) => !NON_BATTLE_TYPES.has(item.name));
  const resources = await client.getAll<TypeResource>(relevant.map((item) => item.url));
  return new Map(resources.map((resource) => [resource.name, resource]));
}

/**
 * `past_types` / `past_damage_relations` entries describe how things were *up to and
 * including* that generation, so the right entry is the earliest one that still covers
 * the target generation. No match means the current data already applies.
 */
function pickHistorical<T extends { generation: { url: string } }>(entries: T[], generationId: number): T | null {
  return entries
    .filter((entry) => idFromUrl(entry.generation.url) >= generationId)
    .sort((a, b) => idFromUrl(a.generation.url) - idFromUrl(b.generation.url))[0] ?? null;
}

export function typesForGeneration(pokemon: Pokemon, generationId: number): string[] {
  const past = pickHistorical(pokemon.past_types ?? [], generationId);
  const types = past ? past.types : pokemon.types;
  return [...types].sort((a, b) => a.slot - b.slot).map((entry) => entry.type.name);
}

export function relationsForGeneration(type: TypeResource, generationId: number): DamageRelations {
  return pickHistorical(type.past_damage_relations ?? [], generationId)?.damage_relations ?? type.damage_relations;
}

function existsInGeneration(type: TypeResource, generationId: number): boolean {
  return idFromUrl(type.generation.url) <= generationId;
}

function defensiveFactor(relations: DamageRelations, attacking: string): number {
  if (relations.no_damage_from.some((entry) => entry.name === attacking)) return 0;
  if (relations.half_damage_from.some((entry) => entry.name === attacking)) return 0.5;
  if (relations.double_damage_from.some((entry) => entry.name === attacking)) return 2;
  return 1;
}

/**
 * Defensive chart for `defendingTypes` as they were in `generationId`. Attacking types
 * introduced later (Dark/Steel in gen 2, Fairy in gen 6) are left out entirely.
 */
export function computeMatchups(
  defendingTypes: string[],
  allTypes: Map<string, TypeResource>,
  generationId: number,
): Matchup[] {
  const relations = defendingTypes
    .map((name) => allTypes.get(name))
    .filter((type): type is TypeResource => type !== undefined)
    .map((type) => relationsForGeneration(type, generationId));

  const byMultiplier = new Map<number, string[]>();

  for (const [name, type] of allTypes) {
    if (!existsInGeneration(type, generationId)) continue;

    const multiplier = relations.reduce((total, relation) => total * defensiveFactor(relation, name), 1);
    if (multiplier === 1) continue;

    const bucket = byMultiplier.get(multiplier) ?? [];
    bucket.push(name);
    byMultiplier.set(multiplier, bucket);
  }

  return [...byMultiplier.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([multiplier, types]) => ({ multiplier, types: types.sort() }));
}
