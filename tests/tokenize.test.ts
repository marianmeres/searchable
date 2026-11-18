import { tokenize } from "../src/lib/tokenize.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const clog = console.log;

test("tokenize works", () => {
	let words = tokenize("well-known foo bar!");
	assert.deepStrictEqual(words.join(), "well,known,foo,bar");

	words = tokenize("well-known foo", "-");
	assert.deepStrictEqual(words.join(), "well-known,foo");

	words = tokenize("foo@bar.baz");
	assert.deepStrictEqual(words.join(), "foo,bar,baz");

	words = tokenize("foo@bar.baz", "@");
	assert.deepStrictEqual(words.join(), "foo@bar,baz");

	words = tokenize("  foo   bar  &  baz!@#  ");
	assert.deepStrictEqual(words.join(), "foo,bar,baz");

	words = tokenize("!@#$%^&*()");
	assert.ok(!words.length);

	words = tokenize("file_name.txt _data.json", "._");
	assert.deepStrictEqual(words.join(), "file_name.txt,_data.json");

	words = tokenize("Příliš žluťoučký kůň úpěl ďábelské ódy");
	assert.deepStrictEqual(words.join(), "Příliš,žluťoučký,kůň,úpěl,ďábelské,ódy");
});

test("path like", () => {
	let words = tokenize("/path/like/123");
	assert.deepStrictEqual(words.join(), "path,like,123");

	words = tokenize("/path/like/123", "'-@");
	assert.deepStrictEqual(words.join(), "path,like,123");
});

test("float", () => {
	let words = tokenize("12.34");
	assert.deepStrictEqual(words.join(), "12,34");

	words = tokenize("12.34", ".");
	assert.deepStrictEqual(words, ["12.34"]);
});
