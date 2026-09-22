import type { ApiReader } from '../api/client.js';
import type { ChainLink, EvolutionChain, EvolutionDetail, PokemonSpecies, VersionGroup } from '../api/types.js';
import { englishName, idFromUrl, pokemonName, titleCase } from '../util.js';
import type { GameContext } from './game.js';

export interface EvolutionNode {
  species: string;
  displayName: string;
  /** How this species is reached from its parent; null for the base form. */
  condition: string | null;
  children: EvolutionNode[];
}

const GENDERS: Record<number, string> = { 1: 'female only', 2: 'male only' };
const PHYSICAL_STATS: Record<number, string> = {
  [-1]: 'with Attack < Defense',
  0: 'with Attack = Defense',
  1: 'with Attack > Defense',
};

export function describeEvolution(detail: EvolutionDetail): string {
  const trigger = detail.trigger?.name ?? 'other';
  const conditions: string[] = [];

  let base: string;
  switch (trigger) {
    case 'level-up':
      base = detail.min_level ? `Level ${detail.min_level}` : 'Level up';
      break;
    case 'trade':
      base = detail.trade_species ? `Trade for a ${pokemonName(detail.trade_species.name)}` : 'Trade';
      break;
    case 'use-item':
      base = detail.item ? `Use ${titleCase(detail.item.name)}` : 'Use an item';
      break;
    case 'shed':
      base = 'Level 20 with a free party slot and a spare Poké Ball';
      break;
    case 'three-critical-hits':
      base = 'Land 3 critical hits in one battle';
      break;
    case 'take-damage':
      base = 'Take damage in a specific place';
      break;
    default:
      base = titleCase(trigger);
  }

  if (detail.held_item) conditions.push(`holding ${titleCase(detail.held_item.name)}`);
  if (detail.min_happiness) conditions.push(`friendship >= ${detail.min_happiness}`);
  if (detail.min_affection) conditions.push(`affection >= ${detail.min_affection}`);
  if (detail.min_beauty) conditions.push(`beauty >= ${detail.min_beauty}`);
  if (detail.time_of_day) conditions.push(`during the ${detail.time_of_day}`);
  if (detail.known_move) conditions.push(`knowing ${titleCase(detail.known_move.name)}`);
  if (detail.known_move_type) conditions.push(`knowing a ${detail.known_move_type.name}-type move`);
  if (detail.location) conditions.push(`at ${titleCase(detail.location.name)}`);
  if (detail.near_special_rock) conditions.push('near a special rock');
  if (detail.needs_overworld_rain) conditions.push('while raining');
  if (detail.party_species) conditions.push(`with ${pokemonName(detail.party_species.name)} in the party`);
  if (detail.party_type) conditions.push(`with a ${detail.party_type.name}-type in the party`);
  if (detail.relative_physical_stats !== null && PHYSICAL_STATS[detail.relative_physical_stats]) {
    conditions.push(PHYSICAL_STATS[detail.relative_physical_stats]!);
  }
  if (detail.gender !== null && GENDERS[detail.gender]) conditions.push(GENDERS[detail.gender]!);
  if (detail.turn_upside_down) conditions.push('with the console upside down');

  return conditions.length > 0 ? `${base} ${conditions.join(', ')}` : base;
}

function collectSpeciesNames(link: ChainLink, into: string[] = []): string[] {
  into.push(link.species.name);
  for (const child of link.evolves_to) collectSpeciesNames(child, into);
  return into;
}

function collectSpecies(link: ChainLink, into: string[] = []): string[] {
  into.push(link.species.url);
  for (const child of link.evolves_to) collectSpecies(child, into);
  return into;
}

function collectVersionGroups(link: ChainLink, into: Set<string> = new Set()): Set<string> {
  for (const child of link.evolves_to) {
    for (const detail of child.evolution_details) {
      if (detail.version_group) into.add(detail.version_group.url);
    }
    collectVersionGroups(child, into);
  }
  return into;
}

export interface EvolutionTree {
  roots: EvolutionNode[];
  /** Species that exist in the chain but not in the selected game. */
  hiddenSpecies: string[];
}

export async function buildEvolutionTree(
  client: ApiReader,
  chainUrl: string,
  game: GameContext,
): Promise<EvolutionTree> {
  const chain = await client.get<EvolutionChain>(chainUrl);

  const speciesList = await client.getAll<PokemonSpecies>(collectSpecies(chain.chain));
  const generationBySpecies = new Map(
    speciesList.map((species) => [species.name, idFromUrl(species.generation.url)]),
  );
  const displayNames = new Map(speciesList.map((species) => [species.name, englishName(species.names, species.name)]));

  const groups = await client.getAll<VersionGroup>([...collectVersionGroups(chain.chain)]);
  const orderByGroup = new Map(groups.map((group) => [group.name, group.order]));
  const maxOrder = game.versionGroup?.order ?? Infinity;

  const hiddenSpecies: string[] = [];

  const conditionFor = (details: EvolutionDetail[]): string | null | false => {
    const usable = details.filter((detail) => {
      const order = detail.version_group ? orderByGroup.get(detail.version_group.name) : undefined;
      return order === undefined || order <= maxOrder;
    });

    if (details.length > 0 && usable.length === 0) return false;

    const phrases = [...new Set(usable.map(describeEvolution))];
    return phrases.length > 0 ? phrases.join(' or ') : null;
  };

  const build = (link: ChainLink, condition: string | null): EvolutionNode[] => {
    const generation = generationBySpecies.get(link.species.name) ?? 1;
    const exists = generation <= game.generationId;

    const children = link.evolves_to.flatMap((child) => {
      const childCondition = conditionFor(child.evolution_details);

      if (childCondition === false) {
        // A method introduced later only blocks the branch when the parent is actually
        // in the game; otherwise the child is simply a base form here.
        if (exists) {
          hiddenSpecies.push(...collectSpeciesNames(child));
          return [];
        }
        return build(child, null);
      }

      return build(child, exists ? childCondition : null);
    });

    if (!exists) {
      // Baby forms and later branches do not exist yet; whatever they evolve into takes
      // their place at the root of the chain.
      hiddenSpecies.push(link.species.name);
      return children;
    }

    return [
      {
        species: link.species.name,
        displayName: displayNames.get(link.species.name) ?? pokemonName(link.species.name),
        condition,
        children,
      },
    ];
  };

  return { roots: build(chain.chain, null), hiddenSpecies };
}

export function findParent(roots: EvolutionNode[], species: string): EvolutionNode | null {
  for (const root of roots) {
    for (const child of root.children) {
      if (child.species === species) return root;
      const deeper = findParent([child], species);
      if (deeper) return deeper;
    }
  }
  return null;
}
