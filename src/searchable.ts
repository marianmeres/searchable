import {
	type DistanceFn,
	type FuzzyOptions,
	type Index,
} from "./lib/index-abstract.ts";
import { intersect } from "./lib/intersect.ts";
import { createNgrams, InvertedIndex, TrieIndex } from "./lib/mod.ts";
import { normalize } from "./lib/normalize.ts";
import { tokenize } from "./lib/tokenize.ts";

/** Factory options */
export interface SearchableOptions {
	/** Should be case sensitive? (Default false) */
	caseSensitive: boolean;
	/** Should be accent sensitive? (Default false) */
	accentSensitive: boolean;
	/** Function to determine whether to ignore the provided word (and not use it in the index).*/
	isStopword: (word: string) => boolean;
	/** Arbitrary word normalizer applied to each tokenized word.
	 *
	 * Applied at BOTH index and query time (since v2.5.0 — prior versions applied
	 * it at index time only, which silently broke stemmer / alias setups).
	 *
	 * Return a single string for 1:1 transforms (stemmer, lemmatizer, case/locale fold).
	 * Return an array to expand one input word into multiple alternates (aliases,
	 * business-term synonyms). At query time, expansions are OR'd within the group
	 * (any alternate matches), while groups are AND'd across the full query. */
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
		limit: number;
		offset: number;
		distanceFn: DistanceFn;
	}>;
	/** Number of query strings to keep in lastQuery.history (default: 5) */
	lastQueryHistoryLength: number;
}

/** Last query meta info */
export interface LastQuery {
	/** history of the "used" queries (post-normalization; `rawHistory` has the raw input) */
	history: string[];
	/** raw user input for each entry in `history` (same order, same length) */
	rawHistory: string[];
	/** last raw query input (even empty string) */
	raw: string | undefined;
	/** last query truly used in search (value after querySomeWordMinLength applied) */
	used: string | undefined;
}

/** Options accepted by `search` (and the strategy-specific variants that take options). */
export interface SearchOptions {
	/** Maximum Levenshtein distance for fuzzy search (default: 2). */
	maxDistance?: number;
	/** Return at most this many results. */
	limit?: number;
	/** Skip the first N results (applied before `limit`). */
	offset?: number;
	/** Override the distance function (default: Levenshtein). */
	distanceFn?: DistanceFn;
}

/** Return shape of `Searchable.explainQuery`. Useful for debugging search behavior. */
export interface QueryExplanation {
	raw: string;
	normalized: string;
	tokens: string[];
	afterStopwords: string[];
	/** Groups of query terms after `normalizeWord` expansion. OR within a group, AND across. */
	groups: string[][];
	/** True when the query would actually invoke the index (post `querySomeWordMinLength`). */
	wouldSearch: boolean;
}

/** Shape returned by `Searchable.merge`. */
export interface MergedSearchable {
	search: (query: string, options?: SearchOptions) => string[];
	searchExact: (query: string, options?: SearchOptions) => string[];
	searchByPrefix: (query: string, options?: SearchOptions) => string[];
	searchFuzzy: (
		query: string,
		maxDistance?: number,
		options?: SearchOptions
	) => string[];
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
		isStopword: (_w: string) => false,
		normalizeWord: (word: string) => word,
		index: "inverted",
		nonWordCharWhitelist: "@-",
		ngramsSize: 0,
		querySomeWordMinLength: 1,
		defaultSearchOptions: {
			strategy: "prefix",
			maxDistance: 2,
		},
		lastQueryHistoryLength: 5,
	};

	#index: Index;

	#lastQuery: LastQuery = {
		history: [],
		rawHistory: [],
		raw: undefined,
		used: undefined,
	};

	/**
	 * Creates a new Searchable index instance.
	 *
	 * @param options - Configuration options for the index (see {@link SearchableOptions})
	 */
	constructor(options: Partial<SearchableOptions> = {}) {
		this.#options = {
			...this.#options,
			...(options || {}),
			// nested object: defensive copy so external mutation doesn't leak in
			defaultSearchOptions: {
				...this.#options.defaultSearchOptions,
				...(options?.defaultSearchOptions ?? {}),
			},
		};

		this.#index =
			this.#options.index === "inverted"
				? new InvertedIndex()
				: new TrieIndex();
	}

	/**
	 * Create a Searchable from a previously-produced dump. The dump format is
	 * index-agnostic, so you may pick a different `index` implementation at
	 * restore time (e.g. migrate inverted ↔ trie).
	 */
	static fromDump(
		dump: any,
		options: Partial<SearchableOptions> = {}
	): Searchable {
		const idx = new Searchable(options);
		idx.restore(dump);
		return idx;
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

	/** Number of unique docIds in the index. */
	get docIdCount(): number {
		return this.#index.docIdCount;
	}

	/** Returns a shallow copy of the last-query meta (safe to inspect / store). */
	get lastQuery(): LastQuery {
		return {
			history: [...this.#lastQuery.history],
			rawHistory: [...this.#lastQuery.rawHistory],
			raw: this.#lastQuery.raw,
			used: this.#lastQuery.used,
		};
	}

	/** Returns true if the docId exists in the index. */
	hasDocId(docId: string): boolean {
		return this.#index.hasDocId(docId);
	}

	#assertInputAndDocId(input: string, docId: string) {
		if (!input || typeof input !== "string") {
			throw new Error("Input must be a non-empty string");
		}
		if (!docId || typeof docId !== "string") {
			throw new Error("DocId must be a non-empty string");
		}
	}

	/**
	 * Splits the input string into words.
	 *
	 * Applies normalization, tokenization, stopword filtering, and (when `isQuery`
	 * is false) the custom `normalizeWord`.
	 *
	 * **Note on `isQuery=true`:** this method returns a flat de-duplicated list,
	 * which is a lossy view for queries whose `normalizeWord` returns arrays
	 * (alias / synonym expansion). For query pipelines, prefer
	 * {@link Searchable.toQueryGroups} which preserves the per-term groups used by
	 * `#search` to produce correct OR-within-AND-across semantics.
	 */
	toWords(input: string, isQuery: boolean = false): string[] {
		input = normalize(input, this.#normalizeOptions);
		let words = tokenize(input, this.#options.nonWordCharWhitelist);
		words = words.filter((w) => w && !this.#options.isStopword(w));

		const expand = (w: string): string[] => {
			const out = this.#options.normalizeWord(w);
			return Array.isArray(out) ? out.filter(Boolean) : out ? [out] : [];
		};

		if (isQuery) {
			// Preserve historical public shape (flat list) but DO apply normalizeWord.
			// This fixes the prior bug where stemmer/alias normalizers never ran at
			// query time; callers needing group-awareness should use toQueryGroups.
			const out: string[] = [];
			for (const w of words) {
				for (const variant of expand(w)) {
					const n = normalize(variant, this.#normalizeOptions);
					if (n && !this.#options.isStopword(n)) out.push(n);
				}
			}
			return [...new Set(out)];
		}

		// indexing path
		const expanded: string[] = [];
		for (const w of words) expanded.push(...expand(w));
		const finalized = expanded
			.map((w) => normalize(w, this.#normalizeOptions))
			.filter((w) => w && !this.#options.isStopword(w));
		return [...new Set(finalized)];
	}

	/**
	 * Splits the input query into groups of alternate terms. Each group maps to
	 * one original tokenized term + its `normalizeWord` expansion. Search
	 * semantics are **OR within a group, AND across groups**.
	 *
	 * @example
	 * ```ts
	 * // normalizeWord: colour → ["colour", "color"]
	 * index.toQueryGroups("big colour test");
	 * // [ ["big"], ["colour", "color"], ["test"] ]
	 * ```
	 */
	toQueryGroups(input: string): string[][] {
		const norm = normalize(input, this.#normalizeOptions);
		const tokens = tokenize(norm, this.#options.nonWordCharWhitelist).filter(
			(w) => w && !this.#options.isStopword(w)
		);

		const groups: string[][] = [];
		for (const token of tokens) {
			const expanded = this.#options.normalizeWord(token);
			const variants = Array.isArray(expanded)
				? expanded.filter(Boolean)
				: expanded
					? [expanded]
					: [];
			const finalized = variants
				.map((w) => normalize(w, this.#normalizeOptions))
				.filter((w) => w && !this.#options.isStopword(w));
			const group = [...new Set(finalized)];
			if (group.length) groups.push(group);
		}
		return groups;
	}

	/**
	 * Adds a searchable text string to the index associated with a document ID.
	 *
	 * @param input - The searchable text to index
	 * @param docId - Unique identifier for the document
	 * @param strict - If true, throws on invalid input. If false, silently returns 0
	 * @returns Number of new word-docId pairs added to the index
	 *
	 * @throws {Error} If input or docId is invalid and strict is true
	 */
	add(input: string, docId: string, strict = true): number {
		try {
			this.#assertInputAndDocId(input, docId);
		} catch (e) {
			if (strict) throw e;
			return 0;
		}

		const words = this.toWords(input, false);
		if (!words.length) return 0;

		let added = 0;
		for (const word of words) {
			added += Number(this.#index.addWord(word, docId));

			if (this.#options.ngramsSize) {
				const ngramsSizes = Array.isArray(this.#options.ngramsSize)
					? this.#options.ngramsSize
					: [this.#options.ngramsSize];
				for (const ngramsSize of ngramsSizes) {
					if (ngramsSize > 0) {
						const ngs = createNgrams(word, ngramsSize, { padChar: "" });
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
	 * Replaces all indexed content for a docId with the new input.
	 * Equivalent to `removeDocId(docId)` then `add(input, docId)` — safer since
	 * it guarantees old words are cleared even when the caller forgets.
	 *
	 * @returns Number of new word-docId pairs added after the replacement
	 */
	replace(docId: string, input: string, strict = true): number {
		this.#index.removeDocId(docId);
		return this.add(input, docId, strict);
	}

	/** Remove all indexed content for the given docId. */
	removeDocId(docId: string): number {
		return this.#index.removeDocId(docId);
	}

	/**
	 * Efficiently adds multiple documents to the index in batch.
	 *
	 * @param documents - Array of [docId, text] tuples or Record<docId, text>
	 * @param strict - If true, stops on first error. If false, continues and collects errors
	 * @returns Object with count of added entries and any errors encountered
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

	/** Internal worker signature — either an array of ids, or a distance-keyed map. */
	#runSearch(
		worker: (word: string) => string[] | Record<string, number>,
		query: string
	): string[] {
		const { querySomeWordMinLength, lastQueryHistoryLength } = this.#options;

		// save raw first (pre-normalization)
		const rawInput = query;
		this.#lastQuery.raw = rawInput;

		const groups = this.toQueryGroups(query);
		const normalizedQuery = normalize(query, this.#normalizeOptions);

		if (
			!groups.some((g) =>
				g.some((w) => w.length >= querySomeWordMinLength)
			)
		) {
			return [];
		}

		this.#lastQuery.used = normalizedQuery;
		if (lastQueryHistoryLength > 0) {
			this.#lastQuery.history = [
				...this.#lastQuery.history,
				normalizedQuery,
			].slice(-lastQueryHistoryLength);
			this.#lastQuery.rawHistory = [
				...this.#lastQuery.rawHistory,
				rawInput,
			].slice(-lastQueryHistoryLength);
		} else {
			this.#lastQuery.history = [];
			this.#lastQuery.rawHistory = [];
		}

		// Per-group: union results of every variant (OR within group).
		// Across groups: intersect (AND across).
		const perGroupIds: string[][] = [];
		const idToDistance = new Map<string, number>();

		for (const group of groups) {
			const unioned = new Set<string>();
			for (const variant of group) {
				const res = worker(variant);
				if (Array.isArray(res)) {
					for (const id of res) unioned.add(id);
				} else {
					for (const [id, distance] of Object.entries(res)) {
						unioned.add(id);
						const prev = idToDistance.get(id);
						if (prev === undefined || distance < prev) {
							idToDistance.set(id, distance);
						}
					}
				}
			}
			perGroupIds.push([...unioned]);
		}

		const results = intersect(...perGroupIds);

		// Sort by best distance we observed (min across all matching variants).
		// Exact search has no distances; those ids stay in insertion order.
		return results.sort((a, b) => {
			const da = idToDistance.get(a);
			const db = idToDistance.get(b);
			if (da === undefined && db === undefined) return 0;
			if (da === undefined) return 1;
			if (db === undefined) return -1;
			return da - db;
		});
	}

	#applyWindow(ids: string[], options?: SearchOptions): string[] {
		const offset = Math.max(0, options?.offset ?? 0);
		const limit = options?.limit;
		if (!offset && (limit === undefined || limit < 0)) return ids;
		const end = limit === undefined ? undefined : offset + Math.max(0, limit);
		return ids.slice(offset, end);
	}

	/** Searches the index for documents containing exact word matches. */
	searchExact(query: string, options?: SearchOptions): string[] {
		const ids = this.#runSearch(
			(word) => this.#index.searchExact(word),
			query
		);
		return this.#applyWindow(ids, options);
	}

	/**
	 * Searches the index for words that start with any query word.
	 * Results are sorted by Levenshtein distance (closest first).
	 */
	searchByPrefix(query: string, options?: SearchOptions): string[] {
		const ids = this.#runSearch(
			(word) => this.#index.searchByPrefix(word, true),
			query
		);
		return this.#applyWindow(ids, options);
	}

	/**
	 * Searches the index using fuzzy matching based on Levenshtein distance.
	 *
	 * Accepts `options.distanceFn` to replace the default Levenshtein with any
	 * custom distance function (e.g. Damerau-Levenshtein, Jaro-Winkler, phonetic).
	 *
	 * @param query - The search query string
	 * @param maxDistance - Maximum distance to consider a match (default: 2)
	 * @param options - Optional pagination / distance-function overrides
	 */
	searchFuzzy(
		query: string,
		maxDistance: number = 2,
		options?: SearchOptions
	): string[] {
		const fuzzyOpts: FuzzyOptions | undefined =
			options?.distanceFn ? { distanceFn: options.distanceFn } : undefined;

		const ids = this.#runSearch(
			(word) =>
				fuzzyOpts
					? this.#index.searchFuzzy(word, maxDistance, true, fuzzyOpts)
					: this.#index.searchFuzzy(word, maxDistance, true),
			query
		);
		return this.#applyWindow(ids, options);
	}

	/** Main search API — picks a strategy then runs it. */
	search(
		query: string,
		strategy?: "exact" | "prefix" | "fuzzy",
		options?: SearchOptions
	): string[] {
		strategy ??= this.#options.defaultSearchOptions.strategy ?? "prefix";
		const maxDistance =
			options?.maxDistance ??
			this.#options.defaultSearchOptions.maxDistance ??
			2;
		const distanceFn =
			options?.distanceFn ?? this.#options.defaultSearchOptions.distanceFn;

		const effective: SearchOptions = {
			maxDistance,
			limit: options?.limit ?? this.#options.defaultSearchOptions.limit,
			offset: options?.offset ?? this.#options.defaultSearchOptions.offset,
			distanceFn,
		};

		if (strategy === "exact") return this.searchExact(query, effective);
		if (strategy === "prefix") return this.searchByPrefix(query, effective);
		if (strategy === "fuzzy") {
			return this.searchFuzzy(query, maxDistance, effective);
		}
		throw new TypeError(`Unknown search strategy "${strategy}"`);
	}

	/**
	 * Returns a step-by-step view of what the query pipeline produces — useful
	 * for debugging "why didn't this match?" scenarios.
	 */
	explainQuery(query: string): QueryExplanation {
		const raw = query;
		const normalized = normalize(query, this.#normalizeOptions);
		const tokens = tokenize(normalized, this.#options.nonWordCharWhitelist);
		const afterStopwords = tokens.filter(
			(w) => w && !this.#options.isStopword(w)
		);
		const groups = this.toQueryGroups(query);
		const wouldSearch = groups.some((g) =>
			g.some((w) => w.length >= this.#options.querySomeWordMinLength)
		);
		return { raw, normalized, tokens, afterStopwords, groups, wouldSearch };
	}

	/**
	 * Exports the index to a JSON-serializable structure. Pair with
	 * {@link Searchable.fromDump} to hydrate back into a Searchable.
	 */
	dump(stringify = true): string | Record<string, any> {
		const dump = this.#index.dump();
		return stringify ? JSON.stringify(dump) : dump;
	}

	/** Resets and restores the internal index state from a previous `dump`. */
	restore(dump: any): boolean {
		return this.#index.restore(dump);
	}

	/**
	 * Creates a unified search interface over multiple Searchable instances.
	 *
	 * Results are the deduplicated union of each instance's matches. Strategy
	 * and options (when provided) are forwarded to every child; when not provided,
	 * each child uses its own configured defaults.
	 */
	static merge(indexes: Searchable[]): MergedSearchable {
		const union = (getter: (idx: Searchable) => string[]): string[] => {
			const out = new Set<string>();
			for (const idx of indexes) for (const id of getter(idx)) out.add(id);
			return [...out];
		};
		return {
			search(query, options) {
				return union((idx) => idx.search(query, undefined, options));
			},
			searchExact(query, options) {
				return union((idx) => idx.searchExact(query, options));
			},
			searchByPrefix(query, options) {
				return union((idx) => idx.searchByPrefix(query, options));
			},
			searchFuzzy(query, maxDistance, options) {
				return union((idx) => idx.searchFuzzy(query, maxDistance, options));
			},
		};
	}
}
