# API Reference

Complete API documentation for `@marianmeres/searchable`.

> Behavior changes between versions live in [BC.md](BC.md).

## Table of Contents

- [Searchable (Main Class)](#searchable)
  - [Constructor](#constructor)
  - [Static Methods](#static-methods)
  - [Instance Methods](#instance-methods)
  - [Properties](#properties)
- [Interfaces](#interfaces)
  - [SearchableOptions](#searchableoptions)
  - [SearchOptions](#searchoptions)
  - [QueryExplanation](#queryexplanation)
  - [LastQuery](#lastquery)
  - [MergedSearchable](#mergedsearchable)
- [Index Implementations](#index-implementations)
  - [InvertedIndex](#invertedindex)
  - [TrieIndex](#trieindex)
  - [Shared methods](#index-methods-both-implementations)
- [Utility Functions](#utility-functions)
  - [tokenize](#tokenize)
  - [normalize](#normalize)
  - [unaccent](#unaccent)
  - [levenshteinDistance](#levenshteindistance)
  - [createNgrams](#createngrams)
  - [intersect](#intersect)

---

## Searchable

The main class for creating and managing a text search index.

### Constructor

```typescript
constructor(options?: Partial<SearchableOptions>)
```

Creates a new Searchable index. See [SearchableOptions](#searchableoptions).

```typescript
import { Searchable } from '@marianmeres/searchable';

const index = new Searchable({
  caseSensitive: false,
  accentSensitive: false,
  index: "trie",
  ngramsSize: [3, 4],
  isStopword: (w) => ['the', 'a', 'an'].includes(w),
});
```

---

### Static Methods

#### Searchable.fromDump

```typescript
static fromDump(dump: any, options?: Partial<SearchableOptions>): Searchable
```

Construct a Searchable from a previously-produced dump. The dump format is
index-agnostic, so you may pick a different `index` at restore time (e.g.
migrate inverted → trie).

```typescript
const trie = Searchable.fromDump(await Deno.readTextFile('./dump.json'), {
  index: 'trie',
});
```

#### Searchable.merge

```typescript
static merge(indexes: Searchable[]): MergedSearchable
```

Unified facade across multiple Searchables. Results are the deduplicated union
of each instance's matches for the same query. Each child runs with its own
configured options unless you pass `options` at call time.

Returns a [MergedSearchable](#mergedsearchable) with full `search` / `searchExact`
/ `searchByPrefix` / `searchFuzzy` surface.

---

### Instance Methods

#### add

```typescript
add(input: string, docId: string, strict?: boolean): number
```

Index `input` under `docId`. Returns the number of new word-docId pairs added.

- `strict` — if `true` (default), throws on invalid input; if `false`, returns `0`.

#### addBatch

```typescript
addBatch(
  documents: [string, string][] | Record<string, string>,
  strict?: boolean
): { added: number; errors: Array<{ docId: string; error: Error }> }
```

Batch version. Accepts an array of tuples or a `Record<docId, text>`. Default
`strict` is `false` (collects errors instead of throwing).

#### replace

```typescript
replace(docId: string, input: string, strict?: boolean): number
```

Clears all indexed content for `docId` then adds `input`. Use this instead of
`removeDocId` + `add` to avoid leaving stale words behind when you forget.

#### removeDocId

```typescript
removeDocId(docId: string): number
```

Removes all indexed content for `docId`. Returns the number of word-docId
pairs deleted.

#### hasDocId

```typescript
hasDocId(docId: string): boolean
```

#### search

```typescript
search(
  query: string,
  strategy?: "exact" | "prefix" | "fuzzy",
  options?: SearchOptions
): string[]
```

Main entry point. Dispatches to the named strategy (default comes from
`defaultSearchOptions.strategy`).

```typescript
index.search('bond');                                           // default strategy
index.search('bond', 'exact');
index.search('bnd', 'fuzzy', { maxDistance: 1 });
index.search('bond', 'prefix', { limit: 10, offset: 0 });
index.search('recieve', 'fuzzy', {
  maxDistance: 1,
  distanceFn: (a, b) => levenshteinDistance(a, b, { damerau: true }),
});
```

#### searchExact / searchByPrefix / searchFuzzy

```typescript
searchExact(query: string, options?: SearchOptions): string[]
searchByPrefix(query: string, options?: SearchOptions): string[]
searchFuzzy(query: string, maxDistance?: number, options?: SearchOptions): string[]
```

Strategy-specific methods. All three accept `SearchOptions` for `limit`,
`offset`, and (fuzzy) `distanceFn`.

#### toWords

```typescript
toWords(input: string, isQuery?: boolean): string[]
```

Returns the flat, de-duplicated word list a given input produces. Since v2.5.0,
`isQuery=true` also applies `normalizeWord` to match the query-side pipeline —
note that when the normalizer returns arrays the flattened output loses the
group boundary. For proper group-aware queries, use [toQueryGroups](#toquerygroups).

#### toQueryGroups

```typescript
toQueryGroups(input: string): string[][]
```

Splits the input into **groups** of alternate terms — one group per original
tokenized term, containing that term's `normalizeWord` expansion. Search
semantics: OR within a group, AND across groups. This is the shape the
internal search pipeline uses.

```typescript
// normalizeWord maps "colour" → ["colour", "color"]
index.toQueryGroups('big colour test');
// [ ["big"], ["colour", "color"], ["test"] ]
```

#### explainQuery

```typescript
explainQuery(query: string): QueryExplanation
```

Returns a step-by-step view of the query pipeline — great for answering "why
didn't my query match?". See [QueryExplanation](#queryexplanation).

#### dump

```typescript
dump(stringify?: boolean): string | Record<string, any>
```

Exports the index to a JSON-serializable structure. Default `stringify` is
`true` (returns a JSON string).

#### restore

```typescript
restore(dump: any): boolean
```

Replaces internal state with the dump contents. Returns `true` on success,
`false` when `dump.words` is missing. Throws `Error` (with `cause` populated)
on malformed JSON or unsupported version. Prefer [Searchable.fromDump](#searchablefromdump)
when building a new instance.

---

### Properties

| Property | Type | Description |
|---|---|---|
| `wordCount` | `number` | Total unique words (including n-grams) in the index |
| `docIdCount` | `number` | Total unique document IDs |
| `lastQuery` | `LastQuery` | Shallow copy of the last-query metadata (see [LastQuery](#lastquery)) |
| `__index` | `Index` | Access to the underlying concrete index (debugging) |

---

## Interfaces

### SearchableOptions

```typescript
interface SearchableOptions {
  caseSensitive: boolean;        // default false
  accentSensitive: boolean;      // default false
  isStopword: (word: string) => boolean;
  normalizeWord: (word: string) => string | string[];
  index: "inverted" | "trie";    // default "inverted"
  nonWordCharWhitelist: string;  // default "@-"
  ngramsSize: 0 | 3 | 4 | 5 | (3 | 4 | 5)[];  // default 0
  querySomeWordMinLength: number;  // default 1
  defaultSearchOptions: Partial<{
    strategy: "exact" | "prefix" | "fuzzy";
    maxDistance: number;
    limit: number;
    offset: number;
    distanceFn: DistanceFn;
  }>;
  lastQueryHistoryLength: number;  // default 5
}
```

Note: `normalizeWord` runs at BOTH index and query time since v2.5.0.

### SearchOptions

```typescript
interface SearchOptions {
  maxDistance?: number;   // fuzzy only; default 2
  limit?: number;         // cap returned results
  offset?: number;        // skip first N results
  distanceFn?: DistanceFn; // override Levenshtein for fuzzy
}

type DistanceFn = (a: string, b: string) => number;
```

### QueryExplanation

```typescript
interface QueryExplanation {
  raw: string;
  normalized: string;
  tokens: string[];
  afterStopwords: string[];
  groups: string[][];    // after normalizeWord expansion
  wouldSearch: boolean;  // false if querySomeWordMinLength gates it
}
```

### LastQuery

```typescript
interface LastQuery {
  history: string[];      // post-normalization queries
  rawHistory: string[];   // pre-normalization user input (same length/order)
  raw: string | undefined;
  used: string | undefined;
}
```

### MergedSearchable

```typescript
interface MergedSearchable {
  search(query: string, options?: SearchOptions): string[];
  searchExact(query: string, options?: SearchOptions): string[];
  searchByPrefix(query: string, options?: SearchOptions): string[];
  searchFuzzy(query: string, maxDistance?: number, options?: SearchOptions): string[];
}
```

---

## Index Implementations

Both implementations extend the abstract `Index` class and expose the same API.

### InvertedIndex

Hash-map based inverted index using `Map<word, Set<docId>>`.

- O(1) exact lookups.
- Prefix / fuzzy scan the whole word list.
- Lower memory overhead.

### TrieIndex

Trie (prefix tree) based index.

- O(k) prefix descent (k = prefix length).
- Fuzzy search walks the trie with a rolling Levenshtein row and prunes
  subtrees whose row minimum exceeds `maxDistance` — dramatically faster
  than a linear scan on non-trivial vocabularies (v2.5.0+).
- Slightly higher memory footprint.

### Index methods (both implementations)

```typescript
// Properties
get wordCount(): number
get docIdCount(): number

// Data access
getAllWords(): string[]
getAllDocIds(): string[]
hasDocId(docId: string): boolean

// Mutations
addWord(word: string, docId: string): boolean
removeWord(word: string, docId: string): boolean
removeDocId(docId: string): number

// Search
searchExact(word: string): string[]
searchByPrefix(prefix: string): string[]
searchByPrefix(prefix: string, returnWithDistance: true): Record<string, number>
searchByDocId(docId: string): string[]
searchFuzzy(word: string, maxDistance?: number): string[]
searchFuzzy(word: string, maxDistance: number, returnWithDistance: true): Record<string, number>
searchFuzzy(word: string, maxDistance: number, returnWithDistance: boolean, options: FuzzyOptions): string[] | Record<string, number>

// Persistence
dump(): { version: string; words: Record<string, string[]> }
restore(data: string | object): boolean
```

Where:

```typescript
interface FuzzyOptions {
  distanceFn?: DistanceFn;
}
```

---

## Utility Functions

### tokenize

```typescript
tokenize(inputString: string, nonWordCharWhitelist?: string): string[]
```

Splits a string into words using Unicode-aware word boundaries
(`\p{L}`, `\p{N}`, `\p{Pc}` + whitelist).

```typescript
tokenize('Hello, World!');            // ['Hello', 'World']
tokenize('user@example.com', '@');    // ['user@example.com']
tokenize('well-known', '-');          // ['well-known']
```

### normalize

```typescript
normalize(input: string, options?: { caseSensitive?: boolean; accentSensitive?: boolean }): string
```

Trims, optionally lowercases, optionally strips accents (via `unaccent`).

### unaccent

```typescript
unaccent(input: string): string
```

Removes diacritical marks via Unicode NFD + combining-mark strip **and**
folds a curated set of precomposed letters (`ß → ss`, `ø → o`, `æ → ae`,
`œ → oe`, `đ → d`, `ł → l`, `þ → th`, `ð → d`, `ı → i`, ...).

```typescript
unaccent('café');     // 'cafe'
unaccent('straße');   // 'strasse'
unaccent('København'); // 'Kobenhavn'
unaccent('łódź');     // 'lodz'
```

### levenshteinDistance

```typescript
levenshteinDistance(
  source: string,
  target: string,
  options?: { damerau?: boolean }
): number
```

Edit distance between two strings.

- Iterates over Unicode code points, so astral characters (emoji, many CJK)
  count as single characters.
- Uses rolling rows — O(min(m,n)) space.
- With `damerau: true`, adjacent transpositions (`teh ↔ the`) count as a
  single edit.

```typescript
levenshteinDistance('cat', 'hat');                           // 1
levenshteinDistance('teh', 'the');                           // 2
levenshteinDistance('teh', 'the', { damerau: true });        // 1
levenshteinDistance('😀cat', '😀cats');                      // 1
```

### createNgrams

```typescript
createNgrams(
  normalizedText: string,
  size?: number,
  options?: { padChar?: string }
): string[]
```

Generates character n-grams of length `size`. Padding defaults to `" "` (n-1
on each side); pass `padChar: ""` to disable padding.

### intersect

```typescript
intersect<T>(...arrays: (readonly T[])[]): T[]
```

Returns all distinct elements that appear in every input array.
