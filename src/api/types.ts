export interface NamedResource {
  name: string;
  url: string;
}

export interface LocalizedName {
  name: string;
  language: NamedResource;
}

export interface PokemonType {
  slot: number;
  type: NamedResource;
}

export interface PastType {
  generation: NamedResource;
  types: PokemonType[];
}

export interface Pokemon {
  id: number;
  name: string;
  height: number;
  weight: number;
  types: PokemonType[];
  past_types: PastType[];
  species: NamedResource;
  location_area_encounters: string;
  sprites: Sprites;
}

export interface DamageRelations {
  no_damage_from: NamedResource[];
  half_damage_from: NamedResource[];
  double_damage_from: NamedResource[];
  no_damage_to: NamedResource[];
  half_damage_to: NamedResource[];
  double_damage_to: NamedResource[];
}

export interface PastDamageRelations {
  generation: NamedResource;
  damage_relations: DamageRelations;
}

export interface TypeResource {
  id: number;
  name: string;
  generation: NamedResource;
  damage_relations: DamageRelations;
  past_damage_relations: PastDamageRelations[];
}

export interface PokemonVariety {
  is_default: boolean;
  pokemon: NamedResource;
}

export interface FlavorTextEntry {
  flavor_text: string;
  language: NamedResource;
  version: NamedResource;
}

export interface PokemonSpecies {
  id: number;
  name: string;
  names: LocalizedName[];
  generation: NamedResource;
  evolution_chain: { url: string } | null;
  evolves_from_species: NamedResource | null;
  varieties: PokemonVariety[];
  flavor_text_entries: FlavorTextEntry[];
}

export interface EvolutionDetail {
  trigger: NamedResource | null;
  item: NamedResource | null;
  held_item: NamedResource | null;
  known_move: NamedResource | null;
  known_move_type: NamedResource | null;
  location: NamedResource | null;
  party_species: NamedResource | null;
  party_type: NamedResource | null;
  trade_species: NamedResource | null;
  gender: number | null;
  min_level: number | null;
  min_happiness: number | null;
  min_beauty: number | null;
  min_affection: number | null;
  needs_overworld_rain: boolean;
  relative_physical_stats: number | null;
  time_of_day: string;
  turn_upside_down: boolean;
  near_special_rock?: boolean;
  version_group?: NamedResource;
}

export interface ChainLink {
  is_baby: boolean;
  species: NamedResource;
  evolution_details: EvolutionDetail[];
  evolves_to: ChainLink[];
}

export interface EvolutionChain {
  id: number;
  chain: ChainLink;
}

export interface Version {
  id: number;
  name: string;
  names: LocalizedName[];
  version_group: NamedResource;
}

export interface VersionGroup {
  id: number;
  name: string;
  order: number;
  generation: NamedResource;
  versions: NamedResource[];
  regions: NamedResource[];
}

export interface Generation {
  id: number;
  name: string;
  names: LocalizedName[];
  main_region: NamedResource;
  version_groups: NamedResource[];
}

export interface Encounter {
  min_level: number;
  max_level: number;
  chance: number;
  method: NamedResource;
  condition_values: NamedResource[];
}

export interface VersionEncounterDetail {
  version: NamedResource;
  max_chance: number;
  encounter_details: Encounter[];
}

export interface LocationAreaEncounter {
  location_area: NamedResource;
  version_details: VersionEncounterDetail[];
}

export interface LocationArea {
  id: number;
  name: string;
  names: LocalizedName[];
  location: NamedResource;
}

export interface ResourceList {
  count: number;
  results: NamedResource[];
}

export interface SpriteSet {
  front_default: string | null;
  front_shiny?: string | null;
  front_transparent?: string | null;
  front_shiny_transparent?: string | null;
  front_gray?: string | null;
  [key: string]: unknown;
}

export interface Sprites extends SpriteSet {
  versions?: Record<string, Record<string, SpriteSet>>;
  other?: Record<string, SpriteSet>;
}
