# Breaking Changes

## 2.5.0

This release is primarily a correctness + performance pass. Most code using the
package will work unchanged, but several behaviors have shifted in ways that
**can** matter depending on what you asked for.

### Real behavioral changes

#### 1. `normalizeWord` now runs at query time too

**Before:** `normalizeWord` was applied when adding documents but skipped when
processing queries. That meant stemmer, lemmatizer, spell-check, alias, and
business-term normalizers would silently never match at query time — the whole
reason the option exists.

**After:** the same normalizer runs on both sides. When it returns a single
string, queries simply pick up the transform. When it returns an array (alias /
synonym expansion), query terms become groups: **OR within a group, AND across
groups**.

**What to check:** if you used `normalizeWord` for indexing-only shaping that
should *not* apply to queries, you'll need to gate it yourself (e.g. return the
input unchanged for words that don't need the transform). In practice this is
rare — the original design clearly intended symmetric behavior.

#### 2. `unaccent` now folds letters NFD doesn't decompose

**Before:** NFD + strip combining marks only. `ß`, `ø`, `æ`, `œ`, `đ`, `ł`, `þ`,
`ð`, `ı`, and a handful of others passed through unchanged, so queries like
`strasse` couldn't find `straße`.

**After:** a curated extra-fold map is applied. `ß → ss`, `ẞ → SS`, `ø → o`,
`æ → ae`, `œ → oe`, `đ → d`, `ł → l`, `þ → th`, `ð → d`, `ı → i`, and a few
more. This affects both indexing and query pipelines via `normalize`.

**What to check:** if you were relying on these letters surviving as-is
(e.g. case-sensitive indexing of `ß` distinct from `ss`), set
`accentSensitive: true` or use `caseSensitive: true` + your own normalizer.

#### 3. `levenshteinDistance` now iterates code points, not UTF-16 units

**Before:** astral characters (emoji, some CJK, math alphanumerics) were
counted as two characters each, producing inflated distances.

**After:** `levenshteinDistance("😀", "😎") === 1` as expected.

**What to check:** fuzzy-search results for corpora containing astral
characters may change (generally: shorter distances, more matches).

#### 4. `TrieIndex#removeWord` used UTF-16 indexing (bug)

**Before:** add/remove were inconsistent for words containing astral chars —
remove could silently fail to delete.

**After:** both iterate code points. If your dumps contain orphaned trie
entries from past removal bugs, re-dump + re-restore will heal them.

#### 5. `searchFuzzy` on the trie uses trie-walked Levenshtein with pruning

**Before:** the trie implementation flattened the trie into a word list and
did a linear scan — strictly slower than the inverted index.

**After:** DFS with rolling edit-distance row + row-min pruning. In the bundled
benchmark this dropped trie fuzzy from ~69ms/iter to ~3.4ms/iter (~20×), making
it the fastest fuzzy strategy.

**What to check:** result *ordering* by distance is stable; tie-breaks within
the same distance may differ from before (both old and new outputs are
correct — the order between equally-good matches wasn't specified).

#### 6. `restore()` throws `Error` with `cause`, never logs to console

**Before:** library code did `console.error(e)` and then threw a
`new Error("Error restoring index")` that lost the original cause.

**After:** no console output; `error.cause` holds the underlying error.

**What to check:** if you were parsing stderr for restore failures, switch to
catching the thrown error and inspecting `.cause`.

#### 7. `restore()` validates the dump `version` field

**Before:** the `version` field was written ("1.0") but never read.

**After:** any version other than `"1.0"` (or missing, for forward/backward
tolerance with pre-2.5.0 dumps) throws a descriptive error.

### Type-shape changes (no runtime change for normal usage)

#### 8. `LastQuery` gained `rawHistory: string[]`

Raw (pre-normalization) query strings are now kept alongside `history`.
Matches `history` length and ordering one-to-one.

**What to check:** TypeScript code that *constructs* a `LastQuery` manually
(e.g. inside a test fixture) must add the `rawHistory` field. Runtime consumers
are unaffected; the getter now returns a shallow copy (see #9).

#### 9. `lastQuery` getter returns a copy

**Before:** the getter returned a live reference — mutating `lastQuery.history`
from outside corrupted internal state.

**After:** getter returns `{ history: [...], rawHistory: [...], raw, used }`
shallow-copied. Safe to inspect, store, modify.

### New APIs (additive, no BC)

- `Searchable.fromDump(dump, options)` — build a Searchable from a dump, optionally
  picking a different underlying index type.
- `Searchable#replace(docId, input)` — replaces all indexed content for a docId
  in one step.
- `Searchable#removeDocId(docId)` — was previously only reachable via `__index`.
- `Searchable#hasDocId(docId)`, `Searchable#docIdCount` — existence / cardinality.
- `Searchable#explainQuery(query)` — returns the full tokenization pipeline
  result for debugging.
- `Searchable#toQueryGroups(query)` — the grouped view used by `#search` for
  proper alias-expansion semantics.
- `SearchOptions.{ limit, offset, distanceFn }` — pagination and pluggable
  distance function on every strategy.
- `Searchable.merge(...)` result now exposes `searchExact`, `searchByPrefix`,
  `searchFuzzy` in addition to `search`.
- `levenshteinDistance(a, b, { damerau: true })` — Damerau-Levenshtein mode.
- `LevenshteinOptions`, `DistanceFn`, `FuzzyOptions`, `SearchOptions`,
  `QueryExplanation`, `MergedSearchable` are now exported types.
- `Index` abstract class grows a `hasDocId(docId)` method (both concrete
  implementations provide it).

### Intentionally preserved inconsistencies

- `add(..., strict = true)` vs `addBatch(..., strict = false)` — kept as-is.
  The defaults are defensible (fail-loud for single add; collect-and-continue
  for batch where partial work is valuable) but not symmetric. Pass `strict`
  explicitly if you want uniform behavior.
- Public `toWords(input, isQuery)` signature is unchanged; its query-mode
  return value remains a flat array for BC. For group-aware semantics, prefer
  the new `toQueryGroups()`.
