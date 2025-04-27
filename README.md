# @marianmeres/searchable

Configurable fast text search index featuring:
- (extremely fast) exact words search,
- (pretty fast) words prefix search (word begins with),
- (reasonably fast) words fuzzy search (misspelled, or parts of the word match).

Useful for fast in-memory filtering of ahead-of-time known set of documents
(autosuggestions, typeahead or similar).

With prefix and fuzzy search the results are ordered by their matched words 
closeness to the query words (using Levenshtein distance and "best naive effort").

Note that fuzzy search with short input query words and generated n-grams may produce
not so usable results.

## Real world example
See https://searchable.meres.sk/example/

## Installation
```shell
npm install @marianmeres/searchable
```

## Basic usage
```javascript
// create instance
const index = new Searchable(options);

// add a searchable string with its document ID reference
index.add('james bond', '007');

// search for it
const results = index.searchByPrefix('Bond. James Bond.');
// or searchExact
// or searchFuzzy

assert(results.length === 1);
assert(results[0] === '007');

```

## Options

```typescript

// default options
const index = new Searchable({
    // Self explanatory
    caseSensitive: false,

    // Self explanatory
    accentSensitive: false,

    // Function to check whether the word should be considered as a stopword (and so
    // effectively omitted from index and/or query).
    isStopword: (word): boolean => false,

    // Any custom normalization applied before adding to index or used for query
    // useful for e.g.: stemming, custom conversion... Can return array of words (aliases).
    normalizeWord: (word): string | string[] => word,

    // Will skip search altogether if none of the query words is longer than this limit.
    querySomeWordMinLength: 1,

    // Which underlying implementation to use. If you are not sure, use "inverted" (the default).
    // @see bench/bench.ts for more
    index: "inverted" | "trie",

    // By default, all non-word chars are considered as a word boundary. You can provide
    // your own non-word whitelist of chars which should be considered as a part of the word.
    nonWordCharWhitelist: "@-",

    // How big (if any) ngrams to generate. Use 0 to not generate ngrams (the default).
    // Reasonable value would be [3, 4]. Smaller values will increase the memory
    // footprint and not provide any practical benefit.
    ngramsSize: 0, // or array of values
});

```

