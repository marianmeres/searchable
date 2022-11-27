import { Trie } from './trie.js';
import intersection from 'lodash-es/intersection.js';

interface ParseQueryResult {
	operators: Record<string, any>;
	query: string;
}

interface SearchableOptions {
	caseSensitive: boolean;
	accentSensitive: boolean;
	isStopword: (word: string) => boolean;
	// stemmer, spell check, ...
	normalizeWord: (word: string) => string | string[];
	processResults: (results, parseQueryResults: ParseQueryResult) => any[];
	parseQuery: (query: string) => ParseQueryResult;
	querySomeWordMinLength: number;
}

const unaccent = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export class Searchable {
	static readonly defaultOptions: SearchableOptions = {
		caseSensitive: false,
		accentSensitive: false,
		isStopword: (word): boolean => false,
		normalizeWord: (word): string => word,
		processResults: (results, parseQueryResults: ParseQueryResult): any[] => results,
		parseQuery: (query): ParseQueryResult => ({ query, operators: null }),
		querySomeWordMinLength: 1,
	};

	// actual index
	protected _index: Trie = new Trie();

	constructor(public options: Partial<SearchableOptions> = {}) {
		this.options = { ...Searchable.defaultOptions, ...this.options };
	}

	clear() {
		this._index.clear();
		return this;
	}

	toWords(input: string): string[] {
		let words: any = `${input}`
			.trim()
			.replace(/\s\s+/g, ' ')
			.split(' ')
			// checking stopword twice: both before and after normalization
			.filter((w) => w && !this.options.isStopword(w));

		// normalizeWord can return array of new words
		words = words.reduce((m, w) => {
			w = this.options.normalizeWord(w);
			if (w && Array.isArray(w)) {
				m = [...m, ...w];
			} else if (w) {
				m.push(w);
			}
			return m;
		}, []);

		words = words.map((w) => {
			if (w && this.options.isStopword(w)) w = null;
			if (w && !this.options.caseSensitive) w = w.toLowerCase();
			if (w && !this.options.accentSensitive) w = unaccent(w);
			return w;
		}).filter(Boolean)

		// unique
		return Array.from(new Set(words));
	}

	add(searchable: string, value: any): boolean {
		if (value === undefined) return false;

		//
		const words = this.toWords(searchable);
		if (!words.length) return false;

		//
		words.forEach((word) => this._index.insert(word, [value]));

		return true;
	}

	search(searchQuery: string) {
		const { parseQuery, querySomeWordMinLength, processResults } = this.options;
		const parseQueryResult = parseQuery(searchQuery);
		const hasOperators =
			parseQueryResult.operators && Object.keys(parseQueryResult.operators).length > 0;

		const words = this.toWords(parseQueryResult.query);
		if (!hasOperators && !words.length) return [];
		if (!hasOperators && !words.some((w) => w.length >= querySomeWordMinLength)) {
			return [];
		}
		const hasWords = words.length > 0;

		// array of arrays of found ids for each word... we'll need to intersect for the final result
		const _foundValues = [];

		for (let word of words) {
			const found = this._index.find(word);
			if (found) _foundValues.push(found.getValues());
			else return [];
		}

		// important!
		let results = intersection(..._foundValues);

		return processResults(results, parseQueryResult);
	}

	//
	dump() {
		return JSON.stringify(this._index.dump());
	}

	restore(dump) {
		if (typeof dump === 'string') {
			dump = JSON.parse(dump);
		}
		this._index.restore(dump);
		return this;
	}
}
