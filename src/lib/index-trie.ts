import { Index, type DistanceFn, type FuzzyOptions } from "./index-abstract.ts";
import { levenshteinDistance } from "./levenshtein.ts";

const defaultDistanceFn: DistanceFn = (a, b) => levenshteinDistance(a, b);

/**
 * TrieNode class represents a node in the Trie data structure.
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

	toJSON(): Record<string, any> {
		return {
			children: Object.fromEntries(this.children.entries()),
			isEOW: this.isEOW,
			docIds: [...this.docIds],
		};
	}

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

/**
 * Trie (prefix tree) based index implementation.
 *
 * Provides O(k) prefix search where k is the prefix length, making it ideal
 * for autocomplete and typeahead features. Uses a tree structure where each
 * node represents a character, with end-of-word markers storing document IDs.
 *
 * Fuzzy search traverses the trie itself with a rolling edit-distance row and
 * prunes subtrees whose row minimum exceeds `maxDistance` — substantially
 * faster than a linear scan for large vocabularies with small `maxDistance`.
 *
 * @example
 * ```ts
 * import { TrieIndex } from '@marianmeres/searchable';
 *
 * const index = new TrieIndex();
 * index.addWord("hello", "doc1");
 * index.addWord("help", "doc2");
 *
 * index.searchByPrefix("hel");
 * // returns: ["doc1", "doc2"]
 * ```
 */
export class TrieIndex extends Index {
	#root: TrieNode;

	// helper index for fast lookup by docId
	#docIdToWords: Map<string, Set<string>> = new Map();

	// unique-word counter maintained incrementally (add/remove)
	#wordCount: number = 0;

	constructor() {
		super();
		this.#root = new TrieNode();
	}

	toJSON(): Record<string, any> {
		return this.#root.toJSON().children;
	}

	/** Get the total number of unique words in the index. */
	get wordCount(): number {
		return this.#wordCount;
	}

	/** Get the total number of unique docIds in the index. */
	get docIdCount(): number {
		return this.#docIdToWords.size;
	}

	/** Get all the words in the index. */
	getAllWords(): string[] {
		return [...this.#collectAllWords().keys()];
	}

	/** Get all the docIds in the index. */
	getAllDocIds(): string[] {
		return [...this.#docIdToWords.keys()];
	}

	/** Returns true if the docId exists in the index. */
	hasDocId(docId: string): boolean {
		return this.#docIdToWords.has(docId);
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

		let currentNode = this.#root;
		for (const char of word) {
			if (!currentNode.children.has(char)) {
				currentNode.children.set(char, new TrieNode());
			}
			currentNode = currentNode.children.get(char)!;
		}

		// new unique word if this node was not EOW yet
		if (!currentNode.isEOW) this.#wordCount++;
		currentNode.isEOW = true;

		const isNewEntry = !currentNode.docIds.has(docId);
		currentNode.docIds.add(docId);

		if (!this.#docIdToWords.has(docId)) {
			this.#docIdToWords.set(docId, new Set());
		}
		this.#docIdToWords.get(docId)!.add(word);

		return isNewEntry;
	}

	/** Removes a word + docId pair from the index. */
	removeWord(word: string, docId: string): boolean {
		this.#assertWordAndDocId(word, docId);

		const result = this.#removeWordFromTrie(this.#root, [...word], 0, docId);

		if (result && this.#docIdToWords.has(docId)) {
			this.#docIdToWords.get(docId)!.delete(word);
			if (this.#docIdToWords.get(docId)!.size === 0) {
				this.#docIdToWords.delete(docId);
			}
		}

		return result;
	}

	/** Removes all entries for a given docId. */
	removeDocId(docId: string): number {
		if (!this.#docIdToWords.has(docId)) return 0;

		const words = [...this.#docIdToWords.get(docId)!];
		let removedCount = 0;

		for (const word of words) {
			if (this.#removeWordFromTrie(this.#root, [...word], 0, docId)) {
				removedCount++;
			}
		}

		this.#docIdToWords.delete(docId);
		return removedCount;
	}

	/** Search for documents containing the exact word. */
	searchExact(word: string): string[] {
		let currentNode = this.#root;
		for (const char of word) {
			if (!currentNode.children.has(char)) return [];
			currentNode = currentNode.children.get(char)!;
		}
		if (!currentNode.isEOW) return [];
		return [...currentNode.docIds];
	}

	/** Search for documents containing words with the given prefix. */
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
		for (const char of prefix) {
			if (!currentNode.children.has(char)) return [];
			currentNode = currentNode.children.get(char)!;
		}

		const idToDistance = new Map<string, number>();
		this.#collectPrefixMatches(currentNode, 0, idToDistance);

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
	 *
	 * With the default distance function, traverses the trie with a rolling
	 * edit-distance row and prunes subtrees whose row minimum exceeds `maxDistance`.
	 * With a custom `distanceFn`, falls back to a linear scan over all words
	 * (the distance function's properties are unknown to the pruner).
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
		const idToDistance = new Map<string, number>();

		if (options.distanceFn) {
			// Custom distance: can't safely prune without knowing its properties.
			const all = this.#collectAllWords();
			for (const [indexedWord, docIds] of all.entries()) {
				const distance = options.distanceFn(word, indexedWord);
				if (distance > maxDistance) continue;
				docIds.forEach((id) => {
					const prev = idToDistance.get(id);
					if (prev === undefined || distance < prev) {
						idToDistance.set(id, distance);
					}
				});
			}
		} else {
			// Trie-walked Levenshtein with row-min pruning.
			this.#fuzzyWalk(word, maxDistance, idToDistance);
		}

		if (returnWithDistance) {
			return Object.fromEntries(idToDistance.entries());
		}
		return [...idToDistance.keys()].sort(
			(a, b) => idToDistance.get(a)! - idToDistance.get(b)!
		);
	}

	/**
	 * DFS over the trie maintaining the current Levenshtein row for the query.
	 * Prunes subtrees whose row minimum exceeds `maxDistance`.
	 */
	#fuzzyWalk(
		query: string,
		maxDistance: number,
		idToDistance: Map<string, number>
	) {
		const qChars = [...query];
		const qLen = qChars.length;

		// initial row = [0, 1, 2, ..., qLen]
		const initialRow = new Array<number>(qLen + 1);
		for (let j = 0; j <= qLen; j++) initialRow[j] = j;

		const visit = (node: TrieNode, prevRow: number[]) => {
			for (const [char, child] of node.children) {
				const newRow = new Array<number>(qLen + 1);
				newRow[0] = prevRow[0] + 1;
				let rowMin = newRow[0];

				for (let j = 1; j <= qLen; j++) {
					const cost = qChars[j - 1] === char ? 0 : 1;
					newRow[j] = Math.min(
						prevRow[j] + 1,
						newRow[j - 1] + 1,
						prevRow[j - 1] + cost
					);
					if (newRow[j] < rowMin) rowMin = newRow[j];
				}

				if (child.isEOW && newRow[qLen] <= maxDistance) {
					const distance = newRow[qLen];
					child.docIds.forEach((id) => {
						const prev = idToDistance.get(id);
						if (prev === undefined || distance < prev) {
							idToDistance.set(id, distance);
						}
					});
				}

				// Prune: if every cell in this row already exceeds maxDistance,
				// no descendant can have final distance <= maxDistance.
				if (rowMin <= maxDistance) visit(child, newRow);
			}
		};

		// Root itself is never EOW in our model; just descend.
		visit(this.#root, initialRow);
	}

	/** Recursive remove helper. Operates on pre-split code-point strings so
	 * astral characters (emoji / surrogate pairs) index consistently with add. */
	#removeWordFromTrie(
		node: TrieNode,
		chars: string[],
		index: number,
		docId: string
	): boolean {
		if (index === chars.length) {
			if (!node.isEOW) return false;
			const result = node.docIds.delete(docId);
			if (node.docIds.size === 0) {
				node.isEOW = false;
				this.#wordCount--;
			}
			return result;
		}

		const char = chars[index];
		if (!node.children.has(char)) return false;

		const childNode: TrieNode = node.children.get(char)!;
		const result = this.#removeWordFromTrie(childNode, chars, index + 1, docId);

		if (childNode.children.size === 0 && !childNode.isEOW) {
			node.children.delete(char);
		}

		return result;
	}

	/** Collects docIds from every EOW node in the subtree rooted at `node`,
	 * tracking the distance from the prefix boundary. */
	#collectPrefixMatches(
		node: TrieNode,
		depthFromPrefix: number,
		idToDistance: Map<string, number>
	) {
		if (node.isEOW) {
			node.docIds.forEach((id) => {
				const prev = idToDistance.get(id);
				if (prev === undefined || depthFromPrefix < prev) {
					idToDistance.set(id, depthFromPrefix);
				}
			});
		}
		for (const child of node.children.values()) {
			this.#collectPrefixMatches(child, depthFromPrefix + 1, idToDistance);
		}
	}

	/** Helper: collect every word+docIds pair in the trie (used for dump + custom-fn fuzzy). */
	#collectAllWords(): Map<string, Set<string>> {
		const results = new Map<string, Set<string>>();
		const visit = (node: TrieNode, word: string) => {
			if (node.isEOW) results.set(word, new Set(node.docIds));
			for (const [char, child] of node.children) {
				visit(child, word + char);
			}
		};
		visit(this.#root, "");
		return results;
	}

	/** Dumps the entire index into a JSON-stringifiable structure. */
	dump(): {
		version: string;
		words: Record<string, string[]>;
	} {
		const allWords = this.#collectAllWords();
		const out: { words: Record<string, string[]>; version: string } = {
			words: {},
			version: "1.0",
		};
		for (const [word, docIds] of allWords) {
			out.words[word] = [...docIds];
		}
		return out;
	}

	/** Restores the index from a dump structure. Throws on malformed data
	 * (original error preserved via `cause`). */
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

			this.#root = new TrieNode();
			this.#docIdToWords.clear();
			this.#wordCount = 0;

			for (const [word, docIds] of Object.entries(data.words)) {
				for (const docId of docIds) {
					this.addWord(word, docId);
				}
			}

			return true;
		} catch (e) {
			throw new Error("Error restoring index", { cause: e });
		}
	}

	/** Debug helper */
	__toCharTrie(): Record<string, any> {
		const tree = {};
		this.#root.__toCharTrie(tree);
		return tree;
	}
}
