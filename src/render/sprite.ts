import { decodePng, type Bitmap } from './png.js';

const ALPHA_THRESHOLD = 128;
const UPPER = '▀';
const LOWER = '▄';
const RESET = '\u001b[0m';

interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

function pixelAt(bitmap: Bitmap, x: number, y: number): Pixel {
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return { r: 0, g: 0, b: 0, a: 0 };
  const offset = (y * bitmap.width + x) * 4;
  return {
    r: bitmap.pixels[offset]!,
    g: bitmap.pixels[offset + 1]!,
    b: bitmap.pixels[offset + 2]!,
    a: bitmap.pixels[offset + 3]!,
  };
}

export function crop(bitmap: Bitmap): Bitmap {
  let top = bitmap.height;
  let left = bitmap.width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (pixelAt(bitmap, x, y).a < ALPHA_THRESHOLD) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  if (right < 0) return bitmap;

  const width = right - left + 1;
  const height = bottom - top + 1;
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const source = ((y + top) * bitmap.width + left) * 4;
    pixels.set(bitmap.pixels.subarray(source, source + width * 4), y * width * 4);
  }

  return { width, height, pixels };
}

export function resize(bitmap: Bitmap, width: number, height: number): Bitmap {
  const pixels = new Uint8Array(width * height * 4);
  const scaleX = bitmap.width / width;
  const scaleY = bitmap.height / height;
  // Nearest neighbour keeps pixel art crisp, but big renders (the 475px BDSP images)
  // need averaging or the result is just noise.
  const average = scaleX > 2 || scaleY > 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;

      if (!average) {
        const source = (Math.min(bitmap.height - 1, Math.floor(y * scaleY)) * bitmap.width
          + Math.min(bitmap.width - 1, Math.floor(x * scaleX))) * 4;
        pixels.set(bitmap.pixels.subarray(source, source + 4), target);
        continue;
      }

      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      let opaque = 0;
      let count = 0;

      for (let sy = Math.floor(y * scaleY); sy < Math.min(bitmap.height, (y + 1) * scaleY); sy++) {
        for (let sx = Math.floor(x * scaleX); sx < Math.min(bitmap.width, (x + 1) * scaleX); sx++) {
          const pixel = pixelAt(bitmap, sx, sy);
          count++;
          alpha += pixel.a;
          // Transparent pixels carry arbitrary colors, so only opaque ones are averaged.
          if (pixel.a >= ALPHA_THRESHOLD) {
            r += pixel.r;
            g += pixel.g;
            b += pixel.b;
            opaque++;
          }
        }
      }

      pixels[target] = opaque > 0 ? Math.round(r / opaque) : 0;
      pixels[target + 1] = opaque > 0 ? Math.round(g / opaque) : 0;
      pixels[target + 2] = opaque > 0 ? Math.round(b / opaque) : 0;
      pixels[target + 3] = count > 0 ? Math.round(alpha / count) : 0;
    }
  }

  return { width, height, pixels };
}

function truecolor(): boolean {
  const flag = process.env.COLORTERM ?? '';
  return flag.includes('truecolor') || flag.includes('24bit');
}

/** xterm-256 fallback: 6x6x6 color cube plus the grayscale ramp. */
function toAnsi256(pixel: Pixel): number {
  const { r, g, b } = pixel;
  if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 24);
  }
  const channel = (value: number) => Math.round((value / 255) * 5);
  return 16 + 36 * channel(r) + 6 * channel(g) + channel(b);
}

function color(pixel: Pixel, background: boolean, wide: boolean): string {
  const layer = background ? 48 : 38;
  return wide
    ? `\u001b[${layer};2;${pixel.r};${pixel.g};${pixel.b}m`
    : `\u001b[${layer};5;${toAnsi256(pixel)}m`;
}

export function toHalfBlocks(bitmap: Bitmap): string[] {
  const wide = truecolor();
  const lines: string[] = [];

  for (let y = 0; y < bitmap.height; y += 2) {
    let line = '';

    for (let x = 0; x < bitmap.width; x++) {
      const top = pixelAt(bitmap, x, y);
      const bottom = pixelAt(bitmap, x, y + 1);
      const topVisible = top.a >= ALPHA_THRESHOLD;
      const bottomVisible = bottom.a >= ALPHA_THRESHOLD;

      if (!topVisible && !bottomVisible) line += `${RESET} `;
      else if (topVisible && bottomVisible) line += `${color(top, false, wide)}${color(bottom, true, wide)}${UPPER}`;
      else if (topVisible) line += `${RESET}${color(top, false, wide)}${UPPER}`;
      else line += `${RESET}${color(bottom, false, wide)}${LOWER}`;
    }

    lines.push(`${line}${RESET}`);
  }

  return lines;
}

/** Decodes a sprite and turns it into terminal lines at most `maxRows` tall. */
export function renderSprite(png: Buffer, maxRows: number): string[] {
  let bitmap = crop(decodePng(png));

  const rows = Math.ceil(bitmap.height / 2);
  if (rows > maxRows) {
    const scale = (maxRows * 2) / bitmap.height;
    bitmap = resize(bitmap, Math.max(1, Math.round(bitmap.width * scale)), maxRows * 2);
  }

  return toHalfBlocks(bitmap);
}
