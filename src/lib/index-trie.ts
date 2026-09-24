import { Index, type DistanceFn, type FuzzyOptions } from "./index-abstract.ts";
import { levenshteinDistance } from "./levenshtein.ts";

const defaultDistanceFn: DistanceFn = (a, b) => levenshteinDistance(a, b);

/**
 * Default end-of-word sentinel key used by {@link TrieIndex.toCharTrie} when
 * `terminalMarker: true`.
 *
 * It is two `$` code points. This is safe as a sentinel because real trie edge
 * keys are *always* exactly one code point, so any key of length >= 2 can never
 * collide with a real edge.
 */
export const DEFAULT_TERMINAL_MARKER = "$$";

/** Options for {@link TrieIndex.toCharTrie}. */
export interface CharTrieOptions {
	/**
	 * Emit an end-of-word terminal marker at word-final nodes so consumers can
	 * distinguish a complete word from a mere prefix (e.g. the word `"bar"` from
	 * the prefix shared with `"barn"`).
	 *
	 * - `false` (default): char-only projection, byte-identical to the legacy
	 *   {@link TrieIndex.__toCharTrie} output.
	 * - `true`: use the default {@link DEFAULT_TERMINAL_MARKER} (`"$$"`).
	 * - `string`: use a custom sentinel key. Must be at least 2 code points long
	 *   (real edges are single code points, so a >= 2-char key can never collide
	 *   with one). A shorter sentinel throws.
	 */
	terminalMarker?: boolean | string;
}

/**
 * Resolves the {@link CharTrieOptions.terminalMarker} option to a concrete
 * sentinel string, or `null` when no marker should be emitted.
 *
 * @throws {Error} If a custom sentinel shorter than 2 code points is given.
 */
function resolveTerminalMarker(
	marker: CharTrieOptions["terminalMarker"]
): string | null {
	if (!marker) return null;
	const sentinel = marker === true ? DEFAULT_TERMINAL_MARKER : marker;
	// Count code points (not UTF-16 units): a single emoji is one code point and
	// could legitimately be a real edge, so it must be rejected as a sentinel.
	if ([...sentinel].length < 2) {
		throw new Error(
			`Invalid terminalMarker ${JSON.stringify(sentinel)}: must be at ` +
				`least 2 code points long, since real trie edges are single code ` +
				`points and a shorter key could collide with one.`
		);
	}
	return sentinel;
}

/**
 * TrieNode class represents a node in the Trie data structure.
 *
 * Both collections are allocated lazily: most nodes are not word ends (no
 * docIds), leaves have no children, and even an empty `Map`/`Set` costs ~100
 * bytes. Allocating on demand cuts heap per indexed character by roughly 40%.
 */
class TrieNode {
	/** Map of character to TrieNode. `null` for a leaf, never an empty Map. */
	children: Map<string, TrieNode> | null = null;
	/** Flag if this char represents end of word */
	isEOW: boolean = false;
	/** DocIds associated with this word. Non-null exactly when `isEOW`. */
	docIds: Set<string> | null = null;

	toJSON(): Record<string, any> {
		return {
			children: this.children ? Object.fromEntries(this.children) : {},
			isEOW: this.isEOW,
			docIds: this.docIds ? [...this.docIds] : [],
		};
	}

	/**
	 * Projects this node's subtree into a nested plain object keyed by single
	 * code points. When `marker` is non-null, the sentinel key is written at
	 * word-final nodes so consumers can tell a complete word from a prefix.
	 *
	 * Iterative (explicit stack), so the nesting depth is bounded by memory, not
	 * by the call stack. Each object still gets its keys in the same order as a
	 * recursive walk would add them (marker first, then children in insertion
	 * order), so the result serializes byte-identically.
	 */
	toCharTrie(marker: string | null): Record<string, any> {
		const out: Record<string, any> = {};
		// Parallel stacks: `trees[i]` is the object that `nodes[i]` projects into.
		const nodes: TrieNode[] = [this];
		const trees: Record<string, any>[] = [out];
		while (nodes.length) {
			const node = nodes.pop()!;
			const tree = trees.pop()!;
			if (marker && node.isEOW) tree[marker] = true;
			if (!node.children) continue;
			for (const [char, child] of node.children) {
				nodes.push(child);
				trees.push((tree[char] ??= {}));
			}
		}
		return out;
	}
}

/**
 * Records `distance` for each of `docIds`, keeping the minimum per docId.
 * Insertion order of `idToDistance` is first-discovery order, which callers
 * rely on as the tie-break when sorting by distance.
 */
function recordMinDistance(
	idToDistance: Map<string, number>,
	docIds: Set<string>,
	distance: number
) {
	docIds.forEach((id) => {
		const prev = idToDistance.get(id);
		if (prev === undefined || distance < prev) {
			idToDistance.set(id, distance);
		}
	});
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

	/**
	 * Debug view of the raw node structure. It nests two levels per character,
	 * so for a very long word `JSON.stringify(index)` is bounded by the engine's
	 * recursive serializer (V8 leaves its iterative fast path once a `toJSON` is
	 * involved). Use the flat {@link TrieIndex.dump} for persistence.
	 */
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
			const children = (currentNode.children ??= new Map());
			let child = children.get(char);
			if (!child) {
				child = new TrieNode();
				children.set(char, child);
			}
			currentNode = child;
		}

		// new unique word if this node was not EOW yet
		if (!currentNode.isEOW) this.#wordCount++;
		currentNode.isEOW = true;

		const docIds = (currentNode.docIds ??= new Set());
		const isNewEntry = !docIds.has(docId);
		docIds.add(docId);

		if (!this.#docIdToWords.has(docId)) {
			this.#docIdToWords.set(docId, new Set());
		}
		this.#docIdToWords.get(docId)!.add(word);

		return isNewEntry;
	}

	/** Removes a word + docId pair from the index. */
	removeWord(word: string, docId: string): boolean {
		this.#assertWordAndDocId(word, docId);

		const result = this.#removeWordFromTrie(word, docId);

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
			if (this.#removeWordFromTrie(word, docId)) {
				removedCount++;
			}
		}

		this.#docIdToWords.delete(docId);
		return removedCount;
	}

	/** Search for documents containing the exact word. */
	searchExact(word: string): string[] {
		const node = this.#findNode(word);
		return node?.isEOW ? [...node.docIds!] : [];
	}

	/** Walks the edges spelled by `path` from the root; `undefined` if absent. */
	#findNode(path: string): TrieNode | undefined {
		let currentNode: TrieNode | undefined = this.#root;
		for (const char of path) {
			currentNode = currentNode.children?.get(char);
			if (!currentNode) return undefined;
		}
		return currentNode;
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
		const node = this.#findNode(prefix);
		if (!node) return [];

		const idToDistance = new Map<string, number>();
		this.#collectPrefixMatches(node, idToDistance);

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
				recordMinDistance(idToDistance, docIds, distance);
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

	// All trie walks below are iterative. Recursion depth would equal the length
	// of the longest indexed word, so a single long token (a base64 blob, a URL
	// without separators) would overflow the call stack. The pre-order walks keep
	// a stack of `Map` iterators, one per level, which visits nodes in exactly the
	// order a recursive walk does (a node, then its children in insertion order).
	// That order is observable: it is `getAllWords()`/`dump()` order and the
	// tie-break between equal distances in search results.

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

		// Root itself is never EOW in our model; just descend.
		if (!this.#root.children) return;

		// Parallel stacks: `rows[i]` is the row of the node whose children
		// `iters[i]` is iterating.
		const iters = [this.#root.children.entries()];
		const rows = [initialRow];

		while (iters.length) {
			const next = iters[iters.length - 1].next();
			if (next.done) {
				iters.pop();
				rows.pop();
				continue;
			}
			const [char, child] = next.value;
			const prevRow = rows[rows.length - 1];

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
				recordMinDistance(idToDistance, child.docIds!, newRow[qLen]);
			}

			// Prune: if every cell in this row already exceeds maxDistance,
			// no descendant can have final distance <= maxDistance.
			if (rowMin <= maxDistance && child.children) {
				iters.push(child.children.entries());
				rows.push(newRow);
			}
		}
	}

	/**
	 * Removes `docId` from `word`'s end-of-word node, then prunes nodes left
	 * with no children and no EOW flag, bottom-up along the walked path.
	 * Iterates code points, so astral characters (emoji / surrogate pairs)
	 * index consistently with add.
	 */
	#removeWordFromTrie(word: string, docId: string): boolean {
		// `nodes[i]` is the node at depth i; `chars[i]` is the edge into nodes[i + 1].
		const nodes: TrieNode[] = [this.#root];
		const chars: string[] = [];
		let reachedEnd = true;
		for (const char of word) {
			const child = nodes[nodes.length - 1].children?.get(char);
			if (!child) {
				reachedEnd = false;
				break;
			}
			chars.push(char);
			nodes.push(child);
		}

		let result = false;
		const node = nodes[nodes.length - 1];
		if (reachedEnd && node.isEOW) {
			result = node.docIds!.delete(docId);
			if (node.docIds!.size === 0) {
				node.isEOW = false;
				node.docIds = null;
				this.#wordCount--;
			}
		}

		// Once a node is kept, every ancestor still has at least that child.
		for (let i = nodes.length - 1; i > 0; i--) {
			if (nodes[i].children || nodes[i].isEOW) break;
			const parent = nodes[i - 1];
			parent.children!.delete(chars[i - 1]);
			if (!parent.children!.size) parent.children = null;
		}

		return result;
	}

	/** Collects docIds from every EOW node in the subtree rooted at `start`,
	 * tracking the distance from the prefix boundary. */
	#collectPrefixMatches(start: TrieNode, idToDistance: Map<string, number>) {
		if (start.isEOW) recordMinDistance(idToDistance, start.docIds!, 0);
		if (!start.children) return;

		const stack = [start.children.values()];
		while (stack.length) {
			const next = stack[stack.length - 1].next();
			if (next.done) {
				stack.pop();
				continue;
			}
			const child = next.value;
			// the stack holds one iterator per level, so its size is the depth
			if (child.isEOW) {
				recordMinDistance(idToDistance, child.docIds!, stack.length);
			}
			if (child.children) stack.push(child.children.values());
		}
	}

	/** Helper: collect every word+docIds pair in the trie (used for dump + custom-fn fuzzy). */
	#collectAllWords(): Map<string, Set<string>> {
		const results = new Map<string, Set<string>>();
		if (!this.#root.children) return results;

		// Parallel stacks: `words[i]` is the word spelled by the node whose
		// children `iters[i]` is iterating. Leaves push nothing.
		const iters = [this.#root.children.entries()];
		const words = [""];
		while (iters.length) {
			const next = iters[iters.length - 1].next();
			if (next.done) {
				iters.pop();
				words.pop();
				continue;
			}
			const [char, child] = next.value;
			const word = words[words.length - 1] + char;
			if (child.isEOW) results.set(word, new Set(child.docIds));
			if (child.children) {
				iters.push(child.children.entries());
				words.push(word);
			}
		}
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

	/**
	 * Projects the trie into a plain nested object suitable for serialization
	 * (e.g. a Postgres JSONB column), where each key is a single code point and
	 * its value is the child sub-object. Leaves are empty objects.
	 *
	 * By default the projection is char-only and therefore cannot distinguish a
	 * complete word from a mere prefix (e.g. whether `"bar"` is itself an indexed
	 * word, or only the shared prefix of `"barn"`). Pass `terminalMarker` to emit
	 * an end-of-word sentinel key at word-final nodes:
	 *
	 * @example
	 * ```ts
	 * const idx = new TrieIndex();
	 * idx.addWord("bar", "1");
	 * idx.addWord("barn", "2");
	 *
	 * idx.toCharTrie();
	 * // { b: { a: { r: { n: {} } } } }
	 * //   ^ is "bar" an indexed word, or just a prefix of "barn"? Ambiguous.
	 *
	 * idx.toCharTrie({ terminalMarker: true });
	 * // { b: { a: { r: { "$$": true, n: { "$$": true } } } } }
	 * //                  ^ "bar" is a word    ^ "barn" is a word
	 * ```
	 *
	 * The sentinel is collision-proof: real trie edges are always exactly one
	 * code point, so a sentinel of length >= 2 can never be mistaken for an edge.
	 *
	 * @param options.terminalMarker - `false` (default) for char-only output;
	 *   `true` for the default `"$$"` sentinel; or a custom sentinel string of at
	 *   least 2 code points. A shorter custom sentinel throws.
	 */
	toCharTrie(options: CharTrieOptions = {}): Record<string, any> {
		const marker = resolveTerminalMarker(options.terminalMarker);
		return this.#root.toCharTrie(marker);
	}

	/**
	 * @deprecated Use {@link TrieIndex.toCharTrie} instead. Retained as a
	 * byte-compatible alias for the char-only projection (no terminal marker).
	 */
	__toCharTrie(): Record<string, any> {
		return this.toCharTrie();
	}
}
