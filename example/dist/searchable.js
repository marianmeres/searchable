// deno-lint-ignore-file no-explicit-any
import { intersect } from "./lib/intersect.js";
import { createNgrams, InvertedIndex, TrieIndex } from "./lib/mod.js";
import { normalize } from "./lib/normalize.js";
import { tokenize } from "./lib/tokenize.js";
/**
 * High level search API and manager of the internal search flow (input normalization,
 * tokenizing, options handling...)
 */
export class Searchable {
    #options = {
        caseSensitive: false,
        accentSensitive: false,
        isStopword: (_w) => false, // no filter by default
        normalizeWord: (word) => word, // noop by default
        index: "inverted",
        nonWordCharWhitelist: "@-",
        ngramsSize: 0,
        querySomeWordMinLength: 1,
        defaultSearchOptions: {
            strategy: "prefix",
            maxDistance: 2,
        },
    };
    #index;
    constructor(options = {}) {
        this.#options = { ...this.#options, ...(options || {}) };
        this.#index =
            this.#options.index === "inverted"
                ? new InvertedIndex()
                : new TrieIndex();
    }
    get #normalizeOptions() {
        return {
            caseSensitive: this.#options.caseSensitive,
            accentSensitive: this.#options.accentSensitive,
        };
    }
    /** Access to internal index instance */
    get __index() {
        return this.#index;
    }
    /** How many words (including n-grams!) are in the index in total */
    get wordCount() {
        return this.#index.wordCount;
    }
    #assertWordAndDocId(word, docId) {
        if (!word || typeof word !== "string") {
            throw new Error("Word must be a non-empty string");
        }
        if (!docId || typeof docId !== "string") {
            throw new Error("DocId must be a non-empty string");
        }
    }
    /** Will split the input string into words respecting the `nonWordCharWhitelist` options. */
    toWords(input, isQuery = false) {
        // 1. normalize
        input = normalize(input, this.#normalizeOptions);
        // 2. tokenize to words
        let words = tokenize(input, this.#options.nonWordCharWhitelist);
        // first round stopwords filter
        words = words.filter((w) => w && !this.#options.isStopword(w));
        // when adding to index, apply few more steps...
        if (!isQuery) {
            // normalizeWord can return array of new words
            words = words.reduce((m, word) => {
                const w = this.#options.normalizeWord(word);
                if (w && Array.isArray(w)) {
                    m = [...m, ...w];
                }
                else if (w) {
                    m.push(w);
                }
                return m;
            }, []);
            // finalize... since normalizeWordabove may have changed words, must normalize again
            words = words
                .map((w) => {
                w = normalize(w, this.#normalizeOptions);
                if (w && this.#options.isStopword(w))
                    w = "";
                return w;
            })
                .filter(Boolean);
        }
        // unique
        return Array.from(new Set(words));
    }
    /** Will add the searchable input string + docId pair to the index. */
    add(input, docId, strict = true) {
        try {
            this.#assertWordAndDocId(input, docId);
        }
        catch (e) {
            if (strict)
                throw e;
            return 0;
        }
        //
        const words = this.toWords(input, false);
        if (!words.length)
            return 0;
        let added = 0;
        for (const word of words) {
            added += Number(this.#index.addWord(word, docId));
            // should we use n-grams?
            if (this.#options.ngramsSize) {
                const ngramsSizes = Array.isArray(this.#options.ngramsSize)
                    ? this.#options.ngramsSize
                    : [this.#options.ngramsSize];
                for (const ngramsSize of ngramsSizes) {
                    if (ngramsSize > 0) {
                        const ngs = createNgrams(word, ngramsSize, {
                            padChar: "", // no padding
                        });
                        for (const ng of ngs) {
                            added += Number(this.#index.addWord(ng, docId));
                        }
                    }
                }
            }
        }
        return added;
    }
    /** Internal, low level search worker */
    #search(worker, query) {
        const { querySomeWordMinLength } = this.#options;
        query = normalize(query, this.#normalizeOptions);
        const words = this.toWords(query, true);
        if (!words.some((w) => w.length >= querySomeWordMinLength)) {
            return [];
        }
        // array of arrays of found ids for each word... we'll need to intersect for the final result
        const _foundValues = [];
        const idToDistance = new Map();
        // actual searching
        for (const word of words) {
            const idDistMapOrArray = worker(word);
            // "searchExact" return string[]
            if (Array.isArray(idDistMapOrArray)) {
                _foundValues.push(idDistMapOrArray);
            }
            // "searchByPrefix" and "searchFuzzy" return Map<string, number>
            // so we need to save the distances so we can sort the intersection later
            else {
                // hm... this is all good and working fine, the only thing is, that
                // with n-grams, it stops making sense. Ideally the n-gram match should
                // be excluded from the distance calc... but currently we can't
                // distinguish between regular word match or n-gram match
                const docIds = [];
                Object.entries(idDistMapOrArray).forEach(([id, distance]) => {
                    if (idToDistance.has(id)) {
                        idToDistance.set(id, Math.min(distance, idToDistance.get(id)));
                    }
                    else {
                        idToDistance.set(id, distance);
                    }
                    docIds.push(id);
                });
                _foundValues.push(docIds);
            }
        }
        const results = intersect(..._foundValues);
        const sortByDistanceAsc = (a, b) => idToDistance.get(a) - idToDistance.get(b);
        return results.toSorted(sortByDistanceAsc);
    }
    /** Main API. Will search the index for exact matched words from the query. */
    searchExact(query) {
        return this.#search((word) => this.#index.searchExact(word), query);
    }
    /** Main API. Will search the index for prefix matched (begins with) words from the query. */
    searchByPrefix(query) {
        return this.#search((word) => this.#index.searchByPrefix(word, true), query);
    }
    /**
     * Main API. Will search the index in a fuzzy fashion, respecting lev distance and
     * n-grams size in options. Note that high distance with multiple sized n-grams may
     * produce practically unusable and unexpected search result (too many matches).
     */
    searchFuzzy(query, maxDistance = 2) {
        return this.#search((word) => this.#index.searchFuzzy(word, maxDistance, true), query);
    }
    /** Central main API entry. */
    search(query, strategy, options) {
        strategy ??= this.#options.defaultSearchOptions.strategy ?? "prefix";
        const { maxDistance = this.#options.defaultSearchOptions.maxDistance ?? 2, } = options || {};
        if (strategy === "exact") {
            return this.searchExact(query);
        }
        if (strategy === "prefix") {
            return this.searchByPrefix(query);
        }
        if (strategy === "fuzzy") {
            return this.searchFuzzy(query, maxDistance);
        }
        throw new TypeError(`Unknown search strategy "${strategy}"`);
    }
    /** Will export the index internals as a string. */
    dump(stringify = true) {
        const dump = this.#index.dump();
        return stringify ? JSON.stringify(dump) : dump;
    }
    /** Will reset and restore the internal index state from the provided dump. */
    restore(dump) {
        return this.#index.restore(dump);
    }
    /** Will create a wrap object for multiple index instances with a search method,
     * which will proxy to search on each instance and merge the individual results */
    static merge(indexes) {
        return {
            search(query) {
                let result = new Set();
                for (const idx of indexes) {
                    const partial = idx.search(query);
                    result = result.union(new Set([...partial]));
                }
                return [...result];
            },
        };
    }
}
