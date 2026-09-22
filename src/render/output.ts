import type { EncounterEntry } from '../domain/encounters.js';
import type { Matchup } from '../domain/effectiveness.js';
import type { EvolutionNode } from '../domain/evolution.js';
import { pokemonName, titleCase } from '../util.js';
import { type Palette } from './colors.js';

const ANSI = /\u001b\[[0-9;]*m/g;
const RESET = '\u001b[0m';
const SPRITE_GAP = '   ';
// Narrower than this the text column wraps so much that stacking reads better.
const MIN_INFO_WIDTH = 40;

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

function renderInfo(view: PokedexView, c: Palette): string[] {
  const lines: string[] = [];

  const number = c.dim(`#${String(view.id).padStart(4, '0')}`);
  const types = view.types.map((type) => c.type(type)).join(c.dim(' / '));
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

  return lines;
}

export function visibleWidth(text: string): number {
  return text.replace(ANSI, '').length;
}

/**
 * Breaks a line into pieces at most `width` columns wide, splitting on spaces. Each piece
 * ends with a reset and the next one replays the escape codes still in effect, so colors
 * survive the break without bleeding into the sprite column.
 */
export function wrap(line: string, width: number): string[] {
  if (visibleWidth(line) <= width) return [line];

  const lead = /^ */.exec(line)![0];
  const reset = line.includes('\u001b') ? RESET : '';
  const indent = ' '.repeat(lead.length + 2);
  const lines: string[] = [];
  const active: string[] = [];
  let current = lead;
  let currentWidth = lead.length;
  let hasContent = false;
  let pending = '';

  const breakLine = () => {
    lines.push(`${current}${reset}`);
    current = indent + active.join('');
    currentWidth = indent.length;
    hasContent = false;
    pending = '';
  };

  for (const part of line.slice(lead.length).split(/(\u001b\[[0-9;]*m| +)/)) {
    if (part === '') continue;

    if (part.startsWith('\u001b')) {
      current += part;
      if (part === RESET) active.length = 0;
      else active.push(part);
      continue;
    }

    if (part.startsWith(' ')) {
      pending += part;
      continue;
    }

    let word = part;
    while (word.length > 0) {
      const available = width - currentWidth - pending.length;
      if (word.length <= available) {
        current += pending + word;
        currentWidth += pending.length + word.length;
        hasContent = true;
        pending = '';
        word = '';
      } else if (hasContent) {
        breakLine();
      } else {
        current += pending + word.slice(0, available);
        word = word.slice(available);
        breakLine();
      }
    }
  }

  lines.push(current);
  return lines;
}

export function render(view: PokedexView, c: Palette, sprite: string[] = [], columns = 80): string {
  const info = renderInfo(view, c);
  if (sprite.length === 0) return ['', ...info, ''].join('\n');

  const spriteWidth = visibleWidth(sprite[0]!);
  const infoWidth = columns - 2 - spriteWidth - SPRITE_GAP.length;
  if (infoWidth < MIN_INFO_WIDTH) {
    return [...sprite.map((line) => `  ${line}`), '', ...info, ''].join('\n');
  }

  const wrapped = info.flatMap((line) => wrap(line, infoWidth));
  const blank = ' '.repeat(spriteWidth);
  const lines: string[] = [];

  for (let row = 0; row < Math.max(sprite.length, wrapped.length); row++) {
    lines.push(`  ${sprite[row] ?? blank}${SPRITE_GAP}${wrapped[row] ?? ''}`.trimEnd());
  }

  lines.push('');
  return lines.join('\n');
}
