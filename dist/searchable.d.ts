import { Trie } from './trie.js';
interface ParseQueryResult {
    operators: Record<string, any>;
    query: string;
}
interface SearchableOptions {
    caseSensitive: boolean;
    accentSensitive: boolean;
    isStopword: (word: string) => boolean;
    normalizeWord: (word: string) => string | string[];
    processResults: (results: any, parseQueryResults: ParseQueryResult) => any[];
    parseQuery: (query: string) => ParseQueryResult;
    querySomeWordMinLength: number;
}
export declare class Searchable {
    options: Partial<SearchableOptions>;
    static readonly defaultOptions: SearchableOptions;
    protected _index: Trie;
    constructor(options?: Partial<SearchableOptions>);
    clear(): this;
    static normalizeInput: (input: string) => string;
    toWords(input: string): string[];
    add(searchable: string, value: any): boolean;
    search(searchQuery: string): any[];
    dump(): string;
    restore(dump: any): this;
}
export {};
