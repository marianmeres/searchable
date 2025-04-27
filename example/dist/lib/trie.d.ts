/**
 * TrieNode class represents a node in the Trie data structure
 */
declare class TrieNode {
    /** Map of character to TrieNode */
    children: Map<string, TrieNode>;
    /** Flag if this char represents end of word */
    isEOW: boolean;
    /** Set of docIds associated with this word */
    docIds: Set<string>;
    constructor(
    /** Map of character to TrieNode */
    children?: Map<string, TrieNode>, 
    /** Flag if this char represents end of word */
    isEOW?: boolean, 
    /** Set of docIds associated with this word */
    docIds?: Set<string>);
    toJSON(): Record<string, any>;
}
/** Inverted index manager */
export declare class TrieIndex {
    #private;
    root: TrieNode;
    constructor();
    toJSON(): Record<string, any>;
    /** Get the total number of unique words in the index. */
    get wordCount(): number;
    /**
     * Get the total number of unique docIds in the index.
     */
    get docIdCount(): number;
    /**
     * Get all the words in the index.
     */
    getAllWords(): string[];
    /**
     * Get all the docIds in the index.
     */
    getAllDocIds(): string[];
    /**
     * Will add the provided word + docId pair to index.
     * It is assumed the word is already normalized.
     */
    addWord(word: string, docId: string): boolean;
    /**
     * Removes a word and associated docId from the index
     */
    removeWord(word: string, docId: string): boolean;
    /**
     * Removes all entries for a given docId
     */
    removeDocId(docId: string): number;
    /**
     * Search for documents containing the exact word.
     */
    searchExact(word: string): string[];
    /**
     * Search for documents containing words with the given prefix.
     */
    searchByPrefix(prefix: string): string[];
    searchByPrefix(prefix: string, returnWithDistance: true): Record<string, number>;
    /**
     * Search for all words associated with a docId.
     */
    searchByDocId(docId: string): string[];
    /**
     * Search for docIds containing words similar to the query using Levenshtein distance.
     */
    searchFuzzy(word: string, maxDistance?: number): string[];
    searchFuzzy(word: string, maxDistance: number, returnWithDistance: true): Record<string, number>;
    /**
     * Dumps the entire index into a JSON stringifiable structure
     */
    dump(): {
        version?: string;
        words: Record<string, string[]>;
    };
    /**
     * Restores the index from a dump structure
     */
    restore(data: string | {
        version?: string;
        words: Record<string, string[]>;
    }): boolean;
}
export {};
