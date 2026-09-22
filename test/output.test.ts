import assert from 'node:assert/strict';
import { test } from 'node:test';
import { palette } from '../src/render/colors.js';
import { render, visibleWidth, wrap, type PokedexView } from '../src/render/output.js';

const plain = palette(false);
const colored = palette(true);

const view: PokedexView = {
  id: 25,
  slug: 'pikachu',
  name: 'Pikachu',
  game: { version: 'platinum', versionGroup: 'platinum', generation: 4, label: 'Pokémon Platinum' },
  types: ['electric'],
  weaknesses: [{ multiplier: 2, types: ['ground'] }],
  evolution: {
    roots: [{ species: 'pikachu', displayName: 'Pikachu', condition: null, children: [] }],
    unavailable: [],
  },
  spriteUrl: null,
  locations: [
    {
      location: 'Trophy Garden',
      areas: [],
      versions: ['platinum'],
      methods: [
        { method: 'walk', minLevel: 22, maxLevel: 24, chance: 10, conditions: [] },
        { method: 'surf', minLevel: 30, maxLevel: 35, chance: 5, conditions: ['time-morning', 'swarm-no'] },
      ],
    },
  ],
  totalLocations: 1,
  notes: [],
  warnings: [],
};

const sprite = Array.from({ length: 4 }, () => '#'.repeat(10));

test('puts the sprite on the left and the info on the right', () => {
  const lines = render(view, plain, sprite, 120).split('\n');

  assert.equal(lines[0], `  ${'#'.repeat(10)}   Pikachu #0025  electric`);
  assert.ok(lines[1]!.startsWith(`  ${'#'.repeat(10)}   Pokémon Platinum`));
  assert.ok(lines.some((line) => line.startsWith(`${' '.repeat(15)}Where to find it`)));
});

test('wraps long lines inside the info column', () => {
  const columns = 60;
  const lines = render(view, plain, sprite, columns).split('\n');

  assert.ok(lines.every((line) => visibleWidth(line) <= columns));
  const location = lines.findIndex((line) => line.includes('Trophy Garden'));
  assert.match(lines[location + 1]!, /^ {19}\S/);
});

test('stacks the sprite above the info when the terminal is narrow', () => {
  const lines = render(view, plain, sprite, 40).split('\n');

  assert.equal(lines[0], `  ${'#'.repeat(10)}`);
  assert.equal(lines[4], '');
  assert.ok(lines[5]!.startsWith('Pikachu'));
});

test('without a sprite the info starts after a blank line', () => {
  const lines = render(view, plain, [], 120).split('\n');

  assert.equal(lines[0], '');
  assert.ok(lines[1]!.startsWith('Pikachu'));
});

test('wrapping keeps colors inside each piece', () => {
  const line = `  ${colored.dim('one two three four five six seven eight')}`;
  const pieces = wrap(line, 16);

  assert.ok(pieces.length > 1);
  assert.ok(pieces.every((piece) => visibleWidth(piece) <= 16));
  assert.ok(pieces.slice(0, -1).every((piece) => piece.endsWith('\u001b[0m')));
  assert.ok(pieces.slice(1).every((piece) => piece.startsWith('    \u001b[2m')));
});

test('splits a word longer than the width', () => {
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', '  ef', '  gh', '  ij']);
});
