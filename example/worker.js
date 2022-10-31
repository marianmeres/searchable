import { Searchable } from "../dist/searchable.esm.js";
import { movies } from './movies.js';

console.log('Total records:', movies.length);

// just a naive examplehere ... for more complex solution use something
// like https://github.com/nepsilon/search-query-parser
const parseQuery = (_query) => {
	const { query, operators } = (_query || '').split(' ').reduce((m, w) => {
		const match = w.match(/^(before|after):(\w+)$/);
		if (match) {
			m.operators[match[1]] = match[2];
		} else {
			m.query += `${w} `;
		}
		return m;
	}, { query: '', operators: {} })

	return { query, operators };
}

// filtering final results based on operators (if any)
const processResults = (results, { query, operators }) => {
	// special case, no results but not empty operators... in such case, use as results
	// the complete result set
	if (!results.length && Object.keys(operators).length) {
		results = movies;
	}

	// filter by operators
	let out = results.filter((r) => {
		let flag = true;
		if (flag && operators.after && /\d+/.test(operators.after)) {
			flag = r.year >= parseInt(operators.after, 10);
		}
		if (flag && operators.before && /\d+/.test(operators.before)) {
			flag = r.year < parseInt(operators.before, 10);
		}
		return flag;
	});

	// sort output by year
	return out.sort((a, b) => a.year - b.year);
}

//
const index = new Searchable({ parseQuery, processResults });

const init = (movies) => movies.forEach((m) => {
	index.add(
		`${m.title} ${m.year} ${m.directors.join(' ')} ${m.actors.join(' ')} ${m.characters.join(' ')} ${m.genres.join(' ')}`,
		m
	);
})

addEventListener('message', (message) => {
	const { command, data } = message.data;
	switch (command) {
		case 'init':
			init(movies);
			return postMessage({ response: 'results', data: movies });
		case 'search':
			return postMessage({
				response: 'results',
				data: data ? index.search(data) : movies
			});
	}
});
