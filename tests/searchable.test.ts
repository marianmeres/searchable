import path from 'node:path';
import { strict as assert } from 'assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import { Searchable } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = new TestRunner(path.basename(__filename));

suite.test('basic usage', () => {
	const index = new Searchable();

	const license = { to: 'kill' };
	index.add('james bond', license);
	index.add('007', license);

	let results = index.search('bond james bond');
	assert(results.length === 1);
	assert(results[0] === license);

	results = index.search('007 bond');
	assert(results.length === 1);
	assert(results[0] === license);
});

suite.test('all words must find some', () => {
	const index = new Searchable();
	index.add('foo bar', 1);
	index.add('bar baz', 2);
	index.add('baz bat', 3);

	assert(!index.search('bar asdf').length);
});

suite.test('store only ids in the index example', () => {
	const map = { 1: 'peter pan', 2: 'mickey mouse', 3: 'shrek' };
	const index = new Searchable();

	// add only ids to index
	Object.entries(map).forEach(([id, label]) => index.add(label, id));

	// map results back to values
	assert('shrek' === index.search('shr').map((id) => map[id])[0]);
});

suite.test('accent sensitivity example', () => {
	const accented = 'Příliš žluťoučký kůň úpěl ďábelské ódy';

	// accent insensitive (default)
	let index = new Searchable();
	index.add(accented, true);
	assert(index.search('kůň')[0]);
	assert(index.search('kun')[0]);

	// accent sensitive
	index = new Searchable({ accentSensitive: true });
	index.add(accented, true);
	assert(index.search('kůň')[0]);
	assert(!index.search('kun')[0]);
});

suite.test('case sensitivity example', () => {
	// case insensitive (default)
	let index = new Searchable();
	index.add('FoO', true);
	assert(index.search('FOO')[0]);
	assert(index.search('fOo')[0]);

	// case sensitive
	index = new Searchable({ caseSensitive: true });
	index.add('FoO', true);
	assert(!index.search('FOO')[0]);
	assert(!index.search('fOo')[0]);
	assert(index.search('FoO')[0]);
});

suite.test('normalize example', () => {
	const index = new Searchable({
		normalizeWord: (w) => {
			const sports = { basketball: 'sport', football: 'sport' };
			return sports[w] || w;
		},
	});

	index.add('basketball', true);
	index.add('football', true);

	assert(index.search('sport')[0]);
});

suite.test('processResults and querySomeWordMinLength example', () => {
	const index = new Searchable({
		processResults: (results, parseQueryResults) => {
			return results.map((v) => {
				if (v.foo) v.foo = v.foo.toUpperCase();
				return v;
			});
		},
		querySomeWordMinLength: 3,
	});

	const value = { foo: 'bar' };
	index.add(' fOo Bar \n ', value);
	index.add('foo', { foo: 'foo' });
	index.add('bar', { bar: 'bar' });

	// query too short
	assert(!index.search('fo').length);

	//
	const found = index.search(' ba FOO');
	assert(found.length === 1);
	assert(found[0] === value);
	// uppercase BAR because of processResults
	assert(found[0].foo === 'BAR');
});

suite.test('index is serializable', () => {
	const index = new Searchable();
	index.add('james bond', 7);
	const dump = index.dump();
	assert(typeof dump === 'string');

	const index2 = new Searchable();
	index2.restore(dump);
	assert(7 === index2.search('bond')[0]);

	// this unserializable example does NOT work for dump & restore:
	index.add('foo', { foo: Symbol() });
	const index3 = new Searchable();
	index3.restore(index.dump());
	// we get `{}` instead of `{ foo: ... }`, so:
	assert(undefined === index3.search('foo')[0].foo);
});

export default suite;
