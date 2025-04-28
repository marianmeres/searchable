# @marianmeres/searchable

Customizable fast text search index featuring:
- Extremely fast "exact" word matching
- Super fast word "prefix" searching (catches the beginning of words)
- Reasonably fast "fuzzy" searching (handles typos and partial matches)

Great for quickly filtering through documents you already have in memory 
(like for autocomplete suggestions or typeahead features).

When you use prefix or fuzzy search, results get ranked by how close they match your 
search terms (using Levenshtein distance).

## Extremely, Super, Reasonably... How fast is it really?

Here's the [bench script](bench/bench.ts), tested on a movie database with approx ~2500 
records, with tens of thousands of words in total. The same data are used in 
the [real world example](https://searchable.meres.sk/example/) where you can test it by yourself.

Long story short (tested on M2 chip): 
- the exact search executes often under 1 millisecond (!),
- the prefix search executes within few milliseconds,
- and the fuzzy executes within few tens of milliseconds.

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

    // How big (if any) n-grams to generate. Use 0 to not generate n-grams (the default).
    // Reasonable value would be [3, 4]. Smaller values will increase the memory
    // footprint and not provide any practical benefit.
    ngramsSize: 0, // or array of values
});

```

