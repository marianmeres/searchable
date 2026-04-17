import { assertEquals } from "@std/assert/equals";
import { levenshteinDistance } from "../src/lib/levenshtein.ts";

type TestInput = [string, string, number][];

Deno.test("levenshtein distance works", () => {
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
		assertEquals(actual, expected, [source, target, actual, expected].join());
	});
});

Deno.test("levenshtein handles astral characters as single code points", () => {
	// 😀 is 2 UTF-16 code units but one code point
	assertEquals(levenshteinDistance("😀cat", "😀cats"), 1);
	assertEquals(levenshteinDistance("cat😀", "cats😀"), 1);
	assertEquals(levenshteinDistance("😀", "😀"), 0);
	assertEquals(levenshteinDistance("😀", "😎"), 1);
	// Math alphanumerics (astral)
	assertEquals(levenshteinDistance("𝕏", "𝕐"), 1);
});

Deno.test("levenshtein damerau option recognises transpositions", () => {
	assertEquals(levenshteinDistance("teh", "the"), 2);
	assertEquals(levenshteinDistance("teh", "the", { damerau: true }), 1);
	assertEquals(levenshteinDistance("recieve", "receive", { damerau: true }), 1);
	// pure substitutions should still work
	assertEquals(levenshteinDistance("cat", "hat", { damerau: true }), 1);
});

Deno.test("levenshtein edge cases", () => {
	assertEquals(levenshteinDistance("", ""), 0);
	assertEquals(levenshteinDistance("abc", ""), 3);
	assertEquals(levenshteinDistance("", "abc"), 3);
});
