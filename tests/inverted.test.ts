// deno-lint-ignore-file no-explicit-any

import { assertEquals } from "@std/assert";
import { InvertedIndex } from "../src/lib/index-inverted.ts";

Deno.test("inverted index works", () => {
	const idx = new InvertedIndex();
	idx.addWord("foo", "1");
	idx.addWord("foo", "2");
	idx.addWord("bar", "3");

	assertEquals(idx.wordCount, 2);
	assertEquals(idx.docIdCount, 3);

	assertEquals(idx.getAllWords(), ["foo", "bar"]);
	assertEquals(idx.getAllDocIds(), ["1", "2", "3"]);

	const dump1 = idx.dump();
	let dump = dump1;

	assertEquals(dump.words, { foo: ["1", "2"], bar: ["3"] });
	// assertEquals(dump.docIdToWords, { 1: ["foo"], 2: ["foo"], 3: ["bar"] });

	idx.removeWord("foo", "2");

	dump = idx.dump();
	assertEquals(dump.words, { foo: ["1"], bar: ["3"] });
	// assertEquals(dump.docIdToWords, { 1: ["foo"], 3: ["bar"] });

	// restore the initial
	idx.restore(dump1);
	dump = idx.dump();
	assertEquals(dump.words, { foo: ["1", "2"], bar: ["3"] });
	// assertEquals(dump.docIdToWords, { 1: ["foo"], 2: ["foo"], 3: ["bar"] });

	//
	let res: any = idx.searchExact("foo");
	assertEquals(res, ["1", "2"]);

	res = idx.searchExact("bar");
	assertEquals(res, ["3"]);

	res = idx.searchExact("hey");
	assertEquals(res, []);

	//
	res = idx.searchByPrefix("f");
	assertEquals(res, ["1", "2"]);

	res = idx.searchByPrefix("fo");
	assertEquals(res, ["1", "2"]);

	res = idx.searchByPrefix("fo", true);
	assertEquals(res, { 1: 1, 2: 1 });
	// console.log(res);

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
	// assertEquals(dump.docIdToWords, { 1: ["foo"], 3: ["bar"] });
});

Deno.test("inverted fuzzy search", () => {
	const docs = ["hello", "ehlo", "books", "look", "cook", "hello", "hell"];

	const idx = new InvertedIndex();
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
