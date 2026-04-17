# @marianmeres/searchable

[![NPM version](https://img.shields.io/npm/v/@marianmeres/searchable.svg)](https://www.npmjs.com/package/@marianmeres/searchable)
[![JSR version](https://jsr.io/badges/@marianmeres/searchable)](https://jsr.io/@marianmeres/searchable)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Customizable fast text search index featuring:
- Extremely fast "exact" word matching
- Super fast word "prefix" searching (catches the beginning of words)
- Reasonably fast "fuzzy" searching (handles typos and partial matches)

Great for quickly filtering through documents you already have in memory
(like for autocomplete suggestions or typeahead features).

When you use prefix or fuzzy search, results get ranked by how close they match your
search terms (using Levenshtein distance by default; pluggable since v2.5.0).

> **Upgrading from 2.4.x?** See [BC.md](BC.md) for behavior changes in 2.5.0.
> The short version: query-side `normalizeWord`, extended unaccent,
> Unicode-safe distance, and a ~20× faster trie fuzzy.

## Extremely, Super, Reasonably... How fast is it really?

Here's the [bench script](bench/bench.ts), tested on a movie database with approx ~2500
records, with tens of thousands of words in total. The same data is used in
the [real world example](https://searchable.meres.sk/example/) where you can test it by yourself.

Rough numbers on an M2 (Deno 2.7.x):
- exact: ~150 µs per query
- prefix: ~800 µs (trie) / ~2 ms (inverted)
- fuzzy: ~3.4 ms (trie) / ~23 ms (inverted)

That's fast enough.

## Choosing the right search strategy: Exact, Prefix, or Fuzzy?

Your optimal search strategy depends on several factors:

- Document volume (smaller collections often benefit from exact matching)
- Document characteristics (technical terminology vs. conversational language)
- Query length (shorter terms typically require more precision)
- Use case sensitivity (financial identifiers vs. content descriptions)
- Search interaction model (real-time typeahead vs. deliberate search submissions)

The decision is rarely straightforward. Consider implementing a hybrid approach that
combines multiple strategies for optimal results. Be careful with the fuzzy search approach.

## Know your Fuzzy

Be aware that the fuzzy search might give you unexpected results.
Effecting factors are **query words count**, **query words length** and their
**similarity** to potential matches.

Since v2.5.0 you can replace Levenshtein with any distance function per call:

```ts
import { levenshteinDistance } from '@marianmeres/searchable';

// Damerau-Levenshtein recognises transpositions (teh ↔ the) as 1 edit.
const damerau = (a, b) => levenshteinDistance(a, b, { damerau: true });
index.search('recieve', 'fuzzy', { maxDistance: 1, distanceFn: damerau });
```

## Real world example
See https://searchable.meres.sk/example/

## Installation
```sh
deno add jsr:@marianmeres/searchable
```
```sh
npm install @marianmeres/searchable
```

## Basic usage
```js
import { Searchable } from '@marianmeres/searchable';
```
```js
// create instance
const index = new Searchable(options);

// add a searchable string with its document ID reference
index.add('james bond', '007');

// search for it
const results = index.search(
    'Bond. James Bond.',
    // you can provide a desired strategy ("prefix" by default)
    'exact' | 'prefix' | 'fuzzy',
    // optional: pagination + custom distance function
    { limit: 10, offset: 0, maxDistance: 2 }
);

assert(results.length === 1);
assert(results[0] === '007');
```

### Batch add, update, remove
```ts
index.addBatch({ d1: 'alpha', d2: 'beta' });
index.replace('d1', 'alpha updated');   // atomic "remove old + add new"
index.removeDocId('d2');
index.hasDocId('d1');                    // => true
```

### Persist + restore
```ts
const dump = index.dump();                                    // string
const restored = Searchable.fromDump(dump, { index: 'trie' }); // can switch index type
```

### Debug the pipeline
```ts
index.explainQuery('The Hello World!');
// {
//   raw: 'The Hello World!',
//   normalized: 'the hello world!',
//   tokens: ['the', 'hello', 'world'],
//   afterStopwords: [...],
//   groups: [...],      // OR within a group, AND across
//   wouldSearch: true,
// }
```

For complete API documentation including all methods and utility functions, see [API.md](API.md).

## Options

```typescript
// default options
const index = new Searchable({
    // Should "Foo" and "foo" be considered as distinct words? (default false)
    caseSensitive: false,

    // Should "cafe" and "café" be considered as distinct words? (default false)
    // Beyond combining marks, also folds ß→ss, ø→o, æ→ae, œ→oe, đ→d, ł→l, þ→th, ð→d...
    accentSensitive: false,

    // Function to check whether a word should be considered a stopword (omitted
    // from index and query).
    isStopword: (word) => false,

    // Custom normalization applied to each tokenized word at BOTH index and query time
    // (since v2.5.0 — prior versions skipped queries, which silently broke stemmers).
    // Return a string for 1:1 (stemmer, lemmatizer), or an array for aliases /
    // synonym expansion. Arrays are OR'd within the group, AND'd across groups.
    normalizeWord: (word) => word,

    // Will skip search altogether if none of the query words is longer than this limit.
    querySomeWordMinLength: 1,

    // Which underlying implementation to use. Since v2.5.0 "trie" is typically the
    // better default thanks to trie-walked fuzzy search; "inverted" remains a fine
    // choice for small indexes or easier debugging.
    index: "inverted" | "trie",

    // By default, all non-word chars are considered as a word boundary. You can provide
    // your own non-word whitelist of chars which should be considered as a part of the word.
    nonWordCharWhitelist: "@-",

    // How big (if any) n-grams to generate. Use 0 to not generate n-grams (the default).
    // Reasonable value would be [3, 4]. Smaller values will increase the memory
    // footprint and not provide any practical benefit.
    ngramsSize: 0, // or array of values

    // Defaults applied by `search()` when the caller doesn't specify.
    defaultSearchOptions: {
        strategy: 'prefix',
        maxDistance: 2,
        // limit, offset, distanceFn also supported here
    },

    // How many query strings to keep in `lastQuery.history` / `.rawHistory` (default 5).
    lastQueryHistoryLength: 5,
});
```

## Choosing Between Inverted and Trie Index

Both implementations provide the same API, but have different performance characteristics.

### Inverted Index (default)
```typescript
const index = new Searchable({ index: "inverted" });
```

- **Pros:** faster exact searches (direct hash lookup), simpler to debug,
  lower memory overhead for most use cases.
- **Cons:** prefix and fuzzy iterate all indexed words.
- **Use when:** you have < 100k unique words, or fuzzy search is rare.

### Trie Index
```typescript
const index = new Searchable({ index: "trie" });
```

- **Pros:** O(k) prefix descent (k = prefix length); fuzzy search walks the
  trie with a rolling Levenshtein row and prunes whole subtrees —
  substantially faster than a linear scan once you have a real vocabulary.
- **Cons:** higher memory footprint (node objects + pointers); exact search
  slightly slower (traversal vs. hash map).
- **Use when:** prefix or fuzzy is your primary path; or you have a large vocabulary.

### Recommendation
For typical mixed workloads since v2.5.0, **trie** is usually the better pick.
Inverted remains a sensible default for small indexes and is simpler to reason
about. Either way, run the [bench script](bench/bench.ts) against your own data
if you care about the last few percent.

## Breaking changes

Full list of behavior shifts per version lives in [BC.md](BC.md).
