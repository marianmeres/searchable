import assert from "node:assert/strict";
import { test } from "node:test";
import { unaccent } from "../src/lib/unaccent.ts";

test("unaccent works", () => {
	assert.deepStrictEqual(
		unaccent("Příliš žluťoučký kůň úpěl ďábelské ódy"),
		"Prilis zlutoucky kun upel dabelske ody",
	);

	assert.deepStrictEqual(
		unaccent(
			"Vypätá dcéra grófa Maxwella s IQ nižším ako kôň núti čeľaď hrýzť hŕbu jabĺk",
		),
		"Vypata dcera grofa Maxwella s IQ nizsim ako kon nuti celad hryzt hrbu jablk",
	);
});

test("unaccent folds letters NFD doesn't decompose", () => {
	assert.deepStrictEqual(unaccent("straße"), "strasse");
	assert.deepStrictEqual(unaccent("STRAẞE"), "STRASSE");
	assert.deepStrictEqual(unaccent("København"), "Kobenhavn");
	assert.deepStrictEqual(unaccent("Ångström"), "Angstrom");
	assert.deepStrictEqual(unaccent("Encyclopædia"), "Encyclopaedia");
	assert.deepStrictEqual(unaccent("cœur"), "coeur");
	assert.deepStrictEqual(unaccent("łódź"), "lodz");
	assert.deepStrictEqual(unaccent("Đặng"), "Dang");
	assert.deepStrictEqual(unaccent("þór"), "thor");
	assert.deepStrictEqual(unaccent("mıx"), "mix"); // Turkish dotless i
});
