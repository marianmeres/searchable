# AGENTS.md - Machine-Readable Package Documentation

## Package Overview

- **Name**: @marianmeres/searchable
- **Version**: see `package.json` (the version of record)
- **License**: MIT
- **Runtime**: runtime-neutral library (web standards only, no runtime APIs); Node LTS
  (`.node-version`) for tooling and tests
- **Language**: TypeScript (erasable-only)
- **Type**: Library (text search index)
- **Registries**: npm gets `dist/` (manifest `package.json`); JSR gets the `.ts` source
  (manifest `jsr.json`, no version)
- **Tooling**: pnpm, `node:test`, `tsc` (type gate + npm build), Biome (format + lint)

## Purpose

High-performance in-memory text search library for:

- Autocomplete / typeahead features
- Document filtering
- Fuzzy text matching

## Architecture

```
src/
├── mod.ts                    # Main entry (re-exports lib + searchable)
├── searchable.ts             # High-level Searchable class (coordinator)
└── lib/
    ├── mod.ts                # Library exports
    ├── index-abstract.ts     # Abstract Index + DistanceFn / FuzzyOptions types
    ├── index-inverted.ts     # InvertedIndex (hash map, O(1) exact)
    ├── index-trie.ts         # TrieIndex (prefix tree, trie-walked fuzzy)
    ├── tokenize.ts           # Unicode-aware word tokenization
    ├── normalize.ts          # Case + accent normalization
    ├── unaccent.ts           # NFD strip + extra precomposed-letter folds
    ├── levenshtein.ts        # Code-point Levenshtein (+ optional Damerau)
    ├── ngram.ts              # Character n-gram generation
    └── intersect.ts          # Set intersection utility (vendored from @std/collections)

tests/                        # node:test suites (*.test.ts), import ../src/*.ts
bench/bench.ts                # mitata benchmark over bench/movies.js (~2500 movies)
example/                      # browser playground: src/main.ts → dist/bundle.js (committed)
scripts/                      # example generators (version, theme), run on Node
package.json                  # manifest of record: version, npm exports, scripts, dev deps
jsr.json                      # JSR manifest: exports, Deno lib, publish.include (no version)
tsconfig.json                 # type gate (src, tests, scripts, bench; noEmit)
tsconfig.build.json           # src → dist (ESM + .d.ts) for npm
example/tsconfig.json         # DOM-typed config for the example (bundle --strict)
```

## Public API

### Main Class

```typescript
class Searchable {
  constructor(options?: Partial<SearchableOptions>)

  // Mutations
  add(input: string, docId: string, strict?: boolean): number
  addBatch(documents: [string, string][] | Record<string, string>, strict?: boolean):
    { added: number; errors: Array<{ docId: string; error: Error }> }
  replace(docId: string, input: string, strict?: boolean): number
  removeDocId(docId: string): number

  // Queries
  search(query: string, strategy?: "exact" | "prefix" | "fuzzy", options?: SearchOptions): string[]
  searchExact(query: string, options?: SearchOptions): string[]
  searchByPrefix(query: string, options?: SearchOptions): string[]
  searchFuzzy(query: string, maxDistance?: number, options?: SearchOptions): string[]
  explainQuery(query: string): QueryExplanation

  // Introspection
  toWords(input: string, isQuery?: boolean): string[]
  toQueryGroups(input: string): string[][]
  hasDocId(docId: string): boolean

  // Persistence
  dump(stringify?: boolean): string | Record<string, any>
  restore(dump: any): boolean
  static fromDump(dump: any, options?: Partial<SearchableOptions>): Searchable

  // Composition
  static merge(indexes: Searchable[]): MergedSearchable

  // Properties
  get wordCount(): number
  get docIdCount(): number
  get lastQuery(): LastQuery       // returns shallow copy
  get __index(): Index
}
```

### Configuration Interface

```typescript
interface SearchableOptions {
  caseSensitive: boolean              // default: false
  accentSensitive: boolean            // default: false
  isStopword: (word: string) => boolean
  normalizeWord: (word: string) => string | string[]  // applied at index AND query time
  index: "inverted" | "trie"          // default: "inverted"
  nonWordCharWhitelist: string        // default: "@-"
  ngramsSize: 0 | 3 | 4 | 5 | (3 | 4 | 5)[]  // default: 0
  querySomeWordMinLength: number      // default: 1
  defaultSearchOptions: Partial<{
    strategy: "exact" | "prefix" | "fuzzy"  // default: "prefix"
    maxDistance: number               // default: 2
    limit: number
    offset: number
    distanceFn: DistanceFn
  }>
  lastQueryHistoryLength: number      // default: 5
}

interface SearchOptions {
  maxDistance?: number
  limit?: number
  offset?: number
  distanceFn?: DistanceFn
}

interface QueryExplanation {
  raw: string
  normalized: string
  tokens: string[]
  afterStopwords: string[]
  groups: string[][]         // OR within group, AND across groups
  wouldSearch: boolean
}

interface LastQuery {
  history: string[]          // normalized queries
  rawHistory: string[]       // raw user input, same length/order as history
  raw: string | undefined
  used: string | undefined
}

interface MergedSearchable {
  search(query: string, options?: SearchOptions): string[]
  searchExact(query: string, options?: SearchOptions): string[]
  searchByPrefix(query: string, options?: SearchOptions): string[]
  searchFuzzy(query: string, maxDistance?: number, options?: SearchOptions): string[]
}

type DistanceFn = (a: string, b: string) => number
```

### Index Classes

```typescript
abstract class Index {
  get wordCount(): number
  get docIdCount(): number
  getAllWords(): string[]
  getAllDocIds(): string[]
  hasDocId(docId: string): boolean
  addWord(word: string, docId: string): boolean
  removeWord(word: string, docId: string): boolean
  removeDocId(docId: string): number
  searchExact(word: string): string[]
  searchByPrefix(prefix: string): string[]
  searchByPrefix(prefix: string, returnWithDistance: true): Record<string, number>
  searchByDocId(docId: string): string[]
  searchFuzzy(word: string, maxDistance?: number): string[]
  searchFuzzy(word: string, maxDistance: number, returnWithDistance: true): Record<string, number>
  searchFuzzy(word: string, maxDistance: number, returnWithDistance: boolean, options: FuzzyOptions):
    string[] | Record<string, number>
  dump(): { version: string; words: Record<string, string[]> }
  restore(data: string | object): boolean
}

interface FuzzyOptions { distanceFn?: DistanceFn }

class InvertedIndex extends Index  // Hash map based, O(1) exact lookup
class TrieIndex extends Index      // Trie, O(k) prefix, trie-walked fuzzy w/ pruning

// TrieIndex-only: project the trie into a nested plain object (e.g. for JSONB export).
// Each key is one code point, leaves are {}. Optional end-of-word sentinel marks
// word-final nodes so a complete word ("bar") is distinguishable from a prefix ("barn").
class TrieIndex {
  toCharTrie(options?: CharTrieOptions): Record<string, any>
  __toCharTrie(): Record<string, any>  // @deprecated byte-compatible alias (char-only)
}
interface CharTrieOptions {
  terminalMarker?: boolean | string  // false (default) | true → "$$" | custom (≥2 code points)
}
const DEFAULT_TERMINAL_MARKER = "$$"
```

### Utility Functions

```typescript
function tokenize(inputString: string, nonWordCharWhitelist?: string): string[]
function normalize(input: string, options?: { caseSensitive?: boolean; accentSensitive?: boolean }): string
function unaccent(input: string): string
function levenshteinDistance(source: string, target: string, options?: { damerau?: boolean }): number
function createNgrams(normalizedText: string, size?: number, options?: { padChar?: string }): string[]
function intersect<T>(...arrays: (readonly T[])[]): T[]
```

## Search Strategies

| Strategy | Inverted    | Trie                                           | Use Case                |
| -------- | ----------- | ---------------------------------------------- | ----------------------- |
| exact    | O(1) hash   | O(k) traversal                                 | Known exact terms       |
| prefix   | O(n) scan   | O(k + subtree)                                 | Autocomplete, typeahead |
| fuzzy    | O(n·m) scan | O(pruned walk) — usually much smaller than n·m | Typo tolerance          |

Where: n = total words, k = query length, m = average word length.

## Index Implementation Comparison

| Feature         | InvertedIndex              | TrieIndex                                                                     |
| --------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Exact search    | O(1)                       | O(k)                                                                          |
| Prefix search   | O(n)                       | O(k + matches)                                                                |
| Fuzzy search    | O(n·m) linear              | pruned trie walk, typically faster for vocabularies with many shared prefixes |
| Memory          | lower                      | higher (one node per char per path, ~160 B per unique indexed char)           |
| Word length     | unbounded                  | unbounded: every walk is iterative, so a 100k-char token is fine              |
| Recommended for | small indexes / simple use | autocomplete / fuzzy heavy / large vocabularies                               |

`TrieIndex` walk order is a contract: pre-order (a node, then its children in
insertion order). It fixes `getAllWords()` / `dump()` order and the tie-break
between equal distances in search results; `tests/trie-walks.test.ts` pins it
against a recursive reference model. The one depth-bounded path left is
`JSON.stringify(trieIndex)` (debug `toJSON`, nests per char, engine-recursive);
persist with the flat `dump()` instead.

## Data Flow (index path)

```
Input
  │
  ▼
normalize()        → trim + optional lowercase + unaccent (incl. ß→ss, ø→o, æ→ae...)
  │
  ▼
tokenize()         → split on non-\p{L}\p{N}\p{Pc}+whitelist
  │
  ▼
isStopword filter
  │
  ▼
normalizeWord()    → may return string or array (aliases)
  │
  ▼
re-normalize each variant, re-filter stopwords, dedupe
  │
  ▼
Index.addWord(word, docId) + optional n-grams
```

## Data Flow (query path)

```
Query
  │
  ▼
normalize()
  │
  ▼
tokenize() + isStopword filter
  │
  ▼
normalizeWord() → expand each token to a GROUP of variants
  │
  ▼
for each group: union of worker(variant) results     (OR within group)
  │
  ▼
intersect across groups                               (AND across groups)
  │
  ▼
sort by min distance, then limit/offset
```

## Test Commands

```bash
pnpm install                 # dev tooling
pnpm test                    # All tests (node --test)
pnpm run test:watch          # Watch mode
pnpm run test:deno           # Same suite on Deno, via jsr.json (before a release)
pnpm run ci                  # typecheck + lint + test (what CI runs)
pnpm run bench               # Benchmarks (mitata)
```

## Build Commands

```bash
pnpm run build               # tsc → dist/ (npm)
pnpm run jsr:check           # deno publish --dry-run with the package.json version
pnpm run example:build       # type-check + bundle example/src → example/dist/bundle.js
pnpm run format              # Biome, before committing
pnpm run rp                  # Release patch + publish npm and JSR (human action)
pnpm run rpm                 # Release minor + publish npm and JSR (human action)
```

## Dependencies

- Runtime: none.
- Dev: `typescript`, `@types/node`, `@biomejs/biome`, `mitata` (bench),
  `@marianmeres/bundle` (example bundler), `@marianmeres/vanilla` +
  `@marianmeres/design-tokens` (example UI and theme).

## Conventions

1. **Runtime policy**: Node at the keyboard, npm as the registry. No `Deno.*`, `Bun.*`,
   `jsr:` or `npm:` specifiers in source, tests or scripts. The suite runs on Node (the
   gate) and on Deno (`test:deno`), so tests use only `node:test` + `node:assert/strict`.
2. **Erasable TypeScript**: no `enum`, `namespace`, constructor parameter properties;
   `import type` for type-only imports; relative imports keep their `.ts` extension
   (`tsc` rewrites them to `.js` for npm). Node strips types and never checks them:
   `pnpm run typecheck` is the only type gate.
3. **Formatting**: Biome (tabs, 4 wide, 90 columns, double quotes); manifests at 2
   spaces. Data files (`bench/movies.js`, `example/movies.json`), vendored
   `example/reboot.css` and generated `example/theme.css` are excluded.

## Common Patterns

### Basic usage

```typescript
const idx = new Searchable();
idx.add("searchable text", "doc-id");
idx.search("query");
```

### Persistence with index-type swap

```typescript
const dumped = fromInverted.dump();
const trie = Searchable.fromDump(dumped, { index: "trie" });
```

### Update in place

```typescript
idx.replace("doc-id", "new text");
```

### Custom distance

```typescript
import { levenshteinDistance } from "@marianmeres/searchable";
const damerau = (a, b) => levenshteinDistance(a, b, { damerau: true });
idx.search("recieve", "fuzzy", { maxDistance: 1, distanceFn: damerau });
```

### Pagination

```typescript
idx.search("apple", "prefix", { limit: 10, offset: 20 });
```

### Debugging

```typescript
idx.explainQuery("The Hello World!");
// → { raw, normalized, tokens, afterStopwords, groups, wouldSearch }
```

### Multiple indexes

```typescript
const merged = Searchable.merge([idx1, idx2]);
merged.searchByPrefix("query", { limit: 10 });
```

### Export trie to nested object (e.g. JSONB)

```typescript
const trie = idx.__index as TrieIndex;       // requires index: "trie"
trie.toCharTrie();                           // { b: { a: { r: { n: {} } } } } (char-only)
trie.toCharTrie({ terminalMarker: true });   // adds "$$" end-of-word marker per word-final node
```

## Error Handling

- `add()` throws on invalid input when `strict=true` (default).
- `add()` returns 0 silently when `strict=false`.
- `addBatch()` collects errors when `strict=false` (default) — otherwise throws on first.
- `restore()` returns `false` when the dump has no `words` field; throws `Error`
  (with `cause` set) on parse failure or unsupported `version` (only `"1.0"` is accepted).
- `search()` returns `[]` when `querySomeWordMinLength` gates the query out
  (no exception thrown).
- `replace()` always succeeds on the remove side (silently no-op if docId unknown),
  then runs `add()` with the given `strict` flag.

## Version history of behavior-impacting changes

See [BC.md](BC.md) for full details. Headline changes in 2.5.0:

- `normalizeWord` now also runs at query time (groups → OR within / AND across).
- `unaccent` folds ß, ø, æ, œ, đ, ł, þ, ð, ı, ...
- Levenshtein iterates code points (astral-safe) and supports Damerau mode.
- `TrieIndex.searchFuzzy` rewritten as trie-walked DP with pruning (~20× faster).
- New: `Searchable.fromDump`, `replace`, `hasDocId`, `explainQuery`,
  `toQueryGroups`, `SearchOptions` (limit/offset/distanceFn), expanded `merge`.
- `restore` throws with `cause`, rejects unknown dump versions.
