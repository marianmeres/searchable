# @marianmeres/searchable

Configurable fast text search index with support of:
- exact words match,
- words prefix match,
- words fuzzy match.

Useful for fast in-memory filtering of ahead-of-time known set of documents
(autosuggestions, typeahead or similar).

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

// add any a searchable string with document ID
index.add('james bond', '007');

// search for it
let results = index.searchByPrefix('Bond. James Bond.');
// or searchExact
// or searchFuzzy

assert(results.length === 1);
assert(results[0] === '007');

```

## Options

```typescript

// default options
const index = new Searchable({
    // self explanatory
    caseSensitive: false,

    // self explanatory
    accentSensitive: false,

    // function to check whether the word should be considered as a stopword (and so
    // effectively omitted from index and/or query)
    isStopword: (word): boolean => false,

    // any custom normalization applied before adding to index or used for query
    // useful for e.g.: stemming, spellcheck, custom conversion...
    // can return array of words (e.g. aliases)
    normalizeWord: (word): string | string[] => word,

    // will skip search altogether if none of the query words is longer than this limit
    querySomeWordMinLength: 1,

    // which underlying implementation to use... If you are not sure, use "inverted" (the default)
    // @see bench/bench.ts for more
    index: "inverted" | "trie",

    // By default, all non-word chars are considered as a word boundary. You can provide
    // your own non-word whitelist of chars which should be considered as a part of the word.
    nonWordCharWhitelist: "@-",

    // how big (if any) ngrams to use. Used for typos. Use 0 to disable.
    ngramsSize: 0, // or array of values
});

```
