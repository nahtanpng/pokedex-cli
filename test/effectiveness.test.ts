import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pokemon, TypeResource } from '../src/api/types.js';
import { computeMatchups, typesForGeneration } from '../src/domain/effectiveness.js';
import { fixture } from './helpers.js';

const allTypes = new Map(fixture<TypeResource[]>('types').map((type) => [type.name, type]));
const gengar = fixture<Pokemon>('pokemon-gengar');
const clefairy = fixture<Pokemon>('pokemon-clefairy');
const charizard = fixture<Pokemon>('pokemon-charizard');

function chart(pokemon: Pokemon, generation: number): Record<string, number> {
  const types = typesForGeneration(pokemon, generation);
  const entries = computeMatchups(types, allTypes, generation).flatMap((matchup) =>
    matchup.types.map((type) => [type, matchup.multiplier] as const),
  );
  return Object.fromEntries(entries);
}

test('gen 1 chart has no types introduced later', () => {
  const gen1 = chart(gengar, 1);
  assert.equal(gen1.dark, undefined);
  assert.equal(gen1.steel, undefined);
  assert.equal(gen1.fairy, undefined);
});

test('gengar defensive multipliers in generation 1', () => {
  assert.deepEqual(chart(gengar, 1), {
    ghost: 2,
    ground: 2,
    psychic: 2,
    grass: 0.5,
    poison: 0.25,
    normal: 0,
    fighting: 0,
  });
});

test('gengar defensive multipliers in generation 9', () => {
  const gen9 = chart(gengar, 9);
  assert.equal(gen9.dark, 2);
  assert.equal(gen9.psychic, 2);
  assert.equal(gen9.ghost, 2);
  assert.equal(gen9.ground, 2);
  assert.equal(gen9.fairy, 0.5);
  assert.equal(gen9.bug, 0.25);
  assert.equal(gen9.normal, 0);
  assert.equal(gen9.fighting, 0);
});

test('clefairy was a normal type before generation 6', () => {
  assert.deepEqual(typesForGeneration(clefairy, 3), ['normal']);
  assert.deepEqual(typesForGeneration(clefairy, 5), ['normal']);
  assert.deepEqual(typesForGeneration(clefairy, 6), ['fairy']);
  assert.deepEqual(typesForGeneration(clefairy, 9), ['fairy']);
});

test('dual type weaknesses stack to x4 and immunities win', () => {
  const gen1 = chart(charizard, 1);
  assert.equal(gen1.rock, 4);
  assert.equal(gen1.ground, 0);
  assert.equal(gen1.bug, 0.25);
});
