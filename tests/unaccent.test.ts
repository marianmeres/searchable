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

Deno.test("unaccent folds letters NFD doesn't decompose", () => {
	assertEquals(unaccent("straße"), "strasse");
	assertEquals(unaccent("STRAẞE"), "STRASSE");
	assertEquals(unaccent("København"), "Kobenhavn");
	assertEquals(unaccent("Ångström"), "Angstrom");
	assertEquals(unaccent("Encyclopædia"), "Encyclopaedia");
	assertEquals(unaccent("cœur"), "coeur");
	assertEquals(unaccent("łódź"), "lodz");
	assertEquals(unaccent("Đặng"), "Dang");
	assertEquals(unaccent("þór"), "thor");
	assertEquals(unaccent("mıx"), "mix"); // Turkish dotless i
});
