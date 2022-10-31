/**
 * Initial inspiration taken from:
 * https://gist.github.com/tpae/72e1c54471e88b689f85ad2b3940a8f0
 */

class TrieNode {
	public parent: TrieNode = null;

	public children: Record<string, TrieNode> = {};

	protected _store: Set<any> = new Set();

	constructor(public key: string, values: any[] = []) {
		if (Array.isArray(values)) {
			this._store = new Set(values);
		}
	}

	addValues(values: any[] = []) {
		(values || []).forEach((v) => this._store.add(v));
		return this;
	}

	setValues(values: any[] = []) {
		this._store.clear();
		return this.addValues(values);
	}

	getValues() {
		return Array.from(this._store);
	}

	getWord() {
		let output = [];
		let node: TrieNode = this;

		while (node !== null) {
			output.unshift(node.key);
			node = node.parent;
		}

		return output.join('');
	}

	getChildrenCount() {
		// return Object.keys(this.children).filter((k) => k !== Trie.VALUES_KEY).length;
		return Object.keys(this.children).length - 1;
	}
}

export interface TrieNodeDTO {
	[Trie.DUMP_VALUES_KEY]: any[];
	[key: string]: any | TrieNodeDTO;
}

const _unique = (arr) => Array.from(new Set(arr));

export class Trie {
	public static readonly DUMP_VALUES_KEY = '__';

	protected _root = new TrieNode(null);

	clear() {
		this._root = new TrieNode(null);
	}

	insert(word: string, values: any[] = null) {
		let node = this._root;

		for (let char of word) {
			if (!node.children[char]) {
				node.children[char] = new TrieNode(char, values);
				node.children[char].parent = node;
			} else {
				node.children[char].addValues(values);
			}

			node = node.children[char];
		}
	}

	find(word: string): TrieNode {
		let node = this._root;

		for (let char of word) {
			if (node.children[char]) {
				node = node.children[char];
			} else {
				return null;
			}
		}

		return node;
	}

	remove(word: string): boolean {
		let node: TrieNode = this.find(word);
		if (!node) return false;

		while (node.parent.key) {
			delete node.children;
			delete node.parent.children[node.key];
			node = node.parent;
		}

		// now update values in the top node by collecting from remaining direct children (if any)
		node.setValues(
			Object.values(node.children).reduce((m, n) => [...m, ...n.getValues()], [])
		);

		return true;
	}

	toJSON() {
		return this.dump();
	}

	dump() {
		let out: Partial<TrieNodeDTO> = {};

		const _getChildren = (node: TrieNode, out: Partial<TrieNodeDTO>) => {
			for (let child of Object.values(node.children)) {
				out[child.key] ||= { [Trie.DUMP_VALUES_KEY]: [] };
				out[child.key][Trie.DUMP_VALUES_KEY] = _unique([
					...out[child.key][Trie.DUMP_VALUES_KEY],
					...child.getValues(),
				]);
				_getChildren(child, out[child.key]);
			}
		};

		_getChildren(this._root, out);

		return out;
	}

	restore(dump: Partial<TrieNodeDTO>) {
		this.clear();

		// prepare
		const words = {};
		const _walk = (_dump: Partial<TrieNodeDTO>, prefix) => {
			for (let [key, child] of Object.entries(_dump)) {
				if (key !== Trie.DUMP_VALUES_KEY) {
					prefix += key;
					words[prefix] ||= [];
					words[prefix] = [...words[prefix], ...child[Trie.DUMP_VALUES_KEY]];
					_walk(_dump[key], prefix);
					prefix = '';
				}
			}
		};
		_walk(dump, '');

		// insert
		Object.entries(words).forEach(([word, values]) => this.insert(word, values as any));

		return this;
	}
}
