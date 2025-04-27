import { assertEquals } from "@std/assert";
import { createNgrams } from "../src/lib/ngram.ts";

Deno.test("ngram works", () => {
	let ng = createNgrams("foo");
	assertEquals(ng, ["  f", " fo", "foo", "oo ", "o  "]);

	ng = createNgrams("foo", 3, { padChar: "" });
	assertEquals(ng, ["foo"]);

	ng = createNgrams("foo", 2, { padChar: "" });
	assertEquals(ng, ["fo", "oo"]);
});
