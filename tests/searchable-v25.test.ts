// Regression + new-feature tests introduced in v2.5.0.
// See BC.md for the behavior changes covered here.

import assert from "node:assert/strict";
import { test } from "node:test";
import { levenshteinDistance } from "../src/lib/levenshtein.ts";
import { Searchable, type SearchableOptions } from "../src/searchable.ts";

const perIndex = (fn: (opts: Partial<SearchableOptions>) => void) =>
	(["inverted", "trie"] as const).forEach((index) => fn({ index }));

test("normalizeWord runs at query time (fixes A1)", () => {
	perIndex((opts) => {
		// Stemmer-style normalizer: collapses -ing / -s
		const stem = (w: string) => w.replace(/(ing|s)$/i, "");
		const idx = new Searchable({ ...opts, normalizeWord: stem });

		idx.add("I love running every morning", "doc1");
		idx.add("The cats are sleeping", "doc2");

		// Query "running" must reduce to "runn" before hitting the index
		assert.deepStrictEqual(idx.search("running", "exact"), ["doc1"]);
		// Query "cats" -> "cat" must match indexed "cat" (from "cats")
		assert.deepStrictEqual(idx.search("cats", "exact"), ["doc2"]);
	});
});

test("normalizeWord array return: OR within group, AND across groups", () => {
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
		assert.deepStrictEqual(new Set(res), new Set(["doc1", "doc2"]));
	});
});

test("prefix search: distance is codepoint-length diff", () => {
	perIndex((opts) => {
		const idx = new Searchable(opts);
		idx.add("rest", "a");
		idx.add("restaurant", "b");
		idx.add("restart", "c");

		const res = idx.searchByPrefix("rest");
		assert.deepStrictEqual(res[0], "a"); // shortest diff wins
	});
});

test("trie fuzzy: Unicode + pruning give same result as inverted", () => {
	const mk = (index: "inverted" | "trie") => {
		const idx = new Searchable({ index });
		["restaurant", "restart", "resting", "eating", "repeat", "restore"].forEach(
			(w, i) => idx.add(w, `d${i}`),
		);
		return idx;
	};
	const inv = mk("inverted");
	const trie = mk("trie");
	assert.deepStrictEqual(
		new Set(inv.searchFuzzy("restarant", 2)),
		new Set(trie.searchFuzzy("restarant", 2)),
	);
});

test("trie & inverted remove astral-char words consistently", async (t) => {
	// Tokenizer strips emojis, so we exercise the index directly here —
	// this guards against the old bug where TrieIndex#removeWordFromTrie
	// used UTF-16 indexing (inconsistent with addWord's code-point iteration).
	const { InvertedIndex, TrieIndex } = await import("../src/lib/mod.ts");

	await t.test("trie", () => {
		const idx = new TrieIndex();
		idx.addWord("😀cat", "a");
		idx.addWord("😎cat", "b");
		assert.deepStrictEqual(idx.searchExact("😀cat"), ["a"]);
		assert.deepStrictEqual(idx.removeWord("😀cat", "a"), true);
		assert.deepStrictEqual(idx.searchExact("😀cat"), []);
		// pruning preserves other entries
		assert.deepStrictEqual(idx.searchExact("😎cat"), ["b"]);
	});

	await t.test("inverted", () => {
		const idx = new InvertedIndex();
		idx.addWord("😀cat", "a");
		assert.deepStrictEqual(idx.searchExact("😀cat"), ["a"]);
		idx.removeDocId("a");
		assert.deepStrictEqual(idx.searchExact("😀cat"), []);
	});

	await t.test("trie fuzzy over astral chars", () => {
		const idx = new TrieIndex();
		idx.addWord("😀cat", "a");
		idx.addWord("😎cat", "b");
		// 😀 vs 😎 differs by 1 code-point substitution
		assert.deepStrictEqual(
			new Set(idx.searchFuzzy("😀cat", 1) as string[]),
			new Set(["a", "b"]),
		);
	});
});

test("unaccent BC: straße matches strasse by default", () => {
	const idx = new Searchable();
	idx.add("straße in Berlin", "d1");
	idx.add("Kobenhavn København", "d2");
	assert.deepStrictEqual(idx.search("strasse"), ["d1"]);
	assert.deepStrictEqual(idx.search("København"), ["d2"]);
});

test("search options: limit & offset", () => {
	const idx = new Searchable();
	for (let i = 0; i < 10; i++) idx.add(`apple${i}`, `d${i}`);

	assert.deepStrictEqual(idx.search("apple", "prefix").length, 10);
	assert.deepStrictEqual(idx.search("apple", "prefix", { limit: 3 }).length, 3);
	assert.deepStrictEqual(
		idx.search("apple", "prefix", { offset: 2, limit: 3 }).length,
		3,
	);
	assert.deepStrictEqual(idx.search("apple", "prefix", { offset: 9 }).length, 1);
});

test("custom distance function", () => {
	const alwaysMatch = () => 0;
	const idx = new Searchable();
	idx.add("cat", "a");
	idx.add("dog", "b");
	idx.add("fish", "c");
	// With a distance fn that always returns 0, every indexed word matches.
	const res = idx.search("xyz", "fuzzy", { distanceFn: alwaysMatch });
	assert.deepStrictEqual(new Set(res), new Set(["a", "b", "c"]));
});

test("custom distance: Damerau via levenshteinDistance", () => {
	const idx = new Searchable();
	idx.add("receive", "a");

	const damerau = (x: string, y: string) =>
		levenshteinDistance(x, y, { damerau: true });

	// "recieve" -> "receive" requires 2 standard edits but 1 Damerau
	assert.deepStrictEqual(idx.search("recieve", "fuzzy", { maxDistance: 1 }), []);
	assert.deepStrictEqual(
		idx.search("recieve", "fuzzy", {
			maxDistance: 1,
			distanceFn: damerau,
		}),
		["a"],
	);
});

test("replace clears old words before reindexing", () => {
	const idx = new Searchable();
	idx.add("alpha beta", "doc1");
	idx.replace("doc1", "gamma delta");

	assert.deepStrictEqual(idx.search("alpha", "exact"), []);
	assert.deepStrictEqual(idx.search("gamma", "exact"), ["doc1"]);
});

test("hasDocId + docIdCount", () => {
	const idx = new Searchable();
	assert.ok(!idx.hasDocId("x"));
	idx.add("anything", "x");
	assert.ok(idx.hasDocId("x"));
	assert.deepStrictEqual(idx.docIdCount, 1);
	idx.removeDocId("x");
	assert.ok(!idx.hasDocId("x"));
	assert.deepStrictEqual(idx.docIdCount, 0);
});

test("explainQuery surfaces the pipeline", () => {
	const idx = new Searchable({
		normalizeWord: (w) => (w === "hi" ? ["hi", "hello"] : w),
		isStopword: (w) => w === "the",
		querySomeWordMinLength: 2,
	});
	const ex = idx.explainQuery("The Hi World!");
	assert.deepStrictEqual(ex.raw, "The Hi World!");
	assert.deepStrictEqual(ex.normalized, "the hi world!");
	assert.deepStrictEqual(ex.tokens, ["the", "hi", "world"]);
	assert.deepStrictEqual(ex.afterStopwords, ["hi", "world"]);
	assert.deepStrictEqual(ex.groups, [["hi", "hello"], ["world"]]);
	assert.deepStrictEqual(ex.wouldSearch, true);
});

test("fromDump + cross-index restore", () => {
	const src = new Searchable({ index: "inverted" });
	src.add("james bond", "007");
	src.add("jason bourne", "117");

	const dump = src.dump(false);

	// restore into a trie — dump format is index-agnostic
	const dst = Searchable.fromDump(dump, { index: "trie" });
	assert.deepStrictEqual(dst.search("bond"), ["007"]);
	assert.deepStrictEqual(dst.search("bourne"), ["117"]);
});

test("merge exposes full strategy surface", () => {
	const a = new Searchable();
	const b = new Searchable();
	a.add("alpha", "x");
	b.add("beta", "y");
	const merged = Searchable.merge([a, b]);

	assert.deepStrictEqual(new Set(merged.searchExact("alpha")), new Set(["x"]));
	assert.deepStrictEqual(new Set(merged.searchByPrefix("bet")), new Set(["y"]));
	assert.deepStrictEqual(new Set(merged.searchFuzzy("alphz", 2)), new Set(["x"]));
});

test("restore with unsupported version throws", () => {
	const idx = new Searchable();
	assert.throws(
		() => idx.restore({ version: "99.0", words: {} }),
		(e: unknown) => e instanceof Error && e.message.includes("restoring"),
	);
});

test("lastQuery getter returns a copy (can't corrupt internal state)", () => {
	const idx = new Searchable();
	idx.add("hello", "d1");
	idx.search("hello");
	const snap = idx.lastQuery;
	snap.history.push("bogus");
	snap.rawHistory.push("bogus");
	assert.deepStrictEqual(idx.lastQuery.history.length, 1);
	assert.deepStrictEqual(idx.lastQuery.rawHistory.length, 1);
});

test("lastQuery.rawHistory preserves pre-normalization input", () => {
	const idx = new Searchable();
	idx.add("Hello World", "d1");
	idx.search("HELLO");
	idx.search("WoRlD");

	assert.deepStrictEqual(idx.lastQuery.rawHistory, ["HELLO", "WoRlD"]);
	assert.deepStrictEqual(idx.lastQuery.history, ["hello", "world"]);
});
