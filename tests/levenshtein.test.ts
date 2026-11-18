import assert from "node:assert/strict";
import { test } from "node:test";
import { levenshteinDistance } from "../src/lib/levenshtein.ts";

type TestInput = [string, string, number][];

test("levenshtein distance works", () => {
	(
		[
			["kitten", "sitting", 3],
			["saturday", "sunday", 3],
			["book", "back", 2],
			["algorithm", "logarithm", 3],
			["hello", "hello", 0],
			["", "test", 4],
			["javascript", "typescript", 4],
		] as TestInput
	).forEach(([source, target, expected]) => {
		const actual = levenshteinDistance(source, target);
		assert.deepStrictEqual(
			actual,
			expected,
			[source, target, actual, expected].join(),
		);
	});
});

test("levenshtein handles astral characters as single code points", () => {
	// 😀 is 2 UTF-16 code units but one code point
	assert.deepStrictEqual(levenshteinDistance("😀cat", "😀cats"), 1);
	assert.deepStrictEqual(levenshteinDistance("cat😀", "cats😀"), 1);
	assert.deepStrictEqual(levenshteinDistance("😀", "😀"), 0);
	assert.deepStrictEqual(levenshteinDistance("😀", "😎"), 1);
	// Math alphanumerics (astral)
	assert.deepStrictEqual(levenshteinDistance("𝕏", "𝕐"), 1);
});

test("levenshtein damerau option recognises transpositions", () => {
	assert.deepStrictEqual(levenshteinDistance("teh", "the"), 2);
	assert.deepStrictEqual(levenshteinDistance("teh", "the", { damerau: true }), 1);
	assert.deepStrictEqual(
		levenshteinDistance("recieve", "receive", { damerau: true }),
		1,
	);
	// pure substitutions should still work
	assert.deepStrictEqual(levenshteinDistance("cat", "hat", { damerau: true }), 1);
});

test("levenshtein edge cases", () => {
	assert.deepStrictEqual(levenshteinDistance("", ""), 0);
	assert.deepStrictEqual(levenshteinDistance("abc", ""), 3);
	assert.deepStrictEqual(levenshteinDistance("", "abc"), 3);
});
