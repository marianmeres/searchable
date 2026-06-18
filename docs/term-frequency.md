# Term frequency / ranking — design analysis (proposed, not implemented)

**Status:** Proposed. Nothing here is built. This document captures the analysis
behind a possible *term-frequency* (TF) capability so the decision and its cost
are recorded before any code is written.

**Related, already shipped:** the end-of-word terminal marker in
[`TrieIndex.toCharTrie`](../src/lib/index-trie.ts) (`{ terminalMarker: true }`).
That feature and this one are frequently bundled together as "make the trie
rankable," but they are very different in cost — the terminal marker already
existed in the model and only needed exposing; term frequency does not exist
anywhere and is a genuine new feature. See [Why these two are not symmetric](#why-these-two-are-not-symmetric).

---

## 1. What this would add

A way to know **how many times a word occurs in a document**, so results can be
ordered by relevance (term frequency) rather than only by edit distance (the
current ordering for `searchByPrefix` / `searchFuzzy`).

This is the foundation for TF-based ranking and, combined with corpus-side
document frequency, for TF-IDF / BM25-style scoring.

---

## 2. Why these two are not symmetric

The terminal marker was cheap because the information **already existed**:
every `TrieNode` carries `isEOW`
([index-trie.ts](../src/lib/index-trie.ts), `TrieNode`), and `searchExact`
already relies on it. The only gap was that the char-trie *projection* discarded
it. Exposing it was a few lines and changed no data structures.

Term frequency is the opposite: **nothing in the library counts anything.** Two
layers actively destroy multiplicity before it could ever be recorded:

1. **The leaf is a `Set<string>`** (`TrieNode.docIds`) — idempotent. Adding the
   same `(word, docId)` twice counts once
   ([index-trie.ts `addWord`](../src/lib/index-trie.ts)).
2. **The tokenizer de-duplicates before the index sees repeats** —
   `toWords` returns `[...new Set(finalized)]`
   ([searchable.ts:269](../src/searchable.ts#L269)), so
   `add("the cat the mat", "d1")` delivers `the` to the index exactly once.

So TF is not a `TrieNode` tweak; capturing it reaches **up into the tokenization
layer** as well.

> **Already free today:** *document frequency* (DF) — the number of documents
> containing a word — is `node.docIds.size`. Only *per-document term frequency*
> is missing. If a use case only needs DF-style weighting, none of the work
> below is required.

---

## 3. Semantics: decide before implementing

| Quantity | Definition | Scope | Where it can live |
|----------|------------|-------|-------------------|
| **TF** (term frequency) | occurrences of a word **within one document** | per document | a per-document structure (trie node, or a flat `{word: count}` map) |
| **DF** (document frequency) | number of documents containing a word | corpus-wide | the shared in-memory index (`docIds.size`); **not** a per-document export |
| **IDF** | `log(N / DF)` | corpus-wide | computed from `N` (doc count) + DF; never inside a single document's payload |

Consequences:

- A **per-document** serialized payload (e.g. one JSONB column per row) can only
  ever carry **TF** (plus optionally document length / max-TF for
  normalization). Trying to bake DF/IDF into each document's payload means every
  insert anywhere rewrites a field in *every other* document — a corpus-wide
  write-amplification trap. DF/IDF must be derived corpus-side at query time.
- The **shared in-memory index** already knows DF for free and could expose it.

---

## 4. The fork that determines whether this is in scope

The right design depends entirely on **who consumes the frequency**:

### Option A — frequency powers in-memory ranking

Results are returned ranked by relevance, not just by edit distance. This is a
legitimate, natural evolution of a search library and **justifies putting TF in
the data model**. But to be coherent it must be designed at the `Index`
abstraction level so **both** backends gain it — the *default* backend is the
inverted index ([index-inverted.ts](../src/lib/index-inverted.ts)), not the
trie. A trie-only frequency feature would be asymmetric and surprising. It also
forces a decision on how TF combines with the existing distance-based ordering
(`searchByPrefix` / `searchFuzzy` already sort by distance).

### Option B — frequency only feeds a serialized projection

The in-memory search never ranks by it; counts exist solely to be exported
(e.g. into the char-trie / a companion map for an external query engine). In
that case, threading `Map<docId, number>` through the hot `addWord` / `removeWord`
path adds weight to the core data structure for a feature the structure itself
never uses — a smell. The cleaner design is to capture counts at the
`Searchable` layer (or in a dedicated, opt-in side structure) feeding the
projection, leaving the lean trie untouched.

**This fork is a product-direction decision, not a technical one, and should be
made first.**

---

## 5. Implementation sketch (if Option A — in-memory model)

Contained but not trivial; touches three layers and has two semantic forks.

### 5.1 Leaf storage

```ts
// TrieNode, before:
docIds: Set<string>;
// after:
docFreq: Map<string, number>; // docId -> occurrences in that doc
```

`addWord` increments instead of set-adding:

```ts
const prev = node.docFreq.get(docId) ?? 0;
node.docFreq.set(docId, prev + 1);
const isNewEntry = prev === 0;
```

Every `[...node.docIds]` / `node.docIds.forEach` site becomes `.keys()` for the
id-list return paths; the ranked variants can additionally surface the count.
(`#docIdToWords` can stay a `Set` — it only needs membership for removal.)

### 5.2 Stop discarding multiplicity at the tokenizer

TF only becomes non-trivial if the same normalized word reaches the index more
than once. Today `toWords` de-dups per `add()`
([searchable.ts:269](../src/searchable.ts#L269)). Capturing true TF requires
counting occurrences *before* (or instead of) that `new Set`. This is a
**behavior change**, so it must be **opt-in** (e.g. a `countTermFrequency`
factory option, default `false`) to preserve current behavior. n-gram emission
([searchable.ts `add`](../src/searchable.ts)) interacts here too — decide
whether n-gram counts track word counts.

### 5.3 Removal semantics (decision required)

Does `removeWord` **decrement** the count or **delete** the `(word, docId)`
pair? For a search index, "remove this association" = delete (current behavior)
is the sane contract; decrement is rarely what callers mean. Recommendation:
keep delete semantics; counts accumulate via repeated `add`.

### 5.4 Both backends

If Option A, mirror the change in `InvertedIndex` so the `Index` contract stays
uniform. Consider adding an abstract method (e.g. `searchRanked`) rather than
overloading existing return shapes.

### 5.5 Dump / restore versioning

`dump()` / `restore()` are versioned at `"1.0"` and `restore` already rejects
unknown versions ([index-trie.ts `restore`](../src/lib/index-trie.ts)). Add
`"2.0"`:

```jsonc
// 1.0: words: Record<word, docId[]>
// 2.0: words: Record<word, Record<docId, count>>
```

`restore` accepts both — a `"1.0"` dump restores losslessly with every count
defaulting to `1` (exactly correct for sets that never counted). Keep `"1.0"` as
the default `dump()` output until a major release so existing persisted dumps and
downstream readers don't break.

---

## 6. Serialization encoding (if Option B, or for export under Option A)

The terminal marker just shipped uses a **collision-proof sentinel key**
(`"$$"`, length >= 2; real edges are single code points). Frequency can ride the
same mechanism in one of two ways:

### 6.1 Count as the sentinel value

Let the terminal marker's *value* carry the count instead of `true`:

```jsonc
{ "b": { "a": { "r": { "$$": 3 }, "z": { "$$": 1 } } } }
//                          ^ "bar" occurs 3x       ^ "baz" occurs 1x
```

One key does double duty: presence = terminal, value = TF. No second reserved
key. (`toCharTrie` would gain something like `terminalValue: true | "tf"`.)

### 6.2 Companion flat map

Emit the counts as a flat word→count map alongside the trie:

```jsonc
{
  "trie":  { "b": { "a": { "r": {}, "z": {} } } }, // prefix probing
  "words": { "bar": 3, "baz": 1 },                 // exact match + TF
  "meta":  { "len": 12, "maxtf": 3 }               // for length-normalized TF
}
```

The flat map is the simpler home for exact-match + ranking; the trie's unique
value is cheap **prefix** probing. If prefix probing is *not* needed by the
consumer, the trie can be dropped entirely in favor of the flat map. **Do not
store TF in both places.**

### 6.3 Not worth it: per-node subtree aggregates

Storing the summed subtree TF at every interior node (to rank *prefix* matches
in one lookup) requires updating the whole path to the root on every edit and
negates the trie's compactness. Reserve subtree aggregation for an in-memory
ranker, not the serialized projection.

---

## 7. Backward compatibility

- **In-memory:** all changes opt-in (`countTermFrequency` default `false`);
  default behavior unchanged. `dump` stays `"1.0"` by default; `restore` reads
  both versions.
- **Serialized payloads:** legacy exports are char-only tries with no markers
  or counts. New output must be additive and detectable (e.g. a version
  discriminator or the presence of the sentinel/`words` map). Existing prefix
  probes keep working unchanged; only exact/ranking consumers gate on the newer
  shape. The clean migration is to **re-emit** payloads from source rather than
  mutate existing structures in place.

---

## 8. A caveat worth stating

If the end goal is corpus-aware relevance ranking inside a database, note that
PostgreSQL's native full-text search (`tsvector` / `ts_rank` / `ts_rank_cd`)
already stores per-document term positions (hence TF), supports A/B/C/D field
weights and proximity ranking, and is GIN-indexable — and it can be fed
*app-supplied lexemes* (via the `'lexeme:position'::tsvector` literal form) so
this library can remain the single source of normalization. A hand-rolled
TF-in-JSONB layer reimplements a weaker, unindexed-for-ordering version of that.

The library's char-trie earns its keep for **cheap in-memory prefix/fuzzy
membership** and **portable serialization**. Term frequency is worth adding to
the library only if **in-memory ranked results** (Option A) are a goal in their
own right; if the only consumer is a database that will do the ranking, prefer
the database's native facilities over exporting counts.

---

## 9. Decision checklist

1. Is **in-memory ranked search** a goal (Option A), or is frequency only for an
   **external/serialized** consumer (Option B)?
2. If Option A: extend the `Index` contract to **both** backends, and define how
   TF combines with the existing distance ordering.
3. Confirm the **opt-in** TF-counting behavior change at the tokenizer
   ([searchable.ts:269](../src/searchable.ts#L269)).
4. Confirm **delete (not decrement)** removal semantics.
5. Choose the serialization encoding: **sentinel value** (§6.1) vs **companion
   flat map** (§6.2).
6. Bump `dump` to `"2.0"` with dual-version `restore`.

**Lean recommendation:** if not committing to Option A across both backends,
keep TF out of the trie core and derive it for export instead — the trie's value
is membership, and per-document counts don't make it better at that.
