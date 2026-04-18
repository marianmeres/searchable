// https://jsr.io/@marianmeres/pubsub/3.0.0/src/pubsub.ts
if (typeof Symbol.dispose === "undefined") {
  Symbol.dispose = Symbol.for("Symbol.dispose");
}
var WILDCARD = "*";
var PubSub = class {
  #subs = /* @__PURE__ */ new Map();
  #onError;
  constructor(options) {
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
        result.catch((reason) => {
          const err = reason instanceof Error ? reason : new Error(String(reason));
          this.#onError(err, topic, isWildcard);
        });
      }
    } catch (error) {
      this.#onError(error, topic, isWildcard);
    }
  }
  #makeUnsubscriber(fn) {
    const u = () => fn();
    u[Symbol.dispose] = fn;
    return u;
  }
  publish(topic, data) {
    if (topic === WILDCARD) {
      throw new Error(
        `Cannot publish to wildcard topic "*". "*" is reserved for subscribers; publish to a real topic name instead.`
      );
    }
    const direct = this.#subs.get(topic);
    const hadDirect = !!direct && direct.size > 0;
    if (direct) {
      for (const cb of [...direct]) {
        this.#invoke(cb, data, topic, false);
      }
    }
    const wildcards = this.#subs.get(WILDCARD);
    if (wildcards && wildcards.size > 0) {
      const envelope = {
        event: topic,
        data
      };
      for (const cb of [...wildcards]) {
        this.#invoke(cb, envelope, topic, true);
      }
    }
    return hadDirect;
  }
  subscribe(topic, cb) {
    let bucket = this.#subs.get(topic);
    if (!bucket) {
      bucket = /* @__PURE__ */ new Set();
      this.#subs.set(topic, bucket);
    }
    bucket.add(cb);
    return this.#makeUnsubscriber(() => {
      this.unsubscribe(topic, cb);
    });
  }
  subscribeOnce(topic, cb) {
    let fired = false;
    const onceWrapper = (data) => {
      if (fired) return;
      fired = true;
      this.unsubscribe(topic, onceWrapper);
      return cb(data);
    };
    return this.subscribe(topic, onceWrapper);
  }
  subscribeMany(topics, cb) {
    const unsubs = topics.map((t) => this.subscribe(t, cb));
    return this.#makeUnsubscriber(() => {
      for (const u of unsubs) u();
    });
  }
  /**
   * Removes a specific callback from a topic, or — if `cb` is omitted —
   * removes every subscriber from the topic. Empty topics are cleaned up.
   *
   * @returns true if anything was removed.
   */
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
  /**
   * Removes every subscriber for `topic`, or — if `topic` is omitted —
   * every subscriber from every topic.
   *
   * @returns true if anything was removed.
   */
  unsubscribeAll(topic) {
    if (topic !== void 0) return this.#subs.delete(topic);
    if (this.#subs.size === 0) return false;
    this.#subs.clear();
    return true;
  }
  /**
   * Checks whether `cb` is subscribed to `topic`. By default also reports true
   * if `cb` is subscribed to the wildcard ("*"). Pass `considerWildcard: false`
   * to require an exact, direct subscription.
   */
  isSubscribed(topic, cb, considerWildcard = true) {
    if (this.#subs.get(topic)?.has(cb)) return true;
    if (considerWildcard && this.#subs.get(WILDCARD)?.has(cb)) return true;
    return false;
  }
  /**
   * Returns the subscriber count for `topic`, or — if `topic` is omitted —
   * the total count across all topics (including wildcard).
   */
  subscriberCount(topic) {
    if (topic !== void 0) return this.#subs.get(topic)?.size ?? 0;
    let total = 0;
    for (const set of this.#subs.values()) total += set.size;
    return total;
  }
  /**
   * Returns true if `topic` has at least one direct subscriber.
   * (Does not consider wildcard subscribers.)
   */
  hasSubscribers(topic) {
    return (this.#subs.get(topic)?.size ?? 0) > 0;
  }
  /**
   * Lists topics that currently have at least one subscriber. Includes "*"
   * if there are wildcard subscribers.
   */
  topics() {
    return [...this.#subs.keys()];
  }
  /**
   * Returns a defensive snapshot of internal subscriptions for debugging.
   * Mutating the returned object does not affect the instance.
   *
   * @internal Intended for debugging and tests only.
   */
  __dump() {
    const out = {};
    for (const [topic, set] of this.#subs.entries()) {
      out[topic] = new Set(set);
    }
    return out;
  }
};
function createPubSub(options) {
  return new PubSub(options);
}

// https://jsr.io/@marianmeres/store/3.0.0/src/store.ts
var isFn = (v) => typeof v === "function";
var assertFn = (v, prefix = "") => {
  if (!isFn(v)) throw new TypeError(`${prefix} Expecting function arg`.trim());
};
var strictEqual = (a, b) => a === b;
function createStore(initial, options = null) {
  const _equal = options?.equal ?? strictEqual;
  const _maybePersist = (v) => {
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
  const _handleInitialSubscriberError = (e) => {
    const err = e instanceof Error ? e : new Error(String(e));
    if (options?.onError) {
      options.onError(err, "change", false);
    } else {
      console.error(`Error in subscriber for topic "change":`, err);
    }
  };
  const _pubsub = createPubSub(
    options?.onError ? {
      onError: (e, topic, isWildcard) => options.onError(e, topic, isWildcard)
    } : void 0
  );
  let _value = initial;
  if (options?.eagerPersist !== false) {
    _maybePersist(_value);
  }
  const get = () => _value;
  let _notifying = false;
  let _hasPending = false;
  let _pendingValue;
  const _applyChange = (value) => {
    _value = value;
    _maybePersist(_value);
    _pubsub.publish("change", _value);
  };
  const set = (value) => {
    if (_equal(_value, value)) return;
    if (_notifying) {
      _hasPending = true;
      _pendingValue = value;
      return;
    }
    _notifying = true;
    try {
      _applyChange(value);
      while (_hasPending) {
        const next = _pendingValue;
        _hasPending = false;
        if (!_equal(_value, next)) _applyChange(next);
      }
    } finally {
      _notifying = false;
      _hasPending = false;
    }
  };
  const update = (cb) => {
    assertFn(cb, "[update]");
    set(cb(get()));
  };
  const subscribe = (cb) => {
    assertFn(cb, "[subscribe]");
    try {
      cb(_value);
    } catch (e) {
      _handleInitialSubscriberError(e);
    }
    return _pubsub.subscribe("change", cb);
  };
  return { set, get, update, subscribe };
}

// src/lib/intersect.ts
function intersect(...arrays) {
  const [array, ...otherArrays] = arrays;
  let set = new Set(array);
  for (const array2 of otherArrays) {
    set = set.intersection(new Set(array2));
    if (set.size === 0) break;
  }
  return [...set];
}

// src/lib/index-abstract.ts
var Index = class {
};

// src/lib/levenshtein.ts
function levenshteinDistance(source, target, options = {}) {
  const s = [...source];
  const t = [...target];
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const damerau = options.damerau === true;
  if (damerau) {
    const matrix = new Array(m + 1);
    for (let i = 0; i <= m; i++) {
      matrix[i] = new Array(n + 1);
      matrix[i][0] = i;
    }
    for (let j = 0; j <= n; j++) matrix[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        let v = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
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
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// src/lib/index-inverted.ts
var defaultDistanceFn = (a, b) => levenshteinDistance(a, b);
var InvertedIndex = class extends Index {
  // Main index: word -> Set of docIds
  #wordToDocIds = /* @__PURE__ */ new Map();
  // Reverse index: docId -> Set of words
  #docIdToWords = /* @__PURE__ */ new Map();
  /** Get the total number of unique words in the index. */
  get wordCount() {
    return this.#wordToDocIds.size;
  }
  /** Get the total number of unique docIds in the index. */
  get docIdCount() {
    return this.#docIdToWords.size;
  }
  /** Get all the words in the index. */
  getAllWords() {
    return [...this.#wordToDocIds.keys()];
  }
  /** Get all the docIds in the index. */
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
    if (!this.#wordToDocIds.has(word)) {
      this.#wordToDocIds.set(word, /* @__PURE__ */ new Set());
    }
    const docIds = this.#wordToDocIds.get(word);
    const isNewEntry = !docIds.has(docId);
    docIds.add(docId);
    if (!this.#docIdToWords.has(docId)) {
      this.#docIdToWords.set(docId, /* @__PURE__ */ new Set());
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
  /** Remove all entries for a given docId. */
  removeDocId(docId) {
    const words = this.#docIdToWords.get(docId);
    if (!words) return 0;
    const count = words.size;
    for (const word of words) {
      const docIds = this.#wordToDocIds.get(word);
      docIds.delete(docId);
      if (docIds.size === 0) this.#wordToDocIds.delete(word);
    }
    this.#docIdToWords.delete(docId);
    return count;
  }
  /** Returns true if the docId exists in the index. */
  hasDocId(docId) {
    return this.#docIdToWords.has(docId);
  }
  /** Search for docIds containing the exact word. */
  searchExact(word) {
    const result = this.#wordToDocIds.get(word);
    return result ? [...result] : [];
  }
  searchByPrefix(prefix, returnWithDistance = false) {
    const idToDistance = /* @__PURE__ */ new Map();
    const prefixLen = [...prefix].length;
    for (const [word, docIds] of this.#wordToDocIds.entries()) {
      if (!word.startsWith(prefix)) continue;
      const distance = [...word].length - prefixLen;
      docIds.forEach((id) => {
        const prev = idToDistance.get(id);
        if (prev === void 0 || distance < prev) {
          idToDistance.set(id, distance);
        }
      });
    }
    if (returnWithDistance) {
      return Object.fromEntries(idToDistance.entries());
    }
    return [...idToDistance.keys()].sort(
      (a, b) => idToDistance.get(a) - idToDistance.get(b)
    );
  }
  /** Search for all words associated with a docId. */
  searchByDocId(docId) {
    const words = this.#docIdToWords.get(docId);
    return words ? [...words] : [];
  }
  searchFuzzy(word, maxDistance = 2, returnWithDistance = false, options = {}) {
    const distanceFn = options.distanceFn ?? defaultDistanceFn;
    const queryLen = [...word].length;
    const idToDistance = /* @__PURE__ */ new Map();
    for (const [indexedWord, docIds] of this.#wordToDocIds.entries()) {
      if (!options.distanceFn && Math.abs([...indexedWord].length - queryLen) > maxDistance) {
        continue;
      }
      const distance = distanceFn(word, indexedWord);
      if (distance > maxDistance) continue;
      docIds.forEach((id) => {
        const prev = idToDistance.get(id);
        if (prev === void 0 || distance < prev) {
          idToDistance.set(id, distance);
        }
      });
    }
    if (returnWithDistance) {
      return Object.fromEntries(idToDistance.entries());
    }
    return [...idToDistance.keys()].sort(
      (a, b) => idToDistance.get(a) - idToDistance.get(b)
    );
  }
  /** Dump the index to a JSON-stringifiable structure. */
  dump() {
    const words = {};
    for (const [word, docIds] of this.#wordToDocIds.entries()) {
      words[word] = [...docIds];
    }
    return { words, version: "1.0" };
  }
  /**
   * Clears existing state and restores the index from a dump produced by `dump()`.
   * Returns `true` on success or `false` if the input has no `words` field.
   * Throws `Error` (with `cause` set to the underlying error) on JSON / structural failure.
   */
  restore(data) {
    try {
      if (typeof data === "string") {
        data = JSON.parse(data);
      }
      if (!data || typeof data !== "object" || !data.words) {
        return false;
      }
      if (data.version !== void 0 && data.version !== "1.0") {
        throw new Error(
          `Unsupported dump version "${data.version}" (expected "1.0")`
        );
      }
      this.#wordToDocIds.clear();
      this.#docIdToWords.clear();
      for (const [word, docIds] of Object.entries(data.words)) {
        this.#wordToDocIds.set(word, new Set(docIds));
        for (const docId of docIds) {
          if (!this.#docIdToWords.has(docId)) {
            this.#docIdToWords.set(docId, /* @__PURE__ */ new Set());
          }
          this.#docIdToWords.get(docId).add(word);
        }
      }
      return true;
    } catch (e) {
      throw new Error("Error restoring index", { cause: e });
    }
  }
};

// src/lib/ngram.ts
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
  const chars = [...paddedText];
  if (chars.length < size) {
    return [];
  }
  const ngrams = [];
  for (let i = 0; i <= chars.length - size; i++) {
    const ngram = chars.slice(i, i + size).join("");
    ngrams.push(ngram);
  }
  return ngrams;
}

// src/lib/unaccent.ts
var EXTRA_FOLDS = {
  "\xDF": "ss",
  "\u1E9E": "SS",
  "\xF8": "o",
  "\xD8": "O",
  "\xE6": "ae",
  "\xC6": "AE",
  "\u0153": "oe",
  "\u0152": "OE",
  "\u0111": "d",
  "\u0110": "D",
  "\xF0": "d",
  "\xD0": "D",
  "\u0142": "l",
  "\u0141": "L",
  "\xFE": "th",
  "\xDE": "Th",
  "\u0127": "h",
  "\u0126": "H",
  "\u0131": "i",
  "\u0138": "k",
  "\u014B": "n",
  "\u014A": "N",
  "\u017F": "s",
  "\u0167": "t",
  "\u0166": "T"
};
var EXTRA_FOLDS_RE = new RegExp(
  `[${Object.keys(EXTRA_FOLDS).join("")}]`,
  "g"
);
function unaccent(input) {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(EXTRA_FOLDS_RE, (c) => EXTRA_FOLDS[c] ?? c);
}

// src/lib/normalize.ts
var DEFAULT_OPTIONS = {
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

// src/lib/tokenize.ts
var CLASS_META = /* @__PURE__ */ new Set(["\\", "]", "^"]);
function escapeForCharClass(c) {
  return CLASS_META.has(c) ? "\\" + c : c;
}
function tokenize(inputString, nonWordCharWhitelist = "") {
  if (typeof inputString !== "string") return [];
  if (typeof nonWordCharWhitelist !== "string") nonWordCharWhitelist = "";
  const chars = [.../* @__PURE__ */ new Set([...nonWordCharWhitelist])];
  const hyphenIdx = chars.indexOf("-");
  let tail = "";
  if (hyphenIdx !== -1) {
    chars.splice(hyphenIdx, 1);
    tail = "-";
  }
  const escaped = chars.map(escapeForCharClass).join("") + tail;
  const wordPattern = new RegExp(
    `[^\\p{L}\\p{N}\\p{Pc}${escaped}]+`,
    "gu"
  );
  return inputString.split(wordPattern).filter((word) => word.length > 0);
}

// src/lib/index-trie.ts
var TrieNode = class {
  constructor(children = /* @__PURE__ */ new Map(), isEOW = false, docIds = /* @__PURE__ */ new Set()) {
    this.children = children;
    this.isEOW = isEOW;
    this.docIds = docIds;
  }
  toJSON() {
    return {
      children: Object.fromEntries(this.children.entries()),
      isEOW: this.isEOW,
      docIds: [...this.docIds]
    };
  }
  __toCharTrie(_tree = {}, _node) {
    _node ??= this;
    _node?.children?.entries().forEach(([char, node]) => {
      _tree[char] ??= {};
      this.__toCharTrie(_tree[char], node);
    });
    return _tree;
  }
};
var TrieIndex = class extends Index {
  #root;
  // helper index for fast lookup by docId
  #docIdToWords = /* @__PURE__ */ new Map();
  // unique-word counter maintained incrementally (add/remove)
  #wordCount = 0;
  constructor() {
    super();
    this.#root = new TrieNode();
  }
  toJSON() {
    return this.#root.toJSON().children;
  }
  /** Get the total number of unique words in the index. */
  get wordCount() {
    return this.#wordCount;
  }
  /** Get the total number of unique docIds in the index. */
  get docIdCount() {
    return this.#docIdToWords.size;
  }
  /** Get all the words in the index. */
  getAllWords() {
    return [...this.#collectAllWords().keys()];
  }
  /** Get all the docIds in the index. */
  getAllDocIds() {
    return [...this.#docIdToWords.keys()];
  }
  /** Returns true if the docId exists in the index. */
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
  /**
   * Will add the provided word + docId pair to index.
   * It is assumed the word is already normalized.
   */
  addWord(word, docId) {
    this.#assertWordAndDocId(word, docId);
    let currentNode = this.#root;
    for (const char of word) {
      if (!currentNode.children.has(char)) {
        currentNode.children.set(char, new TrieNode());
      }
      currentNode = currentNode.children.get(char);
    }
    if (!currentNode.isEOW) this.#wordCount++;
    currentNode.isEOW = true;
    const isNewEntry = !currentNode.docIds.has(docId);
    currentNode.docIds.add(docId);
    if (!this.#docIdToWords.has(docId)) {
      this.#docIdToWords.set(docId, /* @__PURE__ */ new Set());
    }
    this.#docIdToWords.get(docId).add(word);
    return isNewEntry;
  }
  /** Removes a word + docId pair from the index. */
  removeWord(word, docId) {
    this.#assertWordAndDocId(word, docId);
    const result = this.#removeWordFromTrie(this.#root, [...word], 0, docId);
    if (result && this.#docIdToWords.has(docId)) {
      this.#docIdToWords.get(docId).delete(word);
      if (this.#docIdToWords.get(docId).size === 0) {
        this.#docIdToWords.delete(docId);
      }
    }
    return result;
  }
  /** Removes all entries for a given docId. */
  removeDocId(docId) {
    if (!this.#docIdToWords.has(docId)) return 0;
    const words = [...this.#docIdToWords.get(docId)];
    let removedCount = 0;
    for (const word of words) {
      if (this.#removeWordFromTrie(this.#root, [...word], 0, docId)) {
        removedCount++;
      }
    }
    this.#docIdToWords.delete(docId);
    return removedCount;
  }
  /** Search for documents containing the exact word. */
  searchExact(word) {
    let currentNode = this.#root;
    for (const char of word) {
      if (!currentNode.children.has(char)) return [];
      currentNode = currentNode.children.get(char);
    }
    if (!currentNode.isEOW) return [];
    return [...currentNode.docIds];
  }
  searchByPrefix(prefix, returnWithDistance = false) {
    let currentNode = this.#root;
    for (const char of prefix) {
      if (!currentNode.children.has(char)) return [];
      currentNode = currentNode.children.get(char);
    }
    const idToDistance = /* @__PURE__ */ new Map();
    this.#collectPrefixMatches(currentNode, 0, idToDistance);
    if (returnWithDistance) {
      return Object.fromEntries(idToDistance.entries());
    }
    return [...idToDistance.keys()].sort(
      (a, b) => idToDistance.get(a) - idToDistance.get(b)
    );
  }
  /** Search for all words associated with a docId. */
  searchByDocId(docId) {
    const words = this.#docIdToWords.get(docId);
    return words ? [...words] : [];
  }
  searchFuzzy(word, maxDistance = 2, returnWithDistance = false, options = {}) {
    const idToDistance = /* @__PURE__ */ new Map();
    if (options.distanceFn) {
      const all = this.#collectAllWords();
      for (const [indexedWord, docIds] of all.entries()) {
        const distance = options.distanceFn(word, indexedWord);
        if (distance > maxDistance) continue;
        docIds.forEach((id) => {
          const prev = idToDistance.get(id);
          if (prev === void 0 || distance < prev) {
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
    return [...idToDistance.keys()].sort(
      (a, b) => idToDistance.get(a) - idToDistance.get(b)
    );
  }
  /**
   * DFS over the trie maintaining the current Levenshtein row for the query.
   * Prunes subtrees whose row minimum exceeds `maxDistance`.
   */
  #fuzzyWalk(query, maxDistance, idToDistance) {
    const qChars = [...query];
    const qLen = qChars.length;
    const initialRow = new Array(qLen + 1);
    for (let j = 0; j <= qLen; j++) initialRow[j] = j;
    const visit = (node, prevRow) => {
      for (const [char, child] of node.children) {
        const newRow = new Array(qLen + 1);
        newRow[0] = prevRow[0] + 1;
        let rowMin = newRow[0];
        for (let j = 1; j <= qLen; j++) {
          const cost = qChars[j - 1] === char ? 0 : 1;
          newRow[j] = Math.min(
            prevRow[j] + 1,
            newRow[j - 1] + 1,
            prevRow[j - 1] + cost
          );
          if (newRow[j] < rowMin) rowMin = newRow[j];
        }
        if (child.isEOW && newRow[qLen] <= maxDistance) {
          const distance = newRow[qLen];
          child.docIds.forEach((id) => {
            const prev = idToDistance.get(id);
            if (prev === void 0 || distance < prev) {
              idToDistance.set(id, distance);
            }
          });
        }
        if (rowMin <= maxDistance) visit(child, newRow);
      }
    };
    visit(this.#root, initialRow);
  }
  /** Recursive remove helper. Operates on pre-split code-point strings so
   * astral characters (emoji / surrogate pairs) index consistently with add. */
  #removeWordFromTrie(node, chars, index2, docId) {
    if (index2 === chars.length) {
      if (!node.isEOW) return false;
      const result2 = node.docIds.delete(docId);
      if (node.docIds.size === 0) {
        node.isEOW = false;
        this.#wordCount--;
      }
      return result2;
    }
    const char = chars[index2];
    if (!node.children.has(char)) return false;
    const childNode = node.children.get(char);
    const result = this.#removeWordFromTrie(childNode, chars, index2 + 1, docId);
    if (childNode.children.size === 0 && !childNode.isEOW) {
      node.children.delete(char);
    }
    return result;
  }
  /** Collects docIds from every EOW node in the subtree rooted at `node`,
   * tracking the distance from the prefix boundary. */
  #collectPrefixMatches(node, depthFromPrefix, idToDistance) {
    if (node.isEOW) {
      node.docIds.forEach((id) => {
        const prev = idToDistance.get(id);
        if (prev === void 0 || depthFromPrefix < prev) {
          idToDistance.set(id, depthFromPrefix);
        }
      });
    }
    for (const child of node.children.values()) {
      this.#collectPrefixMatches(child, depthFromPrefix + 1, idToDistance);
    }
  }
  /** Helper: collect every word+docIds pair in the trie (used for dump + custom-fn fuzzy). */
  #collectAllWords() {
    const results = /* @__PURE__ */ new Map();
    const visit = (node, word) => {
      if (node.isEOW) results.set(word, new Set(node.docIds));
      for (const [char, child] of node.children) {
        visit(child, word + char);
      }
    };
    visit(this.#root, "");
    return results;
  }
  /** Dumps the entire index into a JSON-stringifiable structure. */
  dump() {
    const allWords = this.#collectAllWords();
    const out = {
      words: {},
      version: "1.0"
    };
    for (const [word, docIds] of allWords) {
      out.words[word] = [...docIds];
    }
    return out;
  }
  /** Restores the index from a dump structure. Throws on malformed data
   * (original error preserved via `cause`). */
  restore(data) {
    try {
      if (typeof data === "string") {
        data = JSON.parse(data);
      }
      if (!data || typeof data !== "object" || !data.words) {
        return false;
      }
      if (data.version !== void 0 && data.version !== "1.0") {
        throw new Error(
          `Unsupported dump version "${data.version}" (expected "1.0")`
        );
      }
      this.#root = new TrieNode();
      this.#docIdToWords.clear();
      this.#wordCount = 0;
      for (const [word, docIds] of Object.entries(data.words)) {
        for (const docId of docIds) {
          this.addWord(word, docId);
        }
      }
      return true;
    } catch (e) {
      throw new Error("Error restoring index", { cause: e });
    }
  }
  /** Debug helper */
  __toCharTrie() {
    const tree = {};
    this.#root.__toCharTrie(tree);
    return tree;
  }
};

// src/searchable.ts
var Searchable = class _Searchable {
  #options = {
    caseSensitive: false,
    accentSensitive: false,
    isStopword: (_w) => false,
    normalizeWord: (word) => word,
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
    raw: void 0,
    used: void 0
  };
  /**
   * Creates a new Searchable index instance.
   *
   * @param options - Configuration options for the index (see {@link SearchableOptions})
   */
  constructor(options = {}) {
    this.#options = {
      ...this.#options,
      ...options || {},
      // nested object: defensive copy so external mutation doesn't leak in
      defaultSearchOptions: {
        ...this.#options.defaultSearchOptions,
        ...options?.defaultSearchOptions ?? {}
      }
    };
    this.#index = this.#options.index === "inverted" ? new InvertedIndex() : new TrieIndex();
  }
  /**
   * Create a Searchable from a previously-produced dump. The dump format is
   * index-agnostic, so you may pick a different `index` implementation at
   * restore time (e.g. migrate inverted ↔ trie).
   */
  static fromDump(dump, options = {}) {
    const idx = new _Searchable(options);
    idx.restore(dump);
    return idx;
  }
  get #normalizeOptions() {
    return {
      caseSensitive: this.#options.caseSensitive,
      accentSensitive: this.#options.accentSensitive
    };
  }
  /** Access to internal index instance */
  get __index() {
    return this.#index;
  }
  /** How many words (including n-grams!) are in the index in total */
  get wordCount() {
    return this.#index.wordCount;
  }
  /** Number of unique docIds in the index. */
  get docIdCount() {
    return this.#index.docIdCount;
  }
  /** Returns a shallow copy of the last-query meta (safe to inspect / store). */
  get lastQuery() {
    return {
      history: [...this.#lastQuery.history],
      rawHistory: [...this.#lastQuery.rawHistory],
      raw: this.#lastQuery.raw,
      used: this.#lastQuery.used
    };
  }
  /** Returns true if the docId exists in the index. */
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
  /**
   * Splits the input string into words.
   *
   * Applies normalization, tokenization, stopword filtering, and (when `isQuery`
   * is false) the custom `normalizeWord`.
   *
   * **Note on `isQuery=true`:** this method returns a flat de-duplicated list,
   * which is a lossy view for queries whose `normalizeWord` returns arrays
   * (alias / synonym expansion). For query pipelines, prefer
   * {@link Searchable.toQueryGroups} which preserves the per-term groups used by
   * `#search` to produce correct OR-within-AND-across semantics.
   */
  toWords(input, isQuery = false) {
    input = normalize(input, this.#normalizeOptions);
    let words = tokenize(input, this.#options.nonWordCharWhitelist);
    words = words.filter((w) => w && !this.#options.isStopword(w));
    const expand = (w) => {
      const out = this.#options.normalizeWord(w);
      return Array.isArray(out) ? out.filter(Boolean) : out ? [out] : [];
    };
    if (isQuery) {
      const out = [];
      for (const w of words) {
        for (const variant of expand(w)) {
          const n = normalize(variant, this.#normalizeOptions);
          if (n && !this.#options.isStopword(n)) out.push(n);
        }
      }
      return [...new Set(out)];
    }
    const expanded = [];
    for (const w of words) expanded.push(...expand(w));
    const finalized = expanded.map((w) => normalize(w, this.#normalizeOptions)).filter((w) => w && !this.#options.isStopword(w));
    return [...new Set(finalized)];
  }
  /**
   * Splits the input query into groups of alternate terms. Each group maps to
   * one original tokenized term + its `normalizeWord` expansion. Search
   * semantics are **OR within a group, AND across groups**.
   *
   * @example
   * ```ts
   * // normalizeWord: colour → ["colour", "color"]
   * index.toQueryGroups("big colour test");
   * // [ ["big"], ["colour", "color"], ["test"] ]
   * ```
   */
  toQueryGroups(input) {
    const norm = normalize(input, this.#normalizeOptions);
    const tokens = tokenize(norm, this.#options.nonWordCharWhitelist).filter(
      (w) => w && !this.#options.isStopword(w)
    );
    const groups = [];
    for (const token of tokens) {
      const expanded = this.#options.normalizeWord(token);
      const variants = Array.isArray(expanded) ? expanded.filter(Boolean) : expanded ? [expanded] : [];
      const finalized = variants.map((w) => normalize(w, this.#normalizeOptions)).filter((w) => w && !this.#options.isStopword(w));
      const group = [...new Set(finalized)];
      if (group.length) groups.push(group);
    }
    return groups;
  }
  /**
   * Adds a searchable text string to the index associated with a document ID.
   *
   * @param input - The searchable text to index
   * @param docId - Unique identifier for the document
   * @param strict - If true, throws on invalid input. If false, silently returns 0
   * @returns Number of new word-docId pairs added to the index
   *
   * @throws {Error} If input or docId is invalid and strict is true
   */
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
    for (const word of words) {
      added += Number(this.#index.addWord(word, docId));
      if (this.#options.ngramsSize) {
        const ngramsSizes = Array.isArray(this.#options.ngramsSize) ? this.#options.ngramsSize : [this.#options.ngramsSize];
        for (const ngramsSize of ngramsSizes) {
          if (ngramsSize > 0) {
            const ngs = createNgrams(word, ngramsSize, { padChar: "" });
            for (const ng of ngs) {
              added += Number(this.#index.addWord(ng, docId));
            }
          }
        }
      }
    }
    return added;
  }
  /**
   * Replaces all indexed content for a docId with the new input.
   * Equivalent to `removeDocId(docId)` then `add(input, docId)` — safer since
   * it guarantees old words are cleared even when the caller forgets.
   *
   * @returns Number of new word-docId pairs added after the replacement
   */
  replace(docId, input, strict = true) {
    this.#index.removeDocId(docId);
    return this.add(input, docId, strict);
  }
  /** Remove all indexed content for the given docId. */
  removeDocId(docId) {
    return this.#index.removeDocId(docId);
  }
  /**
   * Efficiently adds multiple documents to the index in batch.
   *
   * @param documents - Array of [docId, text] tuples or Record<docId, text>
   * @param strict - If true, stops on first error. If false, continues and collects errors
   * @returns Object with count of added entries and any errors encountered
   */
  addBatch(documents, strict = false) {
    const errors = [];
    let added = 0;
    const entries = Array.isArray(documents) ? documents : Object.entries(documents);
    for (const [docId, input] of entries) {
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
    return { added, errors };
  }
  /** Internal worker signature — either an array of ids, or a distance-keyed map. */
  #runSearch(worker, query) {
    const { querySomeWordMinLength, lastQueryHistoryLength } = this.#options;
    const rawInput = query;
    this.#lastQuery.raw = rawInput;
    const groups = this.toQueryGroups(query);
    const normalizedQuery = normalize(query, this.#normalizeOptions);
    if (!groups.some(
      (g) => g.some((w) => w.length >= querySomeWordMinLength)
    )) {
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
    const idToDistance = /* @__PURE__ */ new Map();
    for (const group of groups) {
      const unioned = /* @__PURE__ */ new Set();
      for (const variant of group) {
        const res = worker(variant);
        if (Array.isArray(res)) {
          for (const id of res) unioned.add(id);
        } else {
          for (const [id, distance] of Object.entries(res)) {
            unioned.add(id);
            const prev = idToDistance.get(id);
            if (prev === void 0 || distance < prev) {
              idToDistance.set(id, distance);
            }
          }
        }
      }
      perGroupIds.push([...unioned]);
    }
    const results = intersect(...perGroupIds);
    return results.sort((a, b) => {
      const da = idToDistance.get(a);
      const db = idToDistance.get(b);
      if (da === void 0 && db === void 0) return 0;
      if (da === void 0) return 1;
      if (db === void 0) return -1;
      return da - db;
    });
  }
  #applyWindow(ids, options) {
    const offset = Math.max(0, options?.offset ?? 0);
    const limit = options?.limit;
    if (!offset && (limit === void 0 || limit < 0)) return ids;
    const end = limit === void 0 ? void 0 : offset + Math.max(0, limit);
    return ids.slice(offset, end);
  }
  /** Searches the index for documents containing exact word matches. */
  searchExact(query, options) {
    const ids = this.#runSearch(
      (word) => this.#index.searchExact(word),
      query
    );
    return this.#applyWindow(ids, options);
  }
  /**
   * Searches the index for words that start with any query word.
   * Results are sorted by Levenshtein distance (closest first).
   */
  searchByPrefix(query, options) {
    const ids = this.#runSearch(
      (word) => this.#index.searchByPrefix(word, true),
      query
    );
    return this.#applyWindow(ids, options);
  }
  /**
   * Searches the index using fuzzy matching based on Levenshtein distance.
   *
   * Accepts `options.distanceFn` to replace the default Levenshtein with any
   * custom distance function (e.g. Damerau-Levenshtein, Jaro-Winkler, phonetic).
   *
   * @param query - The search query string
   * @param maxDistance - Maximum distance to consider a match (default: 2)
   * @param options - Optional pagination / distance-function overrides
   */
  searchFuzzy(query, maxDistance = 2, options) {
    const fuzzyOpts = options?.distanceFn ? { distanceFn: options.distanceFn } : void 0;
    const ids = this.#runSearch(
      (word) => fuzzyOpts ? this.#index.searchFuzzy(word, maxDistance, true, fuzzyOpts) : this.#index.searchFuzzy(word, maxDistance, true),
      query
    );
    return this.#applyWindow(ids, options);
  }
  /** Main search API — picks a strategy then runs it. */
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
  /**
   * Returns a step-by-step view of what the query pipeline produces — useful
   * for debugging "why didn't this match?" scenarios.
   */
  explainQuery(query) {
    const raw = query;
    const normalized = normalize(query, this.#normalizeOptions);
    const tokens = tokenize(normalized, this.#options.nonWordCharWhitelist);
    const afterStopwords = tokens.filter(
      (w) => w && !this.#options.isStopword(w)
    );
    const groups = this.toQueryGroups(query);
    const wouldSearch = groups.some(
      (g) => g.some((w) => w.length >= this.#options.querySomeWordMinLength)
    );
    return { raw, normalized, tokens, afterStopwords, groups, wouldSearch };
  }
  /**
   * Exports the index to a JSON-serializable structure. Pair with
   * {@link Searchable.fromDump} to hydrate back into a Searchable.
   */
  dump(stringify = true) {
    const dump = this.#index.dump();
    return stringify ? JSON.stringify(dump) : dump;
  }
  /** Resets and restores the internal index state from a previous `dump`. */
  restore(dump) {
    return this.#index.restore(dump);
  }
  /**
   * Creates a unified search interface over multiple Searchable instances.
   *
   * Results are the deduplicated union of each instance's matches. Strategy
   * and options (when provided) are forwarded to every child; when not provided,
   * each child uses its own configured defaults.
   */
  static merge(indexes) {
    const union = (getter) => {
      const out = /* @__PURE__ */ new Set();
      for (const idx of indexes) for (const id of getter(idx)) out.add(id);
      return [...out];
    };
    return {
      search(query, options) {
        return union((idx) => idx.search(query, void 0, options));
      },
      searchExact(query, options) {
        return union((idx) => idx.searchExact(query, options));
      },
      searchByPrefix(query, options) {
        return union((idx) => idx.searchByPrefix(query, options));
      },
      searchFuzzy(query, maxDistance, options) {
        return union((idx) => idx.searchFuzzy(query, maxDistance, options));
      }
    };
  }
};

// example/src/app.ts
function qsa(selector, context = null) {
  return Array.from((context ?? document).querySelectorAll(selector));
}
function debounce(fn, wait) {
  let timeout = null;
  return function(...args) {
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}
function getSelectedRadioValue(radios) {
  for (const r of radios) {
    if (r.checked) return r.value;
  }
  return "";
}
var $log = qsa("#console")[0];
var $input = qsa("#query")[0];
var $strategyRadios = qsa('input[name="strategy"]');
var $accent = qsa("#accent-sensitive")[0];
var initialized = createStore(false);
var index = new Searchable({ ngramsSize: 0, accentSensitive: false });
var docs = {};
function buildIndex(accentSensitive) {
  index = new Searchable({ ngramsSize: 0, accentSensitive });
  for (const [id, movie] of Object.entries(docs)) {
    const search2 = [
      movie.title,
      movie.year,
      movie.characters.join(),
      movie.genres.join(),
      movie.actors.join(),
      movie.directors.join()
    ].join(" ");
    index.add(search2, `${id}`);
  }
}
function init(movies) {
  docs = movies;
  buildIndex($accent.checked);
  initialized.set(true);
}
initialized.subscribe((v) => {
  $input.disabled = !v;
  if (v) {
    $log.innerHTML = "Movie data loaded. Type your movie search query in the input above.";
  }
});
var search = debounce((v) => {
  const strategy = getSelectedRadioValue($strategyRadios);
  const start = Date.now();
  const docIds = index.search(v, strategy);
  render(docIds, Date.now() - start);
}, 100);
$input.addEventListener("input", (e) => {
  search(e.target.value);
});
$strategyRadios.forEach((radio) => {
  radio.addEventListener("change", () => search($input.value));
});
$accent.addEventListener("change", () => {
  buildIndex($accent.checked);
  search($input.value);
});
function render(docIds, duration) {
  const results = (docIds ?? []).reduce((m, id) => {
    if (docs[id]) m.push(docs[id]);
    return m;
  }, []);
  const rendered = results.slice(0, 1e3).map((m) => {
    const actChar = m.actors.map((a, i) => `${a} (${m.characters[i]})`).join(", ");
    return [
      `&rarr; `,
      `<span class="title">${m.title}</span> `,
      `<span class="year">(${m.year}, ${m.directors.join(", ")})</span> `,
      `<span class="genres">/ ${m.genres.join(", ")}</span> `,
      `<br/><span class="cast">${actChar}</span> `,
      `<br/>`
    ].join("");
  });
  if (results.length > 1e3) {
    rendered.push(
      `
<span style="color: gray;">...next ${results.length - 1e3} results omitted...</span>`
    );
  }
  const dur = `(Found ${results.length} matching out of ~2500 total records in ${duration} ms)<br/><br/>`;
  $log.innerHTML = dur + rendered.join("<br />");
}
fetch("./movies.json").then((response) => response.json()).then((movies) => init(movies)).catch((error) => {
  console.error(error);
  $log.innerHTML = `<span style="color: #b00;">Unable to load movie data. Check the console for details.</span>`;
});
