import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import type { Sprites } from '../src/api/types.js';
import { spriteUrl } from '../src/domain/sprite.js';
import type { GameContext } from '../src/domain/game.js';
import { decodePng } from '../src/render/png.js';
import { crop, toHalfBlocks } from '../src/render/sprite.js';

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  // The decoder does not verify checksums, so a zeroed CRC is enough here.
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

function png(width: number, height: number, depth: number, colorType: number, scanlines: Buffer[], extra: Buffer[] = []): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = depth;
  header[9] = colorType;

  const body = Buffer.concat(scanlines.map((line) => Buffer.concat([Buffer.from([0]), line])));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...extra,
    chunk('IDAT', deflateSync(body)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('decodes an RGBA png', () => {
  const image = png(2, 1, 8, 6, [Buffer.from([255, 0, 0, 255, 0, 0, 255, 128])]);
  const { width, height, pixels } = decodePng(image);

  assert.equal(width, 2);
  assert.equal(height, 1);
  assert.deepEqual([...pixels], [255, 0, 0, 255, 0, 0, 255, 128]);
});

test('decodes a 4-bit palette png with transparency', () => {
  const palette = chunk('PLTE', Buffer.from([0, 0, 0, 10, 20, 30, 200, 100, 50]));
  const transparency = chunk('tRNS', Buffer.from([0]));
  // Two pixels per byte: indexes 0, 1 then 2, 0.
  const image = png(4, 1, 4, 3, [Buffer.from([0x01, 0x20])], [palette, transparency]);
  const { pixels } = decodePng(image);

  assert.deepEqual([...pixels.subarray(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...pixels.subarray(4, 8)], [10, 20, 30, 255]);
  assert.deepEqual([...pixels.subarray(8, 12)], [200, 100, 50, 255]);
  assert.equal(pixels[15], 0);
});

test('unfilters scanlines', () => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;

  // Second row uses the Up filter, so its bytes are deltas from the first row.
  const rows = Buffer.concat([
    Buffer.from([0, 10, 20, 30, 255, 40, 50, 60, 255]),
    Buffer.from([2, 5, 5, 5, 0, 5, 5, 5, 0]),
  ]);
  const image = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  const { pixels } = decodePng(image);
  assert.deepEqual([...pixels.subarray(8, 12)], [15, 25, 35, 255]);
});

test('crops the transparent border', () => {
  const pixels = new Uint8Array(3 * 3 * 4);
  pixels.set([9, 9, 9, 255], (1 * 3 + 1) * 4);
  const cropped = crop({ width: 3, height: 3, pixels });

  assert.deepEqual([cropped.width, cropped.height], [1, 1]);
  assert.deepEqual([...cropped.pixels], [9, 9, 9, 255]);
});

test('pairs vertical pixels into half blocks', () => {
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
  const [line] = toHalfBlocks({ width: 1, height: 2, pixels });

  assert.ok(line!.includes('▀'));
  assert.ok(/255;0;0|\[38;5;/.test(line!));
});

const game = (generationId: number, versionGroup: string | null): GameContext => ({
  version: null,
  versionGroup: versionGroup ? ({ name: versionGroup } as GameContext['versionGroup']) : null,
  generationId,
  versionNames: [],
});

test('picks the sprite that shipped with the game', () => {
  const sprites = {
    front_default: 'modern.png',
    versions: {
      'generation-i': {
        'red-blue': { front_default: 'rb.png', front_transparent: 'rb-transparent.png' },
        yellow: { front_default: 'yellow.png' },
      },
      'generation-vi': {
        'omegaruby-alphasapphire': { front_default: 'oras.png', front_shiny: 'oras-shiny.png' },
      },
    },
  } as unknown as Sprites;

  assert.equal(spriteUrl(sprites, game(1, 'red-blue'), false), 'rb-transparent.png');
  assert.equal(spriteUrl(sprites, game(1, 'yellow'), false), 'yellow.png');
  assert.equal(spriteUrl(sprites, game(6, 'omega-ruby-alpha-sapphire'), true), 'oras-shiny.png');
  assert.equal(spriteUrl(sprites, game(9, null), false), 'modern.png');
});

test('falls back to the default sprite when the game ships none', () => {
  const sprites = {
    front_default: 'modern.png',
    versions: { 'generation-viii': { icons: { front_default: 'icon.png' } } },
  } as unknown as Sprites;

  assert.equal(spriteUrl(sprites, game(8, 'sword-shield'), false), 'modern.png');
});
