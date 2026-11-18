import assert from "node:assert/strict";
import { test } from "node:test";
import { Searchable, type SearchableOptions } from "../src/searchable.ts";

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
	12: "/looks/like-path/to/1234/file.txt",
};

const createSearchable = (opts: Partial<SearchableOptions> = {}) => {
	const idx = new Searchable(opts);
	Object.entries(docs).forEach(([docId, searchable]) => {
		idx.add(searchable, docId);
	});
	return idx;
};

test("searchExact works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index });

		let res = idx.searchExact("office home");
		// console.log(res);
		assert.deepStrictEqual(res, ["7", "10"]);

		res = idx.searchExact("2018");
		assert.deepStrictEqual(res, []);

		// because "-" is whitelisted as part of the word
		res = idx.searchExact("2018-2020");
		assert.deepStrictEqual(res, ["6"]);
	});
});

test("searchByPrefix works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index });

		let res = idx.searchByPrefix("he");
		assert.deepStrictEqual(res, ["1", "11", "8"]);

		res = idx.searchByPrefix("2018");
		assert.deepStrictEqual(res, ["6"]);

		// because "-" is whitelisted as part of the word
		res = idx.searchByPrefix("2018-2020");
		// console.log(res);
		assert.deepStrictEqual(res, ["6"]);
	});
});

test("searchFuzzy works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index });

		let res = idx.searchFuzzy("Ófíce hme");
		assert.deepStrictEqual(res, ["7", "10"]);

		res = idx.searchFuzzy("2018");
		// note that we're NOT getting 6 because "2025" is closer to "2018"
		// than to "2018-2020"
		assert.deepStrictEqual(res, ["7"]);

		res = idx.searchFuzzy("kichtén");
		// console.log(res);
		assert.deepStrictEqual(res, ["1", "2"]);
	});
});

test("searchByPrefix with n-grams works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index, ngramsSize: [3, 4, 5] });

		let res = idx.searchByPrefix("nal");
		assert.deepStrictEqual(res, ["4", "8"]);

		res = idx.searchByPrefix("table");
		assert.deepStrictEqual(res, ["10"]);
	});
});

test("searchFuzzy with n-grams works", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index, ngramsSize: [3] });

		// hm... this is way too tolerant
		const res = idx.searchFuzzy("table");
		// console.log(res);
		assert.deepStrictEqual(res, ["2", "10"]);
	});
});

test("readme", () => {
	const index = new Searchable({ ngramsSize: [3, 4] });
	index.add("james bond", "007");

	const results = index.searchByPrefix("Bond. James Bond.");
	assert.ok(results.length === 1);
	assert.ok(results[0] === "007");

	// console.log(results);
	// index.add(
	// 	`Quantum of Solace (2008, Marc Forster) / Adventure, Action, Thriller, Crime
	// 	Daniel Craig (James Bond), Olga Kurylenko (Camille Montes), Mathieu Amalric (Dominic Greene)`,
	// 	"foo"
	// );
	// results = index.searchByPrefix("Bond. James Bond.");
	// console.log(results);
});

test("with slash", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index });

		assert.deepStrictEqual(idx.search("file.txt"), ["12"]);
		assert.deepStrictEqual(idx.search("to/1234"), ["12"]);
	});
});

test("empty nonWordCharWhitelist", () => {
	(["inverted", "trie"] as ("inverted" | "trie")[]).forEach((index) => {
		const idx = createSearchable({ index, nonWordCharWhitelist: "" });

		assert.deepStrictEqual(idx.search("path"), ["12"]);
	});
});

test("addBatch works with array", () => {
	const index = new Searchable({ index: "inverted" });

	const result = index.addBatch([
		["doc1", "james bond"],
		["doc2", "mission impossible"],
		["doc3", "indiana jones"],
	]);

	assert.deepStrictEqual(result.errors.length, 0);
	assert.deepStrictEqual(result.added > 0, true);

	const search1 = index.search("bond");
	assert.deepStrictEqual(search1, ["doc1"]);

	const search2 = index.search("mission");
	assert.deepStrictEqual(search2, ["doc2"]);
});

test("addBatch works with object", () => {
	const index = new Searchable({ index: "trie" });

	const result = index.addBatch({
		doc1: "james bond",
		doc2: "mission impossible",
		doc3: "indiana jones",
	});

	assert.deepStrictEqual(result.errors.length, 0);
	assert.deepStrictEqual(result.added > 0, true);

	const search = index.search("jones");
	assert.deepStrictEqual(search, ["doc3"]);
});

test("addBatch handles errors in non-strict mode", () => {
	const index = new Searchable();

	const result = index.addBatch(
		[
			["doc1", "valid text"],
			["", "invalid docId"], // This should error
			["doc2", ""], // This should error
			["doc3", "another valid text"],
		],
		false,
	); // non-strict mode

	// Should have added the valid entries
	assert.deepStrictEqual(result.added > 0, true);
	// Should have collected errors
	assert.deepStrictEqual(result.errors.length, 2);
	assert.deepStrictEqual(result.errors[0].docId, "");
	assert.deepStrictEqual(result.errors[1].docId, "doc2");

	// Valid entries should be searchable
	const search = index.search("valid");
	assert.ok(search.includes("doc1"));
	assert.ok(search.includes("doc3"));
});

test("merged works", () => {
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
		lastQueryHistoryLength: 2,
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
			docId,
		);
		fuzzy.add(row.songs, docId);
	});

	let r = index.search("john");
	// console.log(fuzzy.search("don't"));
	assert.deepStrictEqual(r, ["j"]);

	r = index.search("@beatles.com");
	assert.deepStrictEqual(r, ["p", "r"]);

	r = index.search("p_a_u+");
	assert.deepStrictEqual(r, ["p"]);

	//
	assert.deepStrictEqual(prefix.lastQuery, {
		history: ["@beatles.com", "p_a_u+"],
		rawHistory: ["@beatles.com", "p_a_u+"],
		raw: "p_a_u+",
		used: "p_a_u+",
	});

	//
	fuzzy.search("");
	assert.deepStrictEqual(fuzzy.lastQuery, {
		history: ["john", "@beatles.com", "p_a_u+"], // longer history than prefix
		rawHistory: ["john", "@beatles.com", "p_a_u+"],
		raw: "", // last raw
		used: "p_a_u+",
	});
	// assert.deepStrictEqual(prefix.lastRawQuery, "p_a_u+");
	// assert.deepStrictEqual(fuzzy.lastRawQuery, "p_a_u+");

	// console.log(JSON.stringify(prefix.dump(false), null, 4));
	// console.log(JSON.stringify(fuzzy.dump(false), null, 4));
});
