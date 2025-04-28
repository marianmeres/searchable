import { Index } from "./index-abstract.js";
import { levenshteinDistance } from "./levenshtein.js";
/** Inverted index manager */
export class InvertedIndex extends Index {
    // Main index: word -> Set of docIds
    #wordToDocIds = new Map();
    // Reverse index: docId -> Set of words
    #docIdToWords = new Map();
    /** Get the total number of unique words in the index. */
    get wordCount() {
        return this.#wordToDocIds.size;
    }
    /**
     * Get the total number of unique docIds in the index.
     */
    get docIdCount() {
        return this.#docIdToWords.size;
    }
    /**
     * Get all the words in the index.
     */
    getAllWords() {
        return [...this.#wordToDocIds.keys()];
    }
    /**
     * Get all the docIds in the index.
     */
    getAllDocIds() {
        return [...this.#docIdToWords.keys()];
    }
    #assertWordAndDocId(word, docId) {
        if (!word || typeof word !== "string") {
            throw new Error("Word must be a non-empty string");
        }
        if (!docId || typeof docId !== "string") {
            throw new Error("DocId must be a non-empty string");
        }
    }
    /**
     * Will add the provided word + docId pair to index.
     * It is assumed the word is already normalized.
     */
    addWord(word, docId) {
        this.#assertWordAndDocId(word, docId);
        // Add to word -> docIds mapping
        if (!this.#wordToDocIds.has(word)) {
            this.#wordToDocIds.set(word, new Set());
        }
        const docIds = this.#wordToDocIds.get(word);
        const isNewEntry = !docIds.has(docId);
        docIds.add(docId);
        // Add to docId -> words mapping
        if (!this.#docIdToWords.has(docId)) {
            this.#docIdToWords.set(docId, new Set());
        }
        this.#docIdToWords.get(docId).add(word);
        return isNewEntry;
    }
    /**
     * Will remove the provided word + docId pair from index.
     * It is assumed the word is already normalized.
     */
    removeWord(word, docId) {
        this.#assertWordAndDocId(word, docId);
        // Remove from word -> docIds mapping
        const docIds = this.#wordToDocIds.get(word);
        if (!docIds)
            return false;
        const removed = docIds.delete(docId);
        // If no more docs contain this word, remove the word entry entirely
        if (docIds.size === 0) {
            this.#wordToDocIds.delete(word);
        }
        // Remove from docId -> words mapping
        const words = this.#docIdToWords.get(docId);
        if (words) {
            words.delete(word);
            if (words.size === 0) {
                this.#docIdToWords.delete(docId);
            }
        }
        return removed;
    }
    /**
     * Remove all entries for a given docId.
     */
    removeDocId(docId) {
        const words = this.#docIdToWords.get(docId);
        if (!words)
            return 0;
        const count = words.size;
        // Remove all words associated with this docId
        for (const word of words) {
            const docIds = this.#wordToDocIds.get(word);
            docIds.delete(docId);
            // Clean up empty word entries
            if (docIds.size === 0) {
                this.#wordToDocIds.delete(word);
            }
        }
        // Remove the docId entry
        this.#docIdToWords.delete(docId);
        return count;
    }
    /**
     * Search for docIds containing the exact word.
     */
    searchExact(word) {
        const result = this.#wordToDocIds.get(word);
        return result ? [...new Set(result)] : [];
    }
    searchByPrefix(prefix, returnWithDistance = false) {
        const results = new Set();
        const idToDistance = new Map();
        for (const [word, docIds] of this.#wordToDocIds.entries()) {
            if (word.startsWith(prefix)) {
                const distance = levenshteinDistance(prefix, word);
                // console.log(prefix, word, distance);
                docIds.forEach((id) => {
                    results.add(id);
                    if (idToDistance.has(id)) {
                        idToDistance.set(id, Math.min(distance, idToDistance.get(id)));
                    }
                    else {
                        idToDistance.set(id, distance);
                    }
                });
            }
        }
        if (returnWithDistance) {
            return results.values().reduce((m, id) => {
                m[id] = idToDistance.get(id);
                return m;
            }, {});
        }
        const sortByDistanceAsc = (a, b) => idToDistance.get(a) - idToDistance.get(b);
        return [...results].toSorted(sortByDistanceAsc);
    }
    /**
     * Search for all words associated with a docIds.
     */
    searchByDocId(docId) {
        const words = this.#docIdToWords.get(docId);
        return words ? [...new Set(words)] : [];
    }
    searchFuzzy(word, maxDistance = 2, returnWithDistance = false) {
        const results = new Set();
        const idToDistance = new Map();
        for (const [indexedWord, docIds] of this.#wordToDocIds.entries()) {
            const distance = levenshteinDistance(word, indexedWord);
            if (distance <= maxDistance) {
                docIds.forEach((id) => {
                    results.add(id);
                    if (idToDistance.has(id)) {
                        idToDistance.set(id, Math.min(distance, idToDistance.get(id)));
                    }
                    else {
                        idToDistance.set(id, distance);
                    }
                });
            }
        }
        if (returnWithDistance) {
            return results.values().reduce((m, id) => {
                m[id] = idToDistance.get(id);
                return m;
            }, {});
        }
        const sortByDistanceAsc = (a, b) => idToDistance.get(a) - idToDistance.get(b);
        return [...results].toSorted(sortByDistanceAsc);
    }
    /**
     * Dump the index to a JSON-stringifiable structure.
     */
    dump() {
        // Convert the Map of Sets to a plain object with arrays
        const words = {};
        for (const [word, docIds] of this.#wordToDocIds.entries()) {
            words[word] = [...docIds];
        }
        return { words, version: "1.0" };
    }
    /**
     * Clear exising internal state (if any), and restores the index from a previously
     * dumped structure.
     * This method rebuilds the inverted index from a structure created by the dump() method.
     */
    restore(data) {
        try {
            if (typeof data === "string") {
                data = JSON.parse(data);
            }
            if (!data || !data.words) {
                return false;
            }
            // Clear existing data
            this.#wordToDocIds.clear();
            this.#docIdToWords.clear();
            // Restore wordToDocIds (word -> Set of docIds)
            for (const [word, docIds] of Object.entries(data.words)) {
                this.#wordToDocIds.set(word, new Set(docIds));
                for (const docId of docIds.values()) {
                    if (!this.#docIdToWords.has(docId)) {
                        this.#docIdToWords.set(docId, new Set());
                    }
                    this.#docIdToWords.get(docId).add(word);
                }
            }
            return true;
        }
        catch (e) {
            console.error("Error restoring index", e);
            throw new Error("Error restoring index");
        }
    }
}
