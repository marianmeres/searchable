# AGENTS.md - Machine-Readable Package Documentation

## Package Overview

- **Name**: @marianmeres/searchable
- **Version**: 2.3.1
- **License**: MIT
- **Runtime**: Deno (primary), Node.js (via NPM)
- **Language**: TypeScript
- **Type**: Library (text search index)

## Purpose

High-performance in-memory text search library for:
- Autocomplete/typeahead features
- Document filtering
- Fuzzy text matching

## Architecture

```
src/
├── mod.ts                    # Main entry point (re-exports all public API)
├── searchable.ts             # Main Searchable class
└── lib/
    ├── mod.ts                # Library exports
    ├── index-abstract.ts     # Abstract Index interface
    ├── index-inverted.ts     # InvertedIndex implementation (default)
    ├── index-trie.ts         # TrieIndex implementation (for autocomplete)
    ├── tokenize.ts           # String tokenization
    ├── normalize.ts          # Text normalization
    ├── unaccent.ts           # Accent removal
    ├── levenshtein.ts        # Edit distance algorithm
    ├── ngram.ts              # N-gram generation
    └── intersect.ts          # Set intersection utility
```

## Public API

### Main Class

```typescript
class Searchable {
  constructor(options?: Partial<SearchableOptions>)

  // Core methods
  add(input: string, docId: string, strict?: boolean): number
  addBatch(documents: [string, string][] | Record<string, string>, strict?: boolean): { added: number; errors: Array<{ docId: string; error: Error }> }
  search(query: string, strategy?: "exact" | "prefix" | "fuzzy", options?: { maxDistance?: number }): string[]
  searchExact(query: string): string[]
  searchByPrefix(query: string): string[]
  searchFuzzy(query: string, maxDistance?: number): string[]
  toWords(input: string, isQuery?: boolean): string[]

  // Persistence
  dump(stringify?: boolean): string | Record<string, any>
  restore(dump: any): boolean

  // Static
  static merge(indexes: Searchable[]): { search: (query: string) => string[] }

  // Properties
  get wordCount(): number
  get lastQuery(): LastQuery
  get __index(): Index
}
```

### Configuration Interface

```typescript
interface SearchableOptions {
  caseSensitive: boolean              // default: false
  accentSensitive: boolean            // default: false
  isStopword: (word: string) => boolean
  normalizeWord: (word: string) => string | string[]
  index: "inverted" | "trie"          // default: "inverted"
  nonWordCharWhitelist: string        // default: "@-"
  ngramsSize: 0 | 3 | 4 | 5 | (3 | 4 | 5)[]  // default: 0
  querySomeWordMinLength: number      // default: 1
  defaultSearchOptions: Partial<{
    strategy: "exact" | "prefix" | "fuzzy"  // default: "prefix"
    maxDistance: number               // default: 2
  }>
  lastQueryHistoryLength: number      // default: 5
}
```

### Index Classes

```typescript
abstract class Index {
  get wordCount(): number
  get docIdCount(): number
  getAllWords(): string[]
  getAllDocIds(): string[]
  addWord(word: string, docId: string): boolean
  removeWord(word: string, docId: string): boolean
  removeDocId(docId: string): number
  searchExact(word: string): string[]
  searchByPrefix(prefix: string): string[]
  searchByPrefix(prefix: string, returnWithDistance: true): Record<string, number>
  searchByDocId(docId: string): string[]
  searchFuzzy(word: string, maxDistance?: number): string[]
  searchFuzzy(word: string, maxDistance: number, returnWithDistance: true): Record<string, number>
  dump(): { version?: string; words: Record<string, string[]> }
  restore(data: string | object): boolean
}

class InvertedIndex extends Index  // Hash map based, O(1) exact lookup
class TrieIndex extends Index      // Prefix tree, O(k) prefix lookup
```

### Utility Functions

```typescript
function tokenize(inputString: string, nonWordCharWhitelist?: string): string[]
function normalize(input: string, options?: { caseSensitive?: boolean; accentSensitive?: boolean }): string
function unaccent(input: string): string
function levenshteinDistance(source: string, target: string): number
function createNgrams(normalizedText: string, size?: number, options?: { padChar?: string }): string[]
function intersect<T>(...arrays: (readonly T[])[]): T[]
```

## Search Strategies

| Strategy | Time Complexity | Use Case |
|----------|-----------------|----------|
| exact    | O(1) inverted / O(k) trie | Known exact terms |
| prefix   | O(n) inverted / O(k) trie | Autocomplete, typeahead |
| fuzzy    | O(n × m) | Typo tolerance |

Where: n = total words, k = query length, m = average word length

## Index Implementation Comparison

| Feature | InvertedIndex | TrieIndex |
|---------|---------------|-----------|
| Exact search | O(1) | O(k) |
| Prefix search | O(n) | O(k) |
| Memory usage | Lower | Higher |
| Recommended for | General use | Autocomplete-heavy |

## Data Flow

```
Input String
    ↓
normalize() → lowercase, remove accents
    ↓
tokenize() → split into words
    ↓
isStopword filter → remove ignored words
    ↓
normalizeWord() → custom processing (stemming, aliases)
    ↓
Index.addWord() → store word → docId mapping
```

## Test Commands

```bash
deno test                    # Run all tests
deno test --watch            # Watch mode
deno task test               # Via task runner
```

## Build Commands

```bash
deno task npm:build          # Build NPM package
deno task npm:publish        # Build and publish to NPM
deno publish                 # Publish to JSR
```

## Dependencies

- `@std/assert` - Testing assertions
- `@std/fs` - File system utilities (build only)
- `@std/path` - Path utilities (build only)
- `@marianmeres/npmbuild` - NPM build tooling

## File Purposes

| File | Purpose |
|------|---------|
| `src/mod.ts` | Main entry, re-exports all public API |
| `src/searchable.ts` | Main Searchable class with high-level API |
| `src/lib/index-abstract.ts` | Abstract Index interface definition |
| `src/lib/index-inverted.ts` | Hash map based index implementation |
| `src/lib/index-trie.ts` | Trie based index implementation |
| `src/lib/tokenize.ts` | Unicode-aware word tokenization |
| `src/lib/normalize.ts` | Case and accent normalization |
| `src/lib/unaccent.ts` | Diacritical mark removal |
| `src/lib/levenshtein.ts` | Edit distance calculation |
| `src/lib/ngram.ts` | Character n-gram generation |
| `src/lib/intersect.ts` | Array intersection utility |

## Common Patterns

### Basic Usage
```typescript
const index = new Searchable();
index.add("searchable text", "doc-id");
const results = index.search("query");
```

### Persistence
```typescript
// Save
const dump = index.dump();
localStorage.setItem("index", dump);

// Restore
const index = new Searchable();
index.restore(localStorage.getItem("index"));
```

### Multiple Indexes
```typescript
const merged = Searchable.merge([index1, index2]);
const results = merged.search("query");
```

### Custom Processing
```typescript
const index = new Searchable({
  isStopword: (w) => ["the", "a", "an"].includes(w),
  normalizeWord: (w) => stemmer(w),  // your stemmer function
});
```

## Error Handling

- `add()` throws on invalid input when `strict=true` (default)
- `add()` returns 0 silently when `strict=false`
- `addBatch()` collects errors when `strict=false` (default)
- `restore()` returns `false` on invalid data, throws on parse errors
