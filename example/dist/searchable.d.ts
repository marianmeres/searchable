import type { Index } from "./lib/index-abstract.js";
/** Factory options */
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
    lastQueryHistoryLength: number;
}
/** Last query meta info */
export interface LastQuery {
    /** history of the "used" queries */
    history: string[];
    /** last raw query input (even empty string) */
    raw: string | undefined;
    /** last query truly used in search (value after querySomeWordMinLength applied) */
    used: string | undefined;
}
/**
 * High level search API and manager of the internal search flow (input normalization,
 * tokenizing, options handling...).
 *
 * Provides three search strategies:
 * - **exact**: Fast exact word matching
 * - **prefix**: Super fast prefix searching (catches the beginning of words)
 * - **fuzzy**: Reasonably fast fuzzy searching (handles typos using Levenshtein distance)
 *
 * @example
 * ```ts
 * import { Searchable } from '@marianmeres/searchable';
 *
 * const index = new Searchable();
 * index.add('james bond', '007');
 *
 * const results = index.search('Bond. James Bond.');
 * // returns: ['007']
 * ```
 */
export declare class Searchable {
    #private;
    /**
     * Creates a new Searchable index instance.
     *
     * @param options - Configuration options for the index
     * @param options.caseSensitive - Should "Foo" and "foo" be distinct? (default: false)
     * @param options.accentSensitive - Should "cafe" and "café" be distinct? (default: false)
     * @param options.isStopword - Function to check if a word should be ignored (default: none)
     * @param options.normalizeWord - Custom normalizer for stemming, aliases, etc. (default: noop)
     * @param options.index - Which implementation to use: "inverted" or "trie" (default: "inverted")
     * @param options.nonWordCharWhitelist - Characters to include in words (default: "@-")
     * @param options.ngramsSize - N-gram sizes to generate, or 0 to disable (default: 0)
     * @param options.querySomeWordMinLength - Skip search if all query words are shorter (default: 1)
     *
     * @example
     * ```ts
     * const index = new Searchable({
     *   caseSensitive: false,
     *   index: "inverted",
     *   ngramsSize: [3, 4],
     * });
     * ```
     */
    constructor(options?: Partial<SearchableOptions>);
    /** Access to internal index instance */
    get __index(): Index;
    /** How many words (including n-grams!) are in the index in total */
    get wordCount(): number;
    /** Will return last used query used on this instance (or undefined if none exist) */
    get lastQuery(): LastQuery;
    /**
     * Splits the input string into words respecting the `nonWordCharWhitelist` option.
     *
     * This method applies normalization, tokenization, stopword filtering, and custom
     * word normalization according to the configured options.
     *
     * @param input - The string to tokenize
     * @param isQuery - Whether this is a search query (affects processing)
     * @returns Array of unique normalized words
     *
     * @example
     * ```ts
     * const index = new Searchable();
     * const words = index.toWords("Café-Restaurant in São Paulo");
     * // returns: ["cafe", "restaurant", "in", "sao", "paulo"]
     * ```
     */
    toWords(input: string, isQuery?: boolean): string[];
    /**
     * Adds a searchable text string to the index associated with a document ID.
     *
     * The input string will be normalized, tokenized, and processed according to
     * the configured options (case sensitivity, stop words, normalizers, n-grams, etc).
     * Each unique word extracted from the input is indexed with the provided docId.
     *
     * @param input - The searchable text to index
     * @param docId - Unique identifier for the document
     * @param strict - If true, throws on invalid input. If false, silently returns 0
     * @returns Number of new word-docId pairs added to the index
     *
     * @example
     * ```ts
     * const index = new Searchable();
     * const added = index.add("james bond", "007");
     * console.log(`Added ${added} word-document pairs`);
     * ```
     *
     * @throws {Error} If input or docId is invalid and strict is true
     */
    add(input: string, docId: string, strict?: boolean): number;
    /**
     * Efficiently adds multiple documents to the index in batch.
     *
     * This is more convenient than calling add() in a loop for initial data loading.
     * Accepts either an array of [docId, text] tuples or a Record<docId, text> object.
     *
     * @param documents - Array of [docId, text] tuples or Record<docId, text>
     * @param strict - If true, stops on first error. If false, continues and collects errors
     * @returns Object with count of added entries and any errors encountered
     *
     * @example
     * ```ts
     * const index = new Searchable();
     *
     * // Array format
     * const result = index.addBatch([
     *   ["doc1", "james bond"],
     *   ["doc2", "mission impossible"],
     * ]);
     *
     * // Object format
     * index.addBatch({
     *   doc1: "james bond",
     *   doc2: "mission impossible",
     * });
     *
     * console.log(`Added ${result.added} entries`);
     * if (result.errors.length) {
     *   console.error(`Failed: ${result.errors.length} documents`);
     * }
     * ```
     */
    addBatch(documents: [string, string][] | Record<string, string>, strict?: boolean): {
        added: number;
        errors: Array<{
            docId: string;
            error: Error;
        }>;
    };
    /**
     * Searches the index for documents containing exact word matches from the query.
     *
     * This is the fastest search strategy. All query words must match exactly (after
     * normalization). Results are returned in arbitrary order.
     *
     * @param query - The search query string
     * @returns Array of docIds that match all query words exactly
     *
     * @example
     * ```ts
     * const index = new Searchable();
     * index.add("home office", "doc1");
     * index.add("office space", "doc2");
     *
     * const results = index.searchExact("office");
     * // returns: ["doc1", "doc2"]
     * ```
     */
    searchExact(query: string): string[];
    /**
     * Searches the index for documents containing words that start with the query words.
     *
     * This is the recommended strategy for autocomplete and typeahead features. Words in
     * the index that begin with any query word will match. Results are sorted by Levenshtein
     * distance (closest matches first).
     *
     * @param query - The search query string
     * @returns Array of docIds sorted by match quality (best matches first)
     *
     * @example
     * ```ts
     * const index = new Searchable();
     * index.add("restaurant", "doc1");
     * index.add("rest area", "doc2");
     *
     * const results = index.searchByPrefix("rest");
     * // returns: ["doc1", "doc2"] (or ["doc2", "doc1"] depending on distance)
     * ```
     */
    searchByPrefix(query: string): string[];
    /**
     * Searches the index using fuzzy matching based on Levenshtein distance.
     *
     * This strategy is useful for handling typos and partial matches. Words within the
     * specified edit distance will match. Results are sorted by distance (closest matches first).
     *
     * **Warning**: High maxDistance values combined with n-grams can produce too many matches
     * and unexpected results. Use with caution and test with your data.
     *
     * @param query - The search query string
     * @param maxDistance - Maximum Levenshtein distance to consider a match (default: 2)
     * @returns Array of docIds sorted by match quality (best matches first)
     *
     * @example
     * ```ts
     * const index = new Searchable();
     * index.add("restaurant", "doc1");
     *
     * // Handles typos
     * const results = index.searchFuzzy("resturant", 2);
     * // returns: ["doc1"]
     * ```
     */
    searchFuzzy(query: string, maxDistance?: number): string[];
    /**
     * Main search API entry point with configurable strategy.
     *
     * This is the recommended method for most use cases. Choose between exact, prefix,
     * or fuzzy search strategies based on your needs.
     *
     * @param query - The search query string
     * @param strategy - Search strategy to use: "exact", "prefix", or "fuzzy" (default from options)
     * @param options - Additional search options
     * @param options.maxDistance - Maximum Levenshtein distance for fuzzy search (default: 2)
     * @returns Array of docIds matching the query
     *
     * @example
     * ```ts
     * const index = new Searchable();
     * index.add("james bond", "007");
     *
     * // Use default strategy (prefix)
     * const results = index.search("bond");
     *
     * // Specify strategy explicitly
     * const exact = index.search("bond", "exact");
     * const fuzzy = index.search("bnd", "fuzzy", { maxDistance: 1 });
     * ```
     */
    search(query: string, strategy?: "exact" | "prefix" | "fuzzy", options?: Partial<{
        maxDistance: number;
    }>): string[];
    /**
     * Exports the index internals to a JSON-serializable structure.
     *
     * Use this to persist the index to disk or transfer it over the network.
     * The dumped data can be restored later using the restore() method.
     *
     * @param stringify - If true, returns JSON string. If false, returns plain object
     * @returns Serialized index data as string or object
     *
     * @example
     * ```ts
     * const index = new Searchable();
     * index.add("james bond", "007");
     *
     * // Save to file
     * const data = index.dump();
     * await Deno.writeTextFile("index.json", data);
     *
     * // Or work with object
     * const obj = index.dump(false);
     * ```
     */
    dump(stringify?: boolean): string | Record<string, any>;
    /**
     * Resets and restores the internal index state from a previously dumped structure.
     *
     * This completely replaces the current index with the provided data.
     * The dump should come from the dump() method of a compatible Searchable instance.
     *
     * @param dump - Previously dumped index data (string or object)
     * @returns True if restore was successful, false otherwise
     *
     * @example
     * ```ts
     * const index = new Searchable();
     *
     * // Load from file
     * const data = await Deno.readTextFile("index.json");
     * const success = index.restore(data);
     *
     * if (success) {
     *   const results = index.search("bond");
     * }
     * ```
     */
    restore(dump: any): boolean;
    /**
     * Creates a unified search interface over multiple Searchable instances.
     *
     * This is useful when you want to search across different indexes with different
     * configurations (e.g., one for names with prefix search, one for descriptions with fuzzy).
     * Results from all indexes are merged and deduplicated.
     *
     * @param indexes - Array of Searchable instances to merge
     * @returns Object with a search method that queries all indexes
     *
     * @example
     * ```ts
     * const namesIndex = new Searchable({ defaultSearchOptions: { strategy: "prefix" } });
     * const contentIndex = new Searchable({ defaultSearchOptions: { strategy: "fuzzy" } });
     *
     * namesIndex.add("John Lennon", "j");
     * contentIndex.add("Imagine all the people", "j");
     *
     * const merged = Searchable.merge([namesIndex, contentIndex]);
     * const results = merged.search("john");
     * // returns: ["j"]
     * ```
     */
    static merge(indexes: Searchable[]): {
        search: (query: string) => string[];
    };
}
