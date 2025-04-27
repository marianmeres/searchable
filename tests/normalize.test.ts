import { assertEquals } from "@std/assert/equals";
import { normalize } from "../src/lib/normalize.ts";

Deno.test("normalize works", () => {
	assertEquals(normalize("Kôň"), "kon");
	assertEquals(normalize("Kôň", { caseSensitive: true }), "Kon");
	assertEquals(normalize("Kôň", { accentSensitive: true }), "kôň");

	// effectively no-op
	assertEquals(
		normalize("Kôň", { caseSensitive: true, accentSensitive: true }),
		"Kôň"
	);
});
