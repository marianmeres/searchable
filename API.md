# API Reference

Complete API documentation for `@marianmeres/searchable`.

## Table of Contents

- [Searchable (Main Class)](#searchable)
  - [Constructor](#constructor)
  - [Methods](#methods)
  - [Properties](#properties)
- [Interfaces](#interfaces)
  - [SearchableOptions](#searchableoptions)
  - [LastQuery](#lastquery)
- [Index Implementations](#index-implementations)
  - [InvertedIndex](#invertedindex)
  - [TrieIndex](#trieindex)
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

Creates a new Searchable index instance.

**Parameters:**
- `options` - Optional configuration object (see [SearchableOptions](#searchableoptions))

**Example:**
```typescript
import { Searchable } from '@marianmeres/searchable';

// With defaults
const index = new Searchable();

// With custom options
const index = new Searchable({
  caseSensitive: false,
  accentSensitive: false,
  index: "inverted",
  ngramsSize: [3, 4],
  isStopword: (word) => ['the', 'a', 'an'].includes(word),
});
```

### Methods

#### add

```typescript
add(input: string, docId: string, strict?: boolean): number
```

Adds a searchable text string to the index associated with a document ID.

**Parameters:**
- `input` - The searchable text to index
- `docId` - Unique identifier for the document
- `strict` - If `true`, throws on invalid input. If `false`, silently returns 0 (default: `true`)

**Returns:** Number of new word-docId pairs added to the index

**Example:**
```typescript
const index = new Searchable();
const added = index.add("james bond", "007");
console.log(`Added ${added} word-document pairs`);
```

---

#### addBatch

```typescript
addBatch(
  documents: [string, string][] | Record<string, string>,
  strict?: boolean
): { added: number; errors: Array<{ docId: string; error: Error }> }
```

Efficiently adds multiple documents to the index in batch.

**Parameters:**
- `documents` - Array of `[docId, text]` tuples or `Record<docId, text>` object
- `strict` - If `true`, stops on first error. If `false`, continues and collects errors (default: `false`)

**Returns:** Object with count of added entries and any errors encountered

**Example:**
```typescript
const index = new Searchable();

// Array format
const result = index.addBatch([
  ["doc1", "james bond"],
  ["doc2", "mission impossible"],
]);

// Object format
index.addBatch({
  doc1: "james bond",
  doc2: "mission impossible",
});

console.log(`Added ${result.added} entries`);
if (result.errors.length) {
  console.error(`Failed: ${result.errors.length} documents`);
}
```

---

#### search

```typescript
search(
  query: string,
  strategy?: "exact" | "prefix" | "fuzzy",
  options?: { maxDistance?: number }
): string[]
```

Main search API entry point with configurable strategy.

**Parameters:**
- `query` - The search query string
- `strategy` - Search strategy: `"exact"`, `"prefix"`, or `"fuzzy"` (default from options, typically `"prefix"`)
- `options.maxDistance` - Maximum Levenshtein distance for fuzzy search (default: 2)

**Returns:** Array of docIds matching the query

**Example:**
```typescript
const index = new Searchable();
index.add("james bond", "007");

// Use default strategy (prefix)
const results = index.search("bond");

// Specify strategy explicitly
const exact = index.search("bond", "exact");
const fuzzy = index.search("bnd", "fuzzy", { maxDistance: 1 });
```

---

#### searchExact

```typescript
searchExact(query: string): string[]
```

Searches the index for documents containing exact word matches from the query.

This is the fastest search strategy. All query words must match exactly (after normalization).

**Parameters:**
- `query` - The search query string

**Returns:** Array of docIds that match all query words exactly

**Example:**
```typescript
const index = new Searchable();
index.add("home office", "doc1");
index.add("office space", "doc2");

const results = index.searchExact("office");
// returns: ["doc1", "doc2"]
```

---

#### searchByPrefix

```typescript
searchByPrefix(query: string): string[]
```

Searches the index for documents containing words that start with the query words.

Recommended strategy for autocomplete and typeahead features. Results are sorted by Levenshtein distance (closest matches first).

**Parameters:**
- `query` - The search query string

**Returns:** Array of docIds sorted by match quality (best matches first)

**Example:**
```typescript
const index = new Searchable();
index.add("restaurant", "doc1");
index.add("rest area", "doc2");

const results = index.searchByPrefix("rest");
// returns: ["doc1", "doc2"] sorted by match quality
```

---

#### searchFuzzy

```typescript
searchFuzzy(query: string, maxDistance?: number): string[]
```

Searches the index using fuzzy matching based on Levenshtein distance.

Useful for handling typos and partial matches. Results are sorted by distance (closest matches first).

**Parameters:**
- `query` - The search query string
- `maxDistance` - Maximum Levenshtein distance to consider a match (default: 2)

**Returns:** Array of docIds sorted by match quality (best matches first)

**Example:**
```typescript
const index = new Searchable();
index.add("restaurant", "doc1");

// Handles typos
const results = index.searchFuzzy("resturant", 2);
// returns: ["doc1"]
```

---

#### toWords

```typescript
toWords(input: string, isQuery?: boolean): string[]
```

Splits the input string into words respecting the `nonWordCharWhitelist` option.

Applies normalization, tokenization, stopword filtering, and custom word normalization.

**Parameters:**
- `input` - The string to tokenize
- `isQuery` - Whether this is a search query, affects processing (default: `false`)

**Returns:** Array of unique normalized words

**Example:**
```typescript
const index = new Searchable();
const words = index.toWords("Café-Restaurant in São Paulo");
// returns: ["cafe-restaurant", "in", "sao", "paulo"]
```

---

#### dump

```typescript
dump(stringify?: boolean): string | Record<string, any>
```

Exports the index internals to a JSON-serializable structure.

**Parameters:**
- `stringify` - If `true`, returns JSON string. If `false`, returns plain object (default: `true`)

**Returns:** Serialized index data as string or object

**Example:**
```typescript
const index = new Searchable();
index.add("james bond", "007");

// Save to file
const data = index.dump();
await Deno.writeTextFile("index.json", data);

// Or work with object
const obj = index.dump(false);
```

---

#### restore

```typescript
restore(dump: string | object): boolean
```

Resets and restores the internal index state from a previously dumped structure.

**Parameters:**
- `dump` - Previously dumped index data (string or object)

**Returns:** `true` if restore was successful, `false` otherwise

**Example:**
```typescript
const index = new Searchable();

// Load from file
const data = await Deno.readTextFile("index.json");
const success = index.restore(data);

if (success) {
  const results = index.search("bond");
}
```

---

#### static merge

```typescript
static merge(indexes: Searchable[]): { search: (query: string) => string[] }
```

Creates a unified search interface over multiple Searchable instances.

Results from all indexes are merged and deduplicated.

**Parameters:**
- `indexes` - Array of Searchable instances to merge

**Returns:** Object with a `search` method that queries all indexes

**Example:**
```typescript
const namesIndex = new Searchable({ defaultSearchOptions: { strategy: "prefix" } });
const contentIndex = new Searchable({ defaultSearchOptions: { strategy: "fuzzy" } });

namesIndex.add("John Lennon", "j");
contentIndex.add("Imagine all the people", "j");

const merged = Searchable.merge([namesIndex, contentIndex]);
const results = merged.search("john");
// returns: ["j"]
```

### Properties

#### wordCount

```typescript
get wordCount(): number
```

Returns the total number of unique words (including n-grams) in the index.

---

#### lastQuery

```typescript
get lastQuery(): LastQuery
```

Returns metadata about the last search query performed on this instance.

---

#### __index

```typescript
get __index(): Index
```

Access to the internal index instance (for debugging purposes).

---

## Interfaces

### SearchableOptions

Configuration options for the Searchable constructor.

```typescript
interface SearchableOptions {
  /** Should "Foo" and "foo" be distinct? (default: false) */
  caseSensitive: boolean;

  /** Should "cafe" and "café" be distinct? (default: false) */
  accentSensitive: boolean;

  /** Function to check if a word should be ignored (default: none) */
  isStopword: (word: string) => boolean;

  /** Custom normalizer for stemming, aliases, etc. Can return array (default: noop) */
  normalizeWord: (word: string) => string | string[];

  /** Which implementation: "inverted" or "trie" (default: "inverted") */
  index: "inverted" | "trie";

  /** Characters to include in words, not treat as boundaries (default: "@-") */
  nonWordCharWhitelist: string;

  /** N-gram sizes to generate, or 0 to disable (default: 0) */
  ngramsSize: 0 | 3 | 4 | 5 | (3 | 4 | 5)[];

  /** Minimum query word length required to trigger search (default: 1) */
  querySomeWordMinLength: number;

  /** Default search options */
  defaultSearchOptions: Partial<{
    strategy: "exact" | "prefix" | "fuzzy";
    maxDistance: number;
  }>;

  /** Number of queries to keep in history (default: 5) */
  lastQueryHistoryLength: number;
}
```

### LastQuery

Metadata about the last search query.

```typescript
interface LastQuery {
  /** History of "used" queries */
  history: string[];

  /** Last raw query input (even empty string) */
  raw: string | undefined;

  /** Last query truly used (after querySomeWordMinLength applied) */
  used: string | undefined;
}
```

---

## Index Implementations

Both implementations extend the abstract `Index` class and provide the same API.

### InvertedIndex

Hash map based inverted index implementation using word-to-document mapping.

**Characteristics:**
- O(1) exact word lookups
- O(n) prefix search (iterates all words)
- Better memory efficiency
- Default and recommended for most use cases

```typescript
import { InvertedIndex } from '@marianmeres/searchable';

const index = new InvertedIndex();
index.addWord("hello", "doc1");
index.searchExact("hello"); // ["doc1"]
```

### TrieIndex

Trie (prefix tree) based index implementation.

**Characteristics:**
- O(k) prefix search where k = prefix length
- Ideal for autocomplete and typeahead
- Higher memory overhead
- Recommended for prefix-heavy workloads

```typescript
import { TrieIndex } from '@marianmeres/searchable';

const index = new TrieIndex();
index.addWord("hello", "doc1");
index.addWord("help", "doc2");
index.searchByPrefix("hel"); // ["doc1", "doc2"]
```

### Index Methods (both implementations)

```typescript
// Properties
get wordCount(): number
get docIdCount(): number

// Data access
getAllWords(): string[]
getAllDocIds(): string[]

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

// Persistence
dump(): { version?: string; words: Record<string, string[]> }
restore(data: string | object): boolean
```

---

## Utility Functions

### tokenize

```typescript
tokenize(inputString: string, nonWordCharWhitelist?: string): string[]
```

Splits a string into words using Unicode-aware word boundaries.

**Parameters:**
- `inputString` - The string to tokenize
- `nonWordCharWhitelist` - Characters to treat as part of words (default: `""`)

**Example:**
```typescript
import { tokenize } from '@marianmeres/searchable';

tokenize("Hello, World!"); // ["Hello", "World"]
tokenize("user@example.com", "@"); // ["user@example.com"]
tokenize("well-known", "-"); // ["well-known"]
```

---

### normalize

```typescript
normalize(input: string, options?: { caseSensitive?: boolean; accentSensitive?: boolean }): string
```

Creates a normalized version of the input string.

**Parameters:**
- `input` - The string to normalize
- `options.caseSensitive` - If false, converts to lowercase (default: `false`)
- `options.accentSensitive` - If false, removes accents (default: `false`)

**Example:**
```typescript
import { normalize } from '@marianmeres/searchable';

normalize("  Café  "); // "cafe"
normalize("Café", { caseSensitive: true }); // "Cafe"
normalize("Café", { accentSensitive: true }); // "café"
```

---

### unaccent

```typescript
unaccent(input: string): string
```

Removes diacritical marks (accents) from a string using Unicode NFD decomposition.

**Example:**
```typescript
import { unaccent } from '@marianmeres/searchable';

unaccent("café"); // "cafe"
unaccent("São Paulo"); // "Sao Paulo"
unaccent("crème brûlée"); // "creme brulee"
```

---

### levenshteinDistance

```typescript
levenshteinDistance(source: string, target: string): number
```

Calculates the Levenshtein distance (edit distance) between two strings.

**Parameters:**
- `source` - The source string
- `target` - The target string

**Returns:** The minimum number of single-character edits needed

**Example:**
```typescript
import { levenshteinDistance } from '@marianmeres/searchable';

levenshteinDistance("cat", "hat"); // 1
levenshteinDistance("hello", "helo"); // 1
levenshteinDistance("restaurant", "resturant"); // 2
```

---

### createNgrams

```typescript
createNgrams(normalizedText: string, size?: number, options?: { padChar?: string }): string[]
```

Generates character n-grams from an input string.

**Parameters:**
- `normalizedText` - The input string (should be pre-normalized)
- `size` - The n-gram size (default: 3)
- `options.padChar` - Padding character, empty string disables padding (default: `" "`)

**Example:**
```typescript
import { createNgrams } from '@marianmeres/searchable';

createNgrams("hello", 3); // ["  h", " he", "hel", "ell", "llo", "lo ", "o  "]
createNgrams("hello", 3, { padChar: "" }); // ["hel", "ell", "llo"]
```

---

### intersect

```typescript
intersect<T>(...arrays: (readonly T[])[]): T[]
```

Returns all distinct elements that appear in every input array.

**Example:**
```typescript
import { intersect } from '@marianmeres/searchable';

const a = ["Cooking", "Music", "Hiking"];
const b = ["Music", "Tennis", "Cooking"];
intersect(a, b); // ["Cooking", "Music"]
```
