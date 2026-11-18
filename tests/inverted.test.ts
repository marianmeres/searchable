import assert from "node:assert/strict";
import { test } from "node:test";
import { InvertedIndex } from "../src/lib/index-inverted.ts";

test("inverted index works", () => {
	const idx = new InvertedIndex();
	idx.addWord("foo", "1");
	idx.addWord("foo", "2");
	idx.addWord("bar", "3");

	assert.deepStrictEqual(idx.wordCount, 2);
	assert.deepStrictEqual(idx.docIdCount, 3);

	assert.deepStrictEqual(idx.getAllWords(), ["foo", "bar"]);
	assert.deepStrictEqual(idx.getAllDocIds(), ["1", "2", "3"]);

	const dump1 = idx.dump();
	let dump = dump1;

	assert.deepStrictEqual(dump.words, { foo: ["1", "2"], bar: ["3"] });
	// assert.deepStrictEqual(dump.docIdToWords, { 1: ["foo"], 2: ["foo"], 3: ["bar"] });

	idx.removeWord("foo", "2");

	dump = idx.dump();
	assert.deepStrictEqual(dump.words, { foo: ["1"], bar: ["3"] });
	// assert.deepStrictEqual(dump.docIdToWords, { 1: ["foo"], 3: ["bar"] });

	// restore the initial
	idx.restore(dump1);
	dump = idx.dump();
	assert.deepStrictEqual(dump.words, { foo: ["1", "2"], bar: ["3"] });
	// assert.deepStrictEqual(dump.docIdToWords, { 1: ["foo"], 2: ["foo"], 3: ["bar"] });

	//
	let res: any = idx.searchExact("foo");
	assert.deepStrictEqual(res, ["1", "2"]);

	res = idx.searchExact("bar");
	assert.deepStrictEqual(res, ["3"]);

	res = idx.searchExact("hey");
	assert.deepStrictEqual(res, []);

	//
	res = idx.searchByPrefix("f");
	assert.deepStrictEqual(res, ["1", "2"]);

	res = idx.searchByPrefix("fo");
	assert.deepStrictEqual(res, ["1", "2"]);

	res = idx.searchByPrefix("fo", true);
	assert.deepStrictEqual(res, { 1: 1, 2: 1 });
	// console.log(res);

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
	// assert.deepStrictEqual(dump.docIdToWords, { 1: ["foo"], 3: ["bar"] });
});

test("inverted fuzzy search", () => {
	const docs = ["hello", "ehlo", "books", "look", "cook", "hello", "hell"];

	const idx = new InvertedIndex();
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
