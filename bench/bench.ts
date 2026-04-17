import { Searchable } from "../src/searchable.ts";
import { movies } from "./movies.js";

/**
 * Bench observations (see results below):
 *
 * - `searchExact` is within the same order of magnitude for both indexes.
 *
 * - `searchByPrefix` is ~2× faster on the trie (benefits directly from the
 *   prefix-tree structure).
 *
 * - `searchFuzzy` on the trie walks the trie itself with a rolling Levenshtein
 *   row and prunes subtrees whose row minimum exceeds `maxDistance`. The
 *   inverted index has to scan every indexed word linearly. In practice the
 *   trie is substantially faster for fuzzy on non-trivial vocabularies.
 *
 * VERDICT: "trie" is the better general pick since v2.5.0. Inverted remains
 * simpler to reason about and still a fine default for small indexes.
 */

// const map: any = {};
const ngramsSize = 3;
const idx1 = new Searchable({ index: "trie", ngramsSize });
const idx2 = new Searchable({ index: "inverted", ngramsSize });

for (const movie of movies) {
	// map[movie.id] = movie;
	const search = [
		movie.title,
		movie.tagline,
		movie.overview,
		movie.year,
		movie.genres.join(),
		movie.actors.join(),
		movie.directors.join(),
		// movie.characters.join(),
	].join(" ");
	[idx1, idx2].forEach((idx) => {
		idx.add(search, `${movie.id}`);
	});
}

const queries = [
	"comedy tarantino",
	"arnold action",
	"horror",
	"Charlie Chaplin",
	"james bond",
];

function getRandomIntInclusive(min: number, max: number) {
	const minCeiled = Math.ceil(min);
	const maxFloored = Math.floor(max);
	return Math.floor(Math.random() * (maxFloored - minCeiled + 1) + minCeiled); // The maximum is inclusive and the minimum is inclusive
}

function randomQuery() {
	return queries[getRandomIntInclusive(0, queries.length - 1)];
}

Deno.bench({
	name: "trie exact",
	fn: () => {
		idx1.searchExact(randomQuery());
	},
});

Deno.bench({
	name: "inverted exact",
	fn: () => {
		idx2.searchExact(randomQuery());
	},
});

Deno.bench({
	name: "trie prefix",
	fn: () => {
		idx1.searchByPrefix(randomQuery());
	},
});

Deno.bench({
	name: "inverted prefix",
	fn: () => {
		idx2.searchByPrefix(randomQuery());
	},
});

Deno.bench({
	name: "trie fuzzy",
	fn: () => {
		idx1.searchFuzzy(randomQuery());
	},
});

Deno.bench({
	name: "inverted fuzzy",
	fn: () => {
		idx2.searchFuzzy(randomQuery());
	},
});

/*
$ deno bench bench/bench.ts
    CPU | Apple M2
Runtime | Deno 2.7.12 (aarch64-apple-darwin)

benchmark         time/iter (avg)       iter/s
----------------- ------------------------------
trie exact               144.4 µs        6,926
inverted exact           402.3 µs        2,486
trie prefix              765.5 µs        1,306
inverted prefix            1.9 ms        529
trie fuzzy                 3.4 ms        294   (was 68.8 ms pre-v2.5.0)
inverted fuzzy            23.1 ms        43.3
*/
