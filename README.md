# @marianmeres/searchable

A simple **"any word from set that exactly begins with"**
in-memory [trie](https://en.wikipedia.org/wiki/Trie) based search index.
No built-in rankings or sorting. Query words order agnostic.

Useful for fast in-memory filtering of ahead-of-time known set of objects
(autosuggestions, typeahead or similar).

## Real world example
See http://searchable.meres.sk/example/ ([source](./example/)) for more real-world
like example.

## Installation
```shell
npm install @marianmeres/searchable
```

## Basic usage
```javascript
// create instance
const index = new Searchable();

// add any value to index with provided searchable label
const license = { to: 'kill' };
index.add('james bond', license);
index.add('007', license);
// index.add(...) ...

// search for it
let results = index.search('bond james bond');
assert(results.length === 1);
assert(results[0] === license);

results = index.search('007 bond');
assert(results.length === 1);
assert(results[0] === license);
```

The index doesn't care of the values stored in it. It can be anything. But, for cases where:

- you need to index large result set,
- or you have equal but not same instance objects

it might be a good idea to save ids only, which you will need to map to your values manualy.
See below.

```javascript
const map = { 1: 'peter pan', 2: 'mickey mouse', 3: 'shrek' };

const index = new Searchable();

// add only ids to the index
Object.entries(map).forEach(([id, label]) => index.add(label, id));

// map results back to values
assert('shrek' === index.search('shr').map((id) => map[id])[0]);
```

## Options

(Terminology: a search **query** or an **indexable label** are split into **words**
before processing).

```typescript

// default options
const index = new Searchable({
    // if false (default), both input and search query will be lower-cased
    // if true, both input and search query will be kept case-untouched
    caseSensitive: false,

    // if false (default), both input and search query will be un-accented
    // if true, both input and search query will be kept accent-untouched
    accentSensitive: false,

    // function to check whether the word should be considered as a stopword (and so
    // effectivelly omitted from index and/or query)
    isStopword: (word): boolean => false,

    // any custom normalization applied before adding to index or used for query
    // usefull for e.g.: stemming, spellcheck, now-word chars removal, custom conversion...
    normalizeWord: (word): string => word,

    // any custom logic applied to query before being used for search
    // should return `{ query, operators }` shape, where:
    // - `query` will be used for index.search(query)
    // - `operators` (might be null) will be passed to final `processResults` filtering
    parseQuery: (query): ParseQueryResult => ({ query, operators: null }),

    // applied as a last step on found results. Use for:
    // sorting, custom operators filtering, ...
    processResults: (results, parseQueryResults: ParseQueryResult): any[] => results,

    // will skip search altogether if none of the query words is longer than this limit
    querySomeWordMinLength: 1,
});

```

## Advanced usage example

Word normalization example

```javascript
const index = new Searchable({
    // will be applied to both label in the index and the query
    normalizeWord: (w) => {
        const sports = { basketball: 'sport', football: 'sport' };
        return sports[w] || w;
    }
});

index.add('basketball', true);
index.add('football', true);

assert(index.search('sport')[0]);
```

Accent sensitivity example

```javascript
const accented = 'Příliš žluťoučký kůň úpěl ďábelské ódy';

// accent insensitive (default)
let index = new Searchable();
index.add(accented, true);
assert(index.search('kůň')[0]);
assert(index.search('kun')[0]);

// accent sensitive
index = new Searchable({ accentSensitive: true });
index.add(accented, true);
assert(index.search('kůň')[0]);
assert(!index.search('kun')[0]);
```

