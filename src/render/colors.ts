const TYPE_COLORS: Record<string, number> = {
  normal: 145,
  fire: 208,
  water: 39,
  electric: 220,
  grass: 77,
  ice: 81,
  fighting: 167,
  poison: 134,
  ground: 179,
  flying: 147,
  psychic: 205,
  bug: 106,
  rock: 143,
  ghost: 97,
  dragon: 62,
  dark: 243,
  steel: 109,
  fairy: 218,
};

export interface Palette {
  bold: (text: string) => string;
  dim: (text: string) => string;
  heading: (text: string) => string;
  type: (name: string) => string;
  danger: (text: string) => string;
  good: (text: string) => string;
}

const identity = (text: string) => text;

const plain: Palette = {
  bold: identity,
  dim: identity,
  heading: identity,
  type: identity,
  danger: identity,
  good: identity,
};

const colored: Palette = {
  bold: (text) => `\u001b[1m${text}\u001b[22m`,
  dim: (text) => `\u001b[2m${text}\u001b[22m`,
  heading: (text) => `\u001b[1m\u001b[38;5;214m${text}\u001b[0m`,
  type: (name) => {
    const code = TYPE_COLORS[name];
    return code === undefined ? name : `\u001b[38;5;${code}m${name}\u001b[39m`;
  },
  danger: (text) => `\u001b[38;5;203m${text}\u001b[39m`,
  good: (text) => `\u001b[38;5;114m${text}\u001b[39m`,
};

export function palette(enabled: boolean): Palette {
  return enabled ? colored : plain;
}

export function colorsEnabled(noColorFlag: boolean): boolean {
  if (noColorFlag) return false;
  if (process.env.NO_COLOR) return false;
  return process.stdout.isTTY === true;
}
