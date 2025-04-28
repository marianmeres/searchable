import { Index } from "./index-abstract.js";
/** Inverted index manager */
export declare class InvertedIndex extends Index {
    #private;
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
     * Will remove the provided word + docId pair from index.
     * It is assumed the word is already normalized.
     */
    removeWord(word: string, docId: string): boolean;
    /**
     * Remove all entries for a given docId.
     */
    removeDocId(docId: string): number;
    /**
     * Search for docIds containing the exact word.
     */
    searchExact(word: string): string[];
    /**
     * Search for docIds containing words with the given prefix.
     */
    searchByPrefix(prefix: string): string[];
    searchByPrefix(prefix: string, returnWithDistance: true): Record<string, number>;
    /**
     * Search for all words associated with a docIds.
     */
    searchByDocId(docId: string): string[];
    /**
     * Search for docIds containing words similar to the query using Levenshtein distance.
     */
    searchFuzzy(word: string, maxDistance?: number): string[];
    searchFuzzy(word: string, maxDistance: number, returnWithDistance: true): Record<string, number>;
    /**
     * Dump the index to a JSON-stringifiable structure.
     */
    dump(): {
        version?: string;
        words: Record<string, string[]>;
    };
    /**
     * Clear exising internal state (if any), and restores the index from a previously
     * dumped structure.
     * This method rebuilds the inverted index from a structure created by the dump() method.
     */
    restore(data: string | {
        version?: string;
        words: Record<string, string[]>;
    }): boolean;
}
