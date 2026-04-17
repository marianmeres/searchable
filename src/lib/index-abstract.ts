/** A function computing the "distance" between two strings (lower = more similar). */
export type DistanceFn = (a: string, b: string) => number;

/** Options for fuzzy search on a concrete index. */
export interface FuzzyOptions {
	/** Override the distance function. Defaults to Levenshtein. */
	distanceFn?: DistanceFn;
}

/**
 * Abstract base class defining the index interface.
 *
 * Concrete implementations (InvertedIndex, TrieIndex) must implement all abstract
 * methods to provide word-to-document indexing and various search strategies.
 */
export abstract class Index {
	/** Get the total number of unique words in the index. */
	abstract get wordCount(): number;

	/** Get the total number of unique docIds in the index. */
	abstract get docIdCount(): number;

	/** Get all the words in the index. */
	abstract getAllWords(): string[];

	/** Get all the docIds in the index. */
	abstract getAllDocIds(): string[];

	/** Returns true if the docId exists in the index. */
	abstract hasDocId(docId: string): boolean;

	/** Will add the provided word + docId pair to index.
	 * It is assumed the word is already normalized. */
	abstract addWord(word: string, docId: string): boolean;

	/** Removes a word and associated docId from the index */
	abstract removeWord(word: string, docId: string): boolean;

	/** Removes all entries for a given docId */
	abstract removeDocId(docId: string): number;

	/** Search for documents containing the exact word. */
	abstract searchExact(word: string): string[];

	/** Search for documents containing words with the given prefix. */
	abstract searchByPrefix(prefix: string): string[];
	abstract searchByPrefix(
		prefix: string,
		returnWithDistance: true
	): Record<string, number>;

	/** Search for docIds containing words similar to the query using a distance function. */
	abstract searchFuzzy(word: string, maxDistance?: number): string[];
	abstract searchFuzzy(
		word: string,
		maxDistance: number,
		returnWithDistance: true
	): Record<string, number>;
	abstract searchFuzzy(
		word: string,
		maxDistance: number,
		returnWithDistance: boolean,
		options: FuzzyOptions
	): string[] | Record<string, number>;

	/** Search for all words associated with a docId. */
	abstract searchByDocId(docId: string): string[];

	/** Dumps the entire index into a JSON stringifiable structure */
	abstract dump(): { version: string; words: Record<string, string[]> };

	/** Restores the index from a dump structure */
	abstract restore(
		data: string | { version?: string; words: Record<string, string[]> }
	): boolean;
}
