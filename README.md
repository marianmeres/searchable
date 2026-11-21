# @marianmeres/searchable

[![NPM](https://img.shields.io/npm/v/@marianmeres/searchable)](https://www.npmjs.com/package/@marianmeres/searchable)
[![JSR](https://jsr.io/badges/@marianmeres/searchable)](https://jsr.io/@marianmeres/searchable)
[![License](https://img.shields.io/npm/l/@marianmeres/searchable)](LICENSE)

A small in-memory text search index. You hand it strings and document IDs, and it hands
back the IDs that match a query, in one of three ways:

- **exact**: extremely fast whole-word matching
- **prefix**: super fast matching on the beginning of words
- **fuzzy**: reasonably fast matching that forgives typos

It is made for filtering documents you already hold in memory: autocomplete, typeahead,
the search box above a list. It has no dependencies and runs in Node, Deno and the
browser.

It is not a full-text search engine. Results are ordered by how closely the words match,
and there is no relevance scoring (no TF-IDF, no BM25).

Try it on 2,516 movies in the [live example](https://searchable.meres.sk/example/).

## Installation

```sh
npm install @marianmeres/searchable
```

```sh
deno add jsr:@marianmeres/searchable
```

## Quick start

```ts
import { Searchable } from "@marianmeres/searchable";

const index = new Searchable();

// add(text, docId)
index.add("james bond", "007");
index.add("jason bourne", "bourne");

index.search("Bond. James Bond.");   // ["007"]
index.search("ja");                  // ["007", "bourne"] (prefix is the default strategy)
index.search("jmaes bnod", "fuzzy"); // ["007"] (typos forgiven)
index.search("bourne", "exact");     // ["bourne"]
index.search("jason bond");          // [] (every word must match, and nobody is both)
```

The index stores words and IDs, not your documents. Keep those wherever they already live
and look them up by the IDs you get back.

## What a search actually does

Indexed text and queries go through the same steps, which is why `Bond. James Bond.` finds
`james bond`:

1. **Normalize.** Trim, lowercase and fold accents, so `Café` and `cafe` are the same
   word, and so are `Straße` and `strasse`.
2. **Split into words** at anything that is not a letter, a digit or an underscore. `-`
   and `@` stay inside words by default.
3. **Filter and rewrite**, if you asked for it: drop stopwords, run your `normalizeWord`.
4. **Match every word.** A document is a hit only when each query word matches one of its
   words, so more words in the query narrow the result.
5. **Rank.** Prefix and fuzzy results come back closest match first: for the query `bon`,
   `bond` before `bonds` before `bonding`. Exact matches are all equally exact, so they
   come back unranked.

Steps 1 to 3 are configurable through the [options](#options). To page through the
results, pass `limit` and `offset`:

```ts
index.search("bond", "prefix", { limit: 10, offset: 20 });
```

## Extremely, Super, Reasonably... How fast is it really?

The [bench script](bench/bench.ts) indexes the 2,516 movies of the live example (some
25,000 unique words once 3-grams are counted) into both index implementations and runs
one- and two-word queries against them. Rough numbers per query on an Apple M2 with
Node 26 (`pnpm run bench`):

| Strategy | `trie`  | `inverted` |
| -------- | ------- | ---------- |
| exact    | ~30 µs  | ~30 µs     |
| prefix   | ~200 µs | ~750 µs    |
| fuzzy    | ~2 ms   | ~11 ms     |

That's fast enough.

## Exact, prefix, or fuzzy?

| Strategy           | A query word matches                                    | Good for                                               |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------ |
| `exact`            | an identical indexed word                               | IDs, codes, tags: anything where "close" means "wrong" |
| `prefix` (default) | any indexed word that starts with it                    | typeahead and filter-as-you-type                       |
| `fuzzy`            | any indexed word within `maxDistance` edits (default 2) | typos in fully typed words                             |

Fuzzy compares whole words, so it does not cover what prefix covers. A half-typed `termin`
is four edits short of `terminator`: prefix finds it, fuzzy does not. For a typeahead that
also forgives typos, a simple combination is prefix first, and fuzzy only when prefix
comes back empty:

```ts
function typeahead(query: string): string[] {
    const hits = index.search(query, "prefix");
    return hits.length ? hits : index.search(query, "fuzzy");
}
```

## Know your Fuzzy

Fuzzy counts the edits (insert, delete or replace one character) it takes to turn the
query word into an indexed word, and accepts anything within `maxDistance`. That is
precise on long words and very generous on short ones. Some numbers from the bench data:

- **Short words match nearly everything.** `cat` is two edits away from `a`, and 2,261 of
  the 2,516 movies contain the word `a`. So a fuzzy `cat` returns 2,495 movies where an
  exact one returns 16. `maxDistance: 1` still returns 720, so short words are better
  left to exact or prefix.
- **Long words behave.** A fuzzy `tarantion` returns the same 11 movies as an exact
  `tarantino`.
- **Swapped letters cost two edits.** Plain Levenshtein reads `tarantion` as two wrong
  letters, so at `maxDistance: 1` it finds nothing. Damerau-Levenshtein counts a swap of
  two adjacent letters as one edit, and you can plug it in per call (or any other
  distance function):

```ts
import { levenshteinDistance } from "@marianmeres/searchable";

const damerau = (a: string, b: string) => levenshteinDistance(a, b, { damerau: true });

index.search("tarantion", "fuzzy", { maxDistance: 1, distanceFn: damerau });
```

A custom `distanceFn` has a price on the trie index. The trie's fuzzy speed comes from
pruning that is only valid for the built-in Levenshtein, so with your own function it
compares the query against every indexed word, as the inverted index always does.

## Options

Every option has a default. Pass only the ones you want to change:

```ts
const index = new Searchable({ index: "trie", accentSensitive: true });
```

| Option                   | Default                                  | What it does                                                                                                                                                          |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caseSensitive`          | `false`                                  | Treats `Foo` and `foo` as different words.                                                                                                                            |
| `accentSensitive`        | `false`                                  | Treats `cafe` and `café` as different words. When off, folding also covers the letters Unicode does not decompose (`ß` to `ss`, `ø` to `o`, `æ` to `ae`, `ł` to `l`). |
| `isStopword`             | `() => false`                            | `(word) => boolean`. Words it flags are left out of both the index and the query.                                                                                     |
| `normalizeWord`          | `(word) => word`                         | Rewrites or expands each word at index and at query time. See [below](#stemming-synonyms-aliases-normalizeword).                                                      |
| `index`                  | `"inverted"`                             | `"inverted"` or `"trie"`. See [Inverted or trie?](#inverted-or-trie).                                                                                                 |
| `nonWordCharWhitelist`   | `"@-"`                                   | Non-word characters to keep inside words. With the default, `well-known` is one word, so `known` alone does not find it.                                              |
| `ngramsSize`             | `0`                                      | `3`, `4`, `5` or an array of them, to match inside words. `0` turns it off. See [below](#matching-inside-words-ngramssize).                                           |
| `querySomeWordMinLength` | `1`                                      | Returns `[]` without searching unless at least one query word is this long. Set it to 2 or 3 to ignore the first keystrokes of a typeahead.                           |
| `defaultSearchOptions`   | `{ strategy: "prefix", maxDistance: 2 }` | What `search()` uses when the call does not say: `strategy`, `maxDistance`, `limit`, `offset`, `distanceFn`.                                                          |
| `lastQueryHistoryLength` | `5`                                      | How many recent queries `index.lastQuery` keeps, raw and normalized.                                                                                                  |

### Stemming, synonyms, aliases (`normalizeWord`)

`normalizeWord` receives every word, when indexing and again when searching. Return a
string for a one-to-one rewrite (a stemmer, a lemmatizer), or an array to expand a word
into alternatives:

```ts
const synonyms: Record<string, string[]> = { colour: ["colour", "color"] };

const index = new Searchable({
    normalizeWord: (word) => synonyms[word] ?? word,
});

index.add("color palette", "d1");
index.add("colour wheel", "d2");

index.search("colour"); // ["d2", "d1"]
index.search("color");  // ["d1", "d2"]
```

In a query, the alternatives of one word are OR'ed, while the separate words are still
AND'ed: `colour wheel` means (`colour` or `color`) and `wheel`.

### Matching inside words (`ngramsSize`)

By default a word is found only from its beginning. With `ngramsSize: 3`, every
three-letter slice of each word is indexed as well, so `min` finds `terminator`. The
slices are exactly that long: for `mina` to match too, use `[3, 4]`.

It is not free. On the bench data, 3-grams make the dump 3.3 times bigger (1.4 MB to
4.5 MB), and they give fuzzy even more short words to be generous with.

## Inverted or trie?

Both implementations have the same API and the same dump format. They differ in where the
time and the memory go:

|           | `"inverted"` (default)           | `"trie"`                                          |
| --------- | -------------------------------- | ------------------------------------------------- |
| Structure | hash map from word to doc IDs    | prefix tree, one node per character               |
| exact     | one hash lookup                  | one step per character                            |
| prefix    | checks every indexed word        | walks to the prefix and collects what is below it |
| fuzzy     | compares with every indexed word | walks the tree, skips branches already too far    |
| Memory    | lower                            | higher                                            |

If prefix or fuzzy is your main path, and for a typeahead it usually is, pick `"trie"`:
the [numbers above](#extremely-super-reasonably-how-fast-is-it-really) show why.
`"inverted"` is fine for small indexes and exact-heavy use, and it is simpler to debug.
Either way, run the [bench script](bench/bench.ts) against your own data if you care
about the last few percent.

## More things it can do

### Add, update, remove

```ts
index.addBatch({ d1: "alpha", d2: "beta" }); // or [["d1", "alpha"], ["d2", "beta"]]
index.replace("d1", "alpha updated");        // drops d1's old words, adds the new ones
index.removeDocId("d2");
index.hasDocId("d1");                        // true
index.docIdCount;                            // 1
```

`add` on an ID that is already indexed only adds words to it. When a document changes,
use `replace`.

### Save and restore

```ts
const dump = index.dump(); // a JSON string

// the index type may differ from the one that produced the dump
const restored = Searchable.fromDump(dump, { index: "trie" });
```

The dump holds the indexed words, not the options. Pass `fromDump` the same options you
built the index with (stopwords, `normalizeWord`, case and accent sensitivity), or the
queries will be normalized differently from the words they are looking for.

### Search several indexes at once

```ts
const movies = new Searchable();
movies.add("the terminator", "movie:1");

const actors = new Searchable();
actors.add("arnold schwarzenegger terminator", "actor:1");

const all = Searchable.merge([movies, actors]);
all.search("termin"); // ["movie:1", "actor:1"]
```

The merged result is each index's hits back to back, without duplicates. Ranking,
`limit` and `offset` apply inside each index, not to the merged list.

### Ask it what it understood

When a query does not match what you expected, `explainQuery` shows what became of it:

```ts
const stopwords = new Set(["the", "a", "an"]);
const index = new Searchable({ isStopword: (word) => stopwords.has(word) });

index.explainQuery("The Hello World!");
// {
//   raw: "The Hello World!",
//   normalized: "the hello world!",
//   tokens: ["the", "hello", "world"],
//   afterStopwords: ["hello", "world"],
//   groups: [["hello"], ["world"]], // OR within a group, AND across groups
//   wouldSearch: true,              // false when querySomeWordMinLength stops it
// }
```

### Export the trie as a nested object

The trie index can turn itself into a plain nested object, one character per key. That is
handy for a store that can query nested JSON, for example a Postgres JSONB column doing
prefix matching in SQL.

```ts
import { Searchable, type TrieIndex } from "@marianmeres/searchable";

const index = new Searchable({ index: "trie" });
index.add("bar barn", "doc1");
const trie = index.__index as TrieIndex;

trie.toCharTrie();
// { b: { a: { r: { n: {} } } } }   is "bar" a word, or only the start of "barn"?

trie.toCharTrie({ terminalMarker: true });
// { b: { a: { r: { "$$": true, n: { "$$": true } } } } }
//                  └ "bar" is a word    └ "barn" is a word
```

Without `terminalMarker`, a complete word cannot be told from the start of a longer one.
See [API.md](API.md#tochartrie) for the details.

## API

See [API.md](API.md) for the complete reference, and [BC.md](BC.md) for behavior changes
between versions.

## Development

Node LTS (`.node-version`), pnpm, Biome, `node:test`. The source is erasable-only
TypeScript that Node runs directly in the tests; `dist/` is built only for publishing to
npm. JSR is served the `.ts` source (`jsr.json`).

| Command                             | Does                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install`                      | installs the dev tooling                                                             |
| `pnpm test` / `pnpm run test:watch` | `node --test` over `tests/**/*.test.ts`                                              |
| `pnpm run test:deno`                | the same suite on Deno, resolved as JSR consumers see it                             |
| `pnpm run typecheck`                | `tsc --noEmit` over `src`, `tests`, `scripts` and `bench`                            |
| `pnpm run lint` / `pnpm run format` | `biome check .` read-only / with `--write`                                           |
| `pnpm run ci`                       | typecheck + lint + test, what CI runs                                                |
| `pnpm run bench`                    | the [bench script](bench/bench.ts) ([mitata](https://github.com/evanwashere/mitata)) |
| `pnpm run build`                    | `tsc -p tsconfig.build.json` → `dist/`                                               |
| `pnpm run example:build`            | type-checks and bundles `example/src` → `example/dist/bundle.js`                     |
| `pnpm run example:dev`              | the same, rebuilding on change                                                       |
| `pnpm run example:theme [name]`     | regenerates `example/theme.css` from a design-tokens theme                           |
| `pnpm run jsr:check`                | `deno publish --dry-run` with the `package.json` version                             |
| `pnpm run rp` / `pnpm run rpm`      | patch / minor release, then publish to npm and JSR                                   |

The example is served from the repo (the root `index.html` redirects to `example/`), so
open it over `http://` from any static server after `pnpm run example:build`.

## License

[MIT](LICENSE)
