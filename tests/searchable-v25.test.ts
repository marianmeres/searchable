// Regression + new-feature tests introduced in v2.5.0.
// See BC.md for the behavior changes covered here.

import { assertEquals, assertThrows, assert } from "@std/assert";
import { Searchable, type SearchableOptions } from "../src/searchable.ts";
import { levenshteinDistance } from "../src/lib/levenshtein.ts";

const perIndex = (fn: (opts: Partial<SearchableOptions>) => void) =>
	(["inverted", "trie"] as const).forEach((index) => fn({ index }));

Deno.test("normalizeWord runs at query time (fixes A1)", () => {
	perIndex((opts) => {
		// Stemmer-style normalizer: collapses -ing / -s
		const stem = (w: string) => w.replace(/(ing|s)$/i, "");
		const idx = new Searchable({ ...opts, normalizeWord: stem });

		idx.add("I love running every morning", "doc1");
		idx.add("The cats are sleeping", "doc2");

		// Query "running" must reduce to "runn" before hitting the index
		assertEquals(idx.search("running", "exact"), ["doc1"]);
		// Query "cats" -> "cat" must match indexed "cat" (from "cats")
		assertEquals(idx.search("cats", "exact"), ["doc2"]);
	});
});

Deno.test("normalizeWord array return: OR within group, AND across groups", () => {
	perIndex((opts) => {
		const aliases = (w: string) => {
			if (w === "colour") return ["colour", "color"];
			return w;
		};
		const idx = new Searchable({ ...opts, normalizeWord: aliases });

		idx.add("big color", "doc1");
		idx.add("big colour", "doc2");
		idx.add("tiny hue", "doc3");

		// "colour" at query time should expand to {colour OR color}
		// AND "big" must also be present.
		const res = idx.search("big colour", "exact");
		assertEquals(new Set(res), new Set(["doc1", "doc2"]));
	});
});

Deno.test("prefix search: distance is codepoint-length diff", () => {
	perIndex((opts) => {
		const idx = new Searchable(opts);
		idx.add("rest", "a");
		idx.add("restaurant", "b");
		idx.add("restart", "c");

		const res = idx.searchByPrefix("rest");
		assertEquals(res[0], "a"); // shortest diff wins
	});
});

Deno.test("trie fuzzy: Unicode + pruning give same result as inverted", () => {
	const mk = (index: "inverted" | "trie") => {
		const idx = new Searchable({ index });
		["restaurant", "restart", "resting", "eating", "repeat", "restore"].forEach(
			(w, i) => idx.add(w, `d${i}`)
		);
		return idx;
	};
	const inv = mk("inverted");
	const trie = mk("trie");
	assertEquals(
		new Set(inv.searchFuzzy("restarant", 2)),
		new Set(trie.searchFuzzy("restarant", 2))
	);
});

Deno.test("trie & inverted remove astral-char words consistently", async (t) => {
	// Tokenizer strips emojis, so we exercise the index directly here —
	// this guards against the old bug where TrieIndex#removeWordFromTrie
	// used UTF-16 indexing (inconsistent with addWord's code-point iteration).
	const { InvertedIndex, TrieIndex } = await import("../src/lib/mod.ts");

	await t.step("trie", () => {
		const idx = new TrieIndex();
		idx.addWord("😀cat", "a");
		idx.addWord("😎cat", "b");
		assertEquals(idx.searchExact("😀cat"), ["a"]);
		assertEquals(idx.removeWord("😀cat", "a"), true);
		assertEquals(idx.searchExact("😀cat"), []);
		// pruning preserves other entries
		assertEquals(idx.searchExact("😎cat"), ["b"]);
	});

	await t.step("inverted", () => {
		const idx = new InvertedIndex();
		idx.addWord("😀cat", "a");
		assertEquals(idx.searchExact("😀cat"), ["a"]);
		idx.removeDocId("a");
		assertEquals(idx.searchExact("😀cat"), []);
	});

	await t.step("trie fuzzy over astral chars", () => {
		const idx = new TrieIndex();
		idx.addWord("😀cat", "a");
		idx.addWord("😎cat", "b");
		// 😀 vs 😎 differs by 1 code-point substitution
		assertEquals(
			new Set(idx.searchFuzzy("😀cat", 1) as string[]),
			new Set(["a", "b"])
		);
	});
});

Deno.test("unaccent BC: straße matches strasse by default", () => {
	const idx = new Searchable();
	idx.add("straße in Berlin", "d1");
	idx.add("Kobenhavn København", "d2");
	assertEquals(idx.search("strasse"), ["d1"]);
	assertEquals(idx.search("København"), ["d2"]);
});

Deno.test("search options: limit & offset", () => {
	const idx = new Searchable();
	for (let i = 0; i < 10; i++) idx.add(`apple${i}`, `d${i}`);

	assertEquals(idx.search("apple", "prefix").length, 10);
	assertEquals(idx.search("apple", "prefix", { limit: 3 }).length, 3);
	assertEquals(idx.search("apple", "prefix", { offset: 2, limit: 3 }).length, 3);
	assertEquals(
		idx.search("apple", "prefix", { offset: 9 }).length,
		1
	);
});

Deno.test("custom distance function", () => {
	const alwaysMatch = () => 0;
	const idx = new Searchable();
	idx.add("cat", "a");
	idx.add("dog", "b");
	idx.add("fish", "c");
	// With a distance fn that always returns 0, every indexed word matches.
	const res = idx.search("xyz", "fuzzy", { distanceFn: alwaysMatch });
	assertEquals(new Set(res), new Set(["a", "b", "c"]));
});

Deno.test("custom distance: Damerau via levenshteinDistance", () => {
	const idx = new Searchable();
	idx.add("receive", "a");

	const damerau = (x: string, y: string) =>
		levenshteinDistance(x, y, { damerau: true });

	// "recieve" -> "receive" requires 2 standard edits but 1 Damerau
	assertEquals(idx.search("recieve", "fuzzy", { maxDistance: 1 }), []);
	assertEquals(
		idx.search("recieve", "fuzzy", {
			maxDistance: 1,
			distanceFn: damerau,
		}),
		["a"]
	);
});

Deno.test("replace clears old words before reindexing", () => {
	const idx = new Searchable();
	idx.add("alpha beta", "doc1");
	idx.replace("doc1", "gamma delta");

	assertEquals(idx.search("alpha", "exact"), []);
	assertEquals(idx.search("gamma", "exact"), ["doc1"]);
});

Deno.test("hasDocId + docIdCount", () => {
	const idx = new Searchable();
	assert(!idx.hasDocId("x"));
	idx.add("anything", "x");
	assert(idx.hasDocId("x"));
	assertEquals(idx.docIdCount, 1);
	idx.removeDocId("x");
	assert(!idx.hasDocId("x"));
	assertEquals(idx.docIdCount, 0);
});

Deno.test("explainQuery surfaces the pipeline", () => {
	const idx = new Searchable({
		normalizeWord: (w) => (w === "hi" ? ["hi", "hello"] : w),
		isStopword: (w) => w === "the",
		querySomeWordMinLength: 2,
	});
	const ex = idx.explainQuery("The Hi World!");
	assertEquals(ex.raw, "The Hi World!");
	assertEquals(ex.normalized, "the hi world!");
	assertEquals(ex.tokens, ["the", "hi", "world"]);
	assertEquals(ex.afterStopwords, ["hi", "world"]);
	assertEquals(ex.groups, [["hi", "hello"], ["world"]]);
	assertEquals(ex.wouldSearch, true);
});

Deno.test("fromDump + cross-index restore", () => {
	const src = new Searchable({ index: "inverted" });
	src.add("james bond", "007");
	src.add("jason bourne", "117");

	const dump = src.dump(false);

	// restore into a trie — dump format is index-agnostic
	const dst = Searchable.fromDump(dump, { index: "trie" });
	assertEquals(dst.search("bond"), ["007"]);
	assertEquals(dst.search("bourne"), ["117"]);
});

Deno.test("merge exposes full strategy surface", () => {
	const a = new Searchable();
	const b = new Searchable();
	a.add("alpha", "x");
	b.add("beta", "y");
	const merged = Searchable.merge([a, b]);

	assertEquals(new Set(merged.searchExact("alpha")), new Set(["x"]));
	assertEquals(new Set(merged.searchByPrefix("bet")), new Set(["y"]));
	assertEquals(new Set(merged.searchFuzzy("alphz", 2)), new Set(["x"]));
});

Deno.test("restore with unsupported version throws", () => {
	const idx = new Searchable();
	assertThrows(
		() => idx.restore({ version: "99.0", words: {} }),
		Error,
		"restoring"
	);
});

Deno.test("lastQuery getter returns a copy (can't corrupt internal state)", () => {
	const idx = new Searchable();
	idx.add("hello", "d1");
	idx.search("hello");
	const snap = idx.lastQuery;
	snap.history.push("bogus");
	snap.rawHistory.push("bogus");
	assertEquals(idx.lastQuery.history.length, 1);
	assertEquals(idx.lastQuery.rawHistory.length, 1);
});

Deno.test("lastQuery.rawHistory preserves pre-normalization input", () => {
	const idx = new Searchable();
	idx.add("Hello World", "d1");
	idx.search("HELLO");
	idx.search("WoRlD");

	assertEquals(idx.lastQuery.rawHistory, ["HELLO", "WoRlD"]);
	assertEquals(idx.lastQuery.history, ["hello", "world"]);
});
