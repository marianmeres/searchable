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
