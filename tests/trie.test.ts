import path from 'node:path';
import _ from 'lodash';
import { strict as assert } from 'assert';
import { TestRunner } from '@marianmeres/test-runner';
import { fileURLToPath } from 'node:url';
import { Trie } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suite = new TestRunner(path.basename(__filename));

suite.test('insert & find & dump & restore works', () => {
	const trie = new Trie();
	trie.insert('hey', [1]);
	trie.insert('ho', [2]);
	trie.insert('hey ho', [3]);

	const expected = {
		h: {
			[Trie.DUMP_VALUES_KEY]: [1, 2, 3],
			e: {
				[Trie.DUMP_VALUES_KEY]: [1, 3],
				y: {
					[Trie.DUMP_VALUES_KEY]: [1, 3],
					' ': {
						[Trie.DUMP_VALUES_KEY]: [3],
						h: {
							[Trie.DUMP_VALUES_KEY]: [3],
							o: {
								[Trie.DUMP_VALUES_KEY]: [3],
							},
						},
					},
				},
			},
			o: {
				[Trie.DUMP_VALUES_KEY]: [2],
			},
		},
	};

	const dump = trie.dump();
	assert(_.isEqual(expected, dump));

	assert(trie.find('h'));
	assert(trie.find('ho'));
	assert(trie.find('hey '));
	assert(trie.find('hey ho'));

	assert(!trie.find('hey hoX'));
	assert(!trie.find('hex ho'));
	assert(!trie.find('x'));

	assert('1,2,3' === trie.find('h').getValues().join(','));
	assert('3' === trie.find('hey ho').getValues().join(','));

	// manually hack dump and restore it, which creates completely new trie structure
	dump.x = dump.h;
	delete dump.h;
	trie.restore(dump);

	assert(!trie.find('h'));
	assert(!trie.find('hey ho'));
	assert(trie.find('x'));
	assert('1,2,3' === trie.find('x').getValues().join(','));
	assert('3' === trie.find('xey ho').getValues().join(','));
});

suite.test('remove works', () => {
	const trie = new Trie();
	trie.insert('hey', [1]);
	trie.insert('ho', [2]);
	trie.insert('hey ho', [3]);
	trie.insert('ha', [4]);

	// console.log(JSON.stringify(trie, null, 4))
	trie.remove('hey');
	// console.log(JSON.stringify(trie, null, 4))

	assert(!trie.find('hey ho'));
	assert(!trie.find('hey'));
	assert(trie.find('ho'));
	assert(trie.find('h'));

	// important:
	assert('2,4' === trie.find('h').getValues().sort().join(','));
});

export default suite;
