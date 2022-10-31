declare class TrieNode {
    key: string;
    parent: TrieNode;
    children: Record<string, TrieNode>;
    protected _store: Set<any>;
    constructor(key: string, values?: any[]);
    addValues(values?: any[]): this;
    setValues(values?: any[]): this;
    getValues(): any[];
    getWord(): string;
    getChildrenCount(): number;
}
export interface TrieNodeDTO {
    [Trie.DUMP_VALUES_KEY]: any[];
    [key: string]: any | TrieNodeDTO;
}
export declare class Trie {
    static readonly DUMP_VALUES_KEY = "__";
    protected _root: TrieNode;
    clear(): void;
    insert(word: string, values?: any[]): void;
    find(word: string): TrieNode;
    remove(word: string): boolean;
    toJSON(): Partial<TrieNodeDTO>;
    dump(): Partial<TrieNodeDTO>;
    restore(dump: Partial<TrieNodeDTO>): this;
}
export {};
