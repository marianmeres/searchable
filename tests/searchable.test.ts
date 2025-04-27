import { assertEquals } from "@std/assert";
import { Searchable, type SearchableOptions } from "../src/searchable.ts";

const docs: Record<string, string> = {
	1: "How does he repair a leaking new kitchen faucet",
	2: "Best restaurants with kitchen service in downtown Seattle",
	3: "iPhone 14 Pro Max battery replacement cost",
	4: "Symptoms of seasonal allergies vs common cold",
	5: "Quick chocolate chip cookie recipe without eggs",
	6: "Used Toyota Camry 2018-2020 reliability review",
	7: "Home office tax deduction requirements for 2025",
	8: "Natural remedies for seasonal headaches",
	9: "Flight status BA287 London to New York",
	10: "Beginner's guide to growing vegetables in your home office garden",
	11: "Hey ho let's go",
};

const createSearchable = (opts: Partial<SearchableOptions> = {}) => {
	const idx = new Searchable(opts);
	Object.entries(docs).forEach(([docId, searchable]) => {
		idx.add(searchable, docId);
	});
	return idx;
};

Deno.test("searchExact works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index });

		let res = idx.searchExact("office home");
		// console.log(res);
		assertEquals(res, ["7", "10"]);

		res = idx.searchExact("2018");
		assertEquals(res, []);

		// because "-" is whitelisted as part of the word
		res = idx.searchExact("2018-2020");
		assertEquals(res, ["6"]);
	});
});

Deno.test("searchByPrefix works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index });

		let res = idx.searchByPrefix("he");
		assertEquals(res, ["1", "11", "8"]);

		res = idx.searchByPrefix("2018");
		assertEquals(res, ["6"]);

		// because "-" is whitelisted as part of the word
		res = idx.searchByPrefix("2018-2020");
		// console.log(res);
		assertEquals(res, ["6"]);
	});
});

Deno.test("searchFuzzy works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index });

		let res = idx.searchFuzzy("Ófíce hme");
		assertEquals(res, ["7", "10"]);

		res = idx.searchFuzzy("2018");
		// note that we're NOT getting 6 because "2025" is closer to "2018"
		// than to "2018-2020"
		assertEquals(res, ["7"]);

		res = idx.searchFuzzy("kichtén");
		// console.log(res);
		assertEquals(res, ["1", "2"]);
	});
});

Deno.test("searchByPrefix with ngrams works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index, ngramsSize: [3, 4, 5] });

		let res = idx.searchByPrefix("nal");
		assertEquals(res, ["4", "8"]);

		res = idx.searchByPrefix("table");
		assertEquals(res, ["10"]);
	});
});

Deno.test("searchFuzzy with ngrams works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index, ngramsSize: [3] });

		// hm... this is way too tolerant
		const res = idx.searchFuzzy("table");
		// console.log(res);
		assertEquals(res, ["2", "10"]);
	});
});
