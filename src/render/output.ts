import type { EncounterEntry } from '../domain/encounters.js';
import type { Matchup } from '../domain/effectiveness.js';
import type { EvolutionNode } from '../domain/evolution.js';
import { pokemonName, titleCase } from '../util.js';
import { type Palette } from './colors.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export interface PokedexView {
  id: number;
  slug: string;
  name: string;
  game: {
    version: string | null;
    versionGroup: string | null;
    generation: number;
    label: string;
  };
  types: string[];
  weaknesses: Matchup[];
  evolution: {
    roots: EvolutionNode[];
    unavailable: string[];
  };
  spriteUrl: string | null;
  locations: EncounterEntry[];
  totalLocations: number;
  notes: string[];
  warnings: string[];
}

export function generationLabel(generation: number): string {
  return `Generation ${ROMAN[generation] ?? generation}`;
}

function formatMultiplier(multiplier: number): string {
  return `x${Number.isInteger(multiplier) ? multiplier : multiplier.toString()}`;
}

function renderWeaknesses(view: PokedexView, c: Palette): string[] {
  if (view.weaknesses.length === 0) return [c.dim('  Every type deals normal damage.')];

  const width = Math.max(...view.weaknesses.map((entry) => formatMultiplier(entry.multiplier).length));

  return view.weaknesses.map((entry) => {
    const label = formatMultiplier(entry.multiplier).padEnd(width);
    const paint = entry.multiplier > 1 ? c.danger : entry.multiplier === 0 ? c.dim : c.good;
    const types = entry.types.map((type) => c.type(type)).join(' ');
    return `  ${paint(label)}  ${types}`;
  });
}

function renderTree(node: EvolutionNode, prefix: string, isLast: boolean, view: PokedexView, c: Palette, isRoot: boolean): string[] {
  const connector = isRoot ? '' : isLast ? '└─ ' : '├─ ';
  const name = node.displayName;
  const highlight = node.species === view.slug || view.slug.startsWith(`${node.species}-`);
  const label = highlight ? c.bold(name) : name;
  const condition = node.condition ? c.dim(` — ${node.condition}`) : '';
  const marker = highlight ? c.dim('  <-- you') : '';

  const lines = [`  ${prefix}${connector}${label}${condition}${marker}`];
  const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');

  node.children.forEach((child, index) => {
    lines.push(...renderTree(child, childPrefix, index === node.children.length - 1, view, c, false));
  });

  return lines;
}

function renderLocations(view: PokedexView, c: Palette): string[] {
  if (view.locations.length === 0) return [];

  return view.locations.map((entry) => {
    const areas = entry.areas.length > 0 ? c.dim(` (${entry.areas.join('; ')})`) : '';
    const methods = entry.methods
      .map((method) => {
        const levels = method.minLevel === method.maxLevel ? `Lv ${method.minLevel}` : `Lv ${method.minLevel}-${method.maxLevel}`;
        const chance = method.chance > 0 ? ` ${method.chance}%` : '';
        // Many merged condition values usually mean "any condition", so they add noise only.
        const conditions =
          method.conditions.length > 0 && method.conditions.length <= 3
            ? ` [${method.conditions.map((value) => value.replace(/-/g, ' ')).join(', ')}]`
            : '';
        return `${method.method.replace(/-/g, ' ')} ${levels}${chance}${conditions}`;
      })
      .join(c.dim(' · '));
    const versions = view.game.version === null && entry.versions.length > 0
      ? c.dim(`  ${entry.versions.map(titleCase).join('/')}`)
      : '';

    return `  ${entry.location}${areas}  ${c.dim('—')} ${methods}${versions}`;
  });
}

export function render(view: PokedexView, c: Palette, sprite: string[] = []): string {
  const lines: string[] = [];

  for (const line of sprite) lines.push(`  ${line}`);

  const number = c.dim(`#${String(view.id).padStart(4, '0')}`);
  const types = view.types.map((type) => c.type(type)).join(c.dim(' / '));
  lines.push('');
  lines.push(`${c.bold(view.name)} ${number}  ${types}`);
  lines.push(c.dim(`${view.game.label} · ${generationLabel(view.game.generation)}`));

  for (const warning of view.warnings) lines.push(c.danger(`! ${warning}`));

  lines.push('');
  lines.push(c.heading('Weaknesses & resistances'));
  lines.push(...renderWeaknesses(view, c));

  lines.push('');
  lines.push(c.heading('Evolution'));
  if (view.evolution.roots.length === 0) {
    lines.push(c.dim('  No evolution data.'));
  } else {
    for (const root of view.evolution.roots) lines.push(...renderTree(root, '', true, view, c, true));
  }
  if (view.evolution.unavailable.length > 0) {
    lines.push(c.dim(`  Not in this game: ${view.evolution.unavailable.join(', ')}`));
  }

  lines.push('');
  lines.push(c.heading('Where to find it'));
  if (view.locations.length === 0) {
    lines.push(c.dim('  No wild encounters recorded for this game.'));
  } else {
    lines.push(...renderLocations(view, c));
    if (view.totalLocations > view.locations.length) {
      lines.push(c.dim(`  ... and ${view.totalLocations - view.locations.length} more (use --all-locations)`));
    }
  }

  for (const note of view.notes) lines.push(c.dim(`  ${note}`));

  lines.push('');
  return lines.join('\n');
}
