function intersect(...arrays) {
    const [array, ...otherArrays] = arrays;
    let set = new Set(array);
    for (const array of otherArrays){
        set = set.intersection(new Set(array));
        if (set.size === 0) break;
    }
    return [
        ...set
    ];
}
export { intersect as intersect };
class Index {
}
function levenshteinDistance(source, target) {
    const matrix = [];
    for(let i = 0; i <= source.length; i++){
        matrix[i] = [
            i
        ];
    }
    for(let j = 0; j <= target.length; j++){
        matrix[0][j] = j;
    }
    for(let i = 1; i <= source.length; i++){
        for(let j = 1; j <= target.length; j++){
            const cost = source[i - 1] === target[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[source.length][target.length];
}
export { levenshteinDistance as levenshteinDistance };
class InvertedIndex extends Index {
    #wordToDocIds = new Map();
    #docIdToWords = new Map();
    get wordCount() {
        return this.#wordToDocIds.size;
    }
    get docIdCount() {
        return this.#docIdToWords.size;
    }
    getAllWords() {
        return [
            ...this.#wordToDocIds.keys()
        ];
    }
    getAllDocIds() {
        return [
            ...this.#docIdToWords.keys()
        ];
    }
    #assertWordAndDocId(word, docId) {
        if (!word || typeof word !== "string") {
            throw new Error("Word must be a non-empty string");
        }
        if (!docId || typeof docId !== "string") {
            throw new Error("DocId must be a non-empty string");
        }
    }
    addWord(word, docId) {
        this.#assertWordAndDocId(word, docId);
        if (!this.#wordToDocIds.has(word)) {
            this.#wordToDocIds.set(word, new Set());
        }
        const docIds = this.#wordToDocIds.get(word);
        const isNewEntry = !docIds.has(docId);
        docIds.add(docId);
        if (!this.#docIdToWords.has(docId)) {
            this.#docIdToWords.set(docId, new Set());
        }
        this.#docIdToWords.get(docId).add(word);
        return isNewEntry;
    }
    removeWord(word, docId) {
        this.#assertWordAndDocId(word, docId);
        const docIds = this.#wordToDocIds.get(word);
        if (!docIds) return false;
        const removed = docIds.delete(docId);
        if (docIds.size === 0) {
            this.#wordToDocIds.delete(word);
        }
        const words = this.#docIdToWords.get(docId);
        if (words) {
            words.delete(word);
            if (words.size === 0) {
                this.#docIdToWords.delete(docId);
            }
        }
        return removed;
    }
    removeDocId(docId) {
        const words = this.#docIdToWords.get(docId);
        if (!words) return 0;
        const count = words.size;
        for (const word of words){
            const docIds = this.#wordToDocIds.get(word);
            docIds.delete(docId);
            if (docIds.size === 0) {
                this.#wordToDocIds.delete(word);
            }
        }
        this.#docIdToWords.delete(docId);
        return count;
    }
    searchExact(word) {
        const result = this.#wordToDocIds.get(word);
        return result ? [
            ...new Set(result)
        ] : [];
    }
    searchByPrefix(prefix, returnWithDistance = false) {
        const results = new Set();
        const idToDistance = new Map();
        for (const [word, docIds] of this.#wordToDocIds.entries()){
            if (word.startsWith(prefix)) {
                const distance = levenshteinDistance(prefix, word);
                docIds.forEach((id)=>{
                    results.add(id);
                    if (idToDistance.has(id)) {
                        idToDistance.set(id, Math.min(distance, idToDistance.get(id)));
                    } else {
                        idToDistance.set(id, distance);
                    }
                });
            }
        }
        if (returnWithDistance) {
            return results.values().reduce((m, id)=>{
                m[id] = idToDistance.get(id);
                return m;
            }, {});
        }
        const sortByDistanceAsc = (a, b)=>idToDistance.get(a) - idToDistance.get(b);
        return [
            ...results
        ].toSorted(sortByDistanceAsc);
    }
    searchByDocId(docId) {
        const words = this.#docIdToWords.get(docId);
        return words ? [
            ...new Set(words)
        ] : [];
    }
    searchFuzzy(word, maxDistance = 2, returnWithDistance = false) {
        const results = new Set();
        const idToDistance = new Map();
        for (const [indexedWord, docIds] of this.#wordToDocIds.entries()){
            const distance = levenshteinDistance(word, indexedWord);
            if (distance <= maxDistance) {
                docIds.forEach((id)=>{
                    results.add(id);
                    if (idToDistance.has(id)) {
                        idToDistance.set(id, Math.min(distance, idToDistance.get(id)));
                    } else {
                        idToDistance.set(id, distance);
                    }
                });
            }
        }
        if (returnWithDistance) {
            return results.values().reduce((m, id)=>{
                m[id] = idToDistance.get(id);
                return m;
            }, {});
        }
        const sortByDistanceAsc = (a, b)=>idToDistance.get(a) - idToDistance.get(b);
        return [
            ...results
        ].toSorted(sortByDistanceAsc);
    }
    dump() {
        const words = {};
        for (const [word, docIds] of this.#wordToDocIds.entries()){
            words[word] = [
                ...docIds
            ];
        }
        return {
            words,
            version: "1.0"
        };
    }
    restore(data) {
        try {
            if (typeof data === "string") {
                data = JSON.parse(data);
            }
            if (!data || !data.words) {
                return false;
            }
            this.#wordToDocIds.clear();
            this.#docIdToWords.clear();
            for (const [word, docIds] of Object.entries(data.words)){
                this.#wordToDocIds.set(word, new Set(docIds));
                for (const docId of docIds.values()){
                    if (!this.#docIdToWords.has(docId)) {
                        this.#docIdToWords.set(docId, new Set());
                    }
                    this.#docIdToWords.get(docId).add(word);
                }
            }
            return true;
        } catch (e) {
            console.error("Error restoring index", e);
            throw new Error("Error restoring index");
        }
    }
}
export { InvertedIndex as InvertedIndex };
function createNgrams(normalizedText, size = 3, options = {}) {
    if (typeof normalizedText !== "string") {
        throw new TypeError("Input text must be a string");
    }
    if (normalizedText.length === 0) {
        return [];
    }
    const { padChar = " " } = options || {};
    let paddedText = normalizedText;
    if (padChar.length === 1) {
        const padString = padChar.repeat(size - 1);
        paddedText = padString + normalizedText + padString;
    }
    const chars = [
        ...paddedText
    ];
    if (chars.length < size) {
        return [];
    }
    const ngrams = [];
    for(let i = 0; i <= chars.length - size; i++){
        const ngram = chars.slice(i, i + size).join("");
        ngrams.push(ngram);
    }
    return ngrams;
}
export { createNgrams as createNgrams };
function unaccent(input) {
    return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
export { unaccent as unaccent };
const DEFAULT_OPTIONS = {
    caseSensitive: false,
    accentSensitive: false
};
function normalize(input, options = {}) {
    input = `${input}`.trim();
    const { caseSensitive, accentSensitive } = {
        ...DEFAULT_OPTIONS,
        ...options || {}
    };
    if (!caseSensitive) {
        input = input.toLowerCase();
    }
    if (!accentSensitive) {
        input = unaccent(input);
    }
    return input;
}
export { normalize as normalize };
function tokenize(inputString, nonWordCharWhitelist = "") {
    if (typeof inputString !== "string") {
        return [];
    }
    if (typeof nonWordCharWhitelist !== "string") {
        nonWordCharWhitelist = "";
    }
    const hasHyphen = nonWordCharWhitelist.includes("-");
    nonWordCharWhitelist = nonWordCharWhitelist.replaceAll("-", "");
    let escapedWhitelist = nonWordCharWhitelist.split("").map((__char)=>__char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
    if (hasHyphen) escapedWhitelist = `\\-` + escapedWhitelist;
    const wordPattern = new RegExp(`[^\\p{L}\\p{N}\\p{Pc}${escapedWhitelist}]+`, "gu");
    return inputString.split(wordPattern).filter((word)=>word.length > 0);
}
export { tokenize as tokenize };
class TrieNode {
    children;
    isEOW;
    docIds;
    constructor(children = new Map(), isEOW = false, docIds = new Set()){
        this.children = children;
        this.isEOW = isEOW;
        this.docIds = docIds;
    }
    toJSON() {
        return {
            children: Object.fromEntries(this.children.entries()),
            isEOW: this.isEOW,
            docIds: [
                ...this.docIds
            ]
        };
    }
    __toCharTrie(_tree = {}, _node) {
        _node ??= this;
        _node?.children?.entries().forEach(([__char, node])=>{
            _tree[__char] ??= {};
            this.__toCharTrie(_tree[__char], node);
        });
        return _tree;
    }
}
class TrieIndex extends Index {
    #root;
    #docIdToWords = new Map();
    constructor(){
        super();
        this.#root = new TrieNode();
    }
    toJSON() {
        return this.#root.toJSON().children;
    }
    get wordCount() {
        const words = new Set();
        this.#docIdToWords.values().forEach((_words)=>{
            _words.forEach((w)=>words.add(w));
        });
        return words.size;
    }
    get docIdCount() {
        return this.#docIdToWords.size;
    }
    getAllWords() {
        return [
            ...this.#collectAllWords().keys()
        ];
    }
    getAllDocIds() {
        return [
            ...this.#docIdToWords.keys()
        ];
    }
    #assertWordAndDocId(word, docId) {
        if (!word || typeof word !== "string") {
            throw new Error("Word must be a non-empty string");
        }
        if (!docId || typeof docId !== "string") {
            throw new Error("DocId must be a non-empty string");
        }
    }
    addWord(word, docId) {
        this.#assertWordAndDocId(word, docId);
        let currentNode = this.#root;
        for (const __char of word){
            if (!currentNode.children.has(__char)) {
                currentNode.children.set(__char, new TrieNode());
            }
            currentNode = currentNode.children.get(__char);
        }
        currentNode.isEOW = true;
        const isNewEntry = !currentNode.docIds.has(docId);
        currentNode.docIds.add(docId);
        if (!this.#docIdToWords.has(docId)) {
            this.#docIdToWords.set(docId, new Set());
        }
        this.#docIdToWords.get(docId).add(word);
        return isNewEntry;
    }
    removeWord(word, docId) {
        this.#assertWordAndDocId(word, docId);
        const result = this.#removeWordFromTrie(this.#root, word, 0, docId);
        if (result && this.#docIdToWords.has(docId)) {
            this.#docIdToWords.get(docId).delete(word);
            if (this.#docIdToWords.get(docId).size === 0) {
                this.#docIdToWords.delete(docId);
            }
        }
        return result;
    }
    removeDocId(docId) {
        if (!this.#docIdToWords.has(docId)) {
            return 0;
        }
        const words = [
            ...this.#docIdToWords.get(docId)
        ];
        let removedCount = 0;
        for (const word of words){
            if (this.#removeWordFromTrie(this.#root, word, 0, docId)) {
                removedCount++;
            }
        }
        this.#docIdToWords.delete(docId);
        return removedCount;
    }
    searchExact(word) {
        let currentNode = this.#root;
        for (const __char of word){
            if (!currentNode.children.has(__char)) {
                return [];
            }
            currentNode = currentNode.children.get(__char);
        }
        if (!currentNode.isEOW) {
            return [];
        }
        return [
            ...new Set(currentNode.docIds)
        ];
    }
    searchByPrefix(prefix, returnWithDistance = false) {
        let currentNode = this.#root;
        const resultsMap = new Map();
        const results = new Set();
        const idToDistance = new Map();
        for (const __char of prefix){
            if (!currentNode.children.has(__char)) {
                return [];
            }
            currentNode = currentNode.children.get(__char);
        }
        this.#collectWords(currentNode, prefix, resultsMap);
        resultsMap.entries().forEach(([word, docIds])=>{
            docIds.forEach((id)=>{
                results.add(id);
                const distance = levenshteinDistance(prefix, word);
                if (idToDistance.has(id)) {
                    idToDistance.set(id, Math.min(distance, idToDistance.get(id)));
                } else {
                    idToDistance.set(id, distance);
                }
            });
        });
        if (returnWithDistance) {
            return results.values().reduce((m, id)=>{
                m[id] = idToDistance.get(id);
                return m;
            }, {});
        }
        const sortByDistanceAsc = (a, b)=>idToDistance.get(a) - idToDistance.get(b);
        return [
            ...results
        ].toSorted(sortByDistanceAsc);
    }
    searchByDocId(docId) {
        const words = this.#docIdToWords.get(docId);
        return words ? [
            ...new Set(words)
        ] : [];
    }
    searchFuzzy(word, maxDistance = 2, returnWithDistance = false) {
        const results = new Set();
        const idToDistance = new Map();
        const all = this.#collectAllWords();
        for (const [indexedWord, docIds] of all.entries()){
            const distance = levenshteinDistance(word, indexedWord);
            if (distance <= maxDistance) {
                docIds.forEach((id)=>{
                    results.add(id);
                    if (idToDistance.has(id)) {
                        idToDistance.set(id, Math.min(distance, idToDistance.get(id)));
                    } else {
                        idToDistance.set(id, distance);
                    }
                });
            }
        }
        if (returnWithDistance) {
            return results.values().reduce((m, id)=>{
                m[id] = idToDistance.get(id);
                return m;
            }, {});
        }
        const sortByDistanceAsc = (a, b)=>idToDistance.get(a) - idToDistance.get(b);
        return [
            ...results
        ].toSorted(sortByDistanceAsc);
    }
    #removeWordFromTrie(node, word, index, docId) {
        if (index === word.length) {
            if (!node.isEOW) {
                return false;
            }
            const result = node.docIds.delete(docId);
            if (node.docIds.size === 0) {
                node.isEOW = false;
            }
            return result;
        }
        const __char = word[index];
        if (!node.children.has(__char)) {
            return false;
        }
        const childNode = node.children.get(__char);
        const result = this.#removeWordFromTrie(childNode, word, index + 1, docId);
        if (childNode.children.size === 0 && !childNode.isEOW) {
            node.children.delete(__char);
        }
        return result;
    }
    #collectWords(node, currentWord, results = new Map()) {
        if (node.isEOW) {
            results.set(currentWord, new Set(node.docIds));
        }
        for (const [__char, childNode] of node.children.entries()){
            this.#collectWords(childNode, currentWord + __char, results);
        }
    }
    #collectAllWords() {
        const results = new Map();
        this.#collectWords(this.#root, "", results);
        return results;
    }
    dump() {
        const allWords = this.#collectAllWords();
        const out = {
            words: {},
            version: "1.0"
        };
        for (const [word, docIds] of allWords){
            out.words[word] = [
                ...docIds
            ];
        }
        return out;
    }
    restore(data) {
        try {
            if (typeof data === "string") {
                data = JSON.parse(data);
            }
            if (!data || !data.words) {
                return false;
            }
            this.#root = new TrieNode();
            this.#docIdToWords.clear();
            for (const [word, docIds] of Object.entries(data.words)){
                for (const docId of docIds){
                    this.addWord(word, docId);
                }
            }
            return true;
        } catch (e) {
            console.error("Error restoring index", e);
            throw new Error("Error restoring index");
        }
    }
    __toCharTrie() {
        const tree = {};
        this.#root.__toCharTrie(tree);
        return tree;
    }
}
export { TrieIndex as TrieIndex };
class Searchable {
    #options = {
        caseSensitive: false,
        accentSensitive: false,
        isStopword: (_w)=>false,
        normalizeWord: (word)=>word,
        index: "inverted",
        nonWordCharWhitelist: "@-",
        ngramsSize: 0,
        querySomeWordMinLength: 1,
        defaultSearchOptions: {
            strategy: "prefix",
            maxDistance: 2
        },
        lastQueryHistoryLength: 5
    };
    #index;
    #lastQuery = {
        history: [],
        raw: undefined,
        used: undefined
    };
    constructor(options = {}){
        this.#options = {
            ...this.#options,
            ...options || {}
        };
        this.#index = this.#options.index === "inverted" ? new InvertedIndex() : new TrieIndex();
    }
    get #normalizeOptions() {
        return {
            caseSensitive: this.#options.caseSensitive,
            accentSensitive: this.#options.accentSensitive
        };
    }
    get __index() {
        return this.#index;
    }
    get wordCount() {
        return this.#index.wordCount;
    }
    get lastQuery() {
        return this.#lastQuery;
    }
    #assertWordAndDocId(word, docId) {
        if (!word || typeof word !== "string") {
            throw new Error("Word must be a non-empty string");
        }
        if (!docId || typeof docId !== "string") {
            throw new Error("DocId must be a non-empty string");
        }
    }
    toWords(input, isQuery = false) {
        input = normalize(input, this.#normalizeOptions);
        let words = tokenize(input, this.#options.nonWordCharWhitelist);
        words = words.filter((w)=>w && !this.#options.isStopword(w));
        if (!isQuery) {
            words = words.reduce((m, word)=>{
                const w = this.#options.normalizeWord(word);
                if (w && Array.isArray(w)) {
                    m = [
                        ...m,
                        ...w
                    ];
                } else if (w) {
                    m.push(w);
                }
                return m;
            }, []);
            words = words.map((w)=>{
                w = normalize(w, this.#normalizeOptions);
                if (w && this.#options.isStopword(w)) w = "";
                return w;
            }).filter(Boolean);
        }
        return Array.from(new Set(words));
    }
    add(input, docId, strict = true) {
        try {
            this.#assertWordAndDocId(input, docId);
        } catch (e) {
            if (strict) throw e;
            return 0;
        }
        const words = this.toWords(input, false);
        if (!words.length) return 0;
        let added = 0;
        for (const word of words){
            added += Number(this.#index.addWord(word, docId));
            if (this.#options.ngramsSize) {
                const ngramsSizes = Array.isArray(this.#options.ngramsSize) ? this.#options.ngramsSize : [
                    this.#options.ngramsSize
                ];
                for (const ngramsSize of ngramsSizes){
                    if (ngramsSize > 0) {
                        const ngs = createNgrams(word, ngramsSize, {
                            padChar: ""
                        });
                        for (const ng of ngs){
                            added += Number(this.#index.addWord(ng, docId));
                        }
                    }
                }
            }
        }
        return added;
    }
    addBatch(documents, strict = false) {
        const errors = [];
        let added = 0;
        const entries = Array.isArray(documents) ? documents : Object.entries(documents);
        for (const [docId, input] of entries){
            try {
                added += this.add(input, docId, true);
            } catch (error) {
                if (strict) throw error;
                errors.push({
                    docId,
                    error: error instanceof Error ? error : new Error(String(error))
                });
            }
        }
        return {
            added,
            errors
        };
    }
    #search(worker, query) {
        const { querySomeWordMinLength, lastQueryHistoryLength } = this.#options;
        this.#lastQuery.raw = query;
        query = normalize(query, this.#normalizeOptions);
        const words = this.toWords(query, true);
        if (!words.some((w)=>w.length >= querySomeWordMinLength)) {
            return [];
        }
        this.#lastQuery.used = query;
        this.#lastQuery.history = lastQueryHistoryLength > 0 ? [
            ...this.#lastQuery.history,
            query
        ].slice(-1 * lastQueryHistoryLength) : [];
        const _foundValues = [];
        const idToDistance = new Map();
        for (const word of words){
            const idDistMapOrArray = worker(word);
            if (Array.isArray(idDistMapOrArray)) {
                _foundValues.push(idDistMapOrArray);
            } else {
                const docIds = [];
                Object.entries(idDistMapOrArray).forEach(([id, distance])=>{
                    if (idToDistance.has(id)) {
                        idToDistance.set(id, Math.min(distance, idToDistance.get(id)));
                    } else {
                        idToDistance.set(id, distance);
                    }
                    docIds.push(id);
                });
                _foundValues.push(docIds);
            }
        }
        const results = intersect(..._foundValues);
        const sortByDistanceAsc = (a, b)=>idToDistance.get(a) - idToDistance.get(b);
        return results.toSorted(sortByDistanceAsc);
    }
    searchExact(query) {
        return this.#search((word)=>this.#index.searchExact(word), query);
    }
    searchByPrefix(query) {
        return this.#search((word)=>this.#index.searchByPrefix(word, true), query);
    }
    searchFuzzy(query, maxDistance = 2) {
        return this.#search((word)=>this.#index.searchFuzzy(word, maxDistance, true), query);
    }
    search(query, strategy, options) {
        strategy ??= this.#options.defaultSearchOptions.strategy ?? "prefix";
        const { maxDistance = this.#options.defaultSearchOptions.maxDistance ?? 2 } = options || {};
        if (strategy === "exact") {
            return this.searchExact(query);
        }
        if (strategy === "prefix") {
            return this.searchByPrefix(query);
        }
        if (strategy === "fuzzy") {
            return this.searchFuzzy(query, maxDistance);
        }
        throw new TypeError(`Unknown search strategy "${strategy}"`);
    }
    dump(stringify = true) {
        const dump = this.#index.dump();
        return stringify ? JSON.stringify(dump) : dump;
    }
    restore(dump) {
        return this.#index.restore(dump);
    }
    static merge(indexes) {
        return {
            search (query) {
                let result = new Set();
                for (const idx of indexes){
                    const partial = idx.search(query);
                    result = result.union(new Set([
                        ...partial
                    ]));
                }
                return [
                    ...result
                ];
            }
        };
    }
}
export { Searchable as Searchable };
