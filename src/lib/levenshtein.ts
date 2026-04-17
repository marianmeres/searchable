/** Options for `levenshteinDistance`. */
export interface LevenshteinOptions {
	/** Treat adjacent transposition as a single edit (Damerau-Levenshtein).
	 * Improves typo tolerance at a small CPU cost. Default false. */
	damerau?: boolean;
}

/**
 * Calculates the Levenshtein distance between two strings.
 *
 * The Levenshtein distance represents the minimum number of single-character edits
 * (insertions, deletions, or substitutions) needed to transform one string into another.
 *
 * Iterates over Unicode code points (not UTF-16 code units), so astral characters
 * (emoji, some CJK, mathematical alphanumerics) count as a single character.
 *
 * Uses rolling-row dynamic programming: O(n) space, O(m·n) time.
 * With `damerau: true` the algorithm uses a full matrix (still O(m·n) time) to
 * additionally recognise adjacent transpositions as a single edit.
 *
 * @param source - The source string
 * @param target - The target string to compare against
 * @param options - See {@link LevenshteinOptions}
 * @returns The edit distance (non-negative integer)
 *
 * @example
 * ```ts
 * import { levenshteinDistance } from '@marianmeres/searchable';
 *
 * levenshteinDistance("cat", "hat");
 * // returns: 1 (one substitution: c → h)
 *
 * levenshteinDistance("teh", "the");
 * // returns: 2 (standard) / 1 with { damerau: true } (transposition)
 *
 * levenshteinDistance("😀cat", "😀cats");
 * // returns: 1 (astral chars counted as single character)
 * ```
 */
export function levenshteinDistance(
	source: string,
	target: string,
	options: LevenshteinOptions = {}
): number {
	// Iterate code points, not UTF-16 units — otherwise astral characters
	// (emoji, some CJK, math alphanumerics) miscount as two characters each.
	const s = [...source];
	const t = [...target];
	const m = s.length;
	const n = t.length;

	if (m === 0) return n;
	if (n === 0) return m;

	const damerau = options.damerau === true;

	if (damerau) {
		// Transposition needs access to row i-2, so we keep the full matrix.
		const matrix: number[][] = new Array(m + 1);
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
				if (
					i > 1 &&
					j > 1 &&
					s[i - 1] === t[j - 2] &&
					s[i - 2] === t[j - 1]
				) {
					v = Math.min(v, matrix[i - 2][j - 2] + 1);
				}
				matrix[i][j] = v;
			}
		}
		return matrix[m][n];
	}

	// Standard Levenshtein with two rolling rows: O(n) space.
	let prev = new Array<number>(n + 1);
	let curr = new Array<number>(n + 1);
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
