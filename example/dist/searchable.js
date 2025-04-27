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
    /** How many words (including ngrams!) are in the index in total */
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
    toWords(input) {
        // 1. normalize
        input = normalize(input, this.#normalizeOptions);
        // 2. tokenize to words
        let words = tokenize(input, this.#options.nonWordCharWhitelist);
        // first round stopwords filter
        words = words.filter((w) => w && !this.#options.isStopword(w));
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
        // unique
        return Array.from(new Set(words));
    }
    /** Will add the searchable input string + docId pair to the index. */
    add(input, docId) {
        this.#assertWordAndDocId(input, docId);
        //
        const words = this.toWords(input);
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
        const words = this.toWords(query);
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
    /** Alias for `searchByPrefix` for a v1 backwards compatible api. */
    search(query) {
        return this.searchByPrefix(query);
    }
    /**
     * Main API. Will search the index in a fuzzy fashion, respecting lev distance and
     * n-grams size in options. Note that high distance with multiple sized n-grams may
     * produce practically unusable and unexpected search result (too many matches).
     */
    searchFuzzy(query, maxDistance = 2) {
        return this.#search((word) => this.#index.searchFuzzy(word, maxDistance, true), query);
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
}
