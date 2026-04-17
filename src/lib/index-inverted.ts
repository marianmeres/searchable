import { Index, type DistanceFn, type FuzzyOptions } from "./index-abstract.ts";
import { levenshteinDistance } from "./levenshtein.ts";

const defaultDistanceFn: DistanceFn = (a, b) => levenshteinDistance(a, b);

/**
 * Hash map based inverted index implementation.
 *
 * Provides O(1) exact word lookups using a word-to-document mapping. This is the
 * default and recommended index for most use cases, offering a good balance of
 * speed and memory efficiency.
 *
 * @example
 * ```ts
 * import { InvertedIndex } from '@marianmeres/searchable';
 *
 * const index = new InvertedIndex();
 * index.addWord("hello", "doc1");
 * index.addWord("hello", "doc2");
 *
 * index.searchExact("hello");
 * // returns: ["doc1", "doc2"]
 * ```
 */
export class InvertedIndex extends Index {
	// Main index: word -> Set of docIds
	#wordToDocIds: Map<string, Set<string>> = new Map();

	// Reverse index: docId -> Set of words
	#docIdToWords: Map<string, Set<string>> = new Map();

	/** Get the total number of unique words in the index. */
	get wordCount(): number {
		return this.#wordToDocIds.size;
	}

	/** Get the total number of unique docIds in the index. */
	get docIdCount(): number {
		return this.#docIdToWords.size;
	}

	/** Get all the words in the index. */
	getAllWords(): string[] {
		return [...this.#wordToDocIds.keys()];
	}

	/** Get all the docIds in the index. */
	getAllDocIds(): string[] {
		return [...this.#docIdToWords.keys()];
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
	 * Will add the provided word + docId pair to index.
	 * It is assumed the word is already normalized.
	 */
	addWord(word: string, docId: string): boolean {
		this.#assertWordAndDocId(word, docId);

		if (!this.#wordToDocIds.has(word)) {
			this.#wordToDocIds.set(word, new Set());
		}
		const docIds = this.#wordToDocIds.get(word)!;
		const isNewEntry = !docIds.has(docId);
		docIds.add(docId);

		if (!this.#docIdToWords.has(docId)) {
			this.#docIdToWords.set(docId, new Set());
		}
		this.#docIdToWords.get(docId)!.add(word);

		return isNewEntry;
	}

	/**
	 * Will remove the provided word + docId pair from index.
	 * It is assumed the word is already normalized.
	 */
	removeWord(word: string, docId: string): boolean {
		this.#assertWordAndDocId(word, docId);

		const docIds = this.#wordToDocIds.get(word);
		if (!docIds) return false;

		const removed = docIds.delete(docId);
		if (docIds.size === 0) this.#wordToDocIds.delete(word);

		const words = this.#docIdToWords.get(docId);
		if (words) {
			words.delete(word);
			if (words.size === 0) this.#docIdToWords.delete(docId);
		}

		return removed;
	}

	/** Remove all entries for a given docId. */
	removeDocId(docId: string): number {
		const words = this.#docIdToWords.get(docId);
		if (!words) return 0;
		const count = words.size;

		for (const word of words) {
			const docIds = this.#wordToDocIds.get(word)!;
			docIds.delete(docId);
			if (docIds.size === 0) this.#wordToDocIds.delete(word);
		}

		this.#docIdToWords.delete(docId);
		return count;
	}

	/** Returns true if the docId exists in the index. */
	hasDocId(docId: string): boolean {
		return this.#docIdToWords.has(docId);
	}

	/** Search for docIds containing the exact word. */
	searchExact(word: string): string[] {
		const result = this.#wordToDocIds.get(word);
		return result ? [...result] : [];
	}

	/** Search for docIds containing words with the given prefix. */
	searchByPrefix(prefix: string): string[];
	searchByPrefix(
		prefix: string,
		returnWithDistance: true
	): Record<string, number>;
	searchByPrefix(
		prefix: string,
		returnWithDistance: boolean = false
	): string[] | Record<string, number> {
		const idToDistance = new Map<string, number>();
		// For a true prefix match, levenshtein(prefix, word) == codepoint-length diff.
		const prefixLen = [...prefix].length;

		for (const [word, docIds] of this.#wordToDocIds.entries()) {
			if (!word.startsWith(prefix)) continue;
			const distance = [...word].length - prefixLen;
			docIds.forEach((id) => {
				const prev = idToDistance.get(id);
				if (prev === undefined || distance < prev) {
					idToDistance.set(id, distance);
				}
			});
		}

		if (returnWithDistance) {
			return Object.fromEntries(idToDistance.entries());
		}
		return [...idToDistance.keys()].sort(
			(a, b) => idToDistance.get(a)! - idToDistance.get(b)!
		);
	}

	/** Search for all words associated with a docId. */
	searchByDocId(docId: string): string[] {
		const words = this.#docIdToWords.get(docId);
		return words ? [...words] : [];
	}

	/**
	 * Search for docIds containing words similar to the query.
	 * Uses Levenshtein distance by default; pass `distanceFn` to customize.
	 */
	searchFuzzy(word: string, maxDistance?: number): string[];
	searchFuzzy(
		word: string,
		maxDistance: number,
		returnWithDistance: true
	): Record<string, number>;
	searchFuzzy(
		word: string,
		maxDistance: number,
		returnWithDistance: boolean,
		options: FuzzyOptions
	): string[] | Record<string, number>;
	searchFuzzy(
		word: string,
		maxDistance: number = 2,
		returnWithDistance: boolean = false,
		options: FuzzyOptions = {}
	): string[] | Record<string, number> {
		const distanceFn = options.distanceFn ?? defaultDistanceFn;
		const queryLen = [...word].length;
		const idToDistance = new Map<string, number>();

		for (const [indexedWord, docIds] of this.#wordToDocIds.entries()) {
			// Cheap length pre-filter (Levenshtein distance >= |len(a) - len(b)|).
			// Only valid for distance functions that satisfy this (the default does).
			if (
				!options.distanceFn &&
				Math.abs([...indexedWord].length - queryLen) > maxDistance
			) {
				continue;
			}

			const distance = distanceFn(word, indexedWord);
			if (distance > maxDistance) continue;

			docIds.forEach((id) => {
				const prev = idToDistance.get(id);
				if (prev === undefined || distance < prev) {
					idToDistance.set(id, distance);
				}
			});
		}

		if (returnWithDistance) {
			return Object.fromEntries(idToDistance.entries());
		}
		return [...idToDistance.keys()].sort(
			(a, b) => idToDistance.get(a)! - idToDistance.get(b)!
		);
	}

	/** Dump the index to a JSON-stringifiable structure. */
	dump(): {
		version: string;
		words: Record<string, string[]>;
	} {
		const words: Record<string, string[]> = {};
		for (const [word, docIds] of this.#wordToDocIds.entries()) {
			words[word] = [...docIds];
		}
		return { words, version: "1.0" };
	}

	/**
	 * Clears existing state and restores the index from a dump produced by `dump()`.
	 * Returns `true` on success or `false` if the input has no `words` field.
	 * Throws `Error` (with `cause` set to the underlying error) on JSON / structural failure.
	 */
	restore(
		data: string | { version?: string; words: Record<string, string[]> }
	): boolean {
		try {
			if (typeof data === "string") {
				data = JSON.parse(data) as {
					version?: string;
					words: Record<string, string[]>;
				};
			}

			if (!data || typeof data !== "object" || !data.words) {
				return false;
			}

			if (data.version !== undefined && data.version !== "1.0") {
				throw new Error(
					`Unsupported dump version "${data.version}" (expected "1.0")`
				);
			}

			this.#wordToDocIds.clear();
			this.#docIdToWords.clear();

			for (const [word, docIds] of Object.entries(data.words)) {
				this.#wordToDocIds.set(word, new Set(docIds));
				for (const docId of docIds) {
					if (!this.#docIdToWords.has(docId)) {
						this.#docIdToWords.set(docId, new Set());
					}
					this.#docIdToWords.get(docId)!.add(word);
				}
			}

			return true;
		} catch (e) {
			throw new Error("Error restoring index", { cause: e });
		}
	}
}
