import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EvolutionChain, EvolutionDetail, VersionGroup } from '../src/api/types.js';
import { buildEvolutionTree, describeEvolution, type EvolutionNode } from '../src/domain/evolution.js';
import type { GameContext } from '../src/domain/game.js';
import { fakeReader, fixture } from './helpers.js';

const BASE = 'https://pokeapi.co/api/v2';
const CHAIN_URL = `${BASE}/evolution-chain/67/`;

const resources = fixture<Record<string, unknown>>('resources');
const chain = fixture<EvolutionChain>('chain-eevee');
const reader = fakeReader({ ...resources, [CHAIN_URL]: chain });

function detail(overrides: Partial<EvolutionDetail>): EvolutionDetail {
  return {
    trigger: { name: 'level-up', url: `${BASE}/evolution-trigger/1/` },
    item: null,
    held_item: null,
    known_move: null,
    known_move_type: null,
    location: null,
    party_species: null,
    party_type: null,
    trade_species: null,
    gender: null,
    min_level: null,
    min_happiness: null,
    min_beauty: null,
    min_affection: null,
    needs_overworld_rain: false,
    relative_physical_stats: null,
    time_of_day: '',
    turn_upside_down: false,
    ...overrides,
  };
}

function game(generationId: number, versionGroupUrl: string | null): GameContext {
  return {
    version: null,
    versionGroup: versionGroupUrl ? (resources[versionGroupUrl] as VersionGroup) : null,
    generationId,
    versionNames: [],
  };
}

function childNames(node: EvolutionNode): string[] {
  return node.children.map((child) => child.species);
}

test('describes level, item and trade evolutions', () => {
  assert.equal(describeEvolution(detail({ min_level: 16 })), 'Level 16');
  assert.equal(
    describeEvolution(detail({ trigger: { name: 'use-item', url: '' }, item: { name: 'water-stone', url: '' } })),
    'Use Water Stone',
  );
  assert.equal(
    describeEvolution(detail({ trigger: { name: 'trade', url: '' }, held_item: { name: 'metal-coat', url: '' } })),
    'Trade holding Metal Coat',
  );
  assert.equal(
    describeEvolution(detail({ min_happiness: 160, time_of_day: 'night' })),
    'Level up friendship >= 160, during the night',
  );
});

test('keeps only the branches available in the selected game', async () => {
  const gold = await buildEvolutionTree(reader, CHAIN_URL, game(2, `${BASE}/version-group/3/`));
  assert.deepEqual(childNames(gold.roots[0]!), ['vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon']);

  const red = await buildEvolutionTree(reader, CHAIN_URL, game(1, `${BASE}/version-group/1/`));
  assert.deepEqual(childNames(red.roots[0]!), ['vaporeon', 'jolteon', 'flareon']);
});

test('lists every branch when no game is selected', async () => {
  const tree = await buildEvolutionTree(reader, CHAIN_URL, game(9, null));
  assert.equal(childNames(tree.roots[0]!).length, 8);
  assert.equal(tree.roots[0]!.species, 'eevee');
  assert.equal(tree.roots[0]!.condition, null);
});

test('reports species that do not exist in the selected game', async () => {
  const red = await buildEvolutionTree(reader, CHAIN_URL, game(1, `${BASE}/version-group/1/`));
  assert.ok(red.hiddenSpecies.includes('sylveon'));
});
