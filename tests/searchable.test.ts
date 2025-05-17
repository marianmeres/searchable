import { assert, assertEquals } from "@std/assert";
import { Searchable, type SearchableOptions } from "../src/searchable.ts";
import { resolve } from "@std/path/resolve";

const clog = console.log;

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
	12: "/looks/like/path/to/1234/file.txt",
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

Deno.test("searchByPrefix with n-grams works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index, ngramsSize: [3, 4, 5] });

		let res = idx.searchByPrefix("nal");
		assertEquals(res, ["4", "8"]);

		res = idx.searchByPrefix("table");
		assertEquals(res, ["10"]);
	});
});

Deno.test("searchFuzzy with n-grams works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index, ngramsSize: [3] });

		// hm... this is way too tolerant
		const res = idx.searchFuzzy("table");
		// console.log(res);
		assertEquals(res, ["2", "10"]);
	});
});

Deno.test("readme", () => {
	const index = new Searchable({ ngramsSize: [3, 4] });
	index.add("james bond", "007");

	const results = index.searchByPrefix("Bond. James Bond.");
	assert(results.length === 1);
	assert(results[0] === "007");

	// console.log(results);
	// index.add(
	// 	`Quantum of Solace (2008, Marc Forster) / Adventure, Action, Thriller, Crime
	// 	Daniel Craig (James Bond), Olga Kurylenko (Camille Montes), Mathieu Amalric (Dominic Greene)`,
	// 	"foo"
	// );
	// results = index.searchByPrefix("Bond. James Bond.");
	// console.log(results);
});

Deno.test("with slash", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index });

		assertEquals(idx.search("file.txt"), ["12"]);
		assertEquals(idx.search("to/1234"), ["12"]);
	});
});

Deno.test("merged works", () => {
	const beatles = {
		j: {
			email: "john-1@lennon.com",
			name: "John Lennon",
			songs: "Imagine; Hey Jude",
		},
		p: {
			email: "p_a_u+l@beatles.com",
			name: "Paul McCartney",
			songs: "Yesterday; Let It Be",
		},
		g: {
			email: "george@harrison.co.uk",
			name: "George Harrison",
			songs: "Something; Here Comes the Sun",
		},
		r: {
			email: "ringo@beatles.com",
			name: "Ringo Starr",
			songs: "Octopus's Garden; Don't Pass Me By",
		},
	};

	// emails, names
	const prefix = new Searchable({
		defaultSearchOptions: { strategy: "prefix" },
		nonWordCharWhitelist: "@.-_+",
		index: "trie",
		ngramsSize: [3],
	});
	// songs
	const fuzzy = new Searchable({
		defaultSearchOptions: { strategy: "fuzzy", maxDistance: 1 },
		querySomeWordMinLength: 3,
		index: "inverted",
		nonWordCharWhitelist: "'",
		ngramsSize: [3, 4],
	});

	const index = Searchable.merge([prefix, fuzzy]);

	Object.entries(beatles).forEach(([docId, row]) => {
		prefix.add(
			[
				row.email, // full email
				"@" + row.email.split("@")[1], // domain part only
				row.name,
			].join(" "),
			docId
		);
		fuzzy.add(row.songs, docId);
	});

	let r = index.search("john");
	// console.log(fuzzy.search("don't"));
	assertEquals(r, ["j"]);

	r = index.search("@beatles.com");
	assertEquals(r, ["p", "r"]);

	r = index.search("p_a_u+");
	assertEquals(r, ["p"]);

	// console.log(JSON.stringify(prefix.dump(false), null, 4));
	// console.log(JSON.stringify(fuzzy.dump(false), null, 4));
});
