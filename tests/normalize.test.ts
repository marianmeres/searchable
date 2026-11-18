import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../src/lib/normalize.ts";

test("normalize works", () => {
	assert.deepStrictEqual(normalize("Kôň"), "kon");
	assert.deepStrictEqual(normalize("Kôň", { caseSensitive: true }), "Kon");
	assert.deepStrictEqual(normalize("Kôň", { accentSensitive: true }), "kôň");

	// effectively no-op
	assert.deepStrictEqual(
		normalize("Kôň", { caseSensitive: true, accentSensitive: true }),
		"Kôň",
	);
});
