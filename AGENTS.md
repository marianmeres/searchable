# AGENTS.md - Machine-Readable Package Documentation

## Package Overview

- **Name**: @marianmeres/searchable
- **Version**: 2.5.0
- **License**: MIT
- **Runtime**: Deno (primary), Node.js (via NPM)
- **Language**: TypeScript
- **Type**: Library (text search index)

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
    └── intersect.ts          # Set intersection utility
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

| Strategy | Inverted | Trie | Use Case |
|----------|----------|------|----------|
| exact    | O(1) hash | O(k) traversal | Known exact terms |
| prefix   | O(n) scan | O(k + subtree) | Autocomplete, typeahead |
| fuzzy    | O(n·m) scan | O(pruned walk) — usually much smaller than n·m | Typo tolerance |

Where: n = total words, k = query length, m = average word length.

## Index Implementation Comparison

| Feature | InvertedIndex | TrieIndex |
|---------|---------------|-----------|
| Exact search | O(1) | O(k) |
| Prefix search | O(n) | O(k + matches) |
| Fuzzy search | O(n·m) linear | pruned trie walk, typically faster for vocabularies with many shared prefixes |
| Memory | lower | higher (one node per char per path) |
| Recommended for | small indexes / simple use | autocomplete / fuzzy heavy / large vocabularies |

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
deno task test               # All tests
deno task test:watch         # Watch mode
deno bench bench/bench.ts    # Benchmarks
```

## Build Commands

```bash
deno task npm:build          # Build NPM package
deno task npm:publish        # Build and publish to NPM
deno publish                 # Publish to JSR
deno task rp                 # Release patch + publish
deno task rpm                # Release minor + publish
```

## Dependencies

- `@std/assert`    — testing assertions
- `@std/fs`        — file system utilities (build only)
- `@std/path`      — path utilities (build only)
- `@marianmeres/npmbuild` — NPM build tooling

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
