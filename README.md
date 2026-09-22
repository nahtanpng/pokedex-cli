# pokedex-cli

> Tira a dúvida sobre um Pokémon direto do terminal, sem pausar a run pra abrir o Google.

Você está no meio de uma run, o Gengar do rival aparece e bate a dúvida: *o que é
super efetivo nele nesse jogo?* Ou então: *onde eu pego um Pikachu em Pokemon Red?* *Com que nível o
Gastly evolui?*

É só um comando, e a resposta já vem **pro jogo que você está jogando**:

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

E de brinde vem o sprite do próprio jogo, em pixel art colorida, direto no terminal.

## Por que o jogo importa

A maioria dos sites mostra os dados da geração mais recente. Se você está jogando Red, isso
pode te fazer perder a luta. Com `--game`, a CLI responde de acordo com o jogo:

| O quê | O que muda |
| --- | --- |
| **Fraquezas** | Usa a tabela de tipos da época: na Gen 1 não existe Dark nem Steel, e Fairy só chega na Gen 6. O tipo do Pokémon também é o da época (Clefairy era Normal). |
| **Evolução** | Some com as evoluções que ainda não existiam (nada de Espeon em Red) e começa a árvore na forma base quando o bebê não existia (sem Pichu em Red). |
| **Onde encontrar** | Só os encontros daquela versão, com método, nível e chance. Não dá pra capturar na natureza? Ele te fala de qual Pokémon evoluir. |
| **Sprite** | O sprite do jogo mesmo: `--game red` mostra o de Red/Blue, `--game crystal` o de Crystal. |

## Instalação

Precisa do Node 20+.

```bash
git clone https://github.com/nahtanpng/pokedex-cli.git
cd pokedex-cli
npm install      # já roda o build
npm link         # deixa o comando `pokedex` disponível no terminal
```

## Uso

```bash
pokedex <pokemon> --game <jogo>
```

Algumas dúvidas clássicas de run:

```bash
pokedex gengar --game red          # o que usar contra o Gengar na Gen 1
pokedex haunter --game emerald     # quando evolui (spoiler: precisa de troca)
pokedex eevee --game gold          # qual pedra ou condição dá cada evolução
pokedex pikachu --game yellow      # onde capturar
pokedex vulpix-alola -g sword      # formas regionais
pokedex mr mime                    # nome com espaço funciona sem aspas
pokedex gengar --game crystal --shiny
```

O `<pokemon>` é o nome em inglês, do jeito que a PokeAPI usa (`mr-mime`, `vulpix-alola`,
`raichu-alola`). Errou a grafia? Relaxa, a CLI sugere o nome certo.

O `--game` aceita o nome da versão: `red`, `blue`, `yellow`, `gold`, `silver`, `crystal`,
`ruby`, `emerald`, `firered`, `diamond`, `platinum`, `heartgold`, `black`, `x`, `sun`,
`sword`, `scarlet` etc. Sem `--game`, vale a geração mais recente.

### Opções

```
  -g, --game <versão>    jogo usado na consulta
      --shiny            mostra o sprite shiny
      --all-locations    lista todos os locais (padrão: os 10 primeiros)
      --no-sprite        não mostra o sprite
      --sprite           força o sprite mesmo com a saída redirecionada
      --json             imprime os dados em JSON
      --no-cache         ignora o cache local
      --no-color         desliga as cores
  -h, --help             ajuda
```

Curte brincar no terminal? O `--json` combina bem com outras ferramentas:

```bash
pokedex charizard --game yellow --json | jq .weaknesses
```

## Cache

A primeira consulta de um Pokémon pode demorar alguns segundos: a CLI faz dezenas de
requisições à PokeAPI (uma para cada área de encontro). Depois disso tudo fica em cache por 7
dias em `~/.cache/pokedex-cli` (ou em `$XDG_CACHE_HOME`), sprites inclusive, e a próxima
consulta sai umas 10x mais rápida.

## Limitações

- Os dados vêm da [PokeAPI](https://pokeapi.co), então nomes de Pokémon e locais aparecem em
  inglês.
- A PokeAPI registra principalmente encontros selvagens. Presentes, trocas e eventos só
  aparecem quando a API tem esses dados.
- Sword/Shield e alguns jogos recentes não têm sprite próprio na API; nesses casos aparece o
  sprite padrão.

## Desenvolvimento

```bash
npm run dev -- gengar --game red   # roda direto do TypeScript, sem build
npm run build
npm test
```

Os testes usam fixtures reais da API em `test/fixtures/` e cobrem a lógica pura: multiplicadores
de Gengar na Gen 1 e na Gen 9, tipos históricos de Clefairy, as frases de condição de evolução,
o filtro da cadeia do Eevee por jogo e a escolha de sprite.

| Arquivo | Responsabilidade |
| --- | --- |
| `src/cli.ts` | argumentos, orquestração, exit codes |
| `src/api/client.ts` | `fetch` com cache em disco, retry e requisições concorrentes |
| `src/domain/game.ts` | versão → version-group → geração |
| `src/domain/effectiveness.ts` | tipos e tabela de dano históricos, multiplicadores defensivos |
| `src/domain/evolution.ts` | árvore de evolução filtrada pelo jogo e frase da condição |
| `src/domain/encounters.ts` | encontros da versão agrupados por local |
| `src/domain/sprite.ts` | escolha do sprite pelo version-group do jogo |
| `src/render/png.ts` | decodificador PNG mínimo, sem dependências (`node:zlib`) |
| `src/render/sprite.ts` | crop, resize e conversão para half-blocks ANSI |
| `src/render/output.ts` | saída colorida do terminal |

O sprite é desenhado com `▀`/`▄` em truecolor, com fallback para 256 cores quando o terminal
não anuncia `COLORTERM`.

Exit codes: `0` ok · `1` Pokémon não encontrado · `2` uso inválido · `3` erro de rede/API.
