if (typeof Symbol.dispose === "undefined") {
    Symbol.dispose = Symbol.for("Symbol.dispose");
}
const WILDCARD = "*";
class PubSub {
    #subs = new Map();
    #onError;
    constructor(options){
        this.#onError = options?.onError ?? this.#defaultErrorHandler;
        this.publish = this.publish.bind(this);
        this.subscribe = this.subscribe.bind(this);
        this.subscribeOnce = this.subscribeOnce.bind(this);
        this.subscribeMany = this.subscribeMany.bind(this);
        this.unsubscribe = this.unsubscribe.bind(this);
        this.unsubscribeAll = this.unsubscribeAll.bind(this);
        this.isSubscribed = this.isSubscribed.bind(this);
        this.subscriberCount = this.subscriberCount.bind(this);
        this.hasSubscribers = this.hasSubscribers.bind(this);
        this.topics = this.topics.bind(this);
    }
    #defaultErrorHandler(error, topic, isWildcard) {
        const prefix = isWildcard ? "wildcard subscriber" : "subscriber";
        console.error(`Error in ${prefix} for topic "${topic}":`, error);
    }
    #invoke(cb, data, topic, isWildcard) {
        try {
            const result = cb(data);
            if (result && typeof result.then === "function") {
                result.catch((reason)=>{
                    const err = reason instanceof Error ? reason : new Error(String(reason));
                    this.#onError(err, topic, isWildcard);
                });
            }
        } catch (error) {
            this.#onError(error, topic, isWildcard);
        }
    }
    #makeUnsubscriber(fn) {
        const u = ()=>fn();
        u[Symbol.dispose] = fn;
        return u;
    }
    publish(topic, data) {
        if (topic === WILDCARD) {
            throw new Error(`Cannot publish to wildcard topic "*". "*" is reserved for subscribers; publish to a real topic name instead.`);
        }
        const direct = this.#subs.get(topic);
        const hadDirect = !!direct && direct.size > 0;
        if (direct) {
            for (const cb of [
                ...direct
            ]){
                this.#invoke(cb, data, topic, false);
            }
        }
        const wildcards = this.#subs.get(WILDCARD);
        if (wildcards && wildcards.size > 0) {
            const envelope = {
                event: topic,
                data
            };
            for (const cb of [
                ...wildcards
            ]){
                this.#invoke(cb, envelope, topic, true);
            }
        }
        return hadDirect;
    }
    subscribe(topic, cb) {
        let bucket = this.#subs.get(topic);
        if (!bucket) {
            bucket = new Set();
            this.#subs.set(topic, bucket);
        }
        bucket.add(cb);
        return this.#makeUnsubscriber(()=>{
            this.unsubscribe(topic, cb);
        });
    }
    subscribeOnce(topic, cb) {
        let fired = false;
        const onceWrapper = (data)=>{
            if (fired) return;
            fired = true;
            this.unsubscribe(topic, onceWrapper);
            return cb(data);
        };
        return this.subscribe(topic, onceWrapper);
    }
    subscribeMany(topics, cb) {
        const unsubs = topics.map((t)=>this.subscribe(t, cb));
        return this.#makeUnsubscriber(()=>{
            for (const u of unsubs)u();
        });
    }
    unsubscribe(topic, cb) {
        const bucket = this.#subs.get(topic);
        if (!bucket) return false;
        if (typeof cb === "function") {
            const removed = bucket.delete(cb);
            if (bucket.size === 0) this.#subs.delete(topic);
            return removed;
        }
        return this.#subs.delete(topic);
    }
    unsubscribeAll(topic) {
        if (topic !== undefined) return this.#subs.delete(topic);
        if (this.#subs.size === 0) return false;
        this.#subs.clear();
        return true;
    }
    isSubscribed(topic, cb, considerWildcard = true) {
        if (this.#subs.get(topic)?.has(cb)) return true;
        if (considerWildcard && this.#subs.get(WILDCARD)?.has(cb)) return true;
        return false;
    }
    subscriberCount(topic) {
        if (topic !== undefined) return this.#subs.get(topic)?.size ?? 0;
        let total = 0;
        for (const set of this.#subs.values())total += set.size;
        return total;
    }
    hasSubscribers(topic) {
        return (this.#subs.get(topic)?.size ?? 0) > 0;
    }
    topics() {
        return [
            ...this.#subs.keys()
        ];
    }
    __dump() {
        const out = {};
        for (const [topic, set] of this.#subs.entries()){
            out[topic] = new Set(set);
        }
        return out;
    }
}
function createPubSub(options) {
    return new PubSub(options);
}
const isFn = (v)=>typeof v === "function";
const assertFn = (v, prefix = "")=>{
    if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};
const strictEqual = (a, b)=>a === b;
function createStore(initial, options = null) {
    const _equal = options?.equal ?? strictEqual;
    const _maybePersist = (v)=>{
        if (options?.persist) {
            try {
                options.persist(v);
            } catch (e) {
                if (options.onPersistError) {
                    options.onPersistError(e);
                } else {
                    console.warn("Store persistence failed:", e);
                }
            }
        }
    };
    const _handleInitialSubscriberError = (e)=>{
        const err = e instanceof Error ? e : new Error(String(e));
        if (options?.onError) {
            options.onError(err, "change", false);
        } else {
            console.error(`Error in subscriber for topic "change":`, err);
        }
    };
    const _pubsub = createPubSub(options?.onError ? {
        onError: (e, topic, isWildcard)=>options.onError(e, topic, isWildcard)
    } : undefined);
    let _value = initial;
    if (options?.eagerPersist !== false) {
        _maybePersist(_value);
    }
    const get = ()=>_value;
    let _notifying = false;
    let _hasPending = false;
    let _pendingValue;
    const _applyChange = (value)=>{
        _value = value;
        _maybePersist(_value);
        _pubsub.publish("change", _value);
    };
    const set = (value)=>{
        if (_equal(_value, value)) return;
        if (_notifying) {
            _hasPending = true;
            _pendingValue = value;
            return;
        }
        _notifying = true;
        try {
            _applyChange(value);
            while(_hasPending){
                const next = _pendingValue;
                _hasPending = false;
                if (!_equal(_value, next)) _applyChange(next);
            }
        } finally{
            _notifying = false;
            _hasPending = false;
        }
    };
    const update = (cb)=>{
        assertFn(cb, "[update]");
        set(cb(get()));
    };
    const subscribe = (cb)=>{
        assertFn(cb, "[subscribe]");
        try {
            cb(_value);
        } catch (e) {
            _handleInitialSubscriberError(e);
        }
        return _pubsub.subscribe("change", cb);
    };
    return {
        set,
        get,
        update,
        subscribe
    };
}
new Map();
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
class Index {
}
function levenshteinDistance(source, target, options = {}) {
    const s = [
        ...source
    ];
    const t = [
        ...target
    ];
    const m = s.length;
    const n = t.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const damerau = options.damerau === true;
    if (damerau) {
        const matrix = new Array(m + 1);
        for(let i = 0; i <= m; i++){
            matrix[i] = new Array(n + 1);
            matrix[i][0] = i;
        }
        for(let j = 0; j <= n; j++)matrix[0][j] = j;
        for(let i = 1; i <= m; i++){
            for(let j = 1; j <= n; j++){
                const cost = s[i - 1] === t[j - 1] ? 0 : 1;
                let v = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
                    v = Math.min(v, matrix[i - 2][j - 2] + 1);
                }
                matrix[i][j] = v;
            }
        }
        return matrix[m][n];
    }
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for(let j = 0; j <= n; j++)prev[j] = j;
    for(let i = 1; i <= m; i++){
        curr[0] = i;
        for(let j = 1; j <= n; j++){
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [
            curr,
            prev
        ];
    }
    return prev[n];
}
const defaultDistanceFn = (a, b)=>levenshteinDistance(a, b);
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
        if (docIds.size === 0) this.#wordToDocIds.delete(word);
        const words = this.#docIdToWords.get(docId);
        if (words) {
            words.delete(word);
            if (words.size === 0) this.#docIdToWords.delete(docId);
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
            if (docIds.size === 0) this.#wordToDocIds.delete(word);
        }
        this.#docIdToWords.delete(docId);
        return count;
    }
    hasDocId(docId) {
        return this.#docIdToWords.has(docId);
    }
    searchExact(word) {
        const result = this.#wordToDocIds.get(word);
        return result ? [
            ...result
        ] : [];
    }
    searchByPrefix(prefix, returnWithDistance = false) {
        const idToDistance = new Map();
        const prefixLen = [
            ...prefix
        ].length;
        for (const [word, docIds] of this.#wordToDocIds.entries()){
            if (!word.startsWith(prefix)) continue;
            const distance = [
                ...word
            ].length - prefixLen;
            docIds.forEach((id)=>{
                const prev = idToDistance.get(id);
                if (prev === undefined || distance < prev) {
                    idToDistance.set(id, distance);
                }
            });
        }
        if (returnWithDistance) {
            return Object.fromEntries(idToDistance.entries());
        }
        return [
            ...idToDistance.keys()
        ].sort((a, b)=>idToDistance.get(a) - idToDistance.get(b));
    }
    searchByDocId(docId) {
        const words = this.#docIdToWords.get(docId);
        return words ? [
            ...words
        ] : [];
    }
    searchFuzzy(word, maxDistance = 2, returnWithDistance = false, options = {}) {
        const distanceFn = options.distanceFn ?? defaultDistanceFn;
        const queryLen = [
            ...word
        ].length;
        const idToDistance = new Map();
        for (const [indexedWord, docIds] of this.#wordToDocIds.entries()){
            if (!options.distanceFn && Math.abs([
                ...indexedWord
            ].length - queryLen) > maxDistance) {
                continue;
            }
            const distance = distanceFn(word, indexedWord);
            if (distance > maxDistance) continue;
            docIds.forEach((id)=>{
                const prev = idToDistance.get(id);
                if (prev === undefined || distance < prev) {
                    idToDistance.set(id, distance);
                }
            });
        }
        if (returnWithDistance) {
            return Object.fromEntries(idToDistance.entries());
        }
        return [
            ...idToDistance.keys()
        ].sort((a, b)=>idToDistance.get(a) - idToDistance.get(b));
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
            if (!data || typeof data !== "object" || !data.words) {
                return false;
            }
            if (data.version !== undefined && data.version !== "1.0") {
                throw new Error(`Unsupported dump version "${data.version}" (expected "1.0")`);
            }
            this.#wordToDocIds.clear();
            this.#docIdToWords.clear();
            for (const [word, docIds] of Object.entries(data.words)){
                this.#wordToDocIds.set(word, new Set(docIds));
                for (const docId of docIds){
                    if (!this.#docIdToWords.has(docId)) {
                        this.#docIdToWords.set(docId, new Set());
                    }
                    this.#docIdToWords.get(docId).add(word);
                }
            }
            return true;
        } catch (e) {
            throw new Error("Error restoring index", {
                cause: e
            });
        }
    }
}
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
const EXTRA_FOLDS = {
    "ß": "ss",
    "ẞ": "SS",
    "ø": "o",
    "Ø": "O",
    "æ": "ae",
    "Æ": "AE",
    "œ": "oe",
    "Œ": "OE",
    "đ": "d",
    "Đ": "D",
    "ð": "d",
    "Ð": "D",
    "ł": "l",
    "Ł": "L",
    "þ": "th",
    "Þ": "Th",
    "ħ": "h",
    "Ħ": "H",
    "ı": "i",
    "ĸ": "k",
    "ŋ": "n",
    "Ŋ": "N",
    "ſ": "s",
    "ŧ": "t",
    "Ŧ": "T"
};
const EXTRA_FOLDS_RE = new RegExp(`[${Object.keys(EXTRA_FOLDS).join("")}]`, "g");
function unaccent(input) {
    return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(EXTRA_FOLDS_RE, (c)=>EXTRA_FOLDS[c] ?? c);
}
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
const CLASS_META = new Set([
    "\\",
    "]",
    "^"
]);
function escapeForCharClass(c) {
    return CLASS_META.has(c) ? "\\" + c : c;
}
function tokenize(inputString, nonWordCharWhitelist = "") {
    if (typeof inputString !== "string") return [];
    if (typeof nonWordCharWhitelist !== "string") nonWordCharWhitelist = "";
    const chars = [
        ...new Set([
            ...nonWordCharWhitelist
        ])
    ];
    const hyphenIdx = chars.indexOf("-");
    let tail = "";
    if (hyphenIdx !== -1) {
        chars.splice(hyphenIdx, 1);
        tail = "-";
    }
    const escaped = chars.map(escapeForCharClass).join("") + tail;
    const wordPattern = new RegExp(`[^\\p{L}\\p{N}\\p{Pc}${escaped}]+`, "gu");
    return inputString.split(wordPattern).filter((word)=>word.length > 0);
}
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
    #wordCount = 0;
    constructor(){
        super();
        this.#root = new TrieNode();
    }
    toJSON() {
        return this.#root.toJSON().children;
    }
    get wordCount() {
        return this.#wordCount;
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
    hasDocId(docId) {
        return this.#docIdToWords.has(docId);
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
        if (!currentNode.isEOW) this.#wordCount++;
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
        const result = this.#removeWordFromTrie(this.#root, [
            ...word
        ], 0, docId);
        if (result && this.#docIdToWords.has(docId)) {
            this.#docIdToWords.get(docId).delete(word);
            if (this.#docIdToWords.get(docId).size === 0) {
                this.#docIdToWords.delete(docId);
            }
        }
        return result;
    }
    removeDocId(docId) {
        if (!this.#docIdToWords.has(docId)) return 0;
        const words = [
            ...this.#docIdToWords.get(docId)
        ];
        let removedCount = 0;
        for (const word of words){
            if (this.#removeWordFromTrie(this.#root, [
                ...word
            ], 0, docId)) {
                removedCount++;
            }
        }
        this.#docIdToWords.delete(docId);
        return removedCount;
    }
    searchExact(word) {
        let currentNode = this.#root;
        for (const __char of word){
            if (!currentNode.children.has(__char)) return [];
            currentNode = currentNode.children.get(__char);
        }
        if (!currentNode.isEOW) return [];
        return [
            ...currentNode.docIds
        ];
    }
    searchByPrefix(prefix, returnWithDistance = false) {
        let currentNode = this.#root;
        for (const __char of prefix){
            if (!currentNode.children.has(__char)) return [];
            currentNode = currentNode.children.get(__char);
        }
        const idToDistance = new Map();
        this.#collectPrefixMatches(currentNode, 0, idToDistance);
        if (returnWithDistance) {
            return Object.fromEntries(idToDistance.entries());
        }
        return [
            ...idToDistance.keys()
        ].sort((a, b)=>idToDistance.get(a) - idToDistance.get(b));
    }
    searchByDocId(docId) {
        const words = this.#docIdToWords.get(docId);
        return words ? [
            ...words
        ] : [];
    }
    searchFuzzy(word, maxDistance = 2, returnWithDistance = false, options = {}) {
        const idToDistance = new Map();
        if (options.distanceFn) {
            const all = this.#collectAllWords();
            for (const [indexedWord, docIds] of all.entries()){
                const distance = options.distanceFn(word, indexedWord);
                if (distance > maxDistance) continue;
                docIds.forEach((id)=>{
                    const prev = idToDistance.get(id);
                    if (prev === undefined || distance < prev) {
                        idToDistance.set(id, distance);
                    }
                });
            }
        } else {
            this.#fuzzyWalk(word, maxDistance, idToDistance);
        }
        if (returnWithDistance) {
            return Object.fromEntries(idToDistance.entries());
        }
        return [
            ...idToDistance.keys()
        ].sort((a, b)=>idToDistance.get(a) - idToDistance.get(b));
    }
    #fuzzyWalk(query, maxDistance, idToDistance) {
        const qChars = [
            ...query
        ];
        const qLen = qChars.length;
        const initialRow = new Array(qLen + 1);
        for(let j = 0; j <= qLen; j++)initialRow[j] = j;
        const visit = (node, prevRow)=>{
            for (const [__char, child] of node.children){
                const newRow = new Array(qLen + 1);
                newRow[0] = prevRow[0] + 1;
                let rowMin = newRow[0];
                for(let j = 1; j <= qLen; j++){
                    const cost = qChars[j - 1] === __char ? 0 : 1;
                    newRow[j] = Math.min(prevRow[j] + 1, newRow[j - 1] + 1, prevRow[j - 1] + cost);
                    if (newRow[j] < rowMin) rowMin = newRow[j];
                }
                if (child.isEOW && newRow[qLen] <= maxDistance) {
                    const distance = newRow[qLen];
                    child.docIds.forEach((id)=>{
                        const prev = idToDistance.get(id);
                        if (prev === undefined || distance < prev) {
                            idToDistance.set(id, distance);
                        }
                    });
                }
                if (rowMin <= maxDistance) visit(child, newRow);
            }
        };
        visit(this.#root, initialRow);
    }
    #removeWordFromTrie(node, chars, index, docId) {
        if (index === chars.length) {
            if (!node.isEOW) return false;
            const result = node.docIds.delete(docId);
            if (node.docIds.size === 0) {
                node.isEOW = false;
                this.#wordCount--;
            }
            return result;
        }
        const __char = chars[index];
        if (!node.children.has(__char)) return false;
        const childNode = node.children.get(__char);
        const result = this.#removeWordFromTrie(childNode, chars, index + 1, docId);
        if (childNode.children.size === 0 && !childNode.isEOW) {
            node.children.delete(__char);
        }
        return result;
    }
    #collectPrefixMatches(node, depthFromPrefix, idToDistance) {
        if (node.isEOW) {
            node.docIds.forEach((id)=>{
                const prev = idToDistance.get(id);
                if (prev === undefined || depthFromPrefix < prev) {
                    idToDistance.set(id, depthFromPrefix);
                }
            });
        }
        for (const child of node.children.values()){
            this.#collectPrefixMatches(child, depthFromPrefix + 1, idToDistance);
        }
    }
    #collectAllWords() {
        const results = new Map();
        const visit = (node, word)=>{
            if (node.isEOW) results.set(word, new Set(node.docIds));
            for (const [__char, child] of node.children){
                visit(child, word + __char);
            }
        };
        visit(this.#root, "");
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
            if (!data || typeof data !== "object" || !data.words) {
                return false;
            }
            if (data.version !== undefined && data.version !== "1.0") {
                throw new Error(`Unsupported dump version "${data.version}" (expected "1.0")`);
            }
            this.#root = new TrieNode();
            this.#docIdToWords.clear();
            this.#wordCount = 0;
            for (const [word, docIds] of Object.entries(data.words)){
                for (const docId of docIds){
                    this.addWord(word, docId);
                }
            }
            return true;
        } catch (e) {
            throw new Error("Error restoring index", {
                cause: e
            });
        }
    }
    __toCharTrie() {
        const tree = {};
        this.#root.__toCharTrie(tree);
        return tree;
    }
}
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
        rawHistory: [],
        raw: undefined,
        used: undefined
    };
    constructor(options = {}){
        this.#options = {
            ...this.#options,
            ...options || {},
            defaultSearchOptions: {
                ...this.#options.defaultSearchOptions,
                ...options?.defaultSearchOptions ?? {}
            }
        };
        this.#index = this.#options.index === "inverted" ? new InvertedIndex() : new TrieIndex();
    }
    static fromDump(dump, options = {}) {
        const idx = new Searchable(options);
        idx.restore(dump);
        return idx;
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
    get docIdCount() {
        return this.#index.docIdCount;
    }
    get lastQuery() {
        return {
            history: [
                ...this.#lastQuery.history
            ],
            rawHistory: [
                ...this.#lastQuery.rawHistory
            ],
            raw: this.#lastQuery.raw,
            used: this.#lastQuery.used
        };
    }
    hasDocId(docId) {
        return this.#index.hasDocId(docId);
    }
    #assertInputAndDocId(input, docId) {
        if (!input || typeof input !== "string") {
            throw new Error("Input must be a non-empty string");
        }
        if (!docId || typeof docId !== "string") {
            throw new Error("DocId must be a non-empty string");
        }
    }
    toWords(input, isQuery = false) {
        input = normalize(input, this.#normalizeOptions);
        let words = tokenize(input, this.#options.nonWordCharWhitelist);
        words = words.filter((w)=>w && !this.#options.isStopword(w));
        const expand = (w)=>{
            const out = this.#options.normalizeWord(w);
            return Array.isArray(out) ? out.filter(Boolean) : out ? [
                out
            ] : [];
        };
        if (isQuery) {
            const out = [];
            for (const w of words){
                for (const variant of expand(w)){
                    const n = normalize(variant, this.#normalizeOptions);
                    if (n && !this.#options.isStopword(n)) out.push(n);
                }
            }
            return [
                ...new Set(out)
            ];
        }
        const expanded = [];
        for (const w of words)expanded.push(...expand(w));
        const finalized = expanded.map((w)=>normalize(w, this.#normalizeOptions)).filter((w)=>w && !this.#options.isStopword(w));
        return [
            ...new Set(finalized)
        ];
    }
    toQueryGroups(input) {
        const norm = normalize(input, this.#normalizeOptions);
        const tokens = tokenize(norm, this.#options.nonWordCharWhitelist).filter((w)=>w && !this.#options.isStopword(w));
        const groups = [];
        for (const token of tokens){
            const expanded = this.#options.normalizeWord(token);
            const variants = Array.isArray(expanded) ? expanded.filter(Boolean) : expanded ? [
                expanded
            ] : [];
            const finalized = variants.map((w)=>normalize(w, this.#normalizeOptions)).filter((w)=>w && !this.#options.isStopword(w));
            const group = [
                ...new Set(finalized)
            ];
            if (group.length) groups.push(group);
        }
        return groups;
    }
    add(input, docId, strict = true) {
        try {
            this.#assertInputAndDocId(input, docId);
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
    replace(docId, input, strict = true) {
        this.#index.removeDocId(docId);
        return this.add(input, docId, strict);
    }
    removeDocId(docId) {
        return this.#index.removeDocId(docId);
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
    #runSearch(worker, query) {
        const { querySomeWordMinLength, lastQueryHistoryLength } = this.#options;
        const rawInput = query;
        this.#lastQuery.raw = rawInput;
        const groups = this.toQueryGroups(query);
        const normalizedQuery = normalize(query, this.#normalizeOptions);
        if (!groups.some((g)=>g.some((w)=>w.length >= querySomeWordMinLength))) {
            return [];
        }
        this.#lastQuery.used = normalizedQuery;
        if (lastQueryHistoryLength > 0) {
            this.#lastQuery.history = [
                ...this.#lastQuery.history,
                normalizedQuery
            ].slice(-lastQueryHistoryLength);
            this.#lastQuery.rawHistory = [
                ...this.#lastQuery.rawHistory,
                rawInput
            ].slice(-lastQueryHistoryLength);
        } else {
            this.#lastQuery.history = [];
            this.#lastQuery.rawHistory = [];
        }
        const perGroupIds = [];
        const idToDistance = new Map();
        for (const group of groups){
            const unioned = new Set();
            for (const variant of group){
                const res = worker(variant);
                if (Array.isArray(res)) {
                    for (const id of res)unioned.add(id);
                } else {
                    for (const [id, distance] of Object.entries(res)){
                        unioned.add(id);
                        const prev = idToDistance.get(id);
                        if (prev === undefined || distance < prev) {
                            idToDistance.set(id, distance);
                        }
                    }
                }
            }
            perGroupIds.push([
                ...unioned
            ]);
        }
        const results = intersect(...perGroupIds);
        return results.sort((a, b)=>{
            const da = idToDistance.get(a);
            const db = idToDistance.get(b);
            if (da === undefined && db === undefined) return 0;
            if (da === undefined) return 1;
            if (db === undefined) return -1;
            return da - db;
        });
    }
    #applyWindow(ids, options) {
        const offset = Math.max(0, options?.offset ?? 0);
        const limit = options?.limit;
        if (!offset && (limit === undefined || limit < 0)) return ids;
        const end = limit === undefined ? undefined : offset + Math.max(0, limit);
        return ids.slice(offset, end);
    }
    searchExact(query, options) {
        const ids = this.#runSearch((word)=>this.#index.searchExact(word), query);
        return this.#applyWindow(ids, options);
    }
    searchByPrefix(query, options) {
        const ids = this.#runSearch((word)=>this.#index.searchByPrefix(word, true), query);
        return this.#applyWindow(ids, options);
    }
    searchFuzzy(query, maxDistance = 2, options) {
        const fuzzyOpts = options?.distanceFn ? {
            distanceFn: options.distanceFn
        } : undefined;
        const ids = this.#runSearch((word)=>fuzzyOpts ? this.#index.searchFuzzy(word, maxDistance, true, fuzzyOpts) : this.#index.searchFuzzy(word, maxDistance, true), query);
        return this.#applyWindow(ids, options);
    }
    search(query, strategy, options) {
        strategy ??= this.#options.defaultSearchOptions.strategy ?? "prefix";
        const maxDistance = options?.maxDistance ?? this.#options.defaultSearchOptions.maxDistance ?? 2;
        const distanceFn = options?.distanceFn ?? this.#options.defaultSearchOptions.distanceFn;
        const effective = {
            maxDistance,
            limit: options?.limit ?? this.#options.defaultSearchOptions.limit,
            offset: options?.offset ?? this.#options.defaultSearchOptions.offset,
            distanceFn
        };
        if (strategy === "exact") return this.searchExact(query, effective);
        if (strategy === "prefix") return this.searchByPrefix(query, effective);
        if (strategy === "fuzzy") {
            return this.searchFuzzy(query, maxDistance, effective);
        }
        throw new TypeError(`Unknown search strategy "${strategy}"`);
    }
    explainQuery(query) {
        const raw = query;
        const normalized = normalize(query, this.#normalizeOptions);
        const tokens = tokenize(normalized, this.#options.nonWordCharWhitelist);
        const afterStopwords = tokens.filter((w)=>w && !this.#options.isStopword(w));
        const groups = this.toQueryGroups(query);
        const wouldSearch = groups.some((g)=>g.some((w)=>w.length >= this.#options.querySomeWordMinLength));
        return {
            raw,
            normalized,
            tokens,
            afterStopwords,
            groups,
            wouldSearch
        };
    }
    dump(stringify = true) {
        const dump = this.#index.dump();
        return stringify ? JSON.stringify(dump) : dump;
    }
    restore(dump) {
        return this.#index.restore(dump);
    }
    static merge(indexes) {
        const union = (getter)=>{
            const out = new Set();
            for (const idx of indexes)for (const id of getter(idx))out.add(id);
            return [
                ...out
            ];
        };
        return {
            search (query, options) {
                return union((idx)=>idx.search(query, undefined, options));
            },
            searchExact (query, options) {
                return union((idx)=>idx.searchExact(query, options));
            },
            searchByPrefix (query, options) {
                return union((idx)=>idx.searchByPrefix(query, options));
            },
            searchFuzzy (query, maxDistance, options) {
                return union((idx)=>idx.searchFuzzy(query, maxDistance, options));
            }
        };
    }
}
function qsa(selector, context = null) {
    return Array.from((context ?? document).querySelectorAll(selector));
}
function debounce(fn, wait) {
    let timeout = null;
    return function(...args) {
        if (timeout !== null) clearTimeout(timeout);
        timeout = setTimeout(()=>fn.apply(this, args), wait);
    };
}
function getSelectedRadioValue(radios) {
    for (const r of radios){
        if (r.checked) return r.value;
    }
    return "";
}
const $log = qsa("#console")[0];
const $input = qsa("#query")[0];
const $strategyRadios = qsa('input[name="strategy"]');
const $accent = qsa("#accent-sensitive")[0];
const initialized = createStore(false);
let index = new Searchable({
    ngramsSize: 0,
    accentSensitive: false
});
let docs = {};
function buildIndex(accentSensitive) {
    index = new Searchable({
        ngramsSize: 0,
        accentSensitive
    });
    for (const [id, movie] of Object.entries(docs)){
        const search = [
            movie.title,
            movie.year,
            movie.characters.join(),
            movie.genres.join(),
            movie.actors.join(),
            movie.directors.join()
        ].join(" ");
        index.add(search, `${id}`);
    }
}
function init(movies) {
    docs = movies;
    buildIndex($accent.checked);
    initialized.set(true);
}
initialized.subscribe((v)=>{
    $input.disabled = !v;
    if (v) {
        $log.innerHTML = "Movie data loaded. Type your movie search query in the input above.";
    }
});
const search = debounce((v)=>{
    const strategy = getSelectedRadioValue($strategyRadios);
    const start = Date.now();
    const docIds = index.search(v, strategy);
    render(docIds, Date.now() - start);
}, 100);
$input.addEventListener("input", (e)=>{
    search(e.target.value);
});
$strategyRadios.forEach((radio)=>{
    radio.addEventListener("change", ()=>search($input.value));
});
$accent.addEventListener("change", ()=>{
    buildIndex($accent.checked);
    search($input.value);
});
function render(docIds, duration) {
    const results = (docIds ?? []).reduce((m, id)=>{
        if (docs[id]) m.push(docs[id]);
        return m;
    }, []);
    const rendered = results.slice(0, 1000).map((m)=>{
        const actChar = m.actors.map((a, i)=>`${a} (${m.characters[i]})`).join(", ");
        return [
            `&rarr; `,
            `<span class="title">${m.title}</span> `,
            `<span class="year">(${m.year}, ${m.directors.join(", ")})</span> `,
            `<span class="genres">/ ${m.genres.join(", ")}</span> `,
            `<br/><span class="cast">${actChar}</span> `,
            `<br/>`
        ].join("");
    });
    if (results.length > 1000) {
        rendered.push(`\n<span style="color: gray;">...next ${results.length - 1000} results omitted...</span>`);
    }
    const dur = `(Found ${results.length} matching out of ~2500 total records in ${duration} ms)<br/><br/>`;
    $log.innerHTML = dur + rendered.join("<br />");
}
fetch("./movies.json").then((response)=>response.json()).then((movies)=>init(movies)).catch((error)=>{
    console.error(error);
    $log.innerHTML = `<span style="color: #b00;">Unable to load movie data. Check the console for details.</span>`;
});
