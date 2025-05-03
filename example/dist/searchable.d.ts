import type { Index } from "./lib/index-abstract.js";
export interface SearchableOptions {
    /** Should be case sensitive? (Default false)*/
    caseSensitive: boolean;
    /** Should be accent sensitive? (Default false) */
    accentSensitive: boolean;
    /** Function to determine whether ignore the provided word (and not use it in the index).*/
    isStopword: (word: string) => boolean;
    /** Arbitrary word normalizer used just before adding to the index.
     * Eg for stemmer, lemmatizer, spell check, aliases, business variants... */
    normalizeWord: (word: string) => string | string[];
    /** Which underlying index implementation to use? Default "inverted" */
    index: "inverted" | "trie";
    /** List of non-word characters which WILL be considered as part of the word.
     * And thus will not be used as a word boundary for the word tokenizer.
     * Default "@-", that means "at" and "-" are considered as part of the word.*/
    nonWordCharWhitelist: string;
    /** What n-grams size(s) to use? Set 0 (or empty array) to NOT use n-grams. Default is 0 */
    ngramsSize: 0 | 3 | 4 | 5 | (3 | 4 | 5)[];
    /**  */
    querySomeWordMinLength: number;
    /** Default options used in `search` if none provided. */
    defaultSearchOptions: Partial<{
        strategy: "exact" | "prefix" | "fuzzy";
        maxDistance: number;
    }>;
}
/**
 * High level search API and manager of the internal search flow (input normalization,
 * tokenizing, options handling...)
 */
export declare class Searchable {
    #private;
    constructor(options?: Partial<SearchableOptions>);
    /** Access to internal index instance */
    get __index(): Index;
    /** How many words (including n-grams!) are in the index in total */
    get wordCount(): number;
    /** Will split the input string into words respecting the `nonWordCharWhitelist` options. */
    toWords(input: string, isQuery?: boolean): string[];
    /** Will add the searchable input string + docId pair to the index. */
    add(input: string, docId: string, strict?: boolean): number;
    /** Main API. Will search the index for exact matched words from the query. */
    searchExact(query: string): string[];
    /** Main API. Will search the index for prefix matched (begins with) words from the query. */
    searchByPrefix(query: string): string[];
    /**
     * Main API. Will search the index in a fuzzy fashion, respecting lev distance and
     * n-grams size in options. Note that high distance with multiple sized n-grams may
     * produce practically unusable and unexpected search result (too many matches).
     */
    searchFuzzy(query: string, maxDistance?: number): string[];
    /** Central main API entry. */
    search(query: string, strategy?: "exact" | "prefix" | "fuzzy", options?: Partial<{
        maxDistance: number;
    }>): string[];
    /** Will export the index internals as a string. */
    dump(stringify?: boolean): string | Record<string, any>;
    /** Will reset and restore the internal index state from the provided dump. */
    restore(dump: any): boolean;
    /** Will create a wrap object for multiple index instances with a search method,
     * which will proxy to search on each instance and merge the individual results */
    static merge(indexes: Searchable[]): {
        search: (query: string) => string[];
    };
}
