import type { Index } from "./lib/index-abstract.ts";
import { intersect } from "./lib/intersect.ts";
import { createNgrams, InvertedIndex, TrieIndex } from "./lib/mod.ts";
import { normalize } from "./lib/normalize.ts";
import { tokenize } from "./lib/tokenize.ts";

interface ParseQueryResult {
	operators: null | Record<string, any>;
	query: string;
}

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
	/** Minimum length required for at least one query word to trigger search (default: 1) */
	querySomeWordMinLength: number;
	/** Default options used in `search` if none provided. */
	defaultSearchOptions: Partial<{
		strategy: "exact" | "prefix" | "fuzzy";
		maxDistance: number;
	}>;
	/** Number of query strings to keep in lastQuery.history (default: 5) */
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
export class Searchable {
	#options: SearchableOptions = {
		caseSensitive: false,
		accentSensitive: false,
		isStopword: (_w: string) => false, // no filter by default
		normalizeWord: (word: string) => word, // noop by default
		index: "inverted",
		nonWordCharWhitelist: "@-",
		ngramsSize: 0,
		querySomeWordMinLength: 1,
		defaultSearchOptions: {
			strategy: "prefix",
			maxDistance: 2,
		},
		// how many queries keep as history entries? Just a helper for UI (no direct usage)...
		lastQueryHistoryLength: 5,
	};

	#index: Index;

	// just saving some meta about last used query... may be useful in some UI cases
	// (why not do it here when it is basically for free)
	#lastQuery: LastQuery = {
		history: [],
		raw: undefined,
		used: undefined,
	};

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
	constructor(options: Partial<SearchableOptions> = {}) {
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
	get __index(): Index {
		return this.#index;
	}

	/** How many words (including n-grams!) are in the index in total */
	get wordCount(): number {
		return this.#index.wordCount;
	}

	/** Will return last used query used on this instance (or undefined if none exist) */
	get lastQuery(): LastQuery {
		return this.#lastQuery;
	}

	#assertWordAndDocId(word: string, docId: string) {
		if (!word || typeof word !== "string") {
			throw new Error("Word must be a non-empty string");
		}
		if (!docId || typeof docId !== "string") {
			throw new Error("DocId must be a non-empty string");
		}
	}

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
	toWords(input: string, isQuery: boolean = false): string[] {
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
				} else if (w) {
					m.push(w as any);
				}
				return m;
			}, [] as string[]);

			// finalize... since normalizeWordabove may have changed words, must normalize again
			words = words
				.map((w) => {
					w = normalize(w, this.#normalizeOptions);
					if (w && this.#options.isStopword(w)) w = "";
					return w;
				})
				.filter(Boolean);
		}

		// unique
		return Array.from(new Set(words));
	}

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
	add(input: string, docId: string, strict = true): number {
		try {
			this.#assertWordAndDocId(input, docId);
		} catch (e) {
			if (strict) throw e;
			return 0;
		}
		//
		const words = this.toWords(input, false);
		if (!words.length) return 0;

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
	addBatch(
		documents: [string, string][] | Record<string, string>,
		strict = false
	): { added: number; errors: Array<{ docId: string; error: Error }> } {
		const errors: Array<{ docId: string; error: Error }> = [];
		let added = 0;

		const entries = Array.isArray(documents)
			? documents
			: Object.entries(documents);

		for (const [docId, input] of entries) {
			try {
				added += this.add(input, docId, true);
			} catch (error) {
				if (strict) throw error;
				errors.push({
					docId,
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		}

		return { added, errors };
	}

	/** Internal, low level search worker */
	#search(
		worker: (word: string) => string[] | Record<string, number>,
		query: string
	) {
		const { querySomeWordMinLength, lastQueryHistoryLength } = this.#options;
		// save raw version asap
		this.#lastQuery.raw = query;

		query = normalize(query, this.#normalizeOptions);
		const words = this.toWords(query, true);

		if (!words.some((w) => w.length >= querySomeWordMinLength)) {
			return [];
		}

		// save last query meta
		this.#lastQuery.used = query;
		this.#lastQuery.history =
			lastQueryHistoryLength > 0
				? [...this.#lastQuery.history, query].slice(-1 * lastQueryHistoryLength)
				: [];

		// array of arrays of found ids for each word... we'll need to intersect for the final result
		const _foundValues: string[][] = [];
		const idToDistance = new Map<string, number>();

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
				const docIds: string[] = [];
				Object.entries(idDistMapOrArray).forEach(([id, distance]) => {
					if (idToDistance.has(id)) {
						idToDistance.set(id, Math.min(distance, idToDistance.get(id)!));
					} else {
						idToDistance.set(id, distance);
					}
					docIds.push(id);
				});
				_foundValues.push(docIds);
			}
		}

		const results = intersect(..._foundValues);

		const sortByDistanceAsc = (a: string, b: string) =>
			idToDistance.get(a)! - idToDistance.get(b)!;

		return results.toSorted(sortByDistanceAsc);
	}

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
	searchExact(query: string): string[] {
		return this.#search((word: string) => this.#index.searchExact(word), query);
	}

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
	searchByPrefix(query: string): string[] {
		return this.#search(
			(word: string) => this.#index.searchByPrefix(word, true),
			query
		);
	}

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
	searchFuzzy(query: string, maxDistance: number = 2): string[] {
		return this.#search(
			(word: string) => this.#index.searchFuzzy(word, maxDistance, true),
			query
		);
	}

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
	search(
		query: string,
		strategy?: "exact" | "prefix" | "fuzzy",
		options?: Partial<{ maxDistance: number }>
	): string[] {
		strategy ??= this.#options.defaultSearchOptions.strategy ?? "prefix";
		const {
			maxDistance = this.#options.defaultSearchOptions.maxDistance ?? 2,
		} = options || {};

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
	dump(stringify = true): string | Record<string, any> {
		const dump = this.#index.dump();
		return stringify ? JSON.stringify(dump) : dump;
	}

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
	restore(dump: any): boolean {
		return this.#index.restore(dump);
	}

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
	static merge(indexes: Searchable[]): { search: (query: string) => string[] } {
		return {
			search(query: string) {
				let result = new Set<string>();
				for (const idx of indexes) {
					const partial = idx.search(query);
					result = result.union(new Set([...partial]));
				}
				return [...result];
			},
		};
	}
}
