import { assertEquals } from "@std/assert";
import { unaccent } from "../src/lib/unaccent.ts";

Deno.test("unaccent works", () => {
	assertEquals(
		unaccent("Příliš žluťoučký kůň úpěl ďábelské ódy"),
		"Prilis zlutoucky kun upel dabelske ody"
	);

	assertEquals(
		unaccent(
			"Vypätá dcéra grófa Maxwella s IQ nižším ako kôň núti čeľaď hrýzť hŕbu jabĺk"
		),
		"Vypata dcera grofa Maxwella s IQ nizsim ako kon nuti celad hryzt hrbu jablk"
	);
});
