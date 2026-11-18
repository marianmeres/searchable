import { bench, run } from "mitata";
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

bench("trie exact", () => {
	idx1.searchExact(randomQuery());
});

bench("inverted exact", () => {
	idx2.searchExact(randomQuery());
});

bench("trie prefix", () => {
	idx1.searchByPrefix(randomQuery());
});

bench("inverted prefix", () => {
	idx2.searchByPrefix(randomQuery());
});

bench("trie fuzzy", () => {
	idx1.searchFuzzy(randomQuery());
});

bench("inverted fuzzy", () => {
	idx2.searchFuzzy(randomQuery());
});

await run();

/*
$ pnpm run bench
cpu: Apple M2
runtime: node 26.13.1 (arm64-darwin)

benchmark                   avg (min … max) p75 / p99
-------------------------------------------------------
trie exact                    33.61 µs/iter  48.92 µs
inverted exact                28.89 µs/iter  28.44 µs
trie prefix                  204.02 µs/iter 200.59 µs
inverted prefix              758.61 µs/iter 872.08 µs
trie fuzzy                     1.93 ms/iter   2.74 ms   (was 68.8 ms pre-v2.5.0)
inverted fuzzy                11.25 ms/iter  12.90 ms
*/
