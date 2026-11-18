import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TERMINAL_MARKER, TrieIndex } from "../src/lib/index-trie.ts";

test("trie sanity check", () => {
	const idx = new TrieIndex();
	idx.addWord("foo", "1");
	idx.addWord("foo", "2");
	idx.addWord("bar", "3");

	// console.log(JSON.stringify(idx, null, 4));

	assert.deepStrictEqual(idx.wordCount, 2);
	assert.deepStrictEqual(idx.docIdCount, 3);

	assert.deepStrictEqual(idx.getAllWords(), ["foo", "bar"]);
	assert.deepStrictEqual(idx.getAllDocIds(), ["1", "2", "3"]);

	const dump1 = idx.dump();
	let dump = dump1;

	assert.deepStrictEqual(dump.words, { foo: ["1", "2"], bar: ["3"] });

	idx.removeWord("foo", "2");

	dump = idx.dump();
	assert.deepStrictEqual(dump.words, { foo: ["1"], bar: ["3"] });
	// console.log(idx.wordCount, dump, idx.getAllDocIds());

	// restore the initial
	idx.restore(dump1);
	dump = idx.dump();
	assert.deepStrictEqual(dump.words, { foo: ["1", "2"], bar: ["3"] });

	//
	let res: any = idx.searchExact("foo");
	assert.deepStrictEqual(res, ["1", "2"]);

	res = idx.searchExact("bar");
	assert.deepStrictEqual(res, ["3"]);

	res = idx.searchExact("fooo");
	assert.deepStrictEqual(res, []);

	res = idx.searchExact("hey");
	assert.deepStrictEqual(res, []);

	//
	res = idx.searchByPrefix("f");
	assert.deepStrictEqual(res, ["1", "2"]);

	res = idx.searchByPrefix("fo");
	assert.deepStrictEqual(res, ["1", "2"]);

	res = idx.searchByPrefix("fo", true);
	assert.deepStrictEqual(res, { 1: 1, 2: 1 });

	res = idx.searchByPrefix("fooo");
	assert.deepStrictEqual(res, []);

	res = idx.searchByPrefix("b");
	assert.deepStrictEqual(res, ["3"]);

	//
	res = idx.searchByDocId("3");
	assert.deepStrictEqual(res, ["bar"]);

	res = idx.searchByDocId("1");
	assert.deepStrictEqual(res, ["foo"]);

	res = idx.searchByDocId("123");
	assert.deepStrictEqual(res, []);

	//
	idx.removeDocId("2");
	dump = idx.dump();
	assert.deepStrictEqual(dump.words, { foo: ["1"], bar: ["3"] });

	// console.log(JSON.stringify(idx, null, 4));
});

test("trie fuzzy search", () => {
	const docs = ["hello", "ehlo", "books", "look", "cook", "hello", "hell"];

	const idx = new TrieIndex();
	docs.forEach((word, id) => {
		idx.addWord(word, `${id}`);
	});
	// console.log(idx.dump());

	let res = idx.searchFuzzy("hel", 3);
	assert.deepStrictEqual(res, ["6" /*hell*/, "0" /*hello*/, "5" /*hello*/, "1" /*ehlo*/]);

	const res2 = idx.searchFuzzy("hel", 3, true);
	assert.deepStrictEqual(res2, { 0: 2, 1: 3, 5: 2, 6: 1 });

	res = idx.searchFuzzy("oo");
	assert.deepStrictEqual(res, ["3", "4"]);

	res = idx.searchFuzzy("hello");
	assert.deepStrictEqual(res, ["0", "5", "6", "1"]);

	res = idx.searchFuzzy("hello", 1);
	assert.deepStrictEqual(res, ["0", "5", "6"]);
});

test("char trie", () => {
	const idx = new TrieIndex();
	idx.addWord("foo", "1");
	idx.addWord("bar", "2");
	idx.addWord("baz", "3");

	const expected = {
		f: {
			o: {
				o: {},
			},
		},
		b: {
			a: {
				r: {},
				z: {},
			},
		},
	};

	assert.deepStrictEqual(idx.__toCharTrie(), expected);
	// toCharTrie() with no options must be byte-identical to the legacy helper.
	assert.deepStrictEqual(idx.toCharTrie(), expected);
	assert.deepStrictEqual(idx.toCharTrie(), idx.__toCharTrie());
});

test("char trie - terminal marker", () => {
	const EOW = DEFAULT_TERMINAL_MARKER;
	const idx = new TrieIndex();
	idx.addWord("bar", "1");
	idx.addWord("barn", "2");

	// Char-only projection cannot tell "bar" (a word) from a prefix of "barn".
	assert.deepStrictEqual(idx.toCharTrie(), {
		b: { a: { r: { n: {} } } },
	});

	// With the default sentinel, word-final nodes are marked.
	assert.deepStrictEqual(idx.toCharTrie({ terminalMarker: true }), {
		b: { a: { r: { [EOW]: true, n: { [EOW]: true } } } },
	});

	// A custom (>= 2 code point) sentinel works too.
	assert.deepStrictEqual(idx.toCharTrie({ terminalMarker: "·eow" }), {
		b: { a: { r: { "·eow": true, n: { "·eow": true } } } },
	});
});

test("char trie - terminal marker on a word that is a prefix of another", () => {
	const EOW = DEFAULT_TERMINAL_MARKER;
	const idx = new TrieIndex();
	idx.addWord("ba", "1");
	idx.addWord("bar", "2");

	// "ba" is both a complete word AND an interior node with child "r".
	assert.deepStrictEqual(idx.toCharTrie({ terminalMarker: true }), {
		b: { a: { [EOW]: true, r: { [EOW]: true } } },
	});
});

test("char trie - invalid sentinel throws", () => {
	const idx = new TrieIndex();
	idx.addWord("foo", "1");

	// Single code point could collide with a real edge -> rejected.
	assert.throws(() => idx.toCharTrie({ terminalMarker: "$" }));
	// A single emoji is one code point (even though .length === 2) -> rejected.
	assert.throws(() => idx.toCharTrie({ terminalMarker: "😀" }));
});
