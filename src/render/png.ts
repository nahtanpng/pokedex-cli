import { inflateSync } from 'node:zlib';

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  pixels: Uint8Array;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function unfilter(data: Buffer, width: number, height: number, bitsPerPixel: number): Buffer {
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const out = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    const line = data.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const target = y * stride;
    const previous = target - stride;

    for (let x = 0; x < stride; x++) {
      const raw = line[x]!;
      const left = x >= bpp ? out[target + x - bpp]! : 0;
      const up = y > 0 ? out[previous + x]! : 0;
      const upLeft = y > 0 && x >= bpp ? out[previous + x - bpp]! : 0;

      let value: number;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: value = raw + paeth(left, up, upLeft); break;
        default: throw new Error(`Unsupported PNG filter ${filter}`);
      }
      out[target + x] = value & 0xff;
    }
  }

  return out;
}

/** Reads the `index`-th sample of a scanline packed at `depth` bits per sample. */
function sample(line: Buffer, index: number, depth: number): number {
  if (depth === 8) return line[index]!;
  if (depth === 16) return line[index * 2]!;
  const perByte = 8 / depth;
  const byte = line[Math.floor(index / perByte)]!;
  const shift = 8 - depth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << depth) - 1);
}

/**
 * Minimal PNG decoder for the sprite set served by PokeAPI: non-interlaced, 8/16-bit
 * or packed palette images. Node ships zlib, so no dependency is needed.
 */
export function decodePng(buffer: Buffer): Bitmap {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG file');

  let width = 0;
  let height = 0;
  let depth = 8;
  let colorType = 6;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const idat: Buffer[] = [];

  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    switch (type) {
      case 'IHDR':
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        depth = data[8]!;
        colorType = data[9]!;
        if (data[12] !== 0) throw new Error('Interlaced PNGs are not supported');
        break;
      case 'PLTE': palette = Buffer.from(data); break;
      case 'tRNS': transparency = Buffer.from(data); break;
      case 'IDAT': idat.push(Buffer.from(data)); break;
      case 'IEND': offset = buffer.length; break;
      default: break;
    }
  }

  const channels = CHANNELS[colorType];
  if (channels === undefined) throw new Error(`Unsupported PNG color type ${colorType}`);

  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const raw = unfilter(inflateSync(Buffer.concat(idat)), width, height, bitsPerPixel);
  const pixels = new Uint8Array(width * height * 4);
  const scale = depth === 16 ? 1 : 255 / ((1 << depth) - 1);

  for (let y = 0; y < height; y++) {
    const line = raw.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;

      if (colorType === 3) {
        const index = sample(line, x, depth);
        r = palette?.[index * 3] ?? 0;
        g = palette?.[index * 3 + 1] ?? 0;
        b = palette?.[index * 3 + 2] ?? 0;
        a = transparency?.[index] ?? 255;
      } else if (colorType === 0 || colorType === 4) {
        const gray = Math.round(sample(line, x * channels, depth) * scale);
        r = g = b = gray;
        if (colorType === 4) a = sample(line, x * channels + 1, depth);
        else if (transparency && transparency.readUInt16BE(0) === sample(line, x, depth)) a = 0;
      } else {
        r = sample(line, x * channels, depth);
        g = sample(line, x * channels + 1, depth);
        b = sample(line, x * channels + 2, depth);
        if (colorType === 6) a = sample(line, x * channels + 3, depth);
      }

      pixels[target] = r;
      pixels[target + 1] = g;
      pixels[target + 2] = b;
      pixels[target + 3] = a;
    }
  }

  return { width, height, pixels };
}
