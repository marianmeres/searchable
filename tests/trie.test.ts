// deno-lint-ignore-file no-explicit-any

import { assertEquals } from "@std/assert";
import { TrieIndex } from "../src/lib/index-trie.ts";

Deno.test("trie sanity check", () => {
	const idx = new TrieIndex();
	idx.addWord("foo", "1");
	idx.addWord("foo", "2");
	idx.addWord("bar", "3");

	// console.log(JSON.stringify(idx, null, 4));

	assertEquals(idx.wordCount, 2);
	assertEquals(idx.docIdCount, 3);

	assertEquals(idx.getAllWords(), ["foo", "bar"]);
	assertEquals(idx.getAllDocIds(), ["1", "2", "3"]);

	const dump1 = idx.dump();
	let dump = dump1;

	assertEquals(dump.words, { foo: ["1", "2"], bar: ["3"] });

	idx.removeWord("foo", "2");

	dump = idx.dump();
	assertEquals(dump.words, { foo: ["1"], bar: ["3"] });
	// console.log(idx.wordCount, dump, idx.getAllDocIds());

	// restore the initial
	idx.restore(dump1);
	dump = idx.dump();
	assertEquals(dump.words, { foo: ["1", "2"], bar: ["3"] });

	//
	let res: any = idx.searchExact("foo");
	assertEquals(res, ["1", "2"]);

	res = idx.searchExact("bar");
	assertEquals(res, ["3"]);

	res = idx.searchExact("fooo");
	assertEquals(res, []);

	res = idx.searchExact("hey");
	assertEquals(res, []);

	//
	res = idx.searchByPrefix("f");
	assertEquals(res, ["1", "2"]);

	res = idx.searchByPrefix("fo");
	assertEquals(res, ["1", "2"]);

	res = idx.searchByPrefix("fo", true);
	assertEquals(res, { 1: 1, 2: 1 });

	res = idx.searchByPrefix("fooo");
	assertEquals(res, []);

	res = idx.searchByPrefix("b");
	assertEquals(res, ["3"]);

	//
	res = idx.searchByDocId("3");
	assertEquals(res, ["bar"]);

	res = idx.searchByDocId("1");
	assertEquals(res, ["foo"]);

	res = idx.searchByDocId("123");
	assertEquals(res, []);

	//
	idx.removeDocId("2");
	dump = idx.dump();
	assertEquals(dump.words, { foo: ["1"], bar: ["3"] });

	// console.log(JSON.stringify(idx, null, 4));
});

Deno.test("trie fuzzy search", () => {
	const docs = ["hello", "ehlo", "books", "look", "cook", "hello", "hell"];

	const idx = new TrieIndex();
	docs.forEach((word, id) => {
		idx.addWord(word, `${id}`);
	});
	// console.log(idx.dump());

	let res = idx.searchFuzzy("hel", 3);
	assertEquals(res, ["6" /*hell*/, "0" /*hello*/, "5" /*hello*/, "1" /*ehlo*/]);

	const res2 = idx.searchFuzzy("hel", 3, true);
	assertEquals(res2, { 0: 2, 1: 3, 5: 2, 6: 1 });

	res = idx.searchFuzzy("oo");
	assertEquals(res, ["3", "4"]);

	res = idx.searchFuzzy("hello");
	assertEquals(res, ["0", "5", "6", "1"]);

	res = idx.searchFuzzy("hello", 1);
	assertEquals(res, ["0", "5", "6"]);
});

Deno.test("char trie", () => {
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

	assertEquals(idx.__toCharTrie(), expected);
});
