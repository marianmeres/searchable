// deno-lint-ignore-file no-explicit-any

import { Searchable } from "../src/searchable.ts";
import { movies } from "./movies.js";

/**
 * Bench observations (see results below):
 *
 * - `searchExact` is extremely and equally fast (within µs) for both "inverted" and "trie"
 *
 * - "inverted" is slightly less performant vs "trie" for `searchByPrefix`
 *   BUT it is the opposite for `searchFuzzy`. In the real-wold, both are fast
 *   enough (still within µs for prefix, but within ms for fuzzy) and the
 *   difference would be (outside of bench) unnoticeable.
 *
 * - "searchFuzzy" is (obviously) significantly slowest (well within ms) from the rest
 *
 * VERDICT: seems like "inverted" is the better general pick due to the better searchFuzzy
 * performance. If not using fuzzy, both are (almost) equally fast (searchByPrefix is
 * only very slightly better in trie). "Inverted" has also significantly easier
 * implementation.
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
Runtime | Deno 2.2.6 (aarch64-apple-darwin)

benchmark         time/iter (avg)        iter/s      (min … max)           p75      p99     p995
----------------- ----------------------------- --------------------- --------------------------
trie exact                16.7 µs        59,740 (  2.8 µs …   2.3 ms)  26.3 µs  32.8 µs  35.3 µs
inverted exact            16.4 µs        60,990 (  2.6 µs … 825.3 µs)  25.9 µs  32.5 µs  35.5 µs
trie prefix              296.9 µs         3,368 ( 28.4 µs … 968.1 µs) 548.5 µs 704.5 µs 725.9 µs
inverted prefix          620.3 µs         1,612 (334.0 µs …   1.7 ms) 762.6 µs   1.2 ms   1.2 ms
trie fuzzy                68.8 ms          14.5 ( 35.2 ms …  98.8 ms)  76.6 ms  98.8 ms  98.8 ms
inverted fuzzy            17.7 ms          56.6 (  8.3 ms …  22.7 ms)  22.1 ms  22.7 ms  22.7 ms
*/
