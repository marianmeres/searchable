/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="esnext" />
/**
 * Example app for `@marianmeres/searchable`.
 *
 * A live playground that searches a ~2500-record movie dataset across the three
 * strategies the library ships (`exact` / `prefix` / `fuzzy`), with an optional
 * accent-sensitive index.
 *
 * Built with `@marianmeres/vanilla`: explicit reactive state (`observable` /
 * `computed`), markup that lives in `<template>`s (`fromTemplate` / `refs`), and
 * a single delegated listener tree (`delegate`). All wiring is torn down by the
 * view's `track()`-based lifecycle.
 *
 * This is browser code: the triple-slash lib references above type it against the
 * DOM (the repo's `deno.json` targets the Deno runtime for the library itself).
 *
 * Bundle with: `deno task example:build` (→ `example/dist/bundle.js`).
 */
import {
	computed,
	createView,
	delegate,
	fromTemplate,
	observable,
	refs,
} from "@marianmeres/vanilla";
import { Searchable } from "../../src/mod.ts";
import { VERSION } from "./version.generated.ts";

/* ---- Config --------------------------------------------------------------- */

type Strategy = "exact" | "prefix" | "fuzzy";

interface Movie {
	title: string;
	year: number | string;
	characters: string[];
	genres: string[];
	actors: string[];
	directors: string[];
}

/** How many matched movies to render at most (the index can match thousands). */
const RENDER_LIMIT = 100;

/** Must match the literal in the anti-FOUC inline script in index.html. */
const THEME_KEY = "searchable-example-theme";

/* ---- State (module-level: outlives any view) ------------------------------ */

const query = observable("");
const strategy = observable<Strategy>("prefix");
const accentSensitive = observable(false);
const ready = observable(false);
const loadError = observable<string | null>(null);
// Bumped after the index is (re)built so the search `computed` re-runs against
// the new index. The index itself is a side-effecting object, not reactive.
const indexNonce = observable(0);

let index: Searchable | null = null;
let docs: Record<string, Movie> = {};
let totalDocs = 0;

/** Concatenate the searchable fields of one movie into a single index input. */
const toSearchText = (m: Movie): string =>
	[
		m.title,
		m.year,
		m.characters.join(" "),
		m.genres.join(" "),
		m.actors.join(" "),
		m.directors.join(" "),
	].join(" ");

/** (Re)build the whole index from `docs`, then signal dependents via the nonce. */
function buildIndex(): void {
	const idx = new Searchable({ ngramsSize: 0, accentSensitive: accentSensitive.get() });
	for (const id in docs) idx.add(toSearchText(docs[id]), id);
	index = idx;
	indexNonce.update((n) => n + 1);
}

// The search itself. Re-runs on query / strategy / index changes. Returns null
// until the index exists (loading), `{ docIds: [], duration: 0 }` for an empty
// query, and the matched doc ids + elapsed time otherwise.
const result = computed(
	[query, strategy, indexNonce],
	(): { docIds: string[]; duration: number } | null => {
		if (!index) return null;
		const q = query.get().trim();
		if (!q) return { docIds: [], duration: 0 };
		const start = performance.now();
		const docIds = index.search(q, strategy.get());
		return { docIds, duration: performance.now() - start };
	},
);

/* ---- Theme (page-level, class-based: matches the design-tokens `.dark`) ----
 * The class is set pre-paint by the inline script in index.html; this keeps it
 * and the browser chrome color (<meta name="theme-color">) in sync afterwards. */

const prefersDark = (): boolean =>
	globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

const applyTheme = (dark: boolean): void => {
	const root = document.documentElement;
	root.classList.toggle("dark", dark);
	const bg = getComputedStyle(root)
		.getPropertyValue("--stuic-color-background")
		.trim();
	if (bg) {
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute("content", bg);
	}
};

let isDark = (() => {
	const stored = localStorage.getItem(THEME_KEY);
	return stored ? stored === "dark" : prefersDark();
})();
applyTheme(isDark);

const toggleTheme = (): void => {
	isDark = !isDark;
	applyTheme(isDark);
	localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
};

/* ---- Utils ---------------------------------------------------------------- */

function debounce<A extends unknown[]>(
	fn: (...args: A) => void,
	wait: number,
): (...args: A) => void {
	let t: ReturnType<typeof setTimeout> | undefined;
	return (...args: A) => {
		if (t) clearTimeout(t);
		t = setTimeout(() => fn(...args), wait);
	};
}

const nf = new Intl.NumberFormat();
const fmt = (n: number): string => nf.format(n);

/** Keystrokes feed the reactive query through a short debounce. */
const setQuery = debounce((v: string) => query.set(v), 120);

/* ---- View ----------------------------------------------------------------- */

const app = createView((track) => {
	const el = fromTemplate("tpl-app");
	const r = refs(el);
	const input = r.query as HTMLInputElement;

	const setStatus = (text: string, isError = false): void => {
		r.status.textContent = text;
		r.status.classList.toggle("status--error", isError);
	};

	const renderMovies = (movies: Movie[]): void => {
		const frag = document.createDocumentFragment();
		for (const m of movies) {
			const li = fromTemplate("tpl-result");
			const lr = refs(li);
			lr.title.textContent = m.title;
			lr.meta.textContent = [
				String(m.year),
				m.directors.join(", "),
				m.genres.join(", "),
			].filter(Boolean).join(" · ");
			const cast = m.actors
				.map((a, i) => (m.characters[i] ? `${a} (${m.characters[i]})` : a))
				.filter(Boolean)
				.join(", ");
			lr.cast.textContent = cast;
			lr.cast.hidden = !cast;
			frag.appendChild(li);
		}
		r.results.replaceChildren(frag);
		r.scroll.scrollTop = 0; // a new query starts at the top of the list
	};

	// Enable the input once data is loaded.
	track(ready.subscribe((v) => {
		input.disabled = !v;
	}));

	// A load failure short-circuits everything else.
	track(loadError.subscribe((msg) => {
		if (!msg) return;
		setStatus(msg, true);
		r.results.replaceChildren();
		r.empty.hidden = true;
	}));

	// Drive the status line + result list off the search result.
	track(result.subscribe((res) => {
		if (loadError.get()) return;

		if (!res) {
			setStatus("Loading movie data…");
			r.results.replaceChildren();
			r.empty.hidden = true;
			return;
		}

		if (!query.get().trim()) {
			setStatus(
				`Ready — ${fmt(totalDocs)} movies indexed. Start typing to search.`,
			);
			r.results.replaceChildren();
			r.empty.hidden = true;
			return;
		}

		const { docIds, duration } = res;
		if (docIds.length === 0) {
			setStatus(`No matches in ${duration.toFixed(1)} ms.`);
			r.results.replaceChildren();
			r.empty.hidden = false;
			return;
		}

		const shown = docIds.slice(0, RENDER_LIMIT).map((id) => docs[id]);
		const capped = docIds.length > RENDER_LIMIT
			? ` — showing first ${RENDER_LIMIT}`
			: "";
		setStatus(
			`${fmt(docIds.length)} ${docIds.length === 1 ? "match" : "matches"} of ` +
				`${fmt(totalDocs)} in ${duration.toFixed(1)} ms${capped}.`,
		);
		r.empty.hidden = true;
		renderMovies(shown);
	}));

	// One delegated listener tree for the whole view (events bubble to `el`).
	track(delegate(el, {
		setQuery: (_e, t) => setQuery((t as HTMLInputElement).value),
		setStrategy: (_e, t) => strategy.set((t as HTMLInputElement).value as Strategy),
		setAccent: (_e, t) => {
			accentSensitive.set((t as HTMLInputElement).checked);
			if (totalDocs > 0) buildIndex(); // re-index, then re-search via the nonce
		},
		toggleTheme: () => toggleTheme(),
	}));

	r.version.textContent = `v${VERSION}`;

	return { el };
});

document.getElementById("app")!.appendChild(app.el!);

/* ---- Data load ------------------------------------------------------------ */

fetch("./movies.json")
	.then((res) => res.json())
	.then((movies: Record<string, Movie>) => {
		docs = movies;
		totalDocs = Object.keys(movies).length;
		buildIndex();
		ready.set(true);
	})
	.catch((err) => {
		console.error(err);
		loadError.set("Unable to load movie data. Check the console for details.");
	});
