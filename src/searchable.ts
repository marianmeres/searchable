// deno-lint-ignore-file no-explicit-any

import { intersect } from "./lib/intersect.ts";
import { createNgrams, InvertedIndex, TrieIndex } from "./lib/mod.ts";
import { normalize } from "./lib/normalize.ts";
import { tokenize } from "./lib/tokenize.ts";

interface ParseQueryResult {
	operators: null | Record<string, any>;
	query: string;
}

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
	/** What ngrams size(s) to use? Set 0 (or empty array) to NOT use ngrams. Default is 0 */
	ngramsSize: 0 | 3 | 4 | 5 | (3 | 4 | 5)[];
	/**  */
	querySomeWordMinLength: number;
}

/**
 * High level search API and manager of the internal search flow (input normalization,
 * tokenizing, options handling...)
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
	};

	#index: TrieIndex | InvertedIndex;

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
	get __index(): InvertedIndex | TrieIndex {
		return this.#index;
	}

	/** How many words (including ngrams!) are in the index in total */
	get wordCount(): number {
		return this.#index.wordCount;
	}

	#assertWordAndDocId(word: string, docId: string) {
		if (!word || typeof word !== "string") {
			throw new Error("Word must be a non-empty string");
		}
		if (!docId || typeof docId !== "string") {
			throw new Error("DocId must be a non-empty string");
		}
	}

	/** Will split the input string into words respecting the `nonWordCharWhitelist` options. */
	toWords(input: string): string[] {
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

		// unique
		return Array.from(new Set(words));
	}

	/** Will add the searchable input string + docId pair to the index. */
	add(input: string, docId: string): number {
		this.#assertWordAndDocId(input, docId);
		//
		const words = this.toWords(input);
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

	/** Internal, low level search worker */
	#search(
		worker: (word: string) => string[] | Record<string, number>,
		query: string
	) {
		const { querySomeWordMinLength } = this.#options;
		query = normalize(query, this.#normalizeOptions);
		const words = this.toWords(query);

		if (!words.some((w) => w.length >= querySomeWordMinLength)) {
			return [];
		}

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

	/** Main API. Will search the index for exact matched words from the query. */
	searchExact(query: string): string[] {
		return this.#search((word: string) => this.#index.searchExact(word), query);
	}

	/** Main API. Will search the index for prefix matched (begins with) words from the query. */
	searchByPrefix(query: string): string[] {
		return this.#search(
			(word: string) => this.#index.searchByPrefix(word, true),
			query
		);
	}

	/**
	 * Main API. Will search the index in a fuzzy fashion, respecting lev distance and
	 * n-grams size in options. Note that high distance with multiple sized n-grams may
	 * produce practically unusable and unexpected search result (too many matches).
	 */
	searchFuzzy(query: string, maxDistance: number = 2): string[] {
		return this.#search(
			(word: string) => this.#index.searchFuzzy(word, maxDistance, true),
			query
		);
	}

	/** Central main API entry. */
	search(
		query: string,
		strategy: "exact" | "prefix" | "fuzzy" = "prefix",
		options: Partial<{ maxDistance: number }> = {}
	): string[] {
		if (strategy === "exact") {
			return this.searchExact(query);
		}
		if (strategy === "prefix") {
			return this.searchByPrefix(query);
		}
		if (strategy === "fuzzy") {
			return this.searchFuzzy(query, options?.maxDistance ?? 2);
		}
		throw new TypeError(`Unknown search strategy "${strategy}"`);
	}

	/** Will export the index internals as a string. */
	dump(stringify = true): string | Record<string, any> {
		const dump = this.#index.dump();
		return stringify ? JSON.stringify(dump) : dump;
	}

	/** Will reset and restore the internal index state from the provided dump. */
	restore(dump: any): boolean {
		return this.#index.restore(dump);
	}
}
