# pokedex-cli

> Look up a Pokémon right from your terminal, without pausing your run to open Google.

You're in the middle of a run, your rival sends out a Gengar and the question hits: *what's
super effective against it in this game?* Or: *where do I catch a Pikachu in Pokémon Red?*
*What level does Gastly evolve at?*

One command, and the answer comes **for the game you're actually playing**:

```console
$ pokedex pikachu --game red

Pikachu #0025  electric
Pokémon Red · Generation I

Weaknesses & resistances
  x2    ground
  x0.5  electric flying

Evolution
  Pikachu  <-- you
  └─ Raichu — Use Thunder Stone
  Not in this game: Pichu

Where to find it
  Kanto Power Plant  — walk Lv 20-24 25%
  Viridian Forest  — walk Lv 3-5 5%
```

And as a bonus, you get the sprite from that very game, drawn in colorful pixel art right in
your terminal.

## Why the game matters

Most sites show data from the latest generation. If you're playing Red, that can cost you the
fight. With `--game`, the CLI answers for that specific game:

| What | What changes |
| --- | --- |
| **Weaknesses** | Uses the type chart of that era: Gen 1 has no Dark or Steel, and Fairy only shows up in Gen 6. The Pokémon's typing is the one it had back then too (Clefairy was Normal). |
| **Evolution** | Hides evolutions that didn't exist yet (no Espeon in Red) and starts the tree at the base form when the baby didn't exist (no Pichu in Red). |
| **Where to find it** | Only encounters from that version, with method, level and rate. Can't be caught in the wild? It tells you which Pokémon to evolve from. |
| **Sprite** | The actual sprite from the game: `--game red` shows the Red/Blue one, `--game crystal` the Crystal one. |

## Installation

Requires Node 20+.

```bash
git clone https://github.com/nahtanpng/pokedex-cli.git
cd pokedex-cli
npm install      # also runs the build
npm link         # makes the `pokedex` command available in your terminal
```

## Usage

```bash
pokedex <pokemon> --game <game>
```

Some classic mid-run questions:

```bash
pokedex gengar --game red          # what to use against Gengar in Gen 1
pokedex haunter --game emerald     # when it evolves (spoiler: needs a trade)
pokedex eevee --game gold          # which stone or condition gives each evolution
pokedex pikachu --game yellow      # where to catch it
pokedex vulpix-alola -g sword      # regional forms
pokedex mr mime                    # names with spaces work without quotes
pokedex gengar --game crystal --shiny
```

`<pokemon>` is the English name, the way PokeAPI spells it (`mr-mime`, `vulpix-alola`,
`raichu-alola`). Typo? No worries, the CLI suggests the right name.

`--game` takes the version name: `red`, `blue`, `yellow`, `gold`, `silver`, `crystal`,
`ruby`, `emerald`, `firered`, `diamond`, `platinum`, `heartgold`, `black`, `x`, `sun`,
`sword`, `scarlet` and so on. Without `--game`, the latest generation is used.

### Options

```
  -g, --game <version>   game to look up
      --shiny            show the shiny sprite
      --all-locations    list every location (default: the first 10)
      --no-sprite        skip the sprite
      --sprite           force the sprite even when the output is piped
      --json             print the data as JSON
      --no-cache         skip the local cache
      --no-color         disable colors
  -h, --help             show help
```

Like tinkering in the terminal? `--json` plays nicely with other tools:

```bash
pokedex charizard --game yellow --json | jq .weaknesses
```

## Cache

The first lookup of a Pokémon can take a few seconds: the CLI makes dozens of requests to
PokeAPI (one per encounter area). After that, everything is cached for 7 days in
`~/.cache/pokedex-cli` (or `$XDG_CACHE_HOME`), sprites included, and the next lookup is about
10x faster.

## Limitations

- Data comes from [PokeAPI](https://pokeapi.co), so Pokémon and location names are in English.
- PokeAPI mostly records wild encounters. Gifts, trades and events only show up when the API
  has them.
- Sword/Shield and some recent games don't have their own sprite in the API; in those cases the
  default sprite is shown.

## Development

```bash
npm run dev -- gengar --game red   # runs straight from TypeScript, no build
npm run build
npm test
```

Tests use real API fixtures in `test/fixtures/` and cover the pure logic: Gengar's multipliers
in Gen 1 vs Gen 9, Clefairy's historical typing, evolution condition phrasing, filtering
Eevee's chain by game and sprite selection.

| File | Responsibility |
| --- | --- |
| `src/cli.ts` | arguments, orchestration, exit codes |
| `src/api/client.ts` | `fetch` with disk cache, retry and concurrent requests |
| `src/domain/game.ts` | version → version group → generation |
| `src/domain/effectiveness.ts` | historical types and damage chart, defensive multipliers |
| `src/domain/evolution.ts` | evolution tree filtered by game and condition phrasing |
| `src/domain/encounters.ts` | version encounters grouped by location |
| `src/domain/sprite.ts` | sprite selection by the game's version group |
| `src/render/png.ts` | minimal dependency-free PNG decoder (`node:zlib`) |
| `src/render/sprite.ts` | crop, resize and conversion to ANSI half-blocks |
| `src/render/output.ts` | colored terminal output |

The sprite is drawn with `▀`/`▄` in truecolor, falling back to 256 colors when the terminal
doesn't advertise `COLORTERM`.

Exit codes: `0` ok · `1` Pokémon not found · `2` invalid usage · `3` network/API error.

## License

[MIT](LICENSE)

Pokémon and all related names are trademarks of Nintendo, Creatures Inc. and GAME FREAK inc.
This is an unofficial fan project, not affiliated with them. Data and sprites come from
[PokeAPI](https://pokeapi.co).
