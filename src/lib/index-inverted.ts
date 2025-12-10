import { Index } from "./index-abstract.ts";
import { levenshteinDistance } from "./levenshtein.ts";

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

	/**
	 * Get the total number of unique docIds in the index.
	 */
	get docIdCount(): number {
		return this.#docIdToWords.size;
	}

	/**
	 * Get all the words in the index.
	 */
	getAllWords(): string[] {
		return [...this.#wordToDocIds.keys()];
	}

	/**
	 * Get all the docIds in the index.
	 */
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

		// Add to word -> docIds mapping
		if (!this.#wordToDocIds.has(word)) {
			this.#wordToDocIds.set(word, new Set());
		}
		const docIds = this.#wordToDocIds.get(word)!;
		const isNewEntry = !docIds.has(docId);
		docIds.add(docId);

		// Add to docId -> words mapping
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

		// Remove from word -> docIds mapping
		const docIds = this.#wordToDocIds.get(word);
		if (!docIds) return false;

		const removed = docIds.delete(docId);

		// If no more docs contain this word, remove the word entry entirely
		if (docIds.size === 0) {
			this.#wordToDocIds.delete(word);
		}

		// Remove from docId -> words mapping
		const words = this.#docIdToWords.get(docId);
		if (words) {
			words.delete(word);
			if (words.size === 0) {
				this.#docIdToWords.delete(docId);
			}
		}

		return removed;
	}

	/**
	 * Remove all entries for a given docId.
	 */
	removeDocId(docId: string): number {
		const words = this.#docIdToWords.get(docId);
		if (!words) return 0;

		const count = words.size;

		// Remove all words associated with this docId
		for (const word of words) {
			const docIds = this.#wordToDocIds.get(word)!;
			docIds.delete(docId);

			// Clean up empty word entries
			if (docIds.size === 0) {
				this.#wordToDocIds.delete(word);
			}
		}

		// Remove the docId entry
		this.#docIdToWords.delete(docId);

		return count;
	}

	/**
	 * Search for docIds containing the exact word.
	 */
	searchExact(word: string): string[] {
		const result = this.#wordToDocIds.get(word);
		return result ? [...new Set(result)] : [];
	}

	/**
	 * Search for docIds containing words with the given prefix.
	 */
	searchByPrefix(prefix: string): string[];
	searchByPrefix(
		prefix: string,
		returnWithDistance: true
	): Record<string, number>;
	searchByPrefix(
		prefix: string,
		returnWithDistance: boolean = false
	): string[] | Record<string, number> {
		const results = new Set<string>();
		const idToDistance = new Map<string, number>();

		for (const [word, docIds] of this.#wordToDocIds.entries()) {
			if (word.startsWith(prefix)) {
				const distance = levenshteinDistance(prefix, word);
				// console.log(prefix, word, distance);
				docIds.forEach((id) => {
					results.add(id);
					if (idToDistance.has(id)) {
						idToDistance.set(id, Math.min(distance, idToDistance.get(id)!));
					} else {
						idToDistance.set(id, distance);
					}
				});
			}
		}

		if (returnWithDistance) {
			return results.values().reduce((m, id) => {
				m[id] = idToDistance.get(id)!;
				return m;
			}, {} as Record<string, number>);
		}

		const sortByDistanceAsc = (a: string, b: string) =>
			idToDistance.get(a)! - idToDistance.get(b)!;

		return [...results].toSorted(sortByDistanceAsc);
	}

	/**
	 * Search for all words associated with a docIds.
	 */
	searchByDocId(docId: string): string[] {
		const words = this.#docIdToWords.get(docId);
		return words ? [...new Set(words)] : [];
	}

	/**
	 * Search for docIds containing words similar to the query using Levenshtein distance.
	 */
	searchFuzzy(word: string, maxDistance?: number): string[];
	searchFuzzy(
		word: string,
		maxDistance: number,
		returnWithDistance: true
	): Record<string, number>;
	searchFuzzy(
		word: string,
		maxDistance: number = 2,
		returnWithDistance: boolean = false
	): string[] | Record<string, number> {
		const results = new Set<string>();
		const idToDistance = new Map<string, number>();

		for (const [indexedWord, docIds] of this.#wordToDocIds.entries()) {
			const distance = levenshteinDistance(word, indexedWord);
			if (distance <= maxDistance) {
				docIds.forEach((id) => {
					results.add(id);
					if (idToDistance.has(id)) {
						idToDistance.set(id, Math.min(distance, idToDistance.get(id)!));
					} else {
						idToDistance.set(id, distance);
					}
				});
			}
		}

		if (returnWithDistance) {
			return results.values().reduce((m, id) => {
				m[id] = idToDistance.get(id)!;
				return m;
			}, {} as Record<string, number>);
		}

		const sortByDistanceAsc = (a: string, b: string) =>
			idToDistance.get(a)! - idToDistance.get(b)!;

		return [...results].toSorted(sortByDistanceAsc);
	}

	/**
	 * Dump the index to a JSON-stringifiable structure.
	 */
	dump(): {
		version?: string;
		words: Record<string, string[]>;
	} {
		// Convert the Map of Sets to a plain object with arrays
		const words: Record<string, string[]> = {};
		for (const [word, docIds] of this.#wordToDocIds.entries()) {
			words[word] = [...docIds];
		}

		return { words, version: "1.0" };
	}

	/**
	 * Clear exising internal state (if any), and restores the index from a previously
	 * dumped structure.
	 * This method rebuilds the inverted index from a structure created by the dump() method.
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

			if (!data || !data.words) {
				return false;
			}
			// Clear existing data
			this.#wordToDocIds.clear();
			this.#docIdToWords.clear();

			// Restore wordToDocIds (word -> Set of docIds)
			for (const [word, docIds] of Object.entries(data.words)) {
				this.#wordToDocIds.set(word, new Set(docIds));

				for (const docId of docIds.values()) {
					if (!this.#docIdToWords.has(docId)) {
						this.#docIdToWords.set(docId, new Set());
					}
					this.#docIdToWords.get(docId)!.add(word);
				}
			}

			return true;
		} catch (e) {
			console.error("Error restoring index", e);
			throw new Error("Error restoring index");
		}
	}
}
