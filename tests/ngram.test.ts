import assert from "node:assert/strict";
import { test } from "node:test";
import { createNgrams } from "../src/lib/ngram.ts";

test("ngram works", () => {
	let ng = createNgrams("foo");
	assert.deepStrictEqual(ng, ["  f", " fo", "foo", "oo ", "o  "]);

	ng = createNgrams("foo", 3, { padChar: "" });
	assert.deepStrictEqual(ng, ["foo"]);

	ng = createNgrams("foo", 2, { padChar: "" });
	assert.deepStrictEqual(ng, ["fo", "oo"]);
});
