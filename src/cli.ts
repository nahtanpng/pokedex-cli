#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ApiError, NotFoundError, PokeApiClient } from './api/client.js';
import type { Pokemon, PokemonSpecies, ResourceList } from './api/types.js';
import { collectEncounters } from './domain/encounters.js';
import { computeMatchups, loadTypes, typesForGeneration } from './domain/effectiveness.js';
import { buildEvolutionTree, findParent, type EvolutionNode } from './domain/evolution.js';
import { generationVersionNames, resolveGame, UnknownGameError, type GameContext } from './domain/game.js';
import { spriteUrl } from './domain/sprite.js';
import { renderSprite } from './render/sprite.js';
import { colorsEnabled, palette } from './render/colors.js';
import { generationLabel, render, type PokedexView } from './render/output.js';
import { englishName, idFromUrl, pokemonName, suggest, titleCase } from './util.js';

const DEFAULT_LOCATION_LIMIT = 10;
const SPRITE_MAX_ROWS = 18;


/**
 * Alternate forms carry no generation in the API. Only the ones worth querying on their
 * own are listed, gated by the generation their slug suffix belongs to.
 */
const FORM_GENERATION: Record<string, number> = {
  mega: 6,
  'mega-x': 6,
  'mega-y': 6,
  primal: 6,
  alola: 7,
  totem: 7,
  starter: 7,
  galar: 8,
  hisui: 8,
  gmax: 8,
  eternamax: 8,
  paldea: 9,
};

function formExistsIn(slug: string, speciesSlug: string, generationId: number): boolean {
  const suffix = slug.startsWith(`${speciesSlug}-`) ? slug.slice(speciesSlug.length + 1) : slug;
  const introduced = FORM_GENERATION[suffix];
  return introduced !== undefined && introduced <= generationId;
}

const USAGE = `
pokedex — weaknesses, evolution and wild locations from PokeAPI

Usage
  pokedex <pokemon> [options]

Options
  -g, --game <version>   Game version: red, yellow, gold, emerald, sword, scarlet...
      --json             Print the raw data as JSON
      --all-locations    List every location instead of the top ${DEFAULT_LOCATION_LIMIT}
      --shiny            Show the shiny sprite
      --sprite           Force the sprite even when the output is piped
      --no-sprite        Skip the sprite
      --no-cache         Skip the local cache and always hit the API
      --no-color         Disable colored output
  -v, --version          Show the version
  -h, --help             Show this help

Examples
  pokedex gengar --game red
  pokedex eevee --game gold
  pokedex vulpix-alola --game sword
  pokedex charizard --game red --shiny
`;

function gameLabel(game: GameContext): string {
  if (!game.version) return 'Latest games';
  return `Pokémon ${englishName(game.version.names, game.version.name)}`;
}

async function findPokemon(client: PokeApiClient, input: string): Promise<Pokemon> {
  const slug = input.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[.']/g, '');
  try {
    return await client.get<Pokemon>(`pokemon/${slug}`);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    const list = await client.get<ResourceList>('pokemon?limit=100000');
    const suggestions = suggest(slug, list.results.map((item) => item.name));
    const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
    throw new UserError(`No Pokémon called "${input}".${hint}`, 1);
  }
}

class UserError extends Error {
  constructor(message: string, public readonly code: number) {
    super(message);
    this.name = 'UserError';
  }
}

function collectSpeciesNames(nodes: EvolutionNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    into.push(node.species);
    collectSpeciesNames(node.children, into);
  }
  return into;
}

/** "vulpix-alola" -> "Vulpix (Alola)", using the species' localized name as the base. */
function displayName(pokemon: Pokemon, species: PokemonSpecies): string {
  const base = englishName(species.names, species.name);
  if (pokemon.name === species.name) return base;
  const suffix = pokemon.name.startsWith(`${species.name}-`) ? pokemon.name.slice(species.name.length + 1) : null;
  return suffix ? `${base} (${titleCase(suffix)})` : pokemonName(pokemon.name);
}

interface ViewOptions {
  game: string | undefined;
  allLocations: boolean;
  shiny: boolean;
}

async function buildView(client: PokeApiClient, input: string, options: ViewOptions): Promise<PokedexView> {
  const game = await resolveGame(client, options.game);
  if (!game.version) game.versionNames = await generationVersionNames(client, game.generationId);

  const pokemon = await findPokemon(client, input);
  const species = await client.get<PokemonSpecies>(pokemon.species.url);

  const [allTypes, evolution, encounters] = await Promise.all([
    loadTypes(client),
    species.evolution_chain
      ? buildEvolutionTree(client, species.evolution_chain.url, game)
      : Promise.resolve({ roots: [], hiddenSpecies: [] }),
    collectEncounters(client, pokemon.location_area_encounters, game.versionNames),
  ]);

  const types = typesForGeneration(pokemon, game.generationId);
  const warnings: string[] = [];
  const notes: string[] = [];

  const speciesGeneration = idFromUrl(species.generation.url);
  if (game.version && speciesGeneration > game.generationId) {
    warnings.push(
      `${pokemonName(species.name)} does not exist in ${gameLabel(game)} — it was introduced in ${generationLabel(speciesGeneration)}. Data below is shown as of that game's generation.`,
    );
  }

  if (encounters.length === 0) {
    const parent = findParent(evolution.roots, species.name);
    if (parent) notes.push(`Not catchable in the wild here — evolve from ${parent.displayName}.`);
    else if (species.evolves_from_species) notes.push(`Evolves from ${pokemonName(species.evolves_from_species.name)}.`);
    if (!game.version) notes.push('Only the latest generation is searched by default — try --game <version>.');
  }

  const otherForms = species.varieties
    .map((variety) => variety.pokemon.name)
    .filter((name) => name !== pokemon.name && formExistsIn(name, species.name, game.generationId));
  if (otherForms.length > 0) {
    notes.push(`Other forms: ${otherForms.join(', ')}`);
  }

  const chainSpecies = new Set(collectSpeciesNames(evolution.roots));
  const unavailable = [...new Set(evolution.hiddenSpecies)]
    .filter((name) => !chainSpecies.has(name))
    .map(pokemonName);

  return {
    id: pokemon.id,
    slug: pokemon.name,
    name: displayName(pokemon, species),
    game: {
      version: game.version?.name ?? null,
      versionGroup: game.versionGroup?.name ?? null,
      generation: game.generationId,
      label: gameLabel(game),
    },
    types,
    weaknesses: computeMatchups(types, allTypes, game.generationId),
    evolution: { roots: evolution.roots, unavailable },
    spriteUrl: spriteUrl(pokemon.sprites, game, options.shiny),
    locations: options.allLocations ? encounters : encounters.slice(0, DEFAULT_LOCATION_LIMIT),
    totalLocations: encounters.length,
    notes,
    warnings,
  };
}

async function loadSprite(client: PokeApiClient, url: string | null): Promise<string[]> {
  if (!url) return [];
  // The text sits beside the sprite, so it only has to fit the terminal height.
  const maxRows = Math.max(8, Math.min(SPRITE_MAX_ROWS, (process.stdout.rows ?? 40) - 2));
  try {
    return renderSprite(await client.getBinary(url), maxRows);
  } catch {
    // A sprite that fails to download or decode is not worth failing the lookup over.
    return [];
  }
}

function readVersion(): string {
  // Resolves the same way from src/ (tsx) and dist/ (published build).
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pkg.version;
}

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        game: { type: 'string', short: 'g' },
        json: { type: 'boolean', default: false },
        'all-locations': { type: 'boolean', default: false },
        shiny: { type: 'boolean', default: false },
        sprite: { type: 'boolean' },
        'no-sprite': { type: 'boolean', default: false },
        'no-cache': { type: 'boolean', default: false },
        'no-color': { type: 'boolean', default: false },
        version: { type: 'boolean', short: 'v', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 2;
  }

  const { values, positionals } = parsed;

  if (values.version) {
    console.log(readVersion());
    return 0;
  }

  if (values.help || positionals.length === 0) {
    console.log(USAGE.trimStart());
    return positionals.length === 0 && !values.help ? 2 : 0;
  }

  const client = new PokeApiClient({ cache: !values['no-cache'] });

  try {
    const view = await buildView(client, positionals.join('-'), {
      game: values.game,
      allLocations: values['all-locations'],
      shiny: values.shiny,
    });

    if (values.json) {
      console.log(JSON.stringify(view, null, 2));
      return 0;
    }

    const colors = colorsEnabled(values['no-color']);
    const wantsSprite = values.sprite ?? (colors && !values['no-sprite']);
    const sprite = wantsSprite ? await loadSprite(client, view.spriteUrl) : [];

    console.log(render(view, palette(colors), sprite, process.stdout.columns ?? 80));
    return 0;
  } catch (error) {
    if (error instanceof UserError) {
      console.error(error.message);
      return error.code;
    }
    if (error instanceof UnknownGameError) {
      const hint = error.suggestions.length > 0 ? ` Did you mean: ${error.suggestions.join(', ')}?` : '';
      console.error(`Unknown game "${error.input}".${hint} Use a version name such as red, yellow, emerald, sword.`);
      return 2;
    }
    if (error instanceof ApiError) {
      console.error(error.message);
      return 3;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 3;
  }
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
