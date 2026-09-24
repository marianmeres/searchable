import { assert, assertEquals } from "@std/assert";
import { DEFAULT_TERMINAL_MARKER, TrieIndex } from "../src/lib/index-trie.ts";
import { levenshteinDistance } from "../src/lib/levenshtein.ts";
import { Searchable } from "../src/searchable.ts";

// The trie walks used to recurse once per character, so a single word of
// ~7 000 chars overflowed the call stack. 100 000 is far past any default limit.
const LONG = 100_000;

Deno.test("trie - a 100 000-char word goes through every method", () => {
	const long = "d".repeat(LONG);
	const branch = "d".repeat(LONG / 2) + "x";
	const idx = new TrieIndex();
	idx.addWord(long, "1");
	idx.addWord(branch, "2");
	idx.addWord("dd", "3");

	assertEquals(idx.wordCount, 3);
	// pre-order: "dd" is an ancestor of both; "long" was inserted before "branch"
	assertEquals(idx.getAllWords(), ["dd", long, branch]);
	assertEquals(idx.searchExact(long), ["1"]);

	const distances = { 1: LONG - 1, 2: LONG / 2, 3: 1 };
	assertEquals(idx.searchByPrefix("d"), ["3", "2", "1"]);
	assertEquals(idx.searchByPrefix("d", true), distances);

	// a huge maxDistance keeps every row in bounds, so the walk goes all the way down
	assertEquals(idx.searchFuzzy("d", LONG), ["3", "2", "1"]);
	assertEquals(idx.searchFuzzy("d", LONG, true), distances);
	const byLength = (_: string, b: string) => (b.length === LONG ? 0 : 9);
	assertEquals(idx.searchFuzzy("d", 0, false, { distanceFn: byLength }), ["1"]);

	const restored = new TrieIndex();
	assert(restored.restore(JSON.stringify(idx.dump())));
	assertEquals(restored.getAllWords(), idx.getAllWords());

	let node = idx.toCharTrie({ terminalMarker: true });
	let depth = 0;
	while (node.d) {
		node = node.d;
		depth++;
	}
	assertEquals(depth, LONG);
	assertEquals(node, { [DEFAULT_TERMINAL_MARKER]: true });

	// removal prunes each chain back to the shared prefix, leaving nothing behind
	assert(idx.removeWord(long, "1"));
	assertEquals(idx.getAllWords(), ["dd", branch]);
	assertEquals(idx.removeDocId("2"), 1);
	assertEquals(idx.wordCount, 1);
	assertEquals(
		JSON.stringify(idx),
		JSON.stringify({
			d: {
				children: { d: { children: {}, isEOW: true, docIds: ["3"] } },
				isEOW: false,
				docIds: [],
			},
		})
	);
});

Deno.test("searchable (trie) - a 100 000-char token", () => {
	const long = "d".repeat(LONG);
	const s = new Searchable({ index: "trie" });
	s.add(`hello ${long} world`, "1");

	assert(s.__index.getAllWords().includes(long));
	assertEquals(s.search("dd", "prefix"), ["1"]);
	assertEquals(s.search("helo", "fuzzy"), ["1"]);
	assertEquals(Searchable.fromDump(s.dump(), { index: "trie" }).search("dd"), ["1"]);

	s.replace("1", "short");
	assertEquals(s.__index.getAllWords(), ["short"]);
});

// Recursive reference model of the order contract the iterative walks keep:
// pre-order (a node, then its children in insertion order), and removal prunes
// emptied branches, so a re-added branch moves to the end of its parent.
// `getAllWords()` order and the tie-break between equal distances derive from it.
type RefNode = { kids: Map<string, RefNode>; ids: Set<string> };
const refNode = (): RefNode => ({ kids: new Map(), ids: new Set() });

function refAdd(root: RefNode, word: string, id: string) {
	let node = root;
	for (const char of word) {
		if (!node.kids.has(char)) node.kids.set(char, refNode());
		node = node.kids.get(char)!;
	}
	node.ids.add(id);
}

function refRemove(node: RefNode, chars: string[], id: string, i = 0) {
	if (i === chars.length) return void node.ids.delete(id);
	const kid = node.kids.get(chars[i]);
	if (!kid) return;
	refRemove(kid, chars, id, i + 1);
	if (!kid.kids.size && !kid.ids.size) node.kids.delete(chars[i]);
}

function refWalk(node: RefNode, word: string, fn: (word: string, n: RefNode) => void) {
	if (node.ids.size) fn(word, node);
	for (const [char, kid] of node.kids) refWalk(kid, word + char, fn);
}

function sortedByMin(visit: (record: (ids: Set<string>, d: number) => void) => void) {
	const min = new Map<string, number>();
	visit((ids, d) => ids.forEach((id) => min.set(id, Math.min(d, min.get(id) ?? d))));
	return [...min.keys()].sort((a, b) => min.get(a)! - min.get(b)!);
}

// mulberry32 — deterministic, so a failure reproduces
function prng(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

Deno.test("trie - walk order matches the recursive reference", () => {
	const rnd = prng(20260924);
	const pick = <T>(list: T[]) => list[Math.floor(rnd() * list.length)];
	const alphabet = [..."abcd", "ž", "😀"];
	const randomWord = () =>
		Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => pick(alphabet)).join("");

	for (let round = 0; round < 20; round++) {
		const idx = new TrieIndex();
		const ref = refNode();
		const vocab = Array.from({ length: 40 }, randomWord);
		const ids = Array.from({ length: 12 }, (_, i) => `${i}`);

		for (let op = 0; op < 300; op++) {
			const word = pick(vocab);
			const id = pick(ids);
			if (rnd() < 0.7) {
				idx.addWord(word, id);
				refAdd(ref, word, id);
			} else {
				idx.removeWord(word, id);
				refRemove(ref, [...word], id);
			}
		}

		const refWords: string[] = [];
		refWalk(ref, "", (word) => refWords.push(word));
		assertEquals(idx.getAllWords(), refWords);

		for (let q = 0; q < 10; q++) {
			const query = randomWord();
			const prefix = query.slice(0, query.length > 1 ? 2 : 1);
			const expectedPrefix = sortedByMin((record) => {
				let node: RefNode | undefined = ref;
				for (const char of prefix) node = node?.kids.get(char);
				if (node) {
					refWalk(node, "", (tail, n) => record(n.ids, [...tail].length));
				}
			});
			assertEquals(idx.searchByPrefix(prefix), expectedPrefix);

			const expectedFuzzy = sortedByMin((record) =>
				refWalk(ref, "", (word, n) => {
					const d = levenshteinDistance(query, word);
					if (d <= 2) record(n.ids, d);
				})
			);
			assertEquals(idx.searchFuzzy(query, 2), expectedFuzzy);
		}
	}
});
