// deno-lint-ignore-file no-explicit-any

import { Index } from "./index-abstract.ts";
import { levenshteinDistance } from "./levenshtein.ts";

/**
 * TrieNode class represents a node in the Trie data structure
 */
class TrieNode {
	constructor(
		/** Map of character to TrieNode */
		public children: Map<string, TrieNode> = new Map<string, TrieNode>(),
		/** Flag if this char represents end of word */
		public isEOW: boolean = false,
		/** Set of docIds associated with this word */
		public docIds: Set<string> = new Set<string>()
	) {}

	// for debug
	toJSON(): Record<string, any> {
		return {
			children: Object.fromEntries(this.children.entries()),
			isEOW: this.isEOW,
			docIds: [...this.docIds],
		};
	}

	/** Debug helper */
	__toCharTrie(
		_tree: Record<string, any> = {},
		_node?: TrieNode
	): Record<string, any> {
		_node ??= this;
		_node?.children?.entries().forEach(([char, node]) => {
			_tree[char] ??= {};
			this.__toCharTrie(_tree[char], node);
		});
		return _tree;
	}
}

/** Inverted index manager */
export class TrieIndex extends Index {
	#root: TrieNode;

	// helper index for fast lookup by docId
	#docIdToWords: Map<string, Set<string>> = new Map();

	constructor() {
		super();
		this.#root = new TrieNode();
	}

	toJSON(): Record<string, any> {
		return this.#root.toJSON().children;
	}

	/** Get the total number of unique words in the index. */
	get wordCount(): number {
		// return this.#collectAllWords().size;
		// this should be cheaper/faster I would guess
		const words = new Set();
		this.#docIdToWords.values().forEach((_words) => {
			_words.forEach((w) => words.add(w));
		});
		return words.size;
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
		return [...this.#collectAllWords().keys()];
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

		// Add word to the trie
		let currentNode = this.#root;
		for (const char of word) {
			if (!currentNode.children.has(char)) {
				currentNode.children.set(char, new TrieNode());
			}
			currentNode = currentNode.children.get(char)!;
		}

		// Mark as end of word and add docId
		currentNode.isEOW = true;
		const isNewEntry = !currentNode.docIds.has(docId);
		currentNode.docIds.add(docId);

		// Update document-word mapping
		if (!this.#docIdToWords.has(docId)) {
			this.#docIdToWords.set(docId, new Set());
		}
		this.#docIdToWords.get(docId)!.add(word);

		return isNewEntry;
	}

	/**
	 * Removes a word and associated docId from the index
	 */
	removeWord(word: string, docId: string): boolean {
		this.#assertWordAndDocId(word, docId);

		const result = this.#removeWordFromTrie(this.#root, word, 0, docId);

		// Update document-word mapping
		if (result && this.#docIdToWords.has(docId)) {
			this.#docIdToWords.get(docId)!.delete(word);
			// Remove document from map if it has no more words
			if (this.#docIdToWords.get(docId)!.size === 0) {
				this.#docIdToWords.delete(docId);
			}
		}

		return result;
	}

	/**
	 * Removes all entries for a given docId
	 */
	removeDocId(docId: string): number {
		if (!this.#docIdToWords.has(docId)) {
			return 0;
		}

		const words = [...this.#docIdToWords.get(docId)!];
		let removedCount = 0;

		for (const word of words) {
			if (this.#removeWordFromTrie(this.#root, word, 0, docId)) {
				removedCount++;
			}
		}

		this.#docIdToWords.delete(docId);
		return removedCount;
	}

	/**
	 * Search for documents containing the exact word.
	 */
	searchExact(word: string): string[] {
		// const result = this.#wordToDocIds.get(word);
		// return result ? [...new Set(result)] : [];

		let currentNode = this.#root;
		for (const char of word) {
			if (!currentNode.children.has(char)) {
				return []; // Word not found
			}
			currentNode = currentNode.children.get(char)!;
		}

		if (!currentNode.isEOW) {
			return []; // Word not found
		}

		return [...new Set(currentNode.docIds)];
	}

	/**
	 * Search for documents containing words with the given prefix.
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
		let currentNode = this.#root;
		const resultsMap = new Map<string, Set<string>>();
		const results = new Set<string>();
		const idToDistance = new Map<string, number>();

		// Traverse to the node representing the prefix
		for (const char of prefix) {
			if (!currentNode.children.has(char)) {
				return []; // Prefix not found
			}
			currentNode = currentNode.children.get(char)!;
		}

		this.#collectWords(currentNode, prefix, resultsMap);

		resultsMap.entries().forEach(([word, docIds]) => {
			docIds.forEach((id) => {
				results.add(id);
				const distance = levenshteinDistance(prefix, word);
				// console.log(prefix, word, distance);
				if (idToDistance.has(id)) {
					idToDistance.set(id, Math.min(distance, idToDistance.get(id)!));
				} else {
					idToDistance.set(id, distance);
				}
			});
		});

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
	 * Search for all words associated with a docId.
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
		const all = this.#collectAllWords();

		for (const [indexedWord, docIds] of all.entries()) {
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
	 * Helper method to recursively remove a word from the trie
	 */
	#removeWordFromTrie(
		node: TrieNode,
		word: string,
		index: number,
		docId: string
	): boolean {
		// console.log("#removeWordFromTrie", word, index, char);

		// Base case: we've reached the end of the word
		if (index === word.length) {
			if (!node.isEOW) {
				return false; // Word not found
			}

			// Remove docId from this node
			const result = node.docIds.delete(docId);

			// If no more docIds are associated with this word, mark it as not end of word
			if (node.docIds.size === 0) {
				node.isEOW = false;
			}

			return result;
		}

		const char = word[index];
		if (!node.children.has(char)) {
			return false; // Word not found
		}

		const childNode: TrieNode = node.children.get(char)!;
		const result = this.#removeWordFromTrie(childNode, word, index + 1, docId);

		// Clean up nodes with no children and no docIds
		if (childNode.children.size === 0 && !childNode.isEOW) {
			node.children.delete(char);
		}

		return result;
	}

	/** Internal helper */
	#collectWords(
		node: TrieNode,
		currentWord: string,
		results: Map<string, Set<string>> = new Map()
	): void {
		if (node.isEOW) {
			results.set(currentWord, new Set(node.docIds));
		}

		for (const [char, childNode] of node.children.entries()) {
			this.#collectWords(childNode, currentWord + char, results);
		}
	}

	/**
	 * Helper method to collect all words with associated docIds in the trie
	 */
	#collectAllWords(): Map<string, Set<string>> {
		const results = new Map<string, Set<string>>();
		this.#collectWords(this.#root, "", results);
		return results;
	}

	/**
	 * Dumps the entire index into a JSON stringifiable structure
	 */
	dump(): {
		version?: string;
		words: Record<string, string[]>;
	} {
		const allWords = this.#collectAllWords();
		const out: { words: Record<string, string[]>; version?: string } = {
			words: {},
			version: "1.0",
		};

		// Convert each word's docIds Set to an array for serialization
		for (const [word, docIds] of allWords) {
			out.words[word] = [...docIds];
		}

		return out;
	}

	/**
	 * Restores the index from a dump structure
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
			this.#root = new TrieNode();
			this.#docIdToWords.clear();

			// Restore wordToDocIds (word -> Set of docIds)
			for (const [word, docIds] of Object.entries(data.words)) {
				for (const docId of docIds) {
					this.addWord(word, docId);
				}
			}

			return true;
		} catch (e) {
			console.error("Error restoring index", e);
			throw new Error("Error restoring index");
		}
	}

	/** Debug helper */
	__toCharTrie(): Record<string, any> {
		const tree = {};
		this.#root.__toCharTrie(tree);
		return tree;
	}
}
