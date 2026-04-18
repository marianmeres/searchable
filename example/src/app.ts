/// <reference lib="dom" />
import { createStore } from "@marianmeres/store";
import { Searchable } from "../../src/mod.ts";

type Strategy = "exact" | "prefix" | "fuzzy";

interface Movie {
	title: string;
	year: number | string;
	characters: string[];
	genres: string[];
	actors: string[];
	directors: string[];
}

function qsa<T extends Element = Element>(
	selector: string,
	context: ParentNode | null = null,
): T[] {
	return Array.from((context ?? document).querySelectorAll<T>(selector));
}

function debounce<A extends unknown[]>(
	fn: (...args: A) => void,
	wait: number,
): (...args: A) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return function (this: unknown, ...args: A) {
		if (timeout !== null) clearTimeout(timeout);
		timeout = setTimeout(() => fn.apply(this, args), wait);
	};
}

function getSelectedRadioValue(radios: HTMLInputElement[]): string {
	for (const r of radios) {
		if (r.checked) return r.value;
	}
	return "";
}

const $log = qsa("#console")[0] as HTMLDivElement;
const $input = qsa<HTMLInputElement>("#query")[0];
const $strategyRadios = qsa<HTMLInputElement>('input[name="strategy"]');
const $accent = qsa<HTMLInputElement>("#accent-sensitive")[0];

const initialized = createStore(false);
let index = new Searchable({ ngramsSize: 0, accentSensitive: false });
let docs: Record<string, Movie> = {};

function buildIndex(accentSensitive: boolean) {
	index = new Searchable({ ngramsSize: 0, accentSensitive });
	for (const [id, movie] of Object.entries(docs)) {
		const search = [
			movie.title,
			movie.year,
			movie.characters.join(),
			movie.genres.join(),
			movie.actors.join(),
			movie.directors.join(),
		].join(" ");
		index.add(search, `${id}`);
	}
}

function init(movies: Record<string, Movie>) {
	docs = movies;
	buildIndex($accent.checked);
	initialized.set(true);
}

initialized.subscribe((v) => {
	$input.disabled = !v;
	if (v) {
		$log.innerHTML =
			"Movie data loaded. Type your movie search query in the input above.";
	}
});

const search = debounce((v: string) => {
	const strategy = getSelectedRadioValue($strategyRadios) as Strategy;
	const start = Date.now();
	const docIds = index.search(v, strategy);
	render(docIds, Date.now() - start);
}, 100);

$input.addEventListener("input", (e) => {
	search((e.target as HTMLInputElement).value);
});

$strategyRadios.forEach((radio) => {
	radio.addEventListener("change", () => search($input.value));
});

$accent.addEventListener("change", () => {
	buildIndex($accent.checked);
	search($input.value);
});

function render(docIds: string[], duration: number) {
	const results = (docIds ?? []).reduce<Movie[]>((m, id) => {
		if (docs[id]) m.push(docs[id]);
		return m;
	}, []);

	const rendered = results.slice(0, 1000).map((m) => {
		const actChar = m.actors
			.map((a, i) => `${a} (${m.characters[i]})`)
			.join(", ");
		return [
			`&rarr; `,
			`<span class="title">${m.title}</span> `,
			`<span class="year">(${m.year}, ${m.directors.join(", ")})</span> `,
			`<span class="genres">/ ${m.genres.join(", ")}</span> `,
			`<br/><span class="cast">${actChar}</span> `,
			`<br/>`,
		].join("");
	});

	if (results.length > 1000) {
		rendered.push(
			`\n<span style="color: gray;">...next ${
				results.length - 1000
			} results omitted...</span>`,
		);
	}

	const dur =
		`(Found ${results.length} matching out of ~2500 total records in ${duration} ms)<br/><br/>`;

	$log.innerHTML = dur + rendered.join("<br />");
}

fetch("./movies.json")
	.then((response) => response.json())
	.then((movies: Record<string, Movie>) => init(movies))
	.catch((error) => {
		console.error(error);
		$log.innerHTML =
			`<span style="color: #b00;">Unable to load movie data. Check the console for details.</span>`;
	});
