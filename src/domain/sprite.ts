import type { SpriteSet, Sprites } from '../api/types.js';
import type { GameContext } from './game.js';

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

const normalize = (name: string) => name.replace(/-and-/g, '-').replace(/-/g, '');

function pickField(set: SpriteSet | undefined, shiny: boolean): string | null {
  if (!set) return null;
  const order = shiny
    ? ['front_shiny_transparent', 'front_shiny', 'front_transparent', 'front_default']
    : ['front_transparent', 'front_default'];

  for (const field of order) {
    const value = set[field];
    if (typeof value === 'string') return value;
  }
  return null;
}

/**
 * Sprites are stored per version group, so a game maps straight to the artwork that
 * shipped with it. Version group keys are spelled slightly differently there
 * ("omegaruby-alphasapphire"), hence the normalized lookup.
 */
export function spriteUrl(sprites: Sprites, game: GameContext, shiny: boolean): string | null {
  const generation = sprites.versions?.[`generation-${ROMAN[game.generationId] ?? ''}`];

  if (generation && game.versionGroup) {
    const wanted = normalize(game.versionGroup.name);
    const key = Object.keys(generation).find((name) => normalize(name) === wanted);
    const fromGame = pickField(key ? generation[key] : undefined, shiny);
    if (fromGame) return fromGame;
  }

  // Games without their own sprite set (Sword/Shield only ships menu icons) fall back to
  // the default sprite rather than to a sibling game's artwork.
  return pickField(sprites, shiny);
}
