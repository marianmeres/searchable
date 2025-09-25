import { tokenize } from "../src/lib/tokenize.ts";
import { assert, assertEquals } from "@std/assert";

const clog = console.log;

Deno.test("tokenize works", () => {
	let words = tokenize("well-known foo bar!");
	assertEquals(words.join(), "well,known,foo,bar");

	words = tokenize("well-known foo", "-");
	assertEquals(words.join(), "well-known,foo");

	words = tokenize("foo@bar.baz");
	assertEquals(words.join(), "foo,bar,baz");

	words = tokenize("foo@bar.baz", "@");
	assertEquals(words.join(), "foo@bar,baz");

	words = tokenize("  foo   bar  &  baz!@#  ");
	assertEquals(words.join(), "foo,bar,baz");

	words = tokenize("!@#$%^&*()");
	assert(!words.length);

	words = tokenize("file_name.txt _data.json", "._");
	assertEquals(words.join(), "file_name.txt,_data.json");

	words = tokenize("Příliš žluťoučký kůň úpěl ďábelské ódy");
	assertEquals(words.join(), "Příliš,žluťoučký,kůň,úpěl,ďábelské,ódy");
});

Deno.test("path like", () => {
	let words = tokenize("/path/like/123");
	assertEquals(words.join(), "path,like,123");

	words = tokenize("/path/like/123", "'-@");
	assertEquals(words.join(), "path,like,123");
});

Deno.test("float", () => {
	let words = tokenize("12.34");
	assertEquals(words.join(), "12,34");

	words = tokenize("12.34", ".");
	assertEquals(words, ["12.34"]);
});
